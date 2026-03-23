-- Rate limit for moderation reports: max 10 per user per 24h
CREATE OR REPLACE FUNCTION check_report_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM moderation_flags
    WHERE reporter_id = NEW.reporter_id
    AND created_at > NOW() - INTERVAL '24 hours'
  ) >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 10 reports per 24h';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_report_rate_limit
  BEFORE INSERT ON moderation_flags
  FOR EACH ROW EXECUTE FUNCTION check_report_rate_limit();

-- Enforce account blocking in publication insert
CREATE OR REPLACE FUNCTION check_account_blocked()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT is_blocked FROM profiles WHERE user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Account is blocked';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_account_block_on_publish
  BEFORE INSERT ON publications
  FOR EACH ROW EXECUTE FUNCTION check_account_blocked();

CREATE TRIGGER enforce_account_block_on_report
  BEFORE INSERT ON moderation_flags
  FOR EACH ROW EXECUTE FUNCTION check_account_blocked();
