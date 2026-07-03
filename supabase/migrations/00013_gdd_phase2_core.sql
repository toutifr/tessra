-- ============================================================
-- Migration 00013: GDD Phase 2 — Core Game Loop
--
-- Implements:
--   1. GPS server-side verification
--   2. Credits system (virtual currency)
--   3. Shields / boucliers
--   4. Votes "belle photo"
--   5. Price decay & square expiration
--   6. Revenue split on replacements
--   7. Badges & progression
--   8. Follow system
--   9. Square history timeline
--  10. Enhanced profile stats
-- ============================================================

-- ============================================================
-- 1. CREDITS SYSTEM
-- ============================================================

-- User credit balance & stats
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_credits_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_publish_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cells_explored INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);

-- Credit transaction ledger
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount INTEGER NOT NULL, -- positive = earn, negative = spend
  reason TEXT NOT NULL, -- 'publish', 'streak', 'explore', 'vote_received', 'referral', 'shield_purchase', 'replacement_income'
  reference_id UUID, -- optional FK to publication, vote, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_tx_user ON credit_transactions(user_id, created_at DESC);

-- Generate referral codes for existing users
UPDATE profiles SET referral_code = SUBSTR(MD5(RANDOM()::TEXT || id::TEXT), 1, 8)
WHERE referral_code IS NULL;

-- ============================================================
-- 2. SHIELDS / BOUCLIERS
-- ============================================================

CREATE TABLE IF NOT EXISTS shields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  square_id UUID NOT NULL REFERENCES squares(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  tier TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold')),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shields_square ON shields(square_id, expires_at DESC);
CREATE INDEX idx_shields_user ON shields(user_id);

-- Track daily free shield usage
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_free_shield_date DATE;

-- ============================================================
-- 3. VOTES "BELLE PHOTO"
-- ============================================================

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  publication_id UUID NOT NULL REFERENCES publications(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, publication_id)
);

CREATE INDEX idx_votes_publication ON votes(publication_id);
CREATE INDEX idx_votes_user ON votes(user_id);

-- Vote count cache on publications
ALTER TABLE publications ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 4. FOLLOW SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id),
  followed_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, followed_id),
  CHECK(follower_id != followed_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_followed ON follows(followed_id);

-- Follow counts on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS follower_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 5. BADGES & PROGRESSION
-- ============================================================

CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY, -- e.g. 'first_print', 'explorer_local', 'pioneer'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT, -- emoji or icon name
  credits_reward INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  badge_id TEXT NOT NULL REFERENCES badges(id),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_user_badges_user ON user_badges(user_id);

-- Seed badge definitions
INSERT INTO badges (id, name, description, icon, credits_reward) VALUES
  ('first_print',     'Première empreinte',   'Publier votre première photo',                  '👣', 20),
  ('explorer_local',  'Explorateur local',    'Publier dans 10 cases différentes',             '🧭', 0),
  ('cartographer',    'Cartographe',          'Publier dans 50 cases différentes',             '🗺️', 100),
  ('pioneer',         'Pionnier',             'Publier dans un pays non encore couvert',       '🚀', 200),
  ('marathoner',      'Marathonien',          'Publier 30 jours consécutifs',                  '🏃', 0),
  ('conqueror',       'Conquérant',           'Remplacer 10 photos',                           '⚔️', 50),
  ('unsinkable',      'Insubmersible',        'Garder une case 7 jours sans être remplacé',    '🛡️', 0),
  ('globe_trotter',   'Globe-trotter',        'Publier sur 3 continents',                      '🌍', 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. SQUARE ENHANCEMENTS
-- ============================================================

-- Price decay tracking
ALTER TABLE squares ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();
-- Cagnotte (accumulated from replacements)
ALTER TABLE squares ADD COLUMN IF NOT EXISTS cagnotte DECIMAL NOT NULL DEFAULT 0;

-- ============================================================
-- 7. EXPLORED CELLS TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS explored_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  cell_id TEXT NOT NULL,
  explored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, cell_id)
);

CREATE INDEX idx_explored_user ON explored_cells(user_id);

-- ============================================================
-- 8. UPDATED RPC FUNCTIONS
-- ============================================================

