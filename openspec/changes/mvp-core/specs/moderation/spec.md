## ADDED Requirements

### Requirement: User Report Submission
User SHALL be able to report publications that violate policies.

#### Scenario: Report button visible on publication
- **WHEN** user views occupied square detail
- **THEN** system SHALL display "Report" button or flag icon

#### Scenario: Report reasons presented
- **WHEN** user taps report button
- **THEN** system SHALL present modal with report reason options: "Inappropriate Content", "Spam", "Hate Speech", "Fraud"

#### Scenario: User selects reason
- **WHEN** report modal is open
- **THEN** user SHALL select one primary reason for report

#### Scenario: Optional report comment
- **WHEN** user submits report
- **THEN** system MAY provide optional text field for additional context (limit 200 chars)

#### Scenario: Report submitted to database
- **WHEN** user taps "Submit Report"
- **THEN** system SHALL create report record in database with: reporter_id, publication_id, reason, timestamp

#### Scenario: Report confirmation
- **WHEN** report submission succeeds
- **THEN** system SHALL display confirmation: "Report submitted. Thank you." and close modal

### Requirement: Reported Content Blurring
System SHALL obscure reported publication images to other users until moderation review.

#### Scenario: Image blurred on map
- **WHEN** square with 'signale' status is viewed
- **THEN** system SHALL display blurred/pixelated version of reported image

#### Scenario: Detail view shows report status
- **WHEN** user taps reported square
- **THEN** system SHALL display: blurred image, "Under Review" badge, and prevent interaction

#### Scenario: Owner sees unblurred
- **WHEN** publication owner views their own reported square
- **THEN** system SHALL show unblurred image but display warning: "Your publication is under review"

#### Scenario: Blur level sufficient
- **WHEN** image is blurred
- **THEN** system SHALL apply blur radius of 20+ pixels to prevent content recognition

#### Scenario: Text overlay on blurred image
- **WHEN** reported content is displayed blurred
- **THEN** system MAY display text overlay: "Content Reported - Under Review"

### Requirement: Admin Moderation Workflow
Admins SHALL have dedicated interface to review reported content.

#### Scenario: Admin moderation queue
- **WHEN** admin logs into admin panel
- **THEN** system SHALL display moderation queue with pending reports sorted by newest first

#### Scenario: Queue shows report summary
- **WHEN** admin views moderation queue
- **THEN** system SHALL display for each report: thumbnail (original unblurred), reporter count, primary reason, timestamp

#### Scenario: Admin can open report detail
- **WHEN** admin taps report in queue
- **THEN** system SHALL open detail view showing: full image, all report data, report reason(s), publication metadata

#### Scenario: Admin metadata visible
- **WHEN** reviewing publication
- **THEN** system SHALL show: publication_id, user (poster name/id), square_id, post date, publication history

#### Scenario: Admin can see reporter info
- **WHEN** admin opens report detail
- **THEN** system MAY show (privacy-conscious): number of reports, report reasons summary, but NOT reporter identities in MVP

### Requirement: Moderation Actions
Admin SHALL have options to dismiss report or take action on publication.

#### Scenario: Dismiss option
- **WHEN** admin reviews report and determines content complies with policies
- **THEN** system SHALL provide "Dismiss Report" button

#### Scenario: Dismiss action removes report
- **WHEN** admin taps "Dismiss Report"
- **THEN** system SHALL: set report status = 'dismissed', revert square status from 'signale' to 'occupe_*', unhide image

#### Scenario: Remove publication option
- **WHEN** admin determines publication violates policies
- **THEN** system SHALL provide "Remove Publication" button

#### Scenario: Remove action deletes content
- **WHEN** admin taps "Remove Publication"
- **THEN** system SHALL: delete publication record, remove image from Supabase, set square status = 'bloque', transition owner violation count++

#### Scenario: Block user option
- **WHEN** admin sees patterns of abuse from user
- **THEN** system SHALL provide "Block User" option to prevent further posts

#### Scenario: Block action restricts user
- **WHEN** admin taps "Block User"
- **THEN** system SHALL: set user.status = 'blocked', prevent user from posting, display "Account Blocked" on next user login

#### Scenario: Admin can add notes
- **WHEN** admin takes moderation action
- **THEN** system SHALL allow admin to add text note explaining decision (for audit trail)

### Requirement: Moderation Decision Notifications
System SHALL notify affected parties of moderation decisions.

#### Scenario: Owner notified of dismissal
- **WHEN** report is dismissed
- **THEN** system SHALL send push notification to owner: "Report dismissed. Your publication remains active."

#### Scenario: Owner notified of removal
- **WHEN** publication is removed
- **THEN** system SHALL send push notification to owner: "Your publication was removed for policy violation"

#### Scenario: Report resolution notification
- **WHEN** moderation decision is made
- **THEN** system SHALL send push notification to reporter (if opted-in): "Report resolved"

#### Scenario: Reporter not shown action details
- **WHEN** reporter receives notification
- **THEN** notification SHALL NOT reveal what action was taken (privacy)

### Requirement: Report Rate Limiting
System SHALL prevent spam reports from individual users.

#### Scenario: Report limit per user
- **WHEN** user submits reports
- **THEN** system SHALL track reports and limit to maximum 10 per 24-hour period

#### Scenario: Rate limit enforced
- **WHEN** user exceeds 10 reports in 24h
- **THEN** system SHALL display: "You've reached your report limit. Please try again tomorrow."

#### Scenario: Counters reset daily
- **WHEN** 24-hour period expires
- **THEN** system SHALL reset user report count to 0

#### Scenario: Same user cannot report same square twice
- **WHEN** user attempts to report square already reported by them
- **THEN** system SHALL display: "You've already reported this publication"

#### Scenario: Reports on same square aggregate
- **WHEN** multiple users report same square
- **THEN** system SHALL aggregate into single entry in moderation queue with report_count = N

### Requirement: Moderation Audit Trail
System SHALL maintain detailed audit trail of all moderation actions for compliance.

#### Scenario: All actions logged
- **WHEN** admin takes action (dismiss, remove, block)
- **THEN** system SHALL create audit_log entry with: admin_id, action_type, publication_id, timestamp, admin_notes

#### Scenario: Audit trail queryable
- **WHEN** admin or compliance officer queries audit logs
- **THEN** system SHALL display all moderation actions with full context

#### Scenario: User can request data
- **WHEN** user requests export of their moderation actions (GDPR/privacy request)
- **THEN** system SHALL provide access to decisions affecting their account
