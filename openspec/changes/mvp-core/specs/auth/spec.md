## ADDED Requirements

### Requirement: Email Authentication
Email-based sign up and sign in capability with secure credential management via Supabase Auth.

#### Scenario: New user signs up with email
- **WHEN** user enters valid email and password on sign up screen
- **THEN** system SHALL validate password strength (min 8 chars), create account in Supabase, and present email verification prompt

#### Scenario: User attempts sign up with existing email
- **WHEN** user enters email already registered in system
- **THEN** system SHALL reject with "Email already in use" error and suggest sign in

#### Scenario: User signs in with email
- **WHEN** user enters registered email and correct password on sign in screen
- **THEN** system SHALL validate credentials against Supabase, create session token, and navigate to home screen

#### Scenario: User attempts sign in with incorrect password
- **WHEN** user enters registered email with wrong password
- **THEN** system SHALL reject with "Invalid credentials" error and allow retry

### Requirement: Apple Sign-In Integration
Native Sign in with Apple capability for iOS users via Supabase OAuth.

#### Scenario: iOS user initiates Apple Sign-In
- **WHEN** user taps "Sign in with Apple" button on iOS
- **THEN** system SHALL launch Apple Sign-In prompt, handle OAuth flow, create Supabase user, and persist session

#### Scenario: User cancels Apple Sign-In flow
- **WHEN** user cancels Apple authentication prompt
- **THEN** system SHALL dismiss prompt and return to sign in screen without account creation

### Requirement: Google Sign-In Integration
Native Sign in with Google capability for iOS and Android users via Supabase OAuth.

#### Scenario: User initiates Google Sign-In
- **WHEN** user taps "Sign in with Google" button
- **THEN** system SHALL launch Google Sign-In prompt, handle OAuth flow via Supabase, create or link user account, and persist session

#### Scenario: User previously signed up with Google
- **WHEN** returning user taps "Sign in with Google"
- **THEN** system SHALL recognize existing Supabase account, restore session, and skip sign up

### Requirement: Session Persistence
Session data SHALL persist across app closes and device restarts until explicit logout.

#### Scenario: User relaunches app after closing
- **WHEN** user closes app and reopens it within 30 days
- **THEN** system SHALL retrieve stored session token from secure storage, validate with Supabase, and restore authenticated state

#### Scenario: Stored session token expires
- **WHEN** session token becomes expired while app is closed
- **THEN** system SHALL detect invalid token on next app launch and present sign in screen

#### Scenario: User disables and re-enables app
- **WHEN** user force-closes app and relaunches
- **THEN** system SHALL maintain session persistence using secure local storage

### Requirement: Logout Functionality
Users SHALL have ability to sign out and terminate current session.

#### Scenario: User initiates logout
- **WHEN** user taps logout in settings
- **THEN** system SHALL clear stored session token, notify Supabase, and present sign in screen

#### Scenario: Logout succeeds with network
- **WHEN** user logs out with active internet connection
- **THEN** system SHALL invalidate session server-side and locally, preventing further API access with old token

#### Scenario: Logout occurs offline
- **WHEN** user logs out without internet connection
- **THEN** system SHALL clear local session token immediately and prevent authenticated requests

### Requirement: Account Deletion
Users SHALL have ability to permanently delete their account and associated data.

#### Scenario: User requests account deletion
- **WHEN** user taps "Delete Account" in settings and confirms action
- **THEN** system SHALL display confirmation dialog with warning, require password re-entry, and proceed only after confirmation

#### Scenario: Account deletion completes
- **WHEN** deletion is confirmed with correct password
- **THEN** system SHALL delete Supabase user account, all publications, profile data, and clear local session

#### Scenario: Deleted account prevents sign in
- **WHEN** user attempts to sign in with previously deleted email
- **THEN** system SHALL present error stating account no longer exists and offer sign up