-- ────────────────────────────────────────────────
-- publish_new_square: now with GPS verification + credits
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION publish_new_square(
  p_geohash TEXT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_user_id UUID,
  p_image_url TEXT,
  p_user_lat DOUBLE PRECISION DEFAULT NULL,
  p_user_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_square_id UUID;
  v_square squares%ROWTYPE;
  v_pub_id UUID;
  v_cell_lat DOUBLE PRECISION;
  v_cell_lng DOUBLE PRECISION;
  v_km_lat DOUBLE PRECISION := 1.0 / 111.32;
  v_km_lng DOUBLE PRECISION;
  v_cell_row INTEGER;
  v_cell_col INTEGER;
  v_is_new_cell BOOLEAN := FALSE;
  v_pub_date DATE := CURRENT_DATE;
  v_streak INTEGER;
  v_last_date DATE;
BEGIN
  -- GPS VERIFICATION: if user coordinates provided, verify they're in the target cell
  IF p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
    -- Compute cell boundaries from cell_id
    v_cell_row := FLOOR(p_lat / v_km_lat)::INTEGER;
    v_km_lng := v_km_lat / COS(RADIANS(ABS(v_cell_row * v_km_lat)));
    v_cell_col := FLOOR(p_lng / v_km_lng)::INTEGER;

    v_cell_lat := v_cell_row * v_km_lat;
    v_cell_lng := v_cell_col * v_km_lng;

    -- Check user is within cell bounds (with 50m tolerance for GPS drift)
    IF p_user_lat < (v_cell_lat - 0.0005) OR p_user_lat > (v_cell_lat + v_km_lat + 0.0005)
       OR p_user_lng < (v_cell_lng - 0.0005) OR p_user_lng > (v_cell_lng + v_km_lng + 0.0005) THEN
      RAISE EXCEPTION 'GPS verification failed: you must be inside the cell to publish';
    END IF;
  END IF;

  -- Try to find existing square
  SELECT * INTO v_square FROM squares
    WHERE geohash = p_geohash OR cell_id = p_geohash
    FOR UPDATE;

  IF FOUND THEN
    IF v_square.status NOT IN ('libre') THEN
      RAISE EXCEPTION 'Square is not available (status: %)', v_square.status;
    END IF;
    v_square_id := v_square.id;
    IF v_square.cell_id IS NULL THEN
      UPDATE squares SET cell_id = p_geohash WHERE id = v_square_id;
    END IF;
  ELSE
    v_is_new_cell := TRUE;
    INSERT INTO squares (geohash, cell_id, lat, lng, status)
    VALUES (p_geohash, p_geohash, p_lat, p_lng, 'libre')
    RETURNING id INTO v_square_id;
  END IF;

  -- Rate limit: 5 publications per 24h
  IF (SELECT COUNT(*) FROM publications
      WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 5 publications per 24h';
  END IF;

  -- Cooldown: 10 min between publications on same square
  IF (SELECT COUNT(*) FROM publications
      WHERE square_id = v_square_id AND created_at > NOW() - INTERVAL '10 minutes') > 0 THEN
    RAISE EXCEPTION 'Cooldown active: wait before publishing on this square';
  END IF;

  -- Create the publication
  INSERT INTO publications (user_id, square_id, image_url, status)
  VALUES (p_user_id, v_square_id, p_image_url, 'active')
  RETURNING id INTO v_pub_id;

  -- Update the square
  UPDATE squares
  SET status = 'occupe',
      current_publication_id = v_pub_id,
      replacement_count = COALESCE(replacement_count, 0) + 1,
      last_price = 0,
      last_activity_at = NOW(),
      updated_at = NOW()
  WHERE id = v_square_id;

  -- ── CREDITS: +10 for publishing ──
  UPDATE profiles SET credits = credits + 10, total_credits_earned = total_credits_earned + 10
  WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, 10, 'publish', v_pub_id);

  -- ── STREAK tracking ──
  SELECT streak_days, last_publish_date INTO v_streak, v_last_date
  FROM profiles WHERE user_id = p_user_id;

  IF v_last_date IS NULL OR v_last_date < v_pub_date - 1 THEN
    -- Streak reset
    UPDATE profiles SET streak_days = 1, last_publish_date = v_pub_date WHERE user_id = p_user_id;
  ELSIF v_last_date = v_pub_date - 1 THEN
    -- Streak continues
    v_streak := COALESCE(v_streak, 0) + 1;
    UPDATE profiles SET streak_days = v_streak, last_publish_date = v_pub_date WHERE user_id = p_user_id;

    -- Streak bonuses
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
    -- Same day, just update date
    UPDATE profiles SET last_publish_date = v_pub_date WHERE user_id = p_user_id;
  END IF;

  -- ── EXPLORE tracking ──
  INSERT INTO explored_cells (user_id, cell_id)
  VALUES (p_user_id, p_geohash)
  ON CONFLICT (user_id, cell_id) DO NOTHING;

  IF FOUND THEN
    -- New cell explored: +5 credits
    UPDATE profiles SET credits = credits + 5, total_credits_earned = total_credits_earned + 5,
                        cells_explored = cells_explored + 1
    WHERE user_id = p_user_id;
    INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 5, 'explore');
  END IF;

  -- ── BADGE: first_print ──
  IF (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id) = 1 THEN
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, 'first_print')
    ON CONFLICT DO NOTHING;
    -- Award badge credits
    UPDATE profiles SET credits = credits + 20, total_credits_earned = total_credits_earned + 20
    WHERE user_id = p_user_id;
    INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 20, 'badge_first_print');
  END IF;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────
