-- Clean up demand entries older than 48h to prevent table bloat
-- and naturally decay demand signals
CREATE OR REPLACE FUNCTION public.cleanup_old_demand()
RETURNS void AS $$
BEGIN
  DELETE FROM public.square_demand
  WHERE created_at < NOW() - INTERVAL '48 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run cleanup daily at 3 AM
SELECT cron.schedule('cleanup-demand', '0 3 * * *', $$
  SELECT public.cleanup_old_demand();
$$);
