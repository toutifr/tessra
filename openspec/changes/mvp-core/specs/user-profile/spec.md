## ADDED Requirements

### Requirement: User Profile Display
System SHALL display user profile information on dedicated profile screen.

#### Scenario: Profile accessible from navigation
- **WHEN** user taps profile icon or menu option
- **THEN** system SHALL navigate to user profile screen

#### Scenario: Username displayed
- **WHEN** profile screen loads
- **THEN** system SHALL display user's current username prominently at top of profile

#### Scenario: Avatar displayed
- **WHEN** profile screen loads
- **THEN** system SHALL display user's avatar image (or default placeholder if not set)

#### Scenario: Join date shown
- **WHEN** user views their profile
- **THEN** system SHALL display "Joined [month year]" or "Member since [date]"

### Requirement: Username Editing
User SHALL be able to edit their username.

#### Scenario: Edit button available
- **WHEN** user views own profile
- **THEN** system SHALL display "Edit Profile" or pencil icon button

#### Scenario: Edit mode shows username field
- **WHEN** user taps edit button
- **THEN** system SHALL present text input field with current username pre-filled

#### Scenario: Username update submitted
- **WHEN** user modifies username and taps save
- **THEN** system SHALL validate username length (min 3, max 20 chars), uniqueness, and update in database

#### Scenario: Username validation prevents duplicates
- **WHEN** user attempts to set username already taken
- **THEN** system SHALL display error: "Username already taken" and prevent submission

#### Scenario: Username validation prevents invalid characters
- **WHEN** user enters username with invalid characters
- **THEN** system SHALL display error and only allow: letters, numbers, underscores, hyphens

#### Scenario: Username change confirms
- **WHEN** valid new username is saved
- **THEN** system SHALL update user record, refresh profile display, and show success message

#### Scenario: Other users see updated username
- **WHEN** user updates username
- **THEN** system SHALL update username in all publications and references (future MVP expansion)

### Requirement: Avatar Editing
User SHALL be able to upload and edit avatar image.

#### Scenario: Avatar upload option available
- **WHEN** user taps on avatar or edit button
- **THEN** system SHALL present options: "Take Photo" or "Choose from Gallery"

#### Scenario: Avatar selection launches camera/gallery
- **WHEN** user selects avatar source
- **THEN** system SHALL launch camera or photo picker (same as image upload flow)

#### Scenario: Avatar preview before confirmation
- **WHEN** avatar image is selected
- **THEN** system SHALL display preview and allow user to confirm or retake

#### Scenario: Avatar uploaded to Supabase
- **WHEN** user confirms avatar
- **THEN** system SHALL upload image to Supabase Storage at: `/avatars/{user_id}/{timestamp}.{ext}`

#### Scenario: Avatar size optimized
- **WHEN** avatar is uploaded
- **THEN** system SHALL crop/resize to square 200x200px for consistent profile display

#### Scenario: Avatar updates immediately
- **WHEN** avatar upload completes
- **THEN** system SHALL update avatar display on profile and in all user-visible contexts

#### Scenario: Old avatar replaced
- **WHEN** user uploads new avatar
- **THEN** system SHALL replace old avatar_url in user record and optionally cleanup old file

### Requirement: Publication Statistics
User SHALL view aggregate statistics about their publications.

#### Scenario: Statistics displayed on profile
- **WHEN** user views their profile
- **THEN** system SHALL display: "Total Publications: X" and "Active Publications: Y"

#### Scenario: Total publications count
- **WHEN** user has posted multiple times
- **THEN** system SHALL count all publications (regardless of status) and display total

#### Scenario: Active publications count
- **WHEN** user views statistics
- **THEN** system SHALL count publications currently in: 'occupe_gratuit', 'occupe_payant', 'en_expiration' statuses

#### Scenario: Statistics update in real-time
- **WHEN** user posts new publication or publication expires
- **THEN** system SHALL update statistics on profile within 5 seconds

#### Scenario: Statistics visible to user only
- **WHEN** other user views this user's profile (if enabled in future)
- **THEN** system MAY show public statistics (design decision for future)

### Requirement: Profile Completeness
System SHALL indicate profile completeness to encourage user engagement.

#### Scenario: Avatar encourages user
- **WHEN** user has not set avatar
- **THEN** system MAY display prompt: "Add an avatar to personalize your profile"

#### Scenario: Edit profile button prominent
- **WHEN** user views own profile
- **THEN** system SHALL make "Edit Profile" button easily accessible and visible

### Requirement: No Public Publication List in MVP
System SHALL NOT display public list of user's publications on profile (MVP limitation).

#### Scenario: Publication list not on profile
- **WHEN** user (own or other) views profile
- **THEN** system SHALL NOT show scrollable list of all publications

#### Scenario: Only aggregate stats shown
- **WHEN** user views profile in MVP
- **THEN** system SHALL display only: username, avatar, join date, total count, active count

#### Scenario: Full history accessed via menu
- **WHEN** user wants to see own publications
- **THEN** system SHALL provide separate "My Publications" or "History" menu option (private view only)

#### Scenario: Publication discovery future feature
- **WHEN** future MVP expansion includes discovery
- **THEN** public profile publication list MAY be added with user consent

### Requirement: Profile Screen Layout
System SHALL present profile information in clear, organized layout.

#### Scenario: Header section organized
- **WHEN** profile loads
- **THEN** system SHALL display in top section: avatar (large), username (below avatar), join date

#### Scenario: Statistics section clear
- **WHEN** user scrolls down
- **THEN** system SHALL display statistics in cards or grid: "Total Publications", "Active Now"

#### Scenario: Edit button accessible
- **WHEN** user is viewing own profile
- **THEN** system SHALL display "Edit Profile" button in header or as floating action button

#### Scenario: Settings link available
- **WHEN** user views profile
- **THEN** system MAY display link to Settings (separate from profile editing)
