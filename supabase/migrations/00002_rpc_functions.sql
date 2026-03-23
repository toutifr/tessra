-- Publish to a square (free post) with row-level locking
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

  IF v_square.status NOT IN ('libre', 'remplacable') THEN
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

  -- Create the publication
  INSERT INTO publications (user_id, square_id, image_url, status, expires_at)
  VALUES (p_user_id, p_square_id, p_image_url, 'active', NOW() + INTERVAL '24 hours')
  RETURNING id INTO v_pub_id;

  -- Update the square
  UPDATE squares
  SET status = 'occupe_gratuit',
      current_publication_id = v_pub_id,
      updated_at = NOW()
  WHERE id = p_square_id;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Paid takeover of a square
CREATE OR REPLACE FUNCTION takeover_square(
  p_square_id UUID,
  p_user_id UUID,
  p_image_url TEXT,
  p_price DECIMAL
)
RETURNS UUID AS $$
DECLARE
  v_square squares%ROWTYPE;
  v_old_pub publications%ROWTYPE;
  v_pub_id UUID;
BEGIN
  SELECT * INTO v_square FROM squares WHERE id = p_square_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Square not found';
  END IF;

  -- Archive the old publication if it exists
  IF v_square.current_publication_id IS NOT NULL THEN
    SELECT * INTO v_old_pub FROM publications WHERE id = v_square.current_publication_id;

    IF FOUND THEN
      -- Mark old publication as replaced
      UPDATE publications
      SET status = 'replaced'
      WHERE id = v_old_pub.id;

      -- Record in history
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

  -- Create new paid publication
  INSERT INTO publications (user_id, square_id, image_url, status, expires_at, is_paid, price_paid)
  VALUES (p_user_id, p_square_id, p_image_url, 'active', NOW() + INTERVAL '24 hours', TRUE, p_price)
  RETURNING id INTO v_pub_id;

  -- Link old publication to new one
  IF v_square.current_publication_id IS NOT NULL THEN
    UPDATE publications SET replaced_by = v_pub_id WHERE id = v_square.current_publication_id;
  END IF;

  -- Update the square
  UPDATE squares
  SET status = 'occupe_payant',
      current_publication_id = v_pub_id,
      updated_at = NOW()
  WHERE id = p_square_id;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Extend a publication by 24h
CREATE OR REPLACE FUNCTION extend_publication(
  p_publication_id UUID,
  p_user_id UUID,
  p_price DECIMAL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_pub publications%ROWTYPE;
BEGIN
  SELECT * INTO v_pub FROM publications WHERE id = p_publication_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publication not found';
  END IF;

  IF v_pub.user_id != p_user_id THEN
    RAISE EXCEPTION 'Not the publication owner';
  END IF;

  IF v_pub.status != 'active' THEN
    RAISE EXCEPTION 'Publication is not active';
  END IF;

  -- Extend by 24h
  UPDATE publications
  SET expires_at = expires_at + INTERVAL '24 hours',
      is_paid = TRUE,
      price_paid = COALESCE(price_paid, 0) + p_price
  WHERE id = p_publication_id;

  -- Update square status
  UPDATE squares
  SET status = 'occupe_payant',
      updated_at = NOW()
  WHERE current_publication_id = p_publication_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update squares entering expiration window (last hour)
CREATE OR REPLACE FUNCTION update_expiring_squares()
RETURNS void AS $$
BEGIN
  UPDATE squares s
  SET status = 'en_expiration', updated_at = NOW()
  FROM publications p
  WHERE s.current_publication_id = p.id
    AND p.status = 'active'
    AND p.expires_at <= NOW() + INTERVAL '1 hour'
    AND p.expires_at > NOW()
    AND s.status IN ('occupe_gratuit', 'occupe_payant');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cron jobs
-- Note: pg_net extension must be enabled (done in 00001)
-- expire-publications: calls edge function every minute
SELECT cron.schedule('expire-publications', '*/1 * * * *', $$
  SELECT extensions.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/expire-publications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
$$);

-- update-expiring-squares: mark squares in last hour as en_expiration
SELECT cron.schedule('update-expiring-squares', '*/1 * * * *', $$
  SELECT update_expiring_squares();
$$);
