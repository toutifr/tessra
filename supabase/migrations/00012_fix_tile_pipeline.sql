-- Fix the complete photo → tile pipeline:
-- 1. Restore cell_id in publish_new_square (dropped by 00010)
-- 2. Fix webhook trigger to use net.http_post with hardcoded URL
-- 3. Backfill cell_id for existing squares
-- 4. Fix replace_square to preserve cell_id

-- ============================================================
-- 1. Fix publish_new_square: restore cell_id support
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
  -- Try to find existing square by geohash OR cell_id
  SELECT * INTO v_square FROM squares
    WHERE geohash = p_geohash OR cell_id = p_geohash
    FOR UPDATE;

  IF FOUND THEN
    IF v_square.status NOT IN ('libre') THEN
      RAISE EXCEPTION 'Square is not available (status: %)', v_square.status;
    END IF;
    v_square_id := v_square.id;

    -- Ensure cell_id is set (backfill if missing)
    IF v_square.cell_id IS NULL THEN
      UPDATE squares SET cell_id = p_geohash WHERE id = v_square_id;
    END IF;
  ELSE
    -- Create the square WITH cell_id
    INSERT INTO squares (geohash, cell_id, lat, lng, status)
    VALUES (p_geohash, p_geohash, p_lat, p_lng, 'libre')
    RETURNING id INTO v_square_id;
  END IF;

  -- Rate limit: max 5 publications per user per 24h
  IF (
    SELECT COUNT(*) FROM publications
    WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '24 hours'
  ) >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 5 publications per 24h';
  END IF;

  -- Cooldown: 10-min between publications on same square
  IF (
    SELECT COUNT(*) FROM publications
    WHERE square_id = v_square_id
    AND created_at > NOW() - INTERVAL '10 minutes'
  ) > 0 THEN
    RAISE EXCEPTION 'Cooldown active: wait before publishing on this square';
  END IF;

  -- Create the publication (permanent, no expires_at)
  INSERT INTO publications (user_id, square_id, image_url, status)
  VALUES (p_user_id, v_square_id, p_image_url, 'active')
  RETURNING id INTO v_pub_id;

  -- Update the square
  UPDATE squares
  SET status = 'occupe',
      current_publication_id = v_pub_id,
      replacement_count = COALESCE(replacement_count, 0) + 1,
      last_price = 0,
      updated_at = NOW()
  WHERE id = v_square_id;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Fix replace_square: preserve cell_id
-- ============================================================
CREATE OR REPLACE FUNCTION replace_square(
  p_square_id UUID,
  p_user_id UUID,
  p_image_url TEXT,
  p_price_paid DECIMAL DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_square squares%ROWTYPE;
  v_pub_id UUID;
  v_old_pub_id UUID;
  v_min_price DECIMAL;
BEGIN
  SELECT * INTO v_square FROM squares WHERE id = p_square_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Square not found';
  END IF;

  -- Calculate minimum price
  v_min_price := COALESCE(v_square.last_price, 0) + 1;
  IF p_price_paid < v_min_price THEN
    RAISE EXCEPTION 'Price too low: minimum is %', v_min_price;
  END IF;

  -- Rate limit
  IF (
    SELECT COUNT(*) FROM publications
    WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '24 hours'
  ) >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;

  -- Mark old publication as replaced
  v_old_pub_id := v_square.current_publication_id;

  -- Create new publication
  INSERT INTO publications (user_id, square_id, image_url, status, is_paid, price_paid)
  VALUES (p_user_id, p_square_id, p_image_url, 'active', true, p_price_paid)
  RETURNING id INTO v_pub_id;

  IF v_old_pub_id IS NOT NULL THEN
    UPDATE publications
    SET status = 'replaced', replaced_by = v_pub_id
    WHERE id = v_old_pub_id;
  END IF;

  -- Update square
  UPDATE squares
  SET status = 'occupe',
      current_publication_id = v_pub_id,
      replacement_count = COALESCE(replacement_count, 0) + 1,
      last_price = p_price_paid,
      updated_at = NOW()
  WHERE id = p_square_id;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Fix webhook trigger: use net.http_post with hardcoded URL
-- ============================================================

-- Make sure pg_net is enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Drop old trigger first
DROP TRIGGER IF EXISTS trg_tile_worker_publication ON publications;
DROP FUNCTION IF EXISTS notify_tile_worker();

CREATE OR REPLACE FUNCTION notify_tile_worker()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  tile_url TEXT := 'https://tessra-tile-worker.tessra.workers.dev';
  tile_secret TEXT := 'tessra-tile-secret-2026-xK9mP4qR';
BEGIN
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

CREATE TRIGGER trg_tile_worker_publication
  AFTER INSERT OR UPDATE OR DELETE ON publications
  FOR EACH ROW
  EXECUTE FUNCTION notify_tile_worker();

-- ============================================================
-- 4. Backfill cell_id for any existing squares that have lat/lng
--    Uses the same math as kmGrid.ts:
--    row = floor(lat / KM_LAT), col = floor(lng / kmLng(lat))
--    KM_LAT = 1/111.32
-- ============================================================
-- Skip squares where the computed cell_id already belongs to another row
UPDATE squares s
SET cell_id = computed.cid
FROM (
  SELECT id,
    'r' || FLOOR(lat / (1.0/111.32))::INT || 'c' || FLOOR(lng / ((1.0/111.32) / COS(RADIANS(ABS(FLOOR(lat / (1.0/111.32))::INT * (1.0/111.32))))))::INT AS cid
  FROM squares
  WHERE cell_id IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
) computed
WHERE s.id = computed.id
  AND NOT EXISTS (SELECT 1 FROM squares x WHERE x.cell_id = computed.cid);
