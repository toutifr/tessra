-- Migration: permanent-bidding
-- Remove ephemeral 24h model, replace with permanent photos + incremental pricing

-- ============================================================
-- 1. Add new columns to squares
-- ============================================================
ALTER TABLE squares ADD COLUMN replacement_count INT NOT NULL DEFAULT 0;
ALTER TABLE squares ADD COLUMN last_price DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Migrate status enum
-- ============================================================

-- First migrate all data to simplified statuses
UPDATE squares SET status = 'occupe_gratuit' WHERE status IN ('occupe_payant', 'en_expiration', 'remplacable');
UPDATE squares SET status = 'signale' WHERE status = 'en_moderation';

-- Create the new enum type
CREATE TYPE square_status_new AS ENUM ('libre', 'occupe', 'signale', 'bloque');

-- Swap enum: need to alter column type via a cast
ALTER TABLE squares
  ALTER COLUMN status TYPE square_status_new
  USING CASE
    WHEN status::text = 'occupe_gratuit' THEN 'occupe'::square_status_new
    WHEN status::text = 'occupe_payant' THEN 'occupe'::square_status_new
    ELSE status::text::square_status_new
  END;

-- Drop old enum and rename new one
DROP TYPE square_status;
ALTER TYPE square_status_new RENAME TO square_status;

-- ============================================================
-- 3. Remove deprecated columns from squares
-- ============================================================
ALTER TABLE squares DROP COLUMN demand_score;
ALTER TABLE squares DROP COLUMN base_price;

-- ============================================================
-- 4. Remove expires_at from publications (make nullable first for safety)
-- ============================================================
ALTER TABLE publications ALTER COLUMN expires_at DROP NOT NULL;
-- Drop the index on expires_at
DROP INDEX IF EXISTS idx_publications_expires_at;
-- Remove the column
ALTER TABLE publications DROP COLUMN expires_at;

-- ============================================================
-- 5. Drop square_demand table
-- ============================================================
DROP TABLE IF EXISTS square_demand;

-- ============================================================
-- 6. Remove cron jobs for expiration and demand cleanup
-- ============================================================
SELECT cron.unschedule('expire-publications');
SELECT cron.unschedule('update-expiring-squares');
SELECT cron.unschedule('cleanup-demand');

-- Drop the functions that are no longer needed
DROP FUNCTION IF EXISTS update_expiring_squares();
DROP FUNCTION IF EXISTS cleanup_old_demand();

-- ============================================================
-- 7. Update publish_to_square RPC for new model
-- ============================================================
CREATE OR REPLACE FUNCTION publish_to_square(
  p_square_id UUID,
  p_user_id UUID,
  p_image_url TEXT
)
RETURNS UUID AS $$
DECLARE
  v_square squares%ROWTYPE;
  v_pub_id UUID;
BEGIN
  -- Lock the square row to prevent concurrent publications
  SELECT * INTO v_square FROM squares WHERE id = p_square_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Square not found';
  END IF;

  -- Only allow free publish on libre squares
  IF v_square.status != 'libre' THEN
    RAISE EXCEPTION 'Square is not available (status: %)', v_square.status;
  END IF;

  -- Check rate limit: max 5 publications per user per 24h
  IF (
    SELECT COUNT(*) FROM publications
    WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '24 hours'
  ) >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 5 publications per 24h';
  END IF;

  -- Check cooldown: 10-min between publications on same square
  IF (
    SELECT COUNT(*) FROM publications
    WHERE square_id = p_square_id
    AND created_at > NOW() - INTERVAL '10 minutes'
  ) > 0 THEN
    RAISE EXCEPTION 'Cooldown active: wait before publishing on this square';
  END IF;

  -- Create the publication (no expires_at)
  INSERT INTO publications (user_id, square_id, image_url, status)
  VALUES (p_user_id, p_square_id, p_image_url, 'active')
  RETURNING id INTO v_pub_id;

  -- Update the square
  UPDATE squares
  SET status = 'occupe',
      current_publication_id = v_pub_id,
      replacement_count = replacement_count + 1,
      last_price = 0,
      updated_at = NOW()
  WHERE id = p_square_id;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. Update publish_new_square RPC for new model
-- ============================================================
CREATE OR REPLACE FUNCTION publish_new_square(
  p_geohash TEXT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_user_id UUID,
  p_image_url TEXT
)
RETURNS UUID AS $$
DECLARE
  v_square_id UUID;
  v_square squares%ROWTYPE;
  v_pub_id UUID;