-- replace_square: GPS check + shield check + revenue split + credits
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION replace_square(
  p_square_id UUID,
  p_user_id UUID,
  p_image_url TEXT,
  p_price_paid DECIMAL DEFAULT 0,
  p_user_lat DOUBLE PRECISION DEFAULT NULL,
  p_user_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_square squares%ROWTYPE;
  v_pub_id UUID;
  v_old_pub_id UUID;
  v_old_user_id UUID;
  v_min_price DECIMAL;
  v_owner_share DECIMAL;
  v_cagnotte_share DECIMAL;
  v_platform_share DECIMAL;
  v_km_lat DOUBLE PRECISION := 1.0 / 111.32;
  v_km_lng DOUBLE PRECISION;
  v_cell_row INTEGER;
  v_cell_col INTEGER;
  v_cell_lat DOUBLE PRECISION;
  v_cell_lng DOUBLE PRECISION;
BEGIN
  SELECT * INTO v_square FROM squares WHERE id = p_square_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Square not found';
  END IF;

  -- GPS VERIFICATION
  IF p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL AND v_square.lat IS NOT NULL THEN
    v_cell_row := FLOOR(v_square.lat / v_km_lat)::INTEGER;
    v_km_lng := v_km_lat / COS(RADIANS(ABS(v_cell_row * v_km_lat)));
    v_cell_col := FLOOR(v_square.lng / v_km_lng)::INTEGER;
    v_cell_lat := v_cell_row * v_km_lat;
    v_cell_lng := v_cell_col * v_km_lng;

    IF p_user_lat < (v_cell_lat - 0.0005) OR p_user_lat > (v_cell_lat + v_km_lat + 0.0005)
       OR p_user_lng < (v_cell_lng - 0.0005) OR p_user_lng > (v_cell_lng + v_km_lng + 0.0005) THEN
      RAISE EXCEPTION 'GPS verification failed: you must be inside the cell to replace';
    END IF;
  END IF;

  -- SHIELD CHECK: is the square currently protected?
  IF EXISTS (
    SELECT 1 FROM shields
    WHERE square_id = p_square_id AND expires_at > NOW()
  ) THEN
    RAISE EXCEPTION 'Square is protected by a shield';
  END IF;

  -- Price validation
  v_min_price := COALESCE(v_square.last_price, 0) + 1;
  IF p_price_paid < v_min_price THEN
    RAISE EXCEPTION 'Price too low: minimum is %', v_min_price;
  END IF;

  -- Rate limit
  IF (SELECT COUNT(*) FROM publications
      WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;

  -- Get old publication info
  v_old_pub_id := v_square.current_publication_id;
  IF v_old_pub_id IS NOT NULL THEN
    SELECT user_id INTO v_old_user_id FROM publications WHERE id = v_old_pub_id;
  END IF;

  -- Create new publication
  INSERT INTO publications (user_id, square_id, image_url, status, is_paid, price_paid)
  VALUES (p_user_id, p_square_id, p_image_url, 'active', true, p_price_paid)
  RETURNING id INTO v_pub_id;

  -- Mark old as replaced
  IF v_old_pub_id IS NOT NULL THEN
    UPDATE publications SET status = 'replaced', replaced_by = v_pub_id WHERE id = v_old_pub_id;
  END IF;

  -- ── REVENUE SPLIT ──
  v_owner_share := p_price_paid * 0.50;
  v_cagnotte_share := p_price_paid * 0.20;
  v_platform_share := p_price_paid * 0.30;

  -- Credit previous owner
  IF v_old_user_id IS NOT NULL AND v_old_user_id != p_user_id THEN
    UPDATE profiles SET credits = credits + FLOOR(v_owner_share * 100)::INTEGER -- cents to credits (1€ = 100 credits)
    WHERE user_id = v_old_user_id;
    INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
    VALUES (v_old_user_id, FLOOR(v_owner_share * 100)::INTEGER, 'replacement_income', v_pub_id);
  END IF;

  -- Update square
  UPDATE squares
  SET status = 'occupe',
      current_publication_id = v_pub_id,
      replacement_count = COALESCE(replacement_count, 0) + 1,
      last_price = p_price_paid,
      cagnotte = COALESCE(cagnotte, 0) + v_cagnotte_share,
      last_activity_at = NOW(),
      updated_at = NOW()
  WHERE id = p_square_id;

  -- Record payment
  INSERT INTO payments (user_id, publication_id, amount, currency, platform)
  VALUES (p_user_id, v_pub_id, p_price_paid, 'EUR', 'ios');

  -- ── CREDITS for replacement publish ──
  UPDATE profiles SET credits = credits + 10, total_credits_earned = total_credits_earned + 10
  WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, 10, 'publish', v_pub_id);

  -- ── BADGE: conqueror (10 replacements) ──
  IF (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id AND is_paid = true) >= 10 THEN
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, 'conqueror')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────
-- vote_publication: cast a "belle photo" vote
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION vote_publication(
  p_user_id UUID,
  p_publication_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_pub_owner UUID;
BEGIN
  -- Insert vote (unique constraint prevents duplicates)
  INSERT INTO votes (user_id, publication_id)
  VALUES (p_user_id, p_publication_id);

  -- Increment cached count
  UPDATE publications SET vote_count = vote_count + 1 WHERE id = p_publication_id;

  -- Credit the photo owner (+2 credits)
  SELECT user_id INTO v_pub_owner FROM publications WHERE id = p_publication_id;
  IF v_pub_owner IS NOT NULL AND v_pub_owner != p_user_id THEN
    UPDATE profiles SET credits = credits + 2, total_credits_earned = total_credits_earned + 2
    WHERE user_id = v_pub_owner;
    INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
    VALUES (v_pub_owner, 2, 'vote_received', p_publication_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────
-- activate_shield: protect a square
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION activate_shield(
  p_user_id UUID,
  p_square_id UUID,
  p_tier TEXT DEFAULT 'bronze'
)
RETURNS UUID AS $$
DECLARE
  v_shield_id UUID;
  v_duration INTERVAL;
  v_cost INTEGER := 0;
  v_square squares%ROWTYPE;
BEGIN
  -- Verify ownership
  SELECT * INTO v_square FROM squares WHERE id = p_square_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square not found'; END IF;

  IF v_square.current_publication_id IS NULL THEN
    RAISE EXCEPTION 'No publication on this square';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM publications WHERE id = v_square.current_publication_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'You must own the current publication to activate a shield';
  END IF;

  -- Check no active shield already
  IF EXISTS (SELECT 1 FROM shields WHERE square_id = p_square_id AND expires_at > NOW()) THEN
    RAISE EXCEPTION 'Square already has an active shield';
  END IF;

  -- Determine tier
  CASE p_tier
    WHEN 'bronze' THEN
      v_duration := INTERVAL '1 hour';
      -- Free once per day
      IF (SELECT last_free_shield_date FROM profiles WHERE user_id = p_user_id) = CURRENT_DATE THEN
        RAISE EXCEPTION 'Free shield already used today';
      END IF;
      UPDATE profiles SET last_free_shield_date = CURRENT_DATE WHERE user_id = p_user_id;
    WHEN 'silver' THEN
      v_duration := INTERVAL '6 hours';
      v_cost := 50; -- 50 credits
    WHEN 'gold' THEN
      v_duration := INTERVAL '24 hours';
      v_cost := 0; -- paid via IAP, not credits
    ELSE
      RAISE EXCEPTION 'Invalid shield tier: %', p_tier;
  END CASE;

  -- Deduct credits if needed
  IF v_cost > 0 THEN
    IF (SELECT credits FROM profiles WHERE user_id = p_user_id) < v_cost THEN
      RAISE EXCEPTION 'Not enough credits (need %)', v_cost;
    END IF;
    UPDATE profiles SET credits = credits - v_cost WHERE user_id = p_user_id;
    INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
    VALUES (p_user_id, -v_cost, 'shield_purchase', p_square_id);
  END IF;

  -- Create shield
  INSERT INTO shields (square_id, user_id, tier, expires_at)
  VALUES (p_square_id, p_user_id, p_tier, NOW() + v_duration)
  RETURNING id INTO v_shield_id;

  RETURN v_shield_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────
-- follow / unfollow
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION follow_user(p_follower_id UUID, p_followed_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO follows (follower_id, followed_id) VALUES (p_follower_id, p_followed_id);
  UPDATE profiles SET following_count = following_count + 1 WHERE user_id = p_follower_id;
  UPDATE profiles SET follower_count = follower_count + 1 WHERE user_id = p_followed_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION unfollow_user(p_follower_id UUID, p_followed_id UUID)
RETURNS VOID AS $$
BEGIN
  DELETE FROM follows WHERE follower_id = p_follower_id AND followed_id = p_followed_id;
  IF FOUND THEN
    UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE user_id = p_follower_id;
    UPDATE profiles SET follower_count = GREATEST(follower_count - 1, 0) WHERE user_id = p_followed_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────
-- get_user_stats: comprehensive profile stats
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'credits', p.credits,
    'total_credits_earned', p.total_credits_earned,
    'streak_days', p.streak_days,
    'cells_explored', p.cells_explored,
    'follower_count', p.follower_count,
    'following_count', p.following_count,
    'active_squares', (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id AND status = 'active'),
    'total_publications', (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id),
    'total_replacements', (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id AND is_paid = true),
    'total_votes_received', (SELECT COALESCE(SUM(vote_count), 0) FROM publications WHERE user_id = p_user_id),
    'badges', (SELECT COALESCE(json_agg(json_build_object('id', b.id, 'name', b.name, 'icon', b.icon, 'earned_at', ub.earned_at)), '[]'::json)
               FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = p_user_id)
  ) INTO v_result
  FROM profiles p
  WHERE p.user_id = p_user_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. PRICE DECAY & EXPIRATION (cron jobs)
-- ============================================================

-- Function: decay prices on inactive squares (called by cron)
CREATE OR REPLACE FUNCTION decay_square_prices()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- 20% price reduction for squares inactive > 30 days
  UPDATE squares
  SET last_price = GREATEST(FLOOR(last_price * 0.8), 0),
      updated_at = NOW()
  WHERE status = 'occupe'
    AND last_activity_at < NOW() - INTERVAL '30 days'
    AND last_price > 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Expire squares inactive > 90 days: reset to libre
  UPDATE squares
  SET status = 'libre',
      current_publication_id = NULL,
      last_price = 0,
      cagnotte = 0,
      updated_at = NOW()
  WHERE status = 'occupe'
    AND last_activity_at < NOW() - INTERVAL '90 days';

  -- Mark expired publications
  UPDATE publications p
  SET status = 'replaced'
  FROM squares s
  WHERE p.square_id = s.id
    AND p.status = 'active'
    AND s.status = 'libre'
    AND s.current_publication_id IS NULL;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================

-- Credits
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own credits" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- Shields
ALTER TABLE shields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read shields" ON shields FOR SELECT USING (true);
CREATE POLICY "Users create own shields" ON shields FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Votes
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read votes" ON votes FOR SELECT USING (true);
CREATE POLICY "Auth users vote" ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Follows
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read follows" ON follows FOR SELECT USING (true);
CREATE POLICY "Users manage own follows" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users unfollow" ON follows FOR DELETE USING (auth.uid() = follower_id);

-- Badges
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read badges" ON badges FOR SELECT USING (true);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read user badges" ON user_badges FOR SELECT USING (true);

-- Explored cells
ALTER TABLE explored_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own explored" ON explored_cells FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert explored" ON explored_cells FOR INSERT WITH CHECK (auth.uid() = user_id);
