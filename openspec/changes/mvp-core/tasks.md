## 1. Project Scaffolding (P0)

- [x] 1.1 Initialize Expo project with TypeScript template (`create-expo-app`)
- [x] 1.2 Configure Expo Router (file-based routing) with tab navigation
- [x] 1.3 Set up EAS configuration (`eas.json`) for development, preview, production
- [x] 1.4 Add ESLint + Prettier with shared config
- [x] 1.5 Create folder structure: `src/screens`, `src/components`, `src/lib`, `src/hooks`, `src/types`, `src/constants`
- [x] 1.6 Set up environment variables (Supabase URL, Mapbox token, etc.)
- [x] 1.7 Add `.gitignore` for Expo/React Native project

## 2. Supabase Backend Setup (P0)

- [x] 2.1 Create Supabase project and configure connection
- [x] 2.2 Create `profiles` table with RLS policies
- [x] 2.3 Create `squares` table with PostGIS extension, geohash index, and status enum
- [x] 2.4 Create `publications` table with foreign keys to squares and profiles
- [x] 2.5 Create `publication_history` table with audit fields
- [x] 2.6 Create `payments` table with store transaction tracking
- [x] 2.7 Create `moderation_flags` table with reporter/reviewer tracking
- [x] 2.8 Create `square_demand` table for pricing signals
- [x] 2.9 Set up Row Level Security policies for all tables
- [x] 2.10 Create Supabase Storage bucket for publication images (5MB limit, jpg/png only)
- [x] 2.11 Install and configure `@supabase/supabase-js` client in the app

## 3. Authentication (P0)

- [x] 3.1 Configure Supabase Auth providers (email, Apple, Google)
- [x] 3.2 Build sign-up screen (email + password)
- [x] 3.3 Build sign-in screen (email + password)
- [x] 3.4 Integrate Apple Sign-In (`expo-apple-authentication`)
- [x] 3.5 Integrate Google Sign-In (`expo-auth-session`)
- [x] 3.6 Implement auth state listener and session persistence
- [x] 3.7 Build auth-gated navigation (redirect to login if unauthenticated)
- [x] 3.8 Implement logout functionality
- [x] 3.9 Create profile row automatically on first sign-in (Supabase trigger or client-side)

## 4. Onboarding (P1)

- [x] 4.1 Design 3-screen onboarding flow (concept, how it works, CTA)
- [x] 4.2 Build onboarding screens with swipe navigation
- [x] 4.3 Add "Skip" button and completion tracking (AsyncStorage flag)
- [x] 4.4 Show onboarding only on first launch

## 5. Map View — Core Loop (P0)

- [x] 5.1 Install and configure `@rnmapbox/maps` with Mapbox access token
- [x] 5.2 Build main map screen with user location centering
- [x] 5.3 Implement geographic square grid calculation (geohash-based, ~100m squares)
- [x] 5.4 Render square overlays on the map with color coding by status (free=green, occupied=blue, paid=gold, expiring=orange)
- [x] 5.5 Implement viewport-based square loading (query Supabase for visible area only)
- [x] 5.6 Add zoom level handling (cluster squares at low zoom, show individual at high zoom)
- [x] 5.7 Handle tap on square → navigate to square detail screen

## 6. Square Detail & Lifecycle (P0)

- [x] 6.1 Build square detail screen showing: image, timer, status, price, owner info
- [x] 6.2 Implement square status display with appropriate UI per state
- [x] 6.3 Build countdown timer component (24h → 0, live updating)
- [x] 6.4 Display action button based on square status ("Publier", "Prendre cette place", "Prolonger")
- [x] 6.5 Create Supabase Edge Function for square expiration check (pg_cron, runs every minute)
- [x] 6.6 Implement status transitions: libre → occupe_gratuit/occupe_payant
- [x] 6.7 Implement status transitions: occupe → en_expiration → remplacable → libre
- [x] 6.8 Handle edge cases: concurrent publication attempts, race conditions (use Supabase RPC with row-level locking)

## 7. Image Upload (P0)

- [x] 7.1 Install `expo-image-picker` for camera and gallery access
- [x] 7.2 Build image selection UI (camera or gallery choice)
- [x] 7.3 Implement client-side image compression (max 5MB, resize if needed)
- [x] 7.4 Build image preview screen with confirm/cancel
- [x] 7.5 Implement upload to Supabase Storage with progress indicator
- [x] 7.6 Create publication record in database after successful upload
- [x] 7.7 Update square status and link to new publication
- [x] 7.8 Handle upload errors with retry option

