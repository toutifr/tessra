-- ============================================================
-- Migration 00017: ÉCONOMIE V2 — monnaie unique Tessel (⬡)
-- Voir docs/ECONOMY-V2.md
--   1. Cleanup ancien modèle (euros par action, demand, cagnotte)
--   2. Enum simplifié + colonnes prix en Tessels
--   3. publish_new_square (GPS OBLIGATOIRE) / take_square (à distance, ⬡)
--   4. grant_tessels (packs IAP, idempotent)
--   5. Quêtes quotidiennes, feed découverte, leaderboards
--   6. Decay + libération des cases mortes (cron) + push J-7
--   7. Analytics events
-- Écrit défensivement : applicable sur la DB live (drift) comme sur replay.
-- ============================================================

-- ────────────── 1. CLEANUP ──────────────
DO $$ BEGIN PERFORM cron.unschedule('expire-publications'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('update-expiring-squares'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('cleanup-demand'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('decay-prices'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('tessra-decay'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP FUNCTION IF EXISTS takeover_square(UUID, UUID, TEXT, DECIMAL);
DROP FUNCTION IF EXISTS extend_publication(UUID, UUID, DECIMAL);
DROP FUNCTION IF EXISTS publish_to_square(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS update_expiring_squares();
DROP FUNCTION IF EXISTS cleanup_old_demand();
DROP FUNCTION IF EXISTS notify_expiring_publications();
DROP FUNCTION IF EXISTS decay_square_prices();
DROP FUNCTION IF EXISTS publish_new_square(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID, TEXT);
DROP FUNCTION IF EXISTS publish_new_square(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS replace_square(UUID, UUID, TEXT, DECIMAL);
DROP FUNCTION IF EXISTS replace_square(UUID, UUID, TEXT, DECIMAL, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS vote_publication(UUID, UUID);
DROP FUNCTION IF EXISTS activate_shield(UUID, UUID, TEXT);
DROP TABLE IF EXISTS square_demand;

-- ────────────── 2. ENUM + COLONNES ──────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
             WHERE t.typname = 'square_status' AND e.enumlabel = 'occupe_gratuit') THEN
    ALTER TABLE squares ALTER COLUMN status DROP DEFAULT;
    CREATE TYPE square_status_new AS ENUM ('libre','occupe','signale','bloque');
    ALTER TABLE squares ALTER COLUMN status TYPE square_status_new USING (
      CASE
        WHEN status::text LIKE 'occupe%' OR status::text IN ('en_expiration','remplacable') THEN 'occupe'
        WHEN status::text = 'en_moderation' THEN 'signale'
        ELSE status::text
      END
    )::square_status_new;
    DROP TYPE square_status;
    ALTER TYPE square_status_new RENAME TO square_status;
    ALTER TABLE squares ALTER COLUMN status SET DEFAULT 'libre';
  END IF;
END $$;

ALTER TABLE squares ADD COLUMN IF NOT EXISTS replacement_count INT NOT NULL DEFAULT 0;
ALTER TABLE squares ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE squares ADD COLUMN IF NOT EXISTS last_decay_at TIMESTAMPTZ;
DO $$
DECLARE v_type TEXT;
BEGIN
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='squares' AND column_name='last_price';
  IF v_type IS NULL THEN
    ALTER TABLE squares ADD COLUMN last_price INTEGER NOT NULL DEFAULT 0;
  ELSIF v_type <> 'integer' THEN
    -- ancienne colonne en euros → conversion 1€ = 100 ⬡
    ALTER TABLE squares ALTER COLUMN last_price TYPE INTEGER USING ROUND(last_price * 100)::INTEGER;
  END IF;
END $$;
ALTER TABLE squares DROP COLUMN IF EXISTS demand_score;
ALTER TABLE squares DROP COLUMN IF EXISTS base_price;
ALTER TABLE squares DROP COLUMN IF EXISTS cagnotte;
ALTER TABLE publications DROP COLUMN IF EXISTS expires_at;

-- Bonus d'inscription : 100 ⬡ (permet une première prise immédiate)
ALTER TABLE profiles ALTER COLUMN credits SET DEFAULT 100;
UPDATE profiles SET credits = credits + 100 WHERE COALESCE(total_credits_earned,0) = 0 AND credits < 100;

-- Anti-téléportation
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_loc_at TIMESTAMPTZ;

-- Paiements = packs de Tessels uniquement
ALTER TABLE payments ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tessels INTEGER;
ALTER TABLE payments ALTER COLUMN publication_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_store_tx ON payments(store_transaction_id)
  WHERE store_transaction_id IS NOT NULL;

-- ────────────── 3. PRICING ──────────────
CREATE OR REPLACE FUNCTION min_take_price(p_last_price INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(10000, GREATEST(100, (CEIL(p_last_price * 1.5 / 10.0) * 10)::INTEGER));
$$;

-- ────────────── 4. PUBLISH (gratuit, GPS OBLIGATOIRE) ──────────────
CREATE OR REPLACE FUNCTION publish_new_square(
  p_geohash TEXT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_user_id UUID,
  p_image_url TEXT,
  p_user_lat DOUBLE PRECISION,
  p_user_lng DOUBLE PRECISION
)
RETURNS UUID AS $$
DECLARE
  v_square_id UUID;
  v_square squares%ROWTYPE;
  v_pub_id UUID;
  v_km_lat DOUBLE PRECISION := 1.0 / 111.32;
  v_km_lng DOUBLE PRECISION;
  v_cell_row INTEGER; v_cell_col INTEGER;
  v_cell_lat DOUBLE PRECISION; v_cell_lng DOUBLE PRECISION;
  v_last_lat DOUBLE PRECISION; v_last_lng DOUBLE PRECISION; v_last_at TIMESTAMPTZ;
  v_dist_m DOUBLE PRECISION; v_dt DOUBLE PRECISION;
  v_streak INTEGER; v_last_date DATE; v_rows INTEGER;
  v_pub_date DATE := CURRENT_DATE;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- GPS OBLIGATOIRE : c'est le pilier du jeu
  IF p_user_lat IS NULL OR p_user_lng IS NULL THEN
    RAISE EXCEPTION 'GPS required: publishing needs your physical location';
  END IF;

  -- Vérif d'appartenance à la cellule (tolérance ~100 m de dérive GPS)
  v_cell_row := FLOOR(p_lat / v_km_lat)::INTEGER;
  v_km_lng := v_km_lat / COS(RADIANS(ABS(v_cell_row * v_km_lat)));
  v_cell_col := FLOOR(p_lng / v_km_lng)::INTEGER;
  v_cell_lat := v_cell_row * v_km_lat;
  v_cell_lng := v_cell_col * v_km_lng;
  IF p_user_lat < (v_cell_lat - 0.001) OR p_user_lat > (v_cell_lat + v_km_lat + 0.001)
     OR p_user_lng < (v_cell_lng - 0.001) OR p_user_lng > (v_cell_lng + v_km_lng + 0.001) THEN
    RAISE EXCEPTION 'GPS verification failed: you must be inside the cell to publish';
  END IF;

  -- Anti-téléportation : vitesse implicite max 900 km/h
  SELECT last_lat, last_lng, last_loc_at INTO v_last_lat, v_last_lng, v_last_at
  FROM profiles WHERE user_id = p_user_id;
  IF v_last_lat IS NOT NULL AND v_last_at IS NOT NULL THEN
    v_dist_m := ST_DistanceSphere(ST_MakePoint(v_last_lng, v_last_lat), ST_MakePoint(p_user_lng, p_user_lat));
    v_dt := GREATEST(EXTRACT(EPOCH FROM (NOW() - v_last_at)), 1);
    IF v_dist_m / v_dt > 250 THEN
      RAISE EXCEPTION 'GPS verification failed: implausible movement detected';
    END IF;
  END IF;
  UPDATE profiles SET last_lat = p_user_lat, last_lng = p_user_lng, last_loc_at = NOW()
  WHERE user_id = p_user_id;

  -- Case existante ?
  SELECT * INTO v_square FROM squares
  WHERE cell_id = p_geohash OR geohash = p_geohash
  FOR UPDATE;

  IF FOUND THEN
    IF v_square.status <> 'libre' THEN
      RAISE EXCEPTION 'Square is not available (status: %)', v_square.status;
    END IF;
    v_square_id := v_square.id;
    IF v_square.cell_id IS NULL THEN
      UPDATE squares SET cell_id = p_geohash WHERE id = v_square_id;
    END IF;
  ELSE
    INSERT INTO squares (geohash, cell_id, lat, lng, status)
    VALUES (p_geohash, p_geohash, p_lat, p_lng, 'libre')
    RETURNING id INTO v_square_id;
  END IF;

  -- Rate limit : 5 publications gratuites / 24h
  IF (SELECT COUNT(*) FROM publications
      WHERE user_id = p_user_id AND is_paid = false
        AND created_at > NOW() - INTERVAL '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 5 free publications per 24h';
  END IF;

  -- Cooldown 10 min sur la même case
  IF EXISTS (SELECT 1 FROM publications
             WHERE square_id = v_square_id AND created_at > NOW() - INTERVAL '10 minutes') THEN
    RAISE EXCEPTION 'Cooldown active: wait before publishing on this square';
  END IF;

  INSERT INTO publications (user_id, square_id, image_url, status)
  VALUES (p_user_id, v_square_id, p_image_url, 'active')
  RETURNING id INTO v_pub_id;

  UPDATE squares
  SET status = 'occupe', current_publication_id = v_pub_id,
      replacement_count = COALESCE(replacement_count,0) + 1,
      last_price = 0, last_decay_at = NULL,
      last_activity_at = NOW(), updated_at = NOW()
  WHERE id = v_square_id;

  -- +10 ⬡ publication
  UPDATE profiles SET credits = credits + 10, total_credits_earned = total_credits_earned + 10
  WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, 10, 'publish', v_pub_id);

  -- Streak
  SELECT streak_days, last_publish_date INTO v_streak, v_last_date
  FROM profiles WHERE user_id = p_user_id;
  IF v_last_date IS NULL OR v_last_date < v_pub_date - 1 THEN
    UPDATE profiles SET streak_days = 1, last_publish_date = v_pub_date WHERE user_id = p_user_id;
  ELSIF v_last_date = v_pub_date - 1 THEN
    v_streak := COALESCE(v_streak,0) + 1;
    UPDATE profiles SET streak_days = v_streak, last_publish_date = v_pub_date WHERE user_id = p_user_id;
    IF v_streak = 3 THEN
      UPDATE profiles SET credits = credits + 20, total_credits_earned = total_credits_earned + 20 WHERE user_id = p_user_id;
      INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 20, 'streak_3');
    ELSIF v_streak = 7 THEN
      UPDATE profiles SET credits = credits + 50, total_credits_earned = total_credits_earned + 50 WHERE user_id = p_user_id;
      INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 50, 'streak_7');
    ELSIF v_streak = 30 THEN
      UPDATE profiles SET credits = credits + 200, total_credits_earned = total_credits_earned + 200 WHERE user_id = p_user_id;
      INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 200, 'streak_30');
    END IF;
  ELSE
    UPDATE profiles SET last_publish_date = v_pub_date WHERE user_id = p_user_id;
  END IF;

  -- Exploration
  INSERT INTO explored_cells (user_id, cell_id) VALUES (p_user_id, p_geohash)
  ON CONFLICT (user_id, cell_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    UPDATE profiles SET credits = credits + 5, total_credits_earned = total_credits_earned + 5,
                        cells_explored = cells_explored + 1
    WHERE user_id = p_user_id;
    INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 5, 'explore');
  END IF;

  -- Badge première publication
  IF (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id) = 1 THEN
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, 'first_print') ON CONFLICT DO NOTHING;
    UPDATE profiles SET credits = credits + 20, total_credits_earned = total_credits_earned + 20 WHERE user_id = p_user_id;
    INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 20, 'badge_first_print');
  END IF;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────── 5. TAKE (payant en ⬡, à distance) ──────────────
CREATE OR REPLACE FUNCTION take_square(
  p_square_id UUID,
  p_user_id UUID,
  p_image_url TEXT,
  p_bid INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_square squares%ROWTYPE;
  v_old_pub publications%ROWTYPE;
  v_pub_id UUID;
  v_min INTEGER; v_price INTEGER; v_refund INTEGER;
  v_balance INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_square FROM squares WHERE id = p_square_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square not found'; END IF;
  IF v_square.status <> 'occupe' THEN
    RAISE EXCEPTION 'Square is not occupied (status: %)', v_square.status;
  END IF;

  IF EXISTS (SELECT 1 FROM shields WHERE square_id = p_square_id AND expires_at > NOW()) THEN
    RAISE EXCEPTION 'Square is protected by a shield';
  END IF;

  IF v_square.current_publication_id IS NOT NULL THEN
    SELECT * INTO v_old_pub FROM publications WHERE id = v_square.current_publication_id;
    IF FOUND AND v_old_pub.user_id = p_user_id THEN
      RAISE EXCEPTION 'You already own this square';
    END IF;
  END IF;

  v_min := min_take_price(COALESCE(v_square.last_price, 0));
  v_price := COALESCE(p_bid, v_min);
  IF v_price < v_min THEN
    RAISE EXCEPTION 'Price too low: minimum is % tessels', v_min;
  END IF;

  -- Solde
  SELECT credits INTO v_balance FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_price THEN
    RAISE EXCEPTION 'INSUFFICIENT_TESSELS: need %, have %', v_price, COALESCE(v_balance,0);
  END IF;

  -- Débit
  UPDATE profiles SET credits = credits - v_price WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, -v_price, 'take_square', p_square_id);

  -- Archive ancienne publication + remboursement 50%
  IF v_old_pub.id IS NOT NULL THEN
    v_refund := FLOOR(v_price * 0.5);
    UPDATE profiles SET credits = credits + v_refund, total_credits_earned = total_credits_earned + v_refund
    WHERE user_id = v_old_pub.user_id;
    INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
    VALUES (v_old_pub.user_id, v_refund, 'square_income', p_square_id);

    INSERT INTO publication_history (
      publication_id, user_id, square_id, image_url,
      started_at, ended_at, status, acquisition_mode, end_reason
    ) VALUES (
      v_old_pub.id, v_old_pub.user_id, v_old_pub.square_id, v_old_pub.image_url,
      v_old_pub.started_at, NOW(), 'replaced',
      CASE WHEN v_old_pub.is_paid THEN 'paid' ELSE 'free' END, 'replaced_by_user'
    );
  END IF;

  INSERT INTO publications (user_id, square_id, image_url, status, is_paid, price_paid)
  VALUES (p_user_id, p_square_id, p_image_url, 'active', TRUE, v_price)
  RETURNING id INTO v_pub_id;

  IF v_old_pub.id IS NOT NULL THEN
    -- déclenche le push "ta case a été prise" (trigger trg_notify_replaced)
    UPDATE publications SET status = 'replaced', replaced_by = v_pub_id WHERE id = v_old_pub.id;
  END IF;

  UPDATE squares
  SET status = 'occupe', current_publication_id = v_pub_id,
      replacement_count = COALESCE(replacement_count,0) + 1,
      last_price = v_price, last_decay_at = NULL,
      last_activity_at = NOW(), updated_at = NOW()
  WHERE id = p_square_id;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────── 6. PACKS IAP (appelé par validate-receipt, service role) ──────────────
CREATE OR REPLACE FUNCTION grant_tessels(
  p_user_id UUID,
  p_sku TEXT,
  p_platform TEXT,
  p_transaction_id TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_tessels INTEGER;
  v_eur NUMERIC;
  v_balance INTEGER;
BEGIN
  v_tessels := CASE p_sku
    WHEN 'tessra_tessels_s'   THEN 300
    WHEN 'tessra_tessels_m'   THEN 1200
    WHEN 'tessra_tessels_l'   THEN 2800
    WHEN 'tessra_tessels_xl'  THEN 8000
    WHEN 'tessra_tessels_xxl' THEN 18000
    ELSE NULL END;
  IF v_tessels IS NULL THEN RAISE EXCEPTION 'Unknown SKU: %', p_sku; END IF;
  v_eur := CASE p_sku
    WHEN 'tessra_tessels_s' THEN 2.99 WHEN 'tessra_tessels_m' THEN 9.99
    WHEN 'tessra_tessels_l' THEN 19.99 WHEN 'tessra_tessels_xl' THEN 49.99
    ELSE 99.99 END;

  -- Idempotence : transaction déjà traitée → no-op
  IF EXISTS (SELECT 1 FROM payments WHERE store_transaction_id = p_transaction_id) THEN
    SELECT credits INTO v_balance FROM profiles WHERE user_id = p_user_id;
    RETURN v_balance;
  END IF;

  INSERT INTO payments (user_id, amount, currency, platform, store_transaction_id, status, sku, tessels)
  VALUES (p_user_id, v_eur, 'EUR', p_platform, p_transaction_id, 'completed', p_sku, v_tessels);

  UPDATE profiles SET credits = credits + v_tessels WHERE user_id = p_user_id
  RETURNING credits INTO v_balance;
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, v_tessels, 'iap_pack');

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION grant_tessels(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ────────────── 7. VOTES (+2 ⬡ au propriétaire) ──────────────
CREATE OR REPLACE FUNCTION vote_publication(p_user_id UUID, p_publication_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_owner UUID; v_count INTEGER; v_rows INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT user_id INTO v_owner FROM publications WHERE id = p_publication_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Publication not found'; END IF;
  IF v_owner = p_user_id THEN RAISE EXCEPTION 'Cannot vote for your own photo'; END IF;

  INSERT INTO votes (user_id, publication_id) VALUES (p_user_id, p_publication_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    UPDATE publications SET vote_count = COALESCE(vote_count,0) + 1
    WHERE id = p_publication_id RETURNING vote_count INTO v_count;
    UPDATE profiles SET credits = credits + 2, total_credits_earned = total_credits_earned + 2
    WHERE user_id = v_owner;
    INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
    VALUES (v_owner, 2, 'vote_received', p_publication_id);
  ELSE
    SELECT vote_count INTO v_count FROM publications WHERE id = p_publication_id;
  END IF;
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────── 8. SHIELDS (bronze 1h gratuit 1/j, argent 6h 150⬡, or 24h 500⬡) ──────────────
CREATE OR REPLACE FUNCTION activate_shield(p_user_id UUID, p_square_id UUID, p_tier TEXT)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_square squares%ROWTYPE;
  v_owner UUID;
  v_cost INTEGER; v_duration INTERVAL;
  v_balance INTEGER; v_expires TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_square FROM squares WHERE id = p_square_id FOR UPDATE;
  IF NOT FOUND OR v_square.current_publication_id IS NULL THEN
    RAISE EXCEPTION 'Square not found or empty';
  END IF;
  SELECT user_id INTO v_owner FROM publications WHERE id = v_square.current_publication_id;
  IF v_owner <> p_user_id THEN RAISE EXCEPTION 'You do not own this square'; END IF;
  IF EXISTS (SELECT 1 FROM shields WHERE square_id = p_square_id AND expires_at > NOW()) THEN
    RAISE EXCEPTION 'Shield already active';
  END IF;

  IF p_tier = 'bronze' THEN
    v_cost := 0; v_duration := INTERVAL '1 hour';
    IF (SELECT last_free_shield_date FROM profiles WHERE user_id = p_user_id) = CURRENT_DATE THEN
      RAISE EXCEPTION 'Free shield already used today';
    END IF;
    UPDATE profiles SET last_free_shield_date = CURRENT_DATE WHERE user_id = p_user_id;
  ELSIF p_tier = 'silver' THEN
    v_cost := 150; v_duration := INTERVAL '6 hours';
  ELSIF p_tier = 'gold' THEN
    v_cost := 500; v_duration := INTERVAL '24 hours';
  ELSE
    RAISE EXCEPTION 'Unknown shield tier: %', p_tier;
  END IF;

  IF v_cost > 0 THEN
    SELECT credits INTO v_balance FROM profiles WHERE user_id = p_user_id FOR UPDATE;
    IF v_balance < v_cost THEN
      RAISE EXCEPTION 'INSUFFICIENT_TESSELS: need %, have %', v_cost, v_balance;
    END IF;
    UPDATE profiles SET credits = credits - v_cost WHERE user_id = p_user_id;
    INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
    VALUES (p_user_id, -v_cost, 'shield_' || p_tier, p_square_id);
  END IF;

  v_expires := NOW() + v_duration;
  INSERT INTO shields (square_id, user_id, tier, expires_at)
  VALUES (p_square_id, p_user_id, p_tier, v_expires);
  RETURN v_expires;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────── 9. QUÊTES QUOTIDIENNES ──────────────
CREATE TABLE IF NOT EXISTS quest_claims (
  user_id UUID NOT NULL,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  quest_key TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day, quest_key)
);
ALTER TABLE quest_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quest_claims_select ON quest_claims;
CREATE POLICY quest_claims_select ON quest_claims FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION quest_progress(p_user_id UUID, p_quest_key TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_quest_key
    WHEN 'publish_1' THEN (SELECT COUNT(*)::INT FROM publications WHERE user_id = p_user_id AND is_paid = false AND created_at::date = CURRENT_DATE)
    WHEN 'vote_5'    THEN (SELECT COUNT(*)::INT FROM votes WHERE user_id = p_user_id AND created_at::date = CURRENT_DATE)
    WHEN 'take_1'    THEN (SELECT COUNT(*)::INT FROM publications WHERE user_id = p_user_id AND is_paid = true AND created_at::date = CURRENT_DATE)
    ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_daily_quests(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE v_result JSONB := '[]'::JSONB; q RECORD;
BEGIN
  FOR q IN
    SELECT * FROM (VALUES
      ('publish_1', 'Publier 1 photo', 1, 20),
      ('vote_5',    'Voter pour 5 photos', 5, 15),
      ('take_1',    'Prendre 1 case', 1, 50)
    ) AS t(key, label, target, reward)
  LOOP
    v_result := v_result || jsonb_build_object(
      'key', q.key, 'label', q.label, 'target', q.target, 'reward', q.reward,
      'progress', LEAST(quest_progress(p_user_id, q.key), q.target),
      'claimed', EXISTS (SELECT 1 FROM quest_claims WHERE user_id = p_user_id AND day = CURRENT_DATE AND quest_key = q.key)
    );
  END LOOP;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION claim_quest(p_user_id UUID, p_quest_key TEXT)
RETURNS INTEGER AS $$
DECLARE v_target INTEGER; v_reward INTEGER; v_balance INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT target, reward INTO v_target, v_reward FROM (VALUES
    ('publish_1', 1, 20), ('vote_5', 5, 15), ('take_1', 1, 50)
  ) AS t(key, target, reward) WHERE key = p_quest_key;
  IF v_target IS NULL THEN RAISE EXCEPTION 'Unknown quest: %', p_quest_key; END IF;
  IF quest_progress(p_user_id, p_quest_key) < v_target THEN
    RAISE EXCEPTION 'Quest not completed';
  END IF;
  INSERT INTO quest_claims (user_id, quest_key) VALUES (p_user_id, p_quest_key);
  UPDATE profiles SET credits = credits + v_reward, total_credits_earned = total_credits_earned + v_reward
  WHERE user_id = p_user_id RETURNING credits INTO v_balance;
  INSERT INTO credit_transactions (user_id, amount, reason)
  VALUES (p_user_id, v_reward, 'quest_' || p_quest_key);
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────── 10. FEED DÉCOUVERTE ──────────────
CREATE OR REPLACE FUNCTION get_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  publication_id UUID, image_url TEXT, created_at TIMESTAMPTZ, vote_count INTEGER,
  owner_id UUID, username TEXT, avatar_url TEXT,
  square_id UUID, cell_id TEXT, last_price INTEGER, min_price INTEGER,
  has_voted BOOLEAN, is_shielded BOOLEAN
) AS $$
  SELECT
    pub.id, pub.image_url, pub.created_at, COALESCE(pub.vote_count,0),
    pub.user_id, pr.username, pr.avatar_url,
    s.id, s.cell_id, s.last_price, min_take_price(s.last_price),
    EXISTS (SELECT 1 FROM votes v WHERE v.publication_id = pub.id AND v.user_id = p_user_id),
    EXISTS (SELECT 1 FROM shields sh WHERE sh.square_id = s.id AND sh.expires_at > NOW())
  FROM publications pub
  JOIN squares s ON s.current_publication_id = pub.id
  JOIN profiles pr ON pr.user_id = pub.user_id
  WHERE pub.status = 'active'
    AND (p_before IS NULL OR pub.created_at < p_before)
  ORDER BY pub.created_at DESC
  LIMIT LEAST(GREATEST(p_limit,1), 50);
$$ LANGUAGE sql SECURITY DEFINER;

-- ────────────── 11. LEADERBOARDS ──────────────
CREATE OR REPLACE FUNCTION get_leaderboard(p_kind TEXT, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (rank BIGINT, user_id UUID, username TEXT, avatar_url TEXT, value BIGINT) AS $$
BEGIN
  IF p_kind = 'tiles' THEN
    RETURN QUERY
    SELECT ROW_NUMBER() OVER (ORDER BY c.cnt DESC), c.uid, pr.username, pr.avatar_url, c.cnt
    FROM (SELECT pub.user_id AS uid, COUNT(*) AS cnt FROM publications pub
          WHERE pub.status = 'active' GROUP BY pub.user_id) c
    JOIN profiles pr ON pr.user_id = c.uid
    ORDER BY c.cnt DESC LIMIT LEAST(p_limit, 100);
  ELSIF p_kind = 'votes' THEN
    RETURN QUERY
    SELECT ROW_NUMBER() OVER (ORDER BY c.cnt DESC), c.uid, pr.username, pr.avatar_url, c.cnt
    FROM (SELECT pub.user_id AS uid, SUM(COALESCE(pub.vote_count,0))::BIGINT AS cnt
          FROM publications pub GROUP BY pub.user_id HAVING SUM(COALESCE(pub.vote_count,0)) > 0) c
    JOIN profiles pr ON pr.user_id = c.uid
    ORDER BY c.cnt DESC LIMIT LEAST(p_limit, 100);
  ELSIF p_kind = 'explorer' THEN
    RETURN QUERY
    SELECT ROW_NUMBER() OVER (ORDER BY pr.cells_explored DESC), pr.user_id, pr.username, pr.avatar_url, pr.cells_explored::BIGINT
    FROM profiles pr WHERE pr.cells_explored > 0
    ORDER BY pr.cells_explored DESC LIMIT LEAST(p_limit, 100);
  ELSE
    RAISE EXCEPTION 'Unknown leaderboard kind: %', p_kind;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────── 12. DECAY + LIBÉRATION (cron quotidien) ──────────────
CREATE OR REPLACE FUNCTION decay_squares()
RETURNS VOID AS $$
DECLARE r RECORD;
BEGIN
  -- a) Décroissance des prix : -20% après 7j sans prise (plancher 100)
  UPDATE squares
  SET last_price = GREATEST(100, FLOOR(last_price * 0.8)::INTEGER),
      last_decay_at = NOW()
  WHERE status = 'occupe' AND last_price > 100
    AND last_activity_at < NOW() - INTERVAL '7 days'
    AND (last_decay_at IS NULL OR last_decay_at < NOW() - INTERVAL '7 days');

  -- b) Avertissement J-7 avant libération (60j d'inactivité)
  FOR r IN
    SELECT s.id, s.cell_id, pr.push_token
    FROM squares s
    JOIN publications pub ON pub.id = s.current_publication_id
    JOIN profiles pr ON pr.user_id = pub.user_id AND pr.notifications_enabled AND pr.push_token IS NOT NULL
    WHERE s.status = 'occupe'
      AND s.last_activity_at < NOW() - INTERVAL '53 days'
      AND s.last_activity_at >= NOW() - INTERVAL '54 days'
  LOOP
    PERFORM send_push_notification(
      r.push_token,
      'Ta case va expirer',
      'Sans activité, ta case redevient libre dans 7 jours. Va la défendre !',
      jsonb_build_object('type','expiring','square_id', r.id, 'cell_id', r.cell_id)
    );
  END LOOP;

  -- c) Libération après 60j d'inactivité
  FOR r IN
    SELECT s.id AS sq_id, pub.*
    FROM squares s JOIN publications pub ON pub.id = s.current_publication_id
    WHERE s.status = 'occupe' AND s.last_activity_at < NOW() - INTERVAL '60 days'
  LOOP
    INSERT INTO publication_history (
      publication_id, user_id, square_id, image_url,
      started_at, ended_at, status, acquisition_mode, end_reason
    ) VALUES (
      r.id, r.user_id, r.square_id, r.image_url,
      r.started_at, NOW(), 'expired',
      CASE WHEN r.is_paid THEN 'paid' ELSE 'free' END, 'expired_inactivity'
    );
    UPDATE publications SET status = 'expired' WHERE id = r.id;
    UPDATE squares SET status = 'libre', current_publication_id = NULL,
                       last_price = 0, last_decay_at = NULL, updated_at = NOW()
    WHERE id = r.sq_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule('tessra-decay', '0 3 * * *', 'SELECT decay_squares()');

-- ────────────── 13. ANALYTICS ──────────────
CREATE TABLE IF NOT EXISTS events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  props JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS events_insert ON events;
CREATE POLICY events_insert ON events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_events_name_time ON events(name, created_at);

-- ────────────── 14. PUSH VENGEANCE ENRICHI ──────────────
CREATE OR REPLACE FUNCTION notify_publication_replaced()
RETURNS TRIGGER AS $$
DECLARE
  v_token TEXT; v_taker TEXT; v_price INTEGER; v_refund INTEGER; v_cell TEXT;
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'replaced' THEN
    SELECT p.push_token INTO v_token FROM profiles p
    WHERE p.user_id = OLD.user_id AND p.notifications_enabled = true;
    IF v_token IS NOT NULL THEN
      SELECT pr.username, COALESCE(pub.price_paid,0)::INTEGER, s.cell_id
      INTO v_taker, v_price, v_cell
      FROM publications pub
      JOIN profiles pr ON pr.user_id = pub.user_id
      JOIN squares s ON s.id = pub.square_id
      WHERE pub.id = NEW.replaced_by;
      v_refund := FLOOR(COALESCE(v_price,0) * 0.5);
      PERFORM send_push_notification(
        v_token,
        COALESCE(v_taker,'Quelqu''un') || ' a pris ta case !',
        'Tu récupères ' || v_refund || ' tessels. Reprends-la pour ' || min_take_price(v_price) || ' ⬡',
        jsonb_build_object('type','replaced','square_id', OLD.square_id, 'cell_id', v_cell, 'refund', v_refund)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
