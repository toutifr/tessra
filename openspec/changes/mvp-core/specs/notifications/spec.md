## ADDED Requirements

### Requirement: Pre-Expiration Push Notification
System SHALL send push notification to publication owner when content is about to expire.

#### Scenario: Expiration warning 1 hour before
- **WHEN** publication has exactly 1 hour remaining on 24-hour timer
- **THEN** system SHALL send push notification to owner: "Your publication expires in 1 hour"

#### Scenario: Notification sends at correct time
- **WHEN** publication timer reaches 1-hour mark
- **THEN** system SHALL schedule and deliver push notification within 5 minutes of target time

#### Scenario: Notification includes action
- **WHEN** user receives expiration warning
- **THEN** notification SHALL include action button: "Extend Now" (if payments enabled)

#### Scenario: Notification is opt-in
- **WHEN** user has notifications disabled in settings
- **THEN** system SHALL NOT send expiration notification despite opt-out preference

#### Scenario: Owner can tap notification
- **WHEN** user receives expiration notification and taps it
- **THEN** system SHALL open app and navigate to square detail for that publication

#### Scenario: Owner only notified
- **WHEN** publication is about to expire
- **THEN** system SHALL send notification only to publication owner_id, not other users

### Requirement: Replacement/Takeover Push Notification
System SHALL notify publication owner when their square is taken over by another user.

#### Scenario: Notification sent on takeover
- **WHEN** another user successfully takes over square
- **THEN** system SHALL send push notification to original owner: "Your square on [location] was taken over"

#### Scenario: Notification includes context
- **WHEN** owner receives takeover notification
- **THEN** notification MAY display: square location (map region name), timestamp, and basic context

#### Scenario: Notification links to detail
- **WHEN** user taps takeover notification
- **THEN** system SHALL open app and navigate to that square detail showing new publication

#### Scenario: Notification respects opt-out
- **WHEN** user has disabled notifications in settings
- **THEN** system SHALL NOT send takeover notification if user opted out

#### Scenario: Takeover notification sent once
- **WHEN** square is taken over
- **THEN** system SHALL send notification exactly once (not repeated)

### Requirement: Report Resolution Push Notification
System SHALL notify parties when moderation decision is made on reported publication.

#### Scenario: Owner notified of moderation decision
- **WHEN** admin dismisses or removes reported publication
- **THEN** system SHALL send push notification to publication owner with decision result

#### Scenario: Dismissed report notification
- **WHEN** report is dismissed (content cleared)
- **THEN** notification SHALL read: "Report dismissed. Your publication remains active."

#### Scenario: Removed publication notification
- **WHEN** publication is removed for violation
- **THEN** notification SHALL read: "Your publication was removed for violating community guidelines"

#### Scenario: Reporter notified if opted-in
- **WHEN** moderation decision is made
- **THEN** system MAY send notification to reporter (if enabled): "Report resolved" without action details

#### Scenario: Notification does not reveal details
- **WHEN** user receives report resolution notification
- **THEN** notification SHALL NOT specify moderation action taken (admin decision vs. removal vs. block)

### Requirement: Notification Settings (Opt-In/Opt-Out)
User SHALL have granular control over notification preferences.

#### Scenario: Settings accessible
- **WHEN** user navigates to Settings screen
- **THEN** system SHALL display "Notifications" section with toggle options

#### Scenario: Expiration notifications toggle
- **WHEN** notifications settings open
- **THEN** system SHALL display toggle: "Expiration Alerts" (default: ON)

#### Scenario: Takeover notifications toggle
- **WHEN** notifications settings open
- **THEN** system SHALL display toggle: "Takeover Alerts" (default: ON)

#### Scenario: Report resolution toggle
- **WHEN** notifications settings open
- **THEN** system SHALL display toggle: "Report Resolution" (default: ON)

#### Scenario: All notifications disable
- **WHEN** user taps "Disable All Notifications"
- **THEN** system SHALL turn off all toggles and prevent any push notifications except critical system messages

#### Scenario: User preference persisted
- **WHEN** user adjusts notification settings
- **THEN** system SHALL save preferences in Supabase user record immediately

#### Scenario: Changes take effect immediately
- **WHEN** user disables notification type
- **THEN** system SHALL stop sending that notification type for future events (already scheduled messages may send)

### Requirement: System Push Notification Infrastructure
System SHALL deliver notifications reliably across iOS and Android.

#### Scenario: Device token registration
- **WHEN** app launches on iOS or Android
- **THEN** system SHALL obtain push notification device token from APNs or FCM and store in Supabase

#### Scenario: Token refresh on app update
- **WHEN** app is updated or reinstalled
- **THEN** system SHALL refresh device token and update database

#### Scenario: Notification payload structure
- **WHEN** system sends push notification
- **THEN** payload SHALL include: title, body, action URL/deep link, and metadata

#### Scenario: Notification delivery timeout
- **WHEN** notification is queued
- **THEN** system SHALL attempt delivery via APNs/FCM for minimum 24 hours before expiring

### Requirement: In-App Notification Center
System SHALL display notification history in app for users to review.

#### Scenario: Notification center accessible
- **WHEN** user taps notification icon or menu
- **THEN** system SHALL display list of recent notifications (read and unread)

#### Scenario: Notifications list chronological
- **WHEN** notification center opens
- **THEN** system SHALL display notifications sorted by newest first

#### Scenario: Mark notification read
- **WHEN** user views notification in center
- **THEN** notification SHALL be marked as read and visual indication updated

#### Scenario: Clear notification action
- **WHEN** user swipes on notification in center
- **THEN** system SHALL provide option to delete/dismiss notification

#### Scenario: Tap opens detail
- **WHEN** user taps notification in center
- **THEN** system SHALL navigate to relevant detail (publication, square, etc.)

### Requirement: Notification Scheduling and Delivery
System SHALL schedule notifications reliably and handle edge cases.

#### Scenario: Scheduled notifications persist
- **WHEN** app is closed or device is offline
- **THEN** system SHALL re-attempt notification delivery when device reconnects

#### Scenario: Duplicate prevention
- **WHEN** same notification event triggers
- **THEN** system SHALL deduplicate and send single notification (not multiple)

#### Scenario: Time zone aware scheduling
- **WHEN** sending time-based notifications (e.g., 1 hour before)
- **THEN** system SHALL calculate times in user's local time zone