## 8. Dynamic Pricing (P1)

- [x] 8.1 Create Supabase Edge Function for price calculation
- [x] 8.2 Implement demand tracking (log views, tap attempts, publications on square_demand)
- [x] 8.3 Implement pricing formula: `base_price * (1 + demand_multiplier)` with 2x cap
- [x] 8.4 Display current price on square detail screen
- [x] 8.5 Show "Ce carré est très demandé" badge when price > base
- [x] 8.6 Implement demand decay (reduce multiplier after inactivity period)

## 9. In-App Purchases (P1)

- [x] 9.1 Install and configure `react-native-iap`
- [x] 9.2 Define IAP product IDs in App Store Connect and Google Play Console
- [x] 9.3 Build purchase flow UI (price display → confirm → processing → success/failure)
- [x] 9.4 Implement "Extend visibility" purchase (add 24h to current publication)
- [x] 9.5 Implement "Take over square" purchase (replace active publication)
- [x] 9.6 Create Supabase Edge Function for server-side receipt validation
- [x] 9.7 Update publication and square records after successful payment
- [x] 9.8 Record payment in `payments` table
- [x] 9.9 Handle failed/pending transactions gracefully

## 10. Publication History (P1)

- [x] 10.1 Build "Mes publications" screen with list of past publications
- [x] 10.2 Display: square location, thumbnail, dates, status, acquisition mode
- [x] 10.3 Implement publication history recording (trigger on publication create/expire/replace)
- [x] 10.4 Add status filters (active, expired, replaced, moderated)
- [x] 10.5 Ensure RLS: only owner can see their own history

## 11. User Profile (P1)

- [x] 11.1 Build profile screen showing username, avatar, join date
- [x] 11.2 Implement edit username functionality
- [x] 11.3 Implement avatar upload (reuse image upload logic)
- [x] 11.4 Display stats: total publications, active publications count
- [x] 11.5 Add navigation to settings screen

## 12. Moderation (P2)

- [x] 12.1 Build "Report" button on square detail screen
- [x] 12.2 Create report submission flow (reason selection: inappropriate, spam, hate, fraud)
- [x] 12.3 Blur reported content on the map and detail screen
- [x] 12.4 Record moderation flag in `moderation_flags` table
- [x] 12.5 Build basic admin review interface (can be a simple Supabase dashboard query for MVP)
- [x] 12.6 Implement admin actions: dismiss report, remove publication, block user

## 13. Notifications (P2)

- [x] 13.1 Configure Expo Push Notifications
- [x] 13.2 Register device push token on login
- [x] 13.3 Send notification 1h before publication expires
- [x] 13.4 Send notification when publication is replaced
- [x] 13.5 Add notification opt-in/opt-out toggle in settings

## 14. Anti-Abuse (P1)

- [x] 14.1 Implement server-side rate limit: max 5 publications per user per 24h
- [x] 14.2 Implement cooldown: 10-minute minimum between publications on same square
- [x] 14.3 Implement report rate limit: max 10 reports per user per 24h
- [x] 14.4 Add account blocking flag on profiles table, enforce in RLS
- [x] 14.5 Return clear error messages for rate limit violations

## 15. Polish & Testing (P1)

- [x] 15.1 Add loading states and skeleton screens for all data-fetching screens
- [x] 15.2 Implement error boundaries and user-friendly error messages
- [x] 15.3 Add pull-to-refresh on map and history screens
- [ ] 15.4 Test full core loop end-to-end: sign up → find square → upload → wait 24h → verify expiration
- [ ] 15.5 Test payment flows on both iOS and Android sandboxes
- [ ] 15.6 Test auth flows for all 3 providers
- [ ] 15.7 Performance test map with 1000+ squares in viewport

## 16. Build & Release (P1)

- [x] 16.1 Configure EAS Build profiles (development, preview, production)
- [x] 16.2 Set up app icons and splash screen
- [x] 16.3 Configure `app.json` with correct bundle identifiers, permissions, Mapbox token
- [ ] 16.4 Build and test on iOS simulator and Android emulator
- [ ] 16.5 Build preview APK/IPA for internal testing
- [ ] 16.6 Prepare App Store and Play Store listings (screenshots, description, privacy policy)
- [ ] 16.7 Submit to TestFlight and Google Play internal testing
