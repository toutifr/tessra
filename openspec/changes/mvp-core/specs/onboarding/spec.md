## ADDED Requirements

### Requirement: First-Launch Onboarding Flow
New users SHALL be presented with introductory screens explaining core concept on first app launch.

#### Scenario: First app launch shows onboarding
- **WHEN** authenticated user opens app for first time (onboarding_complete flag = false)
- **THEN** system SHALL present onboarding flow without allowing access to home screen

#### Scenario: Onboarding screen count limited
- **WHEN** onboarding flow is displayed
- **THEN** system SHALL show maximum 3 screens explaining: (1) map concept, (2) square posting mechanics, (3) pricing overview

#### Scenario: Each onboarding screen is focused
- **WHEN** user views first onboarding screen
- **THEN** system SHALL explain world map divided into squares with single 24-hour image per square
- **WHEN** user swipes to second screen
- **THEN** system SHALL explain how to post images to squares and view others' posts
- **WHEN** user views third screen
- **THEN** system SHALL explain dynamic pricing and how payments extend visibility

### Requirement: Onboarding Skip Option
Users SHALL have ability to skip onboarding screens and proceed to main app.

#### Scenario: User skips onboarding
- **WHEN** user taps "Skip" button on any onboarding screen
- **THEN** system SHALL mark onboarding_complete = true, dismiss onboarding flow, and navigate to home screen

#### Scenario: Skip button visible on all screens
- **WHEN** user is on first, second, or third onboarding screen
- **THEN** system SHALL display "Skip" button in top-left corner (or persistent skip option)

### Requirement: Onboarding Completion Tracking
System SHALL track whether user has completed onboarding.

#### Scenario: First sign up completes onboarding
- **WHEN** user completes all 3 screens or skips onboarding
- **THEN** system SHALL set onboarding_complete = true in user profile and store in Supabase

#### Scenario: Completed onboarding prevents re-display
- **WHEN** user closes and reopens app after completing onboarding
- **THEN** system SHALL check onboarding_complete flag, skip onboarding, and show home screen immediately

#### Scenario: New user returning after logout
- **WHEN** user who completed onboarding signs back in
- **THEN** system SHALL recognize onboarding_complete = true and not redisplay onboarding flow

### Requirement: Onboarding Content Clarity
Onboarding screens SHALL clearly communicate core gameplay without overwhelming detail.

#### Scenario: First screen visual
- **WHEN** user views first onboarding screen
- **THEN** system SHALL display world map visualization with grid overlay showing squares

#### Scenario: Second screen interaction hint
- **WHEN** user views second screen
- **THEN** system SHALL show example of tapping a square and uploading an image

#### Scenario: Third screen pricing context
- **WHEN** user views third screen
- **THEN** system SHALL explain price differences and show example of dynamic price increase
