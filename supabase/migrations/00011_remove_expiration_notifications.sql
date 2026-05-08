-- Remove expiration notification cron and function
SELECT cron.unschedule('notify-expiring');
DROP FUNCTION IF EXISTS notify_expiring_publications();
