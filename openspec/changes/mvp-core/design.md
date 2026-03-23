# Tessra MVP — Core Design

## Context

Tessra is a greenfield mobile app validating a novel social map product hypothesis: users share ephemeral images pinned to geographic locations, creating a dynamic, location-based content layer over the real world. The world map is divided into geographic squares, each can hold exactly one image visible for 24 hours. After expiration, the square becomes available for a new image. Users can pay to extend their publication or take over someone else's square with dynamic pricing based on local demand.

**Tech Stack:**
- Expo + React Native (iOS/Android)
- EAS (Expo Application Services) for CI/CD
- Supabase (auth, relational DB, storage, edge functions)
- Mapbox GL for map rendering
- In-App Purchases (iOS/Android)
- TypeScript

This design focuses on MVP-level simplicity: a testable, deployable system that validates core mechanics before scaling features like social graph, comments, or advanced moderation.

---

## Goals / Non-Goals

### Goals
- Define a simple but complete data model that supports all core flows: image uploads, 24h expiration, takeovers, and payments
- Establish clear square lifecycle and state transitions
- Design automated expiration system via Supabase cron
- Provide price calculation formula that incentivizes demand
- Outline map rendering and geospatial queries
- Enable server-side receipt validation for IAP
- Create a foundation that is testable and can scale to 10k daily active users

### Non-Goals
- Social features (follow, like, comment)
- Real-time notifications (can add via Expo Push later)
- Advanced moderation ML/automation (manual review acceptable)
- High-resolution image optimization or CDN integration
- Analytics and funnel tracking
- Admin dashboard
- Support for image filters or editing

---

## Decisions

### 1. Geographic Square Grid System

**Decision:** Use a simple latitude/longitude grid with geohash encoding for locality and efficient spatial indexing.

**Rationale:**
- **Simple to implement:** Calculate grid cell from lat/lng using fixed resolution (e.g., 100m × 100m at the equator).
- **Geohash encoding:** Store a 6-7 character geohash as a denormalized field for fast range queries and human-readable square identification.
- **Database indexing:** PostGIS `ST_DWithin()` or geohash prefix queries for viewport-based fetching.
- **Scalability:** Lazy square creation—only create a square row when first accessed, avoiding billions of pre-computed cells.

**Why not alternatives:**
- H3 hexagons: Slightly less intuitive grid, additional dependency, similar performance.
- Quadtree: Complex to implement from scratch; geohash + PostGIS queries achieve the same goal simpler.

**Square Resolution:** Start with ~100m × 100m (geohash precision 6); make configurable in backend settings for future tuning.

---

### 2. Supabase Data Model

**Full schema with all tables:**

#### `users` (Supabase Auth)
Auto-managed by Supabase. Schema includes:
- `id` (UUID, primary key)
- `email` (string, unique)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### `profiles`
User-extended data.
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `squares`
Geographic grid cells and their state.
```sql
CREATE TABLE squares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lat FLOAT8 NOT NULL,
  lng FLOAT8 NOT NULL,
  geohash TEXT NOT NULL UNIQUE,  -- e.g., "u09"
  status TEXT NOT NULL DEFAULT 'libre',  -- enum
  current_publication_id UUID REFERENCES publications(id),
  demand_score INT DEFAULT 0,  -- count of takeover attempts, requests in last 24h
  base_price DECIMAL(10, 2) DEFAULT 0.99,  -- USD or configurable
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_squares_geohash ON squares(geohash);
CREATE INDEX idx_squares_status ON squares(status);
```

#### `publications`
Active and historical image posts on squares.
```sql
CREATE TABLE publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  square_id UUID NOT NULL REFERENCES squares(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'expired', 'replaced', 'deleted'
  started_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,  -- started_at + 24h
  is_paid BOOLEAN DEFAULT FALSE,
  price_paid DECIMAL(10, 2),
  replaced_by UUID REFERENCES publications(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_publications_user_id ON publications(user_id);
CREATE INDEX idx_publications_square_id ON publications(square_id);
CREATE INDEX idx_publications_expires_at ON publications(expires_at);
```

