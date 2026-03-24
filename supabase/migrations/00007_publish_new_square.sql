-- Publish to a square that may not exist yet (create from geohash)
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
    IF v_square.status NOT IN ('libre', 'remplacable') THEN
      RAISE EXCEPTION 'Square is not available (status: %)', v_square.status;
    END IF;
    v_square_id := v_square.id;
  ELSE
    -- Create the square
    INSERT INTO squares (geohash, lat, lng, status, demand_score, base_price)
    VALUES (p_geohash, p_lat, p_lng, 'libre', 0, 0)
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

  -- Create the publication
  INSERT INTO publications (user_id, square_id, image_url, status, expires_at)
  VALUES (p_user_id, v_square_id, p_image_url, 'active', NOW() + INTERVAL '24 hours')
  RETURNING id INTO v_pub_id;

  -- Update the square status
  UPDATE squares
  SET status = 'occupe_gratuit',
      current_publication_id = v_pub_id,
      updated_at = NOW()
  WHERE id = v_square_id;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
