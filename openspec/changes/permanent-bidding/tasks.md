## 1. Database Migration (P0)

- [x] 1.1 Create migration to add `replacement_count` (int default 0) and `last_price` (numeric default 0) columns to `squares` table
- [x] 1.2 Create migration to replace status enum with simplified values (`libre`, `occupe`, `signale`, `bloque`) and migrate existing data (`occupe_gratuit`/`occupe_payant`/`en_expiration`/`remplacable` → `occupe`, `en_moderation` → `signale`)
- [x] 1.3 Remove `demand_score` and `base_price` columns from `squares` table
- [x] 1.4 Remove `expires_at` column from `publications` table
- [x] 1.5 Drop `square_demand` table
- [x] 1.6 Remove expiration cron job (`pg_cron` task for square expiration checks)

## 2. Backend — Replace Square RPC (P0)

- [x] 2.1 Create `replace_square(square_id, user_id, image_url, price_paid)` RPC function with row-level locking, price validation (`price_paid >= replacement_count`), publication creation, and square update (`replacement_count++`, `last_price = price_paid`)
- [x] 2.2 Update existing `publish_to_square` RPC to handle free first publication (no price check when `replacement_count = 0` and status is `libre`)
- [x] 2.3 Remove demand-based pricing edge function and demand tracking logic
- [x] 2.4 Remove expiration check edge function

## 3. TypeScript Types & Constants (P0)

- [x] 3.1 Update `SquareStatus` type to `'libre' | 'occupe' | 'signale' | 'bloque'`
- [x] 3.2 Update `Square` interface: remove `demand_score`, `base_price`; add `replacement_count`, `last_price`
- [x] 3.3 Update `Publication` interface: remove `expires_at`
- [x] 3.4 Update `STATUS_COLORS` to reflect 4 statuses only (remove `occupe_gratuit`, `occupe_payant`, `en_expiration`, `remplacable`)

## 4. Map View Updates (P1)

- [x] 4.1 Update `SquareLayer` component to render squares with simplified 4-status color scheme
- [x] 4.2 Add minimum price label display on occupied squares at zoom ≥ 10
- [x] 4.3 Remove any expiration timer overlay or countdown display from the map

## 5. Square Detail & Upload Flow (P0)

- [x] 5.1 Remove countdown timer component from square detail screen
- [x] 5.2 Update square detail screen to show: photo, owner info, replacement price minimum (for occupied squares) or "Gratuit" (for free squares)
- [x] 5.3 Update action button logic: `libre` → "Publier gratuitement", `occupe` → "Prendre cette place — X€ minimum"
- [x] 5.4 Build price input screen for replacements: display minimum price, numeric input pre-filled at minimum, validation (≥ minimum), "Prendre cette place pour X€" confirm button
- [x] 5.5 Integrate price input into upload flow: after image selection on occupied square, show price screen → then payment → then upload

## 6. Payments Adaptation (P1)

- [x] 6.1 Remove `extend_visibility` IAP product and "Prolonger" button from UI
- [x] 6.2 Adapt IAP flow to support variable-amount `replace_square` payments (tiered consumable products: 1€, 2€, 3€, 5€, 10€, 20€, 50€, or nearest store tier)
- [x] 6.3 Update server-side receipt validation to call `replace_square` RPC after successful payment
- [x] 6.4 Handle stale-price error (square replaced between price display and payment) with retry UI showing updated minimum

## 7. Notifications (P1)

- [x] 7.1 Remove expiration warning notification trigger (1h before expiration)
- [x] 7.2 Update takeover notification to include the price paid: "Quelqu'un a pris ta place sur [location] pour X€"
- [x] 7.3 Remove "Extend Now" action from notification payloads

## 8. Cleanup (P2)

- [x] 8.1 Remove dynamic pricing related code: `useSquareDemand` hook, demand display components, demand API calls
- [x] 8.2 Remove expiration-related code: countdown timer component, expiration notification scheduling, `expires_at` references throughout codebase
- [x] 8.3 Update onboarding copy if it references 24h visibility or expiration
- [x] 8.4 Update microcopy throughout the app: replace "Visible pendant 24h" with "Visible tant que personne ne prend ta place", remove "Prolonger la visibilité"