#### `publication_history`
Immutable audit log of all publications (past and present).
```sql
CREATE TABLE publication_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES publications(id),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  square_id UUID NOT NULL REFERENCES squares(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  status TEXT NOT NULL,  -- 'active', 'expired', 'replaced'
  acquisition_mode TEXT NOT NULL,  -- 'free', 'paid', 'replaced'
  end_reason TEXT,  -- 'natural_expiration', 'replaced_by_user', 'moderation_deleted'
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_publication_history_user_id ON publication_history(user_id);
CREATE INDEX idx_publication_history_square_id ON publication_history(square_id);
```

#### `payments`
Transaction records for paid actions.
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  platform TEXT NOT NULL,  -- 'ios' or 'android'
  store_transaction_id TEXT NOT NULL UNIQUE,  -- Apple / Google receipt ID
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'completed', 'failed', 'refunded'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_publication_id ON payments(publication_id);
```

#### `moderation_flags`
User reports and flagged content.
```sql
CREATE TABLE moderation_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,  -- 'spam', 'explicit', 'harassment', 'other'
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'reviewed', 'dismissed'
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_moderation_flags_status ON moderation_flags(status);
CREATE INDEX idx_moderation_flags_publication_id ON moderation_flags(publication_id);
```

#### `square_demand`
Lightweight demand signal tracking for pricing multiplier.
```sql
CREATE TABLE square_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  square_id UUID NOT NULL REFERENCES squares(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,  -- 'view', 'takeover_attempt', 'flag'
  user_id UUID REFERENCES profiles(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_square_demand_square_id_created_at ON square_demand(square_id, created_at);
```

---

### 3. Square Lifecycle & State Machine

Each square transitions through well-defined states:

```
libre (free)
  ├─→ occupe_gratuit (occupied, free 24h post)
  │    └─→ en_expiration (last hour before expiry)
  │         ├─→ remplacable (expired, free to claim)
  │         │    └─→ occupe_payant (user paid takeover)
  │         └─→ occupe_payant (user paid to extend)
  │              └─→ en_expiration
  │                  └─→ remplacable
  │
  └─→ occupe_payant (occupied, paid 24h post)
       ├─→ en_expiration
       │    └─→ remplacable
       └─→ signale (flagged)
            └─→ en_moderation
                 ├─→ libre (content approved)
                 └─→ bloque (content removed)
```

**State Definitions:**
- `libre` — Square is empty; anyone can post.
- `occupe_gratuit` — Free post active; expires in 24h.
- `occupe_payant` — Paid post active (extended or takeover); expires in 24h from payment.
- `en_expiration` — Active post in final hour; displays countdown.
- `remplacable` — Post expired; square available for immediate takeover at dynamic price.
- `signale` — User flagged content; awaiting moderation review.
- `en_moderation` — Moderation in progress.
- `bloque` — Content removed; square becomes `libre` after moderation.

**Transitions triggered by:**
- Time (edge function cron job)
- User action (publish, pay, flag)
- Moderation action (approve, remove)

---

### 4. Expiration System

**Implementation:** Supabase Edge Function + PostgreSQL `pg_cron` extension.

**Flow:**
1. Edge function runs every minute (or every 5 minutes for MVP).
2. Query: `SELECT * FROM publications WHERE status = 'active' AND expires_at <= NOW()`.
3. For each expired publication:
   - Insert record into `publication_history` with `status='expired'`, `end_reason='natural_expiration'`.
   - Update `publications` set `status='expired'`.
   - Update `squares` set `status='remplacable'`, `current_publication_id=NULL`.
4. Edge function is idempotent (safe to re-run).

**Cron job setup:**
```sql
-- Enable pg_cron extension (requires Supabase Auth for direct DB access)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the job
SELECT cron.schedule('expire_publications', '*/1 * * * *', $$
  SELECT tessra.expire_active_publications();
$$);
```

**Fallback for MVP:** Scheduled HTTP trigger on a Vercel cron service or similar, calling the edge function.

---

### 5. Dynamic Pricing

**Formula:**
```
price = base_price * (1 + demand_multiplier)

demand_multiplier = COUNT(recent_actions) / 10.0
  (capped at 2.0, i.e., max 3x base price)

recent_actions = actions on the square in the past 24h
  (takeover_attempts, views from distinct users, flags)
```

**Example:**
- Base price: $0.99
- 5 recent takeover attempts in 24h → multiplier = 0.5 → price = $1.49
- 25 recent actions → multiplier = 2.0 (capped) → price = $2.97

**Calculation Trigger:**
- Computed on-demand when user opens a `remplacable` square.
- Cached for 5 minutes to avoid thrashing the DB.
- Logged in `square_demand` table.

**SQL to compute demand:**
```sql
SELECT COUNT(*) FROM square_demand
WHERE square_id = $1
  AND created_at > NOW() - INTERVAL '24 hours';
```

---

### 6. Image Storage

**Provider:** Supabase Storage (integrated with DB auth).

**Configuration:**
- **Bucket:** `publications` (public read, authenticated write).
- **Max file size:** 5 MB.
- **Formats:** JPEG, PNG, WebP.
- **Path structure:** `/publications/{publication_id}/{uuid}.jpg`
- **Cache:** Cloudflare CDN on Supabase domain (automatic).

**Client-side validation:**
- Enforce file type and size before upload.
- Compress to max 1024×1024 on device (Expo Image Picker + compression library).

**Cleanup:** When a publication is deleted or moderated, edge function removes image from storage.

---

### 7. Map Rendering

**Framework:** Mapbox GL for React Native (via `@react-native-mapbox-gl/maps`).

**Rendering Strategy:**
1. **Base map:** Mapbox style (satellite, streets, custom).
2. **Square layer:** GeoJSON feature collection of visible squares, updated every pan/zoom.
3. **Clustering:** At zoom < 14, cluster squares by geohash prefix; show cluster badge with count.
4. **Viewport query:** On map move, query Supabase for squares within viewport bounds using `ST_DWithin()` or geohash prefix.

**Viewport query (PostGIS):**
```sql
SELECT id, lat, lng, status, current_publication_id, image_url
FROM squares
WHERE ST_DWithin(
  ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
  ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
  $3  -- distance in meters (viewport-dependent)
);
```

**Visual Design:**
- `libre` squares: Light gray outline, no fill.
- `occupe_gratuit` squares: Image thumbnail in center, 24h timer.
- `occupe_payant` squares: Image thumbnail, lock icon, timer.
- `remplacable` squares: Faded image, checkmark or "Claim" overlay.
- `signale` squares: Warning icon overlay.

---

### 8. Auth Flow

**Provider:** Supabase Auth with email, Apple Sign-in, and Google Sign-in.

**Flow:**
1. App checks `supabase.auth.session()` on launch.
2. If logged out, show auth screen with email/Apple/Google buttons.
3. On successful auth:
   - Supabase returns JWT.
   - App stores JWT in device secure storage (Expo SecureStore).
   - App fetches or creates `profiles` row.
   - User navigates to Map.
4. Token refresh: Supabase client auto-refreshes JWT; app retries failed requests.

**Session Management:**
- Logout: Clear JWT, clear profiles cache.
- Refresh: Automatic via Supabase client (background).

---

### 9. In-App Purchases

**Framework:** `react-native-iap` for iOS/Android.

**Flow:**
1. When user clicks "Take Over for $X.XX":
   - App calls IAP SDK to request purchase.
   - User completes payment in native flow (Face ID, Touch ID, Google Play billing).
   - IAP SDK returns receipt.
2. App sends receipt to backend (Supabase Edge Function).
3. Edge Function validates receipt server-side:
   - iOS: Call Apple Server-to-Server API.
   - Android: Call Google Play Billing API.
4. If valid:
   - Create `payments` row (status='completed').
   - Update or create `publications` row.
   - Update `squares` row to `occupe_payant`.
   - Insert `publication_history` row.
5. If invalid: Return error to app.

**Product SKUs:**
- `tessra_takeover_24h` — $0.99–$2.97 (dynamic pricing).
- `tessra_extend_24h` — $0.99–$2.97 (extend current publication).

**Edge Function validation (simplified):**
```typescript
// Validate Apple receipt
const appleResponse = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
  method: 'POST',
  body: JSON.stringify({ 'receipt-data': receipt, password: APPLE_SHARED_SECRET })
});

