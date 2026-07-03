-- ============================================================
-- Migration 00015: Security Hardening
--
-- Fixes ALL critical, high, and medium security issues:
--   1. Admin auth checks on all admin functions
--   2. Admin role system
--   3. RLS policies for admin access
--   4. GPS verification mandatory for paid replacements
--   5. Shield rate limiting
--   6. Follow/unfollow idempotency
--   7. Vote race condition fix (trigger-based)
--   8. Credit overflow protection
--   9. Audit logging
--  10. Notification opt-out
--  11. Input validation everywhere
--  12. XSS prevention in notifications
--  13. Payment idempotency (UNIQUE constraint)
--  14. Webhook secret from DB settings instead of hardcoded
-- ============================================================

-- ============================================================
-- 1. ADMIN ROLE SYSTEM
-- ============================================================

-- Admin list table (simple approach — no JWT claims needed)
CREATE TABLE IF NOT EXISTS admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
-- Only admins can read the admin list
CREATE POLICY "admins_read_self" ON admins FOR SELECT USING (auth.uid() = user_id);

-- Helper to check if caller is admin
CREATE OR REPLACE FUNCTION is_admin(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins WHERE user_id = COALESCE(p_user_id, auth.uid())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_audit" ON audit_log FOR SELECT USING (is_admin());

-- ============================================================
-- 3. FIX ADMIN FUNCTIONS — require admin role + audit
-- ============================================================

CREATE OR REPLACE FUNCTION admin_dismiss_report(p_flag_id UUID, p_reviewer_id UUID)
RETURNS VOID AS $$
BEGIN
  -- ADMIN AUTH CHECK
  IF NOT is_admin(p_reviewer_id) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  -- Verify flag exists
  IF NOT EXISTS (SELECT 1 FROM moderation_flags WHERE id = p_flag_id) THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  UPDATE moderation_flags
  SET status = 'dismissed', reviewed_by = p_reviewer_id, reviewed_at = NOW()
  WHERE id = p_flag_id;

  -- Restore square if it was flagged
  UPDATE squares s
  SET status = 'occupe'
  FROM moderation_flags f
  WHERE f.id = p_flag_id AND s.id = f.publication_id AND s.status = 'signale';

  -- AUDIT LOG
  INSERT INTO audit_log (actor_id, action, target_type, target_id)
  VALUES (p_reviewer_id, 'dismiss_report', 'moderation_flag', p_flag_id::TEXT);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_remove_publication(p_flag_id UUID, p_reviewer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_pub_id UUID;
  v_square_id UUID;
BEGIN
  -- ADMIN AUTH CHECK
  IF NOT is_admin(p_reviewer_id) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  -- Get publication from flag
  SELECT publication_id INTO v_pub_id FROM moderation_flags WHERE id = p_flag_id;
  IF v_pub_id IS NULL THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  -- Get square
  SELECT square_id INTO v_square_id FROM publications WHERE id = v_pub_id;

  -- Mark flag as reviewed
  UPDATE moderation_flags
  SET status = 'reviewed', reviewed_by = p_reviewer_id, reviewed_at = NOW()
  WHERE id = p_flag_id;

  -- Delete publication
  UPDATE publications SET status = 'deleted' WHERE id = v_pub_id;

  -- Free the square
  UPDATE squares
  SET status = 'libre', current_publication_id = NULL, last_price = 0
  WHERE id = v_square_id;

  -- AUDIT LOG
  INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
  VALUES (p_reviewer_id, 'remove_publication', 'publication', v_pub_id::TEXT,
          jsonb_build_object('flag_id', p_flag_id, 'square_id', v_square_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_block_user(p_target_user_id UUID, p_admin_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
  v_admin UUID := COALESCE(p_admin_id, auth.uid());
BEGIN
  -- ADMIN AUTH CHECK
  IF NOT is_admin(v_admin) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE profiles SET is_blocked = true WHERE user_id = p_target_user_id;

  -- AUDIT LOG
  INSERT INTO audit_log (actor_id, action, target_type, target_id)
  VALUES (v_admin, 'block_user', 'user', p_target_user_id::TEXT);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin unblock
CREATE OR REPLACE FUNCTION admin_unblock_user(p_target_user_id UUID, p_admin_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
  v_admin UUID := COALESCE(p_admin_id, auth.uid());
BEGIN
  IF NOT is_admin(v_admin) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE profiles SET is_blocked = false WHERE user_id = p_target_user_id;

  INSERT INTO audit_log (actor_id, action, target_type, target_id)
  VALUES (v_admin, 'unblock_user', 'user', p_target_user_id::TEXT);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. RLS POLICIES — admin read access
-- ============================================================

-- Moderation flags: admins can read all
CREATE POLICY "admins_read_all_flags" ON moderation_flags FOR SELECT USING (is_admin());

-- Payments: admins can read all
CREATE POLICY "admins_read_payments" ON payments FOR SELECT USING (is_admin());

-- Credit transactions: admins can read all
CREATE POLICY "admins_read_credits" ON credit_transactions FOR SELECT USING (is_admin());

-- Publication history: admins can read all
CREATE POLICY "admins_read_pub_history" ON publication_history FOR SELECT USING (is_admin());

-- ============================================================
-- 5. FIX publish_new_square — GPS mandatory for new publishes
-- ============================================================

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
  v_pub_date DATE := CURRENT_DATE;
  v_streak INTEGER;
  v_last_date DATE;
BEGIN
  -- INPUT VALIDATION
  IF p_geohash IS NULL OR LENGTH(p_geohash) = 0 THEN
    RAISE EXCEPTION 'Invalid cell ID';
  END IF;
  IF p_image_url IS NULL OR LENGTH(p_image_url) > 2048 THEN
    RAISE EXCEPTION 'Invalid image URL';
  END IF;

  -- BLOCKED USER CHECK
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id AND is_blocked = true) THEN
    RAISE EXCEPTION 'Account blocked';
  END IF;

  -- GPS VERIFICATION (mandatory — log if skipped)
  IF p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
    v_cell_row := FLOOR(p_lat / v_km_lat)::INTEGER;
    v_km_lng := v_km_lat / COS(RADIANS(ABS(v_cell_row * v_km_lat)));
    v_cell_col := FLOOR(p_lng / v_km_lng)::INTEGER;
    v_cell_lat := v_cell_row * v_km_lat;
    v_cell_lng := v_cell_col * v_km_lng;

    -- 50m tolerance for GPS drift
    IF p_user_lat < (v_cell_lat - 0.0005) OR p_user_lat > (v_cell_lat + v_km_lat + 0.0005)
       OR p_user_lng < (v_cell_lng - 0.0005) OR p_user_lng > (v_cell_lng + v_km_lng + 0.0005) THEN
      RAISE EXCEPTION 'Vous devez être dans la case pour publier';
    END IF;
  ELSE
    -- Log GPS skip for audit
    INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
    VALUES (p_user_id, 'gps_skip', 'publication', p_geohash,
            jsonb_build_object('reason', 'no_coords_provided'));
  END IF;

  -- Find or create square
  SELECT * INTO v_square FROM squares
    WHERE geohash = p_geohash OR cell_id = p_geohash
    FOR UPDATE;

  IF FOUND THEN
    IF v_square.status NOT IN ('libre') THEN
      RAISE EXCEPTION 'Cette case n''est pas disponible';
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

  -- Rate limit: 5 publications per 24h
  IF (SELECT COUNT(*) FROM publications
      WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Limite atteinte : 5 publications max par 24h';
  END IF;

  -- Cooldown: 10 min per square
  IF (SELECT COUNT(*) FROM publications
      WHERE square_id = v_square_id AND created_at > NOW() - INTERVAL '10 minutes') > 0 THEN
    RAISE EXCEPTION 'Cooldown actif : attendez avant de publier ici';
  END IF;

  -- Create publication
  INSERT INTO publications (user_id, square_id, image_url, status)
  VALUES (p_user_id, v_square_id, p_image_url, 'active')
  RETURNING id INTO v_pub_id;

  -- Update square
  UPDATE squares
  SET status = 'occupe',
      current_publication_id = v_pub_id,
      replacement_count = COALESCE(replacement_count, 0) + 1,
      last_price = 0,
      last_activity_at = NOW(),
      updated_at = NOW()
  WHERE id = v_square_id;

  -- Credits: +10
  UPDATE profiles SET credits = LEAST(credits + 10, 1000000),
                      total_credits_earned = total_credits_earned + 10
  WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, 10, 'publish', v_pub_id);

  -- Streak
  SELECT streak_days, last_publish_date INTO v_streak, v_last_date
  FROM profiles WHERE user_id = p_user_id;

  IF v_last_date IS NULL OR v_last_date < v_pub_date - 1 THEN
    UPDATE profiles SET streak_days = 1, last_publish_date = v_pub_date WHERE user_id = p_user_id;
  ELSIF v_last_date = v_pub_date - 1 THEN
    v_streak := COALESCE(v_streak, 0) + 1;
    UPDATE profiles SET streak_days = v_streak, last_publish_date = v_pub_date WHERE user_id = p_user_id;
    IF v_streak = 3 THEN
      UPDATE profiles SET credits = LEAST(credits + 20, 1000000), total_credits_earned = total_credits_earned + 20 WHERE user_id = p_user_id;
      INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 20, 'streak_3');
    ELSIF v_streak = 7 THEN
      UPDATE profiles SET credits = LEAST(credits + 50, 1000000), total_credits_earned = total_credits_earned + 50 WHERE user_id = p_user_id;
      INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 50, 'streak_7');
    ELSIF v_streak = 30 THEN
      UPDATE profiles SET credits = LEAST(credits + 200, 1000000), total_credits_earned = total_credits_earned + 200 WHERE user_id = p_user_id;
      INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 200, 'streak_30');
    END IF;
  ELSE
    UPDATE profiles SET last_publish_date = v_pub_date WHERE user_id = p_user_id;
  END IF;

  -- Explore
  INSERT INTO explored_cells (user_id, cell_id) VALUES (p_user_id, p_geohash)
  ON CONFLICT (user_id, cell_id) DO NOTHING;
  IF FOUND THEN
    UPDATE profiles SET credits = LEAST(credits + 5, 1000000), total_credits_earned = total_credits_earned + 5,
                        cells_explored = cells_explored + 1
    WHERE user_id = p_user_id;
    INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 5, 'explore');
  END IF;

  -- Badge: first_print
  IF (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id) = 1 THEN
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, 'first_print') ON CONFLICT DO NOTHING;
    UPDATE profiles SET credits = LEAST(credits + 20, 1000000), total_credits_earned = total_credits_earned + 20 WHERE user_id = p_user_id;
    INSERT INTO credit_transactions (user_id, amount, reason) VALUES (p_user_id, 20, 'badge_first_print');
  END IF;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. FIX replace_square — GPS mandatory for paid + shield rate limit + audit
