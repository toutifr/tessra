-- Trigger to notify the tile worker when publications change.
-- This ensures tiles are regenerated when photos are published or expire.
--
-- Uses pg_net to call the tile worker webhook asynchronously.
-- The tile worker URL must be set in app.settings.tile_worker_url.

CREATE OR REPLACE FUNCTION notify_tile_worker()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  tile_worker_url TEXT;
  webhook_secret TEXT;
BEGIN
  tile_worker_url := current_setting('app.settings.tile_worker_url', true);
  webhook_secret := current_setting('app.settings.tile_worker_secret', true);

  IF tile_worker_url IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::jsonb END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD)::jsonb END
  );

  PERFORM extensions.http_post(
    url := tile_worker_url || '/webhook/publication',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(webhook_secret, '')
    ),
    body := payload
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fire on INSERT (new publication), UPDATE (status change, expiration),
-- and DELETE (publication removed)
CREATE TRIGGER trg_tile_worker_publication
  AFTER INSERT OR UPDATE OR DELETE ON publications
  FOR EACH ROW
  EXECUTE FUNCTION notify_tile_worker();