// Validate Google receipt
const googleResponse = await fetch(
  `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${token}`,
  { headers: { Authorization: `Bearer ${googleAccessToken}` } }
);
```

---

### 10. App Structure

**Framework:** Expo Router (file-based routing).

**Screen Hierarchy:**
```
(auth)/
  ├─ sign-up.tsx
  ├─ sign-in.tsx
  └─ (forgot-password).tsx

(app)/
  ├─ (tabs)/
  │   ├─ _layout.tsx  -- bottom tab nav
  │   ├─ index.tsx    -- Map screen (home)
  │   ├─ history.tsx  -- User's publication history
  │   └─ profile.tsx  -- Profile & settings
  │
  └─ square/
      └─ [id].tsx    -- Square detail modal (publication, timer, takeover button)

upload.tsx       -- Upload screen (from map or tab)
```

**Key Screens:**
- **Map** (index.tsx): Viewport rendering, square tapping, floating action buttons.
- **Square Detail** ([id].tsx): Full-screen image, timer, current user info, takeover button, report button.
- **Upload**: Image picker, caption field, preview, confirm.
- **History**: List of user's past publications, filtering by status.
- **Profile**: Username, avatar, settings (notifications, account, logout).

**State Management:** Zustand for simple client state (user, selected square, map region); Supabase client for server state.

---

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Square grid at scale** (billions of cells) | DB storage & query complexity | Lazy creation: only create squares on first access. Monitor row count. Migrate to partitioned table if > 1M rows. |
| **Expiration timing precision** | User confusion if expiry is off-by-minutes | 1-minute cron is acceptable for MVP. Client-side countdown timer provides perceived accuracy. |
| **IAP complexity & fraud** | Revenue loss, bad actor takeovers | Use platform-native validation (Apple/Google). Rate-limit takeovers per user. Monitor for refund patterns. |
| **Mapbox costs** | Unexpected bills | Free tier covers ~50k map loads/month. Upgrade to usage-based pricing after validation. Monitor API usage. |
| **Content moderation at scale** | Spam, explicit, harassment posts | Manual review queue acceptable for MVP. Flag-to-human workflow. If volume exceeds team capacity, evaluate ML filtering. |
| **Image storage cleanup** | Storage costs | Archive old publications to cold storage after 30 days. Implement soft deletes initially. |
| **Geohash collisions** | Edge cases in queries | Use geohash length 7–8 (< 1m precision). Validate lat/lng before creating squares. |
| **Timezone issues** | Expiration logic broken for non-UTC users | Store all timestamps in UTC. Client renders local time via JavaScript `Intl` API. |

---

## Migration Plan

**Greenfield project** — no existing data to migrate.

### Initial Deployment

1. **Database setup:**
   - Create tables per schema above.
   - Create indexes and PostGIS extension.
   - Set up `pg_cron` for expiration job.

2. **Image storage:**
   - Create `publications` bucket in Supabase Storage.
   - Enable CORS for localhost & production domains.

3. **Auth providers:**
   - Register Apple App ID and Certificate.
   - Register Google OAuth 2.0 credentials.
   - Configure Supabase Auth with both.

4. **Mapbox & IAP:**
   - Create Mapbox token.
   - Register Apple & Google IAP products (SKUs).

5. **Edge functions:**
   - Deploy `expire_publications()` function.
   - Deploy `validate_receipt()` function.

6. **App build & release:**
   - Build iOS and Android via EAS.
   - Submit to App Stores (TestFlight / Google Play Console).
   - Start with closed beta.

7. **Monitoring:**
   - Set up Sentry for crash reporting.
   - Log all IAP transactions.
   - Monitor Mapbox API usage.

---

## Open Questions

1. **Exact square size:** 100m × 100m? 500m × 500m? Configurable per region? Trade-off between density and load.

2. **Pricing tiers:** Is all paid content the same ($0.99–$2.97)? Do extensions cost the same as takeovers? Should high-demand squares have a higher floor price?

3. **Push notifications:** Expo Push Service vs. OneSignal? When to notify users (someone took over your square, square is expiring soon)?

4. **Image compression strategy:** Compress on client before upload (reduce bandwidth) or trust Supabase/CDN to serve optimized sizes?

5. **User discovery & social:** Is Map-only sufficient for MVP? Or add a feed or trending squares list? Defer to MVP v2.

6. **Moderation workflows:** Who reviews flags? Manual Slack queue + UI, or simple database form? Define SLA for review.

7. **Analytics:** Do we track impressions (views per square)? Useful for refining pricing but not required for MVP validation.

8. **Square ownership history:** Store which user created the first square, or is that data only in `publication_history`? Clarify for legal/audit purposes.

