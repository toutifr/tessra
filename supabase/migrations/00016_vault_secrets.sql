-- ============================================================
-- Migration 00016: Read secrets from Supabase Vault
--
-- Replaces current_setting('app.settings.tile_worker_*')
-- with vault.decrypted_secrets lookups, since ALTER DATABASE
-- SET is not permitted on Supabase hosted.
-- ============================================================

-- Also store the tile worker URL in vault (optional, fallback exists)
-- Run this manually if you want:
--   SELECT vault.create_secret('https://tessra-tile-worker.tessra.workers.dev', 'tile_worker_url');

CREATE OR REPLACE FUNCTION notify_tile_worker()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  tile_url TEXT;
  tile_secret TEXT;
BEGIN
  -- Read from Supabase Vault
  SELECT decrypted_secret INTO tile_secret
  FROM vault.decrypted_secrets
  WHERE name = 'tile_worker_secret'
  LIMIT 1;

  IF tile_secret IS NULL OR tile_secret = '' THEN
    RAISE WARNING 'tile_worker_secret not found in vault — skipping webhook';
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- URL: try vault first, fallback to hardcoded default
  SELECT decrypted_secret INTO tile_url
  FROM vault.decrypted_secrets
  WHERE name = 'tile_worker_url'
  LIMIT 1;

  tile_url := COALESCE(
    NULLIF(tile_url, ''),
    'https://tessra-tile-worker.tessra.workers.dev'
  );

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
    ),
    body := payload
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
