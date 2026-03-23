## ADDED Requirements

### Requirement: Private Per-User Publication History
System SHALL maintain private publication history for each user, not publicly visible.

#### Scenario: History created on first publication
- **WHEN** user posts first image to square
- **THEN** system SHALL create publication_history record for that user in database

#### Scenario: History is user-private by default
- **WHEN** user views their own history
- **THEN** system SHALL display all their publications regardless of status

#### Scenario: Other users cannot view another user's history
- **WHEN** non-owner user attempts to access another user's history via URL or API
- **THEN** system SHALL reject with 403 Forbidden error

#### Scenario: History not listed on public profiles
- **WHEN** other users view user's public profile in MVP
- **THEN** system SHALL NOT display publication list or history

### Requirement: Publication History Record Structure
System SHALL store comprehensive metadata for each publication in history.

#### Scenario: Each publication record includes identifier
- **WHEN** publication is created
- **THEN** system SHALL record: publication_id, square_id for reference and lookup

#### Scenario: Image reference stored
- **WHEN** image is uploaded
- **THEN** system SHALL store: image_url (Supabase Storage path) in publication record

#### Scenario: Timeline data recorded
- **WHEN** publication is posted
- **THEN** system SHALL record: created_at, scheduled_expiration_time, actual_end_time (if ended)

#### Scenario: Status history tracked
- **WHEN** publication status changes
- **THEN** system SHALL record: initial_status, current_status, status_changes_log

#### Scenario: Acquisition mode recorded
- **WHEN** publication is posted
- **THEN** system SHALL record: acquisition_mode value: 'free_post', 'paid_post', or 'takeover'

#### Scenario: Event log maintained
- **WHEN** publication experiences events (view, takeover, report, etc.)
- **THEN** system SHALL maintain event_log with: event_type, timestamp, event_data

### Requirement: History Entry Events
System SHALL track specific events that occur to publication.

#### Scenario: Posted event recorded
- **WHEN** user posts image
- **THEN** system SHALL create event_log entry: {type: 'posted', timestamp: now, acquisition_mode: 'free_post|paid_post'}

#### Scenario: Replaced event recorded
- **WHEN** another user takes over square
- **THEN** system SHALL record event_log entry: {type: 'replaced', timestamp: now, replaced_by_user_id: X}

#### Scenario: Report event recorded
- **WHEN** publication is reported
- **THEN** system SHALL record event_log entry: {type: 'reported', timestamp: now, report_count: N}

#### Scenario: Extended event recorded
- **WHEN** publication timer is extended via payment
- **THEN** system SHALL record event_log entry: {type: 'extended', timestamp: now, new_expiration: X}

#### Scenario: Expired event recorded
- **WHEN** publication automatically expires (24h timer ends)
- **THEN** system SHALL record event_log entry: {type: 'expired', timestamp: now}

#### Scenario: Blocked event recorded
- **WHEN** publication is blocked by moderation
- **THEN** system SHALL record event_log entry: {type: 'blocked', timestamp: now, reason: 'moderation_decision'}

### Requirement: History Filtering by Status
User SHALL be able to filter publication history by current status.

#### Scenario: Filter options available
- **WHEN** user opens publication history view
- **THEN** system SHALL display filter buttons: All, Active, Expired, Replaced, Blocked, Reported

#### Scenario: Filter by status updates view
- **WHEN** user taps "Active" filter
- **THEN** system SHALL show only publications with status: 'occupe_gratuit', 'occupe_payant', 'en_expiration'

#### Scenario: Filter by expired
- **WHEN** user taps "Expired" filter
- **THEN** system SHALL show only publications with status: 'remplacable' or naturally expired (end_time < now)

#### Scenario: Filter by replaced
- **WHEN** user taps "Replaced" filter
- **THEN** system SHALL show only publications with event_type: 'replaced' in recent events

#### Scenario: Filter by blocked
- **WHEN** user taps "Blocked" filter
- **THEN** system SHALL show only publications with status: 'bloque'

#### Scenario: Filter by reported
- **WHEN** user taps "Reported" filter
- **THEN** system SHALL show only publications with status: 'signale' or 'en_moderation'

### Requirement: History Detail View
User SHALL view detailed information about each publication.

#### Scenario: History entry displays thumbnail
- **WHEN** user views publication history list
- **THEN** system SHALL display small preview thumbnail of posted image

#### Scenario: Detail view shows full image
- **WHEN** user taps history entry
- **THEN** system SHALL display: full-size image, square location, posted date/time, status

#### Scenario: Metadata visible in detail
- **WHEN** history detail is open
- **THEN** system SHALL show: acquisition_mode (Free/Paid/Takeover), expiration time, current status, event log

#### Scenario: Event timeline displayed
- **WHEN** user views publication detail
- **THEN** system SHALL show chronological event_log: posted → [viewed] → [reported] → [expired/replaced/blocked]

### Requirement: History Accessibility to Owners and Admins
System SHALL ensure only authorized users can view publication history.

#### Scenario: Owner views own history
- **WHEN** authenticated user navigates to "My Publications" or history section
- **THEN** system SHALL check user_id == publication.user_id and display full history

#### Scenario: Admin can view any user's history
- **WHEN** admin user navigates to user's publication history via admin panel
- **THEN** system SHALL display user's full history with additional admin metadata

#### Scenario: Non-owner non-admin cannot access
- **WHEN** unauthorized user attempts to access publication_history endpoint for another user
- **THEN** system SHALL return 403 Forbidden and not expose data

### Requirement: History Data Retention
System SHALL retain publication history indefinitely for audit and user reference.

#### Scenario: Deleted account removes history
- **WHEN** user account is permanently deleted
- **THEN** system SHALL delete or anonymize associated publication_history records (compliance)

#### Scenario: Blocked publication history preserved
- **WHEN** publication is blocked and removed
- **THEN** system SHALL retain publication_history record (with image_url reference removed) for moderation audit trail
