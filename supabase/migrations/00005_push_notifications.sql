-- Add push token to profiles
ALTER TABLE profiles ADD COLUMN push_token TEXT;
ALTER TABLE profiles ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Function to send notification before expiration (called by cron)
CREATE OR REPLACE FUNCTION notify_expiring_publications()
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  -- Find publications expiring in ~1 hour that haven't been notified
  FOR r IN
    SELECT p.id, p.user_id, pr.push_token
    FROM publications p
    JOIN profiles pr ON pr.user_id = p.user_id
    WHERE p.status = 'active'
      AND p.expires_at BETWEEN NOW() + INTERVAL '55 minutes' AND NOW() + INTERVAL '65 minutes'
      AND pr.push_token IS NOT NULL
      AND pr.notifications_enabled = TRUE
  LOOP
    -- Log notification (actual sending happens via Expo Push API in edge function)
    PERFORM pg_notify('push_notification', json_build_object(
      'token', r.push_token,
      'title', 'Votre publication expire bientôt',
      'body', 'Il vous reste moins d''une heure. Prolongez-la maintenant !',
      'data', json_build_object('publication_id', r.id)
    )::text);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule notification check every 5 minutes
SELECT cron.schedule('notify-expiring', '*/5 * * * *', $$
  SELECT notify_expiring_publications();
$$);
