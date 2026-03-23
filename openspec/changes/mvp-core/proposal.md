## Why

Tessra needs its foundational MVP to validate the core product hypothesis: users will engage with an ephemeral, geo-based social map where content visibility is time-limited (24h) and premium placement is monetizable through dynamic pricing.

There is no existing product that combines geographic content posting, ephemeral visibility, and marketplace-style competition for map real estate. The MVP must be built from scratch to test whether users (1) understand the concept immediately, (2) publish an image, (3) return to browse the map, (4) pay to extend or claim visibility, and (5) grasp the replacement/expiration mechanics.

## What Changes

This is a greenfield project — everything is new:

- Expo + React Native mobile app with Mapbox-powered world map divided into geographic squares
- Supabase backend handling auth (email, Apple, Google), database, file storage, and edge functions
- Square lifecycle system: free posting → 24h visibility → expiration → replacement or paid extension
- Dynamic pricing engine: square cost increases based on demand and occupancy
- In-app purchase integration for paid square actions (extend, take over)
- Private publication history per user
- Basic moderation system (user reports, manual review, content blocking)
- Minimal user profiles and onboarding flow

## Capabilities

### New Capabilities

- `auth`: Email, Apple Sign-In, and Google Sign-In via Supabase Auth
- `onboarding`: Minimal first-launch flow explaining the core concept
- `map-view`: Mapbox world map with geographic square grid overlay and square status rendering
- `square-lifecycle`: Square state machine (libre, occupé, en expiration, remplaçable, signalé, en modération, bloqué) with 24h timer and automatic expiration
- `image-upload`: Image capture/selection and upload to Supabase Storage, linked to a square
- `dynamic-pricing`: Pricing engine based on square demand and occupancy status
- `payments`: In-app purchases for extending visibility or taking over occupied squares
- `publication-history`: Private per-user log of all publications with status, dates, and events
- `user-profile`: Simple profile screen with basic account info
- `moderation`: User reporting, content flagging, manual review workflow, and content blocking
- `notifications`: Simple push notifications for square expiration and replacement events
- `anti-abuse`: Rate limiting (publications per account), cooldowns, and account blocking

### Modified Capabilities

_(None — greenfield project)_

## Impact

- **New mobile app**: Full Expo/React Native project scaffolding with EAS build configuration
- **New Supabase project**: Database schema (users, profiles, squares, publications, publication_history, payments, moderation_flags), Row Level Security policies, Edge Functions for pricing and expiration logic, Storage buckets for images
- **Third-party integrations**: Mapbox SDK, Apple/Google IAP, Apple/Google OAuth, push notification service
- **App Store submissions**: Both Apple App Store and Google Play Store listings required for launch

## Non-goals (V2+)

- Messaging between users
- Followers / likes / social graph
- Feed-style content browsing
- 3D globe rendering
- Real-time bidding / auctions
- Advanced recommendation engine
- Heavy gamification
- Multi-language support
- Web version
- Advanced analytics dashboard
- AI-powered content moderation
