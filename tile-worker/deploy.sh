#!/bin/bash
# Tessra Tile Worker — Full deployment script
# Run from the tile-worker/ directory

set -e

echo "=== 1/5 Deploy Cloudflare Worker ==="
npx wrangler deploy

echo ""
echo "=== 2/5 Set secrets (skip if already set) ==="
echo "If prompted, enter the values below:"
echo "  WEBHOOK_SECRET: tessra-tile-secret-2026-xK9mP4qR"
echo "  SUPABASE_URL: https://epqxxzdfmsuunxlcizkj.supabase.co"
echo "  SUPABASE_SERVICE_KEY: (your service role key)"
echo ""
read -p "Set secrets now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Enter WEBHOOK_SECRET value:"
  npx wrangler secret put WEBHOOK_SECRET
  echo "Enter SUPABASE_URL value:"
  npx wrangler secret put SUPABASE_URL
  echo "Enter SUPABASE_SERVICE_KEY value:"
  npx wrangler secret put SUPABASE_SERVICE_KEY
fi

echo ""
echo "=== 3/5 Clear old tiles from R2 ==="
curl -s -X POST https://tessra-tile-worker.tessra.workers.dev/clear | jq .

echo ""
echo "=== 4/5 Seed tiles (generate from existing publications) ==="
curl -s -X POST https://tessra-tile-worker.tessra.workers.dev/seed \
  -H "Authorization: Bearer tessra-tile-secret-2026-xK9mP4qR" | jq .

echo ""
echo "=== 5/5 Health check ==="
curl -s https://tessra-tile-worker.tessra.workers.dev/health | jq .

echo ""
echo "Done! To monitor logs: npx wrangler tail"