BEGIN
  -- Try to find existing square by geohash
  SELECT * INTO v_square FROM squares WHERE geohash = p_geohash FOR UPDATE;

  IF FOUND THEN
    -- Square exists — check if it's available
    IF v_square.status != 'libre' THEN
      RAISE EXCEPTION 'Square is not available (status: %)', v_square.status;
    END IF;
    v_square_id := v_square.id;
  ELSE
    -- Create the square
    INSERT INTO squares (geohash, lat, lng, status)
    VALUES (p_geohash, p_lat, p_lng, 'libre')
    RETURNING id INTO v_square_id;
  END IF;

  -- Check rate limit: max 5 publications per user per 24h
  IF (
    SELECT COUNT(*) FROM publications
    WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '24 hours'
  ) >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 5 publications per 24h';
  END IF;

  -- Check cooldown: 10-min between publications on same square
  IF (
    SELECT COUNT(*) FROM publications
    WHERE square_id = v_square_id
    AND created_at > NOW() - INTERVAL '10 minutes'
  ) > 0 THEN
    RAISE EXCEPTION 'Cooldown active: wait before publishing on this square';
  END IF;

  -- Create the publication (no expires_at)
  INSERT INTO publications (user_id, square_id, image_url, status)
  VALUES (p_user_id, v_square_id, p_image_url, 'active')
  RETURNING id INTO v_pub_id;

  -- Update the square status
  UPDATE squares
  SET status = 'occupe',
      current_publication_id = v_pub_id,
      replacement_count = replacement_count + 1,
      last_price = 0,
      updated_at = NOW()
  WHERE id = v_square_id;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. Replace takeover_square with replace_square RPC
-- ============================================================
DROP FUNCTION IF EXISTS takeover_square(UUID, UUID, TEXT, DECIMAL);

CREATE OR REPLACE FUNCTION replace_square(
  p_square_id UUID,
  p_user_id UUID,
  p_image_url TEXT,
  p_price_paid DECIMAL
)
RETURNS UUID AS $$
DECLARE
  v_square squares%ROWTYPE;
  v_old_pub publications%ROWTYPE;
  v_pub_id UUID;
  v_min_price DECIMAL;
BEGIN
  -- Lock the square row
  SELECT * INTO v_square FROM squares WHERE id = p_square_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Square not found';
  END IF;

  IF v_square.status != 'occupe' THEN
    RAISE EXCEPTION 'Square is not occupied (status: %)', v_square.status;
  END IF;

  -- Calculate minimum price: replacement_count * 1.00
  v_min_price := v_square.replacement_count * 1.00;

  -- Validate price
  IF p_price_paid < v_min_price THEN
    RAISE EXCEPTION 'Price too low: minimum is %€ (paid: %€)', v_min_price, p_price_paid;
  END IF;

  -- Archive the old publication
  IF v_square.current_publication_id IS NOT NULL THEN
    SELECT * INTO v_old_pub FROM publications WHERE id = v_square.current_publication_id;

    IF FOUND THEN
      UPDATE publications SET status = 'replaced' WHERE id = v_old_pub.id;

      INSERT INTO publication_history (
        publication_id, user_id, square_id, image_url,
        started_at, ended_at, status, acquisition_mode, end_reason
      ) VALUES (
        v_old_pub.id, v_old_pub.user_id, v_old_pub.square_id, v_old_pub.image_url,
        v_old_pub.started_at, NOW(), 'replaced',
        CASE WHEN v_old_pub.is_paid THEN 'paid' ELSE 'free' END,
        'replaced_by_user'
      );
    END IF;
  END IF;

  -- Create new publication
  INSERT INTO publications (user_id, square_id, image_url, status, is_paid, price_paid)
  VALUES (p_user_id, p_square_id, p_image_url, 'active', TRUE, p_price_paid)
  RETURNING id INTO v_pub_id;

  -- Link old publication to new one
  IF v_square.current_publication_id IS NOT NULL THEN
    UPDATE publications SET replaced_by = v_pub_id WHERE id = v_square.current_publication_id;
  END IF;

  -- Update the square
  UPDATE squares
  SET current_publication_id = v_pub_id,
      replacement_count = replacement_count + 1,
      last_price = p_price_paid,
      updated_at = NOW()
  WHERE id = p_square_id;

  -- Notify the previous owner that their square was replaced
  IF v_old_pub.user_id IS NOT NULL THEN
    PERFORM pg_notify('push_notification', json_build_object(
      'user_id', v_old_pub.user_id,
      'title', 'Quelqu''un a pris ta place',
      'body', format('Ta photo a été remplacée pour %s€', p_price_paid),
      'data', json_build_object('square_id', p_square_id, 'price_paid', p_price_paid)
    )::text);
  END IF;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. Remove extend_publication function
-- ============================================================
DROP FUNCTION IF EXISTS extend_publication(UUID, UUID, DECIMAL);
