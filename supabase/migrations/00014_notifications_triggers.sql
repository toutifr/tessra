-- ============================================================
-- Migration 00014: Push notification triggers
--
-- Sends Expo push notifications via pg_net for:
--   1. Photo replaced
--   2. Shield expiring (1h before)
--   3. Followed user published
--   4. Vote received
-- ============================================================

-- Helper function: send Expo push notification via pg_net
CREATE OR REPLACE FUNCTION send_push_notification(
  p_push_token TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID AS $$
BEGIN
  IF p_push_token IS NULL OR p_push_token = '' THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'to', p_push_token,
      'title', p_title,
      'body', p_body,
      'data', p_data,
      'sound', 'default'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────
-- Trigger: notify when a publication is replaced
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_publication_replaced()
RETURNS TRIGGER AS $$
DECLARE
  v_old_user_token TEXT;
  v_old_username TEXT;
  v_square_cell_id TEXT;
BEGIN
  -- Only trigger when status changes from 'active' to 'replaced'
  IF OLD.status = 'active' AND NEW.status = 'replaced' THEN
    -- Get the old user's push token
    SELECT p.push_token, p.username, s.cell_id
    INTO v_old_user_token, v_old_username, v_square_cell_id
    FROM profiles p
    JOIN squares s ON s.id = OLD.square_id
    WHERE p.user_id = OLD.user_id
      AND p.notifications_enabled = true;

    IF v_old_user_token IS NOT NULL THEN
      PERFORM send_push_notification(
        v_old_user_token,
        'Votre photo a été remplacée !',
        'Quelqu''un a pris votre place. Reprenez-la !',
        jsonb_build_object('type', 'replaced', 'square_id', OLD.square_id, 'cell_id', v_square_cell_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_replaced ON publications;
CREATE TRIGGER trg_notify_replaced
  AFTER UPDATE ON publications
  FOR EACH ROW
  EXECUTE FUNCTION notify_publication_replaced();

-- ────────────────────────────────────────────────
-- Trigger: notify when a vote is received
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_vote_received()
RETURNS TRIGGER AS $$
DECLARE
  v_pub_owner_id UUID;
  v_owner_token TEXT;
  v_voter_name TEXT;
  v_new_count INTEGER;
BEGIN
  -- Get publication owner
  SELECT user_id, vote_count INTO v_pub_owner_id, v_new_count
  FROM publications WHERE id = NEW.publication_id;

  -- Don't notify self-votes
  IF v_pub_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get owner's push token
  SELECT push_token INTO v_owner_token
  FROM profiles
  WHERE user_id = v_pub_owner_id AND notifications_enabled = true;

  -- Get voter's name
  SELECT username INTO v_voter_name
  FROM profiles WHERE user_id = NEW.user_id;

  IF v_owner_token IS NOT NULL THEN
    PERFORM send_push_notification(
      v_owner_token,
      'Nouvelle appréciation !',
      COALESCE(v_voter_name, 'Quelqu''un') || ' a aimé votre photo (' || v_new_count || ' votes)',
      jsonb_build_object('type', 'vote', 'publication_id', NEW.publication_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_vote ON votes;
CREATE TRIGGER trg_notify_vote
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION notify_vote_received();

-- ────────────────────────────────────────────────
-- Trigger: notify followers when someone publishes
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_followers_on_publish()
RETURNS TRIGGER AS $$
DECLARE
  v_publisher_name TEXT;
  v_follower RECORD;
BEGIN
  -- Only on new active publications
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_publisher_name
  FROM profiles WHERE user_id = NEW.user_id;

  FOR v_follower IN
    SELECT p.push_token
    FROM follows f
    JOIN profiles p ON p.user_id = f.follower_id
    WHERE f.followed_id = NEW.user_id
      AND p.push_token IS NOT NULL
      AND p.notifications_enabled = true
    LIMIT 100 -- cap to avoid overload
  LOOP
    PERFORM send_push_notification(
      v_follower.push_token,
      COALESCE(v_publisher_name, 'Un utilisateur') || ' a publié !',
      'Découvrez sa nouvelle photo sur la carte',
      jsonb_build_object('type', 'followed_publish', 'publication_id', NEW.id, 'square_id', NEW.square_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_followers ON publications;
CREATE TRIGGER trg_notify_followers
  AFTER INSERT ON publications
  FOR EACH ROW
  EXECUTE FUNCTION notify_followers_on_publish();

-- ────────────────────────────────────────────────
-- Trigger: notify new follower
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_new_follower()
RETURNS TRIGGER AS $$
DECLARE
  v_follower_name TEXT;
  v_followed_token TEXT;
BEGIN
  SELECT username INTO v_follower_name
  FROM profiles WHERE user_id = NEW.follower_id;

  SELECT push_token INTO v_followed_token
  FROM profiles
  WHERE user_id = NEW.followed_id AND notifications_enabled = true;

  IF v_followed_token IS NOT NULL THEN
    PERFORM send_push_notification(
      v_followed_token,
      'Nouveau follower !',
      COALESCE(v_follower_name, 'Quelqu''un') || ' vous suit maintenant',
      jsonb_build_object('type', 'new_follower', 'follower_id', NEW.follower_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_follower ON follows;
CREATE TRIGGER trg_notify_new_follower
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_follower();