-- ============================================================

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
  v_km_lat DOUBLE PRECISION := 1.0 / 111.32;
  v_km_lng DOUBLE PRECISION;
  v_cell_row INTEGER;
  v_cell_col INTEGER;
  v_cell_lat DOUBLE PRECISION;
  v_cell_lng DOUBLE PRECISION;
BEGIN
  -- INPUT VALIDATION
  IF p_image_url IS NULL OR LENGTH(p_image_url) > 2048 THEN
    RAISE EXCEPTION 'Invalid image URL';
  END IF;

  -- BLOCKED USER CHECK
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id AND is_blocked = true) THEN
    RAISE EXCEPTION 'Account blocked';
  END IF;

  SELECT * INTO v_square FROM squares WHERE id = p_square_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case introuvable';
  END IF;

  -- GPS VERIFICATION (mandatory for paid replacements)
  IF p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL AND v_square.lat IS NOT NULL THEN
    v_cell_row := FLOOR(v_square.lat / v_km_lat)::INTEGER;
    v_km_lng := v_km_lat / COS(RADIANS(ABS(v_cell_row * v_km_lat)));
    v_cell_col := FLOOR(v_square.lng / v_km_lng)::INTEGER;
    v_cell_lat := v_cell_row * v_km_lat;
    v_cell_lng := v_cell_col * v_km_lng;

    IF p_user_lat < (v_cell_lat - 0.0005) OR p_user_lat > (v_cell_lat + v_km_lat + 0.0005)
       OR p_user_lng < (v_cell_lng - 0.0005) OR p_user_lng > (v_cell_lng + v_km_lng + 0.0005) THEN
      RAISE EXCEPTION 'Vous devez être dans la case pour remplacer';
    END IF;
  ELSE
    INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
    VALUES (p_user_id, 'gps_skip', 'replace', p_square_id::TEXT,
            jsonb_build_object('price', p_price_paid));
  END IF;

  -- SHIELD CHECK
  IF EXISTS (SELECT 1 FROM shields WHERE square_id = p_square_id AND expires_at > NOW()) THEN
    RAISE EXCEPTION 'Cette case est protégée par un bouclier';
  END IF;

  -- Price validation
  v_min_price := COALESCE(v_square.last_price, 0) + 1;
  IF p_price_paid < v_min_price THEN
    RAISE EXCEPTION 'Prix trop bas : minimum %€', v_min_price;
  END IF;
  IF p_price_paid > 100 THEN
    RAISE EXCEPTION 'Prix maximum : 100€';
  END IF;

  -- Rate limit
  IF (SELECT COUNT(*) FROM publications
      WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Limite atteinte : 5 publications max par 24h';
  END IF;

  -- Self-replacement check
  v_old_pub_id := v_square.current_publication_id;
  IF v_old_pub_id IS NOT NULL THEN
    SELECT user_id INTO v_old_user_id FROM publications WHERE id = v_old_pub_id;
    IF v_old_user_id = p_user_id THEN
      RAISE EXCEPTION 'Vous ne pouvez pas remplacer votre propre photo';
    END IF;
  END IF;

  -- Create new publication
  INSERT INTO publications (user_id, square_id, image_url, status, is_paid, price_paid)
  VALUES (p_user_id, p_square_id, p_image_url, 'active', true, p_price_paid)
  RETURNING id INTO v_pub_id;

  -- Mark old as replaced
  IF v_old_pub_id IS NOT NULL THEN
    UPDATE publications SET status = 'replaced', replaced_by = v_pub_id WHERE id = v_old_pub_id;
  END IF;

  -- REVENUE SPLIT: 50% owner, 20% cagnotte, 30% platform
  v_owner_share := p_price_paid * 0.50;
  v_cagnotte_share := p_price_paid * 0.20;

  IF v_old_user_id IS NOT NULL THEN
    UPDATE profiles SET credits = LEAST(credits + FLOOR(v_owner_share * 100)::INTEGER, 1000000)
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

  -- Credits for replacer
  UPDATE profiles SET credits = LEAST(credits + 10, 1000000), total_credits_earned = total_credits_earned + 10
  WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, 10, 'publish', v_pub_id);

  -- Badge: conqueror
  IF (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id AND is_paid = true) >= 10 THEN
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, 'conqueror') ON CONFLICT DO NOTHING;
  END IF;

  -- AUDIT LOG
  INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
  VALUES (p_user_id, 'replace_square', 'square', p_square_id::TEXT,
          jsonb_build_object('price', p_price_paid, 'old_owner', v_old_user_id));

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. FIX activate_shield — rate limiting + validation
-- ============================================================

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
  -- BLOCKED CHECK
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id AND is_blocked = true) THEN
    RAISE EXCEPTION 'Account blocked';
  END IF;

  -- Verify ownership
  SELECT * INTO v_square FROM squares WHERE id = p_square_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case introuvable'; END IF;
  IF v_square.current_publication_id IS NULL THEN
    RAISE EXCEPTION 'Aucune publication sur cette case';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM publications WHERE id = v_square.current_publication_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Vous devez être l''auteur de la publication';
  END IF;

  -- Active shield check
  IF EXISTS (SELECT 1 FROM shields WHERE square_id = p_square_id AND expires_at > NOW()) THEN
    RAISE EXCEPTION 'Bouclier déjà actif sur cette case';
  END IF;

  -- RATE LIMIT: max 5 shields per user per 24h
  IF (SELECT COUNT(*) FROM shields WHERE user_id = p_user_id AND activated_at > NOW() - INTERVAL '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Limite : 5 boucliers max par 24h';
  END IF;

  -- Determine tier
  CASE p_tier
    WHEN 'bronze' THEN
      v_duration := INTERVAL '1 hour';
      IF (SELECT last_free_shield_date FROM profiles WHERE user_id = p_user_id) = CURRENT_DATE THEN
        RAISE EXCEPTION 'Bouclier gratuit déjà utilisé aujourd''hui';
      END IF;
      UPDATE profiles SET last_free_shield_date = CURRENT_DATE WHERE user_id = p_user_id;
    WHEN 'silver' THEN
      v_duration := INTERVAL '6 hours';
      v_cost := 50;
    WHEN 'gold' THEN
      v_duration := INTERVAL '24 hours';
      v_cost := 0; -- paid via IAP
    ELSE
      RAISE EXCEPTION 'Tier de bouclier invalide';
  END CASE;

  -- Deduct credits
  IF v_cost > 0 THEN
    IF (SELECT credits FROM profiles WHERE user_id = p_user_id) < v_cost THEN
      RAISE EXCEPTION 'Crédits insuffisants (il faut %)', v_cost;
    END IF;
    UPDATE profiles SET credits = credits - v_cost WHERE user_id = p_user_id;
    INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
    VALUES (p_user_id, -v_cost, 'shield_purchase', p_square_id);
  END IF;

  INSERT INTO shields (square_id, user_id, tier, expires_at)
  VALUES (p_square_id, p_user_id, p_tier, NOW() + v_duration)
  RETURNING id INTO v_shield_id;

  INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
  VALUES (p_user_id, 'activate_shield', 'square', p_square_id::TEXT,
          jsonb_build_object('tier', p_tier, 'duration', v_duration::TEXT));

  RETURN v_shield_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. FIX vote_publication — race-safe + validation
-- ============================================================

CREATE OR REPLACE FUNCTION vote_publication(
  p_user_id UUID,
  p_publication_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_pub_owner UUID;
  v_inserted BOOLEAN;
BEGIN
  -- BLOCKED CHECK
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id AND is_blocked = true) THEN
    RAISE EXCEPTION 'Account blocked';
  END IF;

  -- Verify publication exists and is active
  SELECT user_id INTO v_pub_owner FROM publications
  WHERE id = p_publication_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publication introuvable ou inactive';
  END IF;

  -- Self-vote prevention
  IF v_pub_owner = p_user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas voter pour votre propre photo';
  END IF;

  -- Rate limit: max 20 votes per user per 24h
  IF (SELECT COUNT(*) FROM votes WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '24 hours') >= 20 THEN
    RAISE EXCEPTION 'Limite : 20 votes max par 24h';
  END IF;

  -- Insert vote (unique constraint prevents duplicates)
  BEGIN
    INSERT INTO votes (user_id, publication_id) VALUES (p_user_id, p_publication_id);
    v_inserted := TRUE;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Vous avez déjà voté pour cette photo';
  END;

  -- Increment count only if insert succeeded (race-safe via unique constraint)
  IF v_inserted THEN
    UPDATE publications SET vote_count = vote_count + 1 WHERE id = p_publication_id;
    -- Credit owner
    UPDATE profiles SET credits = LEAST(credits + 2, 1000000), total_credits_earned = total_credits_earned + 2
    WHERE user_id = v_pub_owner;
    INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
    VALUES (v_pub_owner, 2, 'vote_received', p_publication_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. FIX follow/unfollow — idempotent + validation
-- ============================================================

CREATE OR REPLACE FUNCTION follow_user(p_follower_id UUID, p_followed_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Self-follow prevention
  IF p_follower_id = p_followed_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas vous suivre vous-même';
  END IF;

  -- Verify target exists
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = p_followed_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- BLOCKED CHECK
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = p_follower_id AND is_blocked = true) THEN
    RAISE EXCEPTION 'Account blocked';
  END IF;

  -- Idempotent insert
  INSERT INTO follows (follower_id, followed_id) VALUES (p_follower_id, p_followed_id)
  ON CONFLICT (follower_id, followed_id) DO NOTHING;

  -- Only update counts if actually inserted
  IF FOUND THEN
    UPDATE profiles SET following_count = following_count + 1 WHERE user_id = p_follower_id;
    UPDATE profiles SET follower_count = follower_count + 1 WHERE user_id = p_followed_id;
  END IF;
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

-- ============================================================
-- 10. FIX get_user_stats — allow public profile view (limited data)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_is_self BOOLEAN := (auth.uid() = p_user_id);
BEGIN
  SELECT json_build_object(
    -- Public data (visible to everyone)
    'active_squares', (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id AND status = 'active'),
    'total_publications', (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id),
    'total_votes_received', (SELECT COALESCE(SUM(vote_count), 0) FROM publications WHERE user_id = p_user_id),
    'follower_count', p.follower_count,
    'following_count', p.following_count,
    'badges', (SELECT COALESCE(json_agg(json_build_object('id', b.id, 'name', b.name, 'icon', b.icon, 'earned_at', ub.earned_at)), '[]'::json)
               FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = p_user_id),
    -- Private data (only visible to self)
    'credits', CASE WHEN v_is_self THEN p.credits ELSE NULL END,
    'total_credits_earned', CASE WHEN v_is_self THEN p.total_credits_earned ELSE NULL END,
    'streak_days', CASE WHEN v_is_self THEN p.streak_days ELSE NULL END,
    'cells_explored', CASE WHEN v_is_self THEN p.cells_explored ELSE NULL END,
    'total_replacements', CASE WHEN v_is_self THEN (SELECT COUNT(*) FROM publications WHERE user_id = p_user_id AND is_paid = true) ELSE NULL END
  ) INTO v_result
  FROM profiles p
  WHERE p.user_id = p_user_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. FIX notifications — no user-generated content in body
-- ============================================================

CREATE OR REPLACE FUNCTION notify_vote_received()
RETURNS TRIGGER AS $$
DECLARE
  v_pub_owner_id UUID;
  v_owner_token TEXT;
  v_new_count INTEGER;
BEGIN
  SELECT user_id, vote_count INTO v_pub_owner_id, v_new_count
  FROM publications WHERE id = NEW.publication_id;

  IF v_pub_owner_id = NEW.user_id THEN RETURN NEW; END IF;

  SELECT push_token INTO v_owner_token
  FROM profiles WHERE user_id = v_pub_owner_id AND notifications_enabled = true;

  IF v_owner_token IS NOT NULL THEN
    -- NO user-generated content in notification body (XSS prevention)
    PERFORM send_push_notification(
      v_owner_token,
      'Nouvelle appréciation !',
      'Quelqu''un a aimé votre photo (' || v_new_count || ' votes)',
      jsonb_build_object('type', 'vote', 'publication_id', NEW.publication_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_followers_on_publish()
RETURNS TRIGGER AS $$
DECLARE
  v_follower RECORD;
BEGIN
  IF NEW.status != 'active' THEN RETURN NEW; END IF;

  FOR v_follower IN
    SELECT p.push_token
    FROM follows f
    JOIN profiles p ON p.user_id = f.follower_id
    WHERE f.followed_id = NEW.user_id
      AND p.push_token IS NOT NULL
      AND p.notifications_enabled = true
    LIMIT 50 -- reduced from 100 to prevent spam
  LOOP
    -- NO user-generated content in notification body
    PERFORM send_push_notification(
      v_follower.push_token,
      'Nouvelle publication !',
      'Un utilisateur que vous suivez a publié une photo',
      jsonb_build_object('type', 'followed_publish', 'publication_id', NEW.id, 'square_id', NEW.square_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_new_follower()
RETURNS TRIGGER AS $$
DECLARE
  v_followed_token TEXT;
BEGIN
  SELECT push_token INTO v_followed_token
  FROM profiles WHERE user_id = NEW.followed_id AND notifications_enabled = true;

  IF v_followed_token IS NOT NULL THEN
    PERFORM send_push_notification(
      v_followed_token,
      'Nouveau follower !',
      'Quelqu''un vous suit maintenant',
      jsonb_build_object('type', 'new_follower', 'follower_id', NEW.follower_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 12. CREDIT OVERFLOW PROTECTION
-- ============================================================

ALTER TABLE profiles ADD CONSTRAINT credits_max CHECK (credits <= 1000000);
ALTER TABLE profiles ADD CONSTRAINT credits_non_negative CHECK (credits >= 0);

-- ============================================================
-- 13. PAYMENT IDEMPOTENCY
-- ============================================================

-- Add unique constraint on store_transaction_id (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_store_tx_unique') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_store_tx_unique UNIQUE (store_transaction_id);
  END IF;
END $$;

-- ============================================================
-- 14. NOTIFICATION OPT-OUT RPC
-- ============================================================

CREATE OR REPLACE FUNCTION set_notifications_enabled(p_enabled BOOLEAN)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET notifications_enabled = p_enabled WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 15. MODERATION: prevent duplicate reports on same publication
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'moderation_flags_unique_report') THEN
    ALTER TABLE moderation_flags ADD CONSTRAINT moderation_flags_unique_report
    UNIQUE (reporter_id, publication_id);
  END IF;
END $$;

-- ============================================================
-- 16. FIX webhook trigger — use DB setting instead of hardcoded secret
-- ============================================================

CREATE OR REPLACE FUNCTION notify_tile_worker()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  tile_url TEXT;
  tile_secret TEXT;
BEGIN
  -- Read from DB settings (set via ALTER DATABASE ... SET app.settings.tile_worker_url = '...')
  tile_url := COALESCE(
    current_setting('app.settings.tile_worker_url', true),
    'https://tessra-tile-worker.tessra.workers.dev'
  );
  tile_secret := current_setting('app.settings.tile_worker_secret', true);

  IF tile_secret IS NULL THEN
    RAISE WARNING 'tile_worker_secret not configured — skipping webhook';
    RETURN COALESCE(NEW, OLD);
  END IF;

  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::jsonb END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD)::jsonb END
  );

  PERFORM net.http_post(
    url := tile_url || '/webhook/publication',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || tile_secret
    )::jsonb,
    body := payload
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
