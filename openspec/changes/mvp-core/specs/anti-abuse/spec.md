## ADDED Requirements

### Requirement: Maximum Posts Per User Per 24 Hours
System SHALL limit users to maximum 5 publications within any 24-hour rolling window.

#### Scenario: User posts first publication
- **WHEN** user posts first image successfully
- **THEN** system SHALL record publication timestamp and increment user publication_count_24h = 1

#### Scenario: User can post up to 5
- **WHEN** user has posted 4 times in past 24h
- **WHEN** user attempts 5th post
- **THEN** system SHALL allow post and set publication_count_24h = 5

#### Scenario: 6th post rejected
- **WHEN** user attempts 6th post within 24 hours
- **THEN** system SHALL reject with error: "You've reached the daily publication limit (5). Try again tomorrow."

#### Scenario: Counter resets after 24h
- **WHEN** 24-hour period expires since user's oldest post
- **THEN** system SHALL decrement publication_count_24h and allow new posts

#### Scenario: Rolling window enforced
- **WHEN** user posts at times: 10am, 12pm, 2pm, 4pm, 6pm
- **WHEN** user attempts post at 11am next day
- **THEN** system SHALL allow post (oldest post from 10am is now >24h ago)

#### Scenario: Check happens before image upload
- **WHEN** user initiates post
- **THEN** system SHALL check publication_count_24h BEFORE requesting image, not after

#### Scenario: Admin exemption possible
- **WHEN** admin posts (if admin posts enabled)
- **THEN** system MAY exempt admin from this limit (implementation decision)

### Requirement: Post Cooldown on Same Square
System SHALL enforce 10-minute cooldown between successive posts to same square.

#### Scenario: First post on square succeeds
- **WHEN** user posts to empty 'libre' square
- **THEN** system SHALL record last_post_time for that square

#### Scenario: Immediate re-post rejected
- **WHEN** user attempts post to same square within 10 minutes
- **THEN** system SHALL reject with error: "Please wait [X] minutes before posting again to this square"

#### Scenario: Cooldown timer accurate
- **WHEN** user posts at 2:00 PM
- **WHEN** user attempts re-post at 2:09 PM
- **THEN** system SHALL reject (1 minute remaining)

#### Scenario: Post allowed after cooldown expires
- **WHEN** user attempts post at 2:10:01 PM (10+ minutes after)
- **THEN** system SHALL allow post

#### Scenario: Takeover triggers cooldown
- **WHEN** user takes over square with payment
- **THEN** system SHALL record last_post_time and start 10-minute cooldown for any subsequent attempts

#### Scenario: Different users not affected
- **WHEN** user A posts to square
- **WHEN** user B immediately attempts to take over with payment
- **THEN** system SHALL evaluate takeover as valid payment (cooldown applies after takeover)

### Requirement: Maximum Reports Per User Per 24 Hours
System SHALL limit users to maximum 10 reports within any 24-hour rolling window.

#### Scenario: User can report up to 10
- **WHEN** user submits first through 10th report within 24h
- **THEN** system SHALL accept all reports and increment report_count_24h

#### Scenario: 11th report rejected
- **WHEN** user attempts 11th report within 24h
- **THEN** system SHALL reject with error: "You've reached the daily report limit (10). Try again tomorrow."

#### Scenario: Counter resets after 24h
- **WHEN** 24-hour period expires since user's oldest report
- **THEN** system SHALL decrement report_count_24h and allow new reports

#### Scenario: Check happens before submission
- **WHEN** user initiates report
- **THEN** system SHALL check report_count_24h before accepting submission

#### Scenario: Same-square re-report blocked
- **WHEN** user attempts to report same square twice
- **THEN** system SHALL reject: "You've already reported this publication"

#### Scenario: Duplicate reports not counted
- **WHEN** user attempts to report publication already reported by them
- **THEN** duplicate SHALL NOT increment report_count_24h, just rejected silently

### Requirement: Admin Account Blocking
System SHALL provide admin capability to permanently block abusive users from platform.

#### Scenario: Admin can block user
- **WHEN** admin navigates to user management and selects user
- **THEN** system SHALL display "Block User" action button

#### Scenario: Block requires confirmation
- **WHEN** admin taps "Block User"
- **THEN** system SHALL display confirmation dialog: "Block user [name]? They will not be able to post."

#### Scenario: Block sets user status
- **WHEN** admin confirms block action
- **THEN** system SHALL set user.status = 'blocked' in database

#### Scenario: Blocked user cannot post
- **WHEN** blocked user attempts to post
- **THEN** system SHALL reject all post attempts with error: "Your account is blocked. Contact support."

#### Scenario: Blocked user cannot take over
- **WHEN** blocked user attempts to pay for takeover
- **THEN** system SHALL reject payment attempt: "This account is blocked."

#### Scenario: Blocked user cannot report
- **WHEN** blocked user attempts to submit report
- **THEN** system SHALL reject report: "Your account is blocked."

#### Scenario: Blocked user can still view
- **WHEN** blocked user opens app
- **THEN** system SHALL allow view-only mode (reading content, but no posting/payment actions)

#### Scenario: Block can be reversed
- **WHEN** admin navigates to blocked user
- **THEN** system SHALL display "Unblock User" button to reverse block

#### Scenario: Unblock reverses restrictions
- **WHEN** admin taps "Unblock User"
- **THEN** system SHALL set user.status = 'active' and restore all capabilities

#### Scenario: Block audit trail
- **WHEN** user is blocked
- **THEN** system SHALL create audit_log entry with: admin_id, action_type: 'user_block', timestamp

### Requirement: Automatic API Rate Limiting
System SHALL implement server-side rate limiting on API endpoints to prevent abuse.

#### Scenario: Post endpoint rate limited
- **WHEN** user makes excessive POST requests to /api/publications
- **THEN** system SHALL enforce rate limit: max 10 requests per minute per user

#### Scenario: Report endpoint rate limited
- **WHEN** user makes excessive POST requests to /api/reports
- **THEN** system SHALL enforce rate limit: max 15 requests per minute per user

#### Scenario: Rate limit response
- **WHEN** user exceeds rate limit
- **THEN** system SHALL return HTTP 429 (Too Many Requests) with retry-after header

#### Scenario: Rate limit resets
- **WHEN** rate limit window expires
- **THEN** system SHALL reset counter and allow new requests

#### Scenario: IP-based rate limiting
- **WHEN** single IP makes excessive requests
- **THEN** system SHALL implement IP-level rate limits: max 100 requests per minute

#### Scenario: Distributed attack mitigation
- **WHEN** system detects spike in requests from multiple IPs
- **THEN** system MAY implement temporary IP blocking (DDoS mitigation)

### Requirement: Violation Tracking and Escalation
System SHALL track user violations for escalating enforcement.

#### Scenario: Violation count incremented
- **WHEN** user's publication is removed by moderation
- **THEN** system SHALL increment user.violation_count

#### Scenario: Warning at 1st violation
- **WHEN** user reaches violation_count = 1
- **THEN** system SHALL send notification: "First warning: Review community guidelines"

#### Scenario: Escalation at 3 violations
- **WHEN** user reaches violation_count = 3
- **THEN** system SHALL send notification: "You're at risk of account suspension"

#### Scenario: Automatic block at 5 violations
- **WHEN** user reaches violation_count = 5
- **THEN** system SHALL automatically set user.status = 'blocked'

#### Scenario: Appeals process
- **WHEN** user is blocked for violations
- **THEN** system SHALL provide contact/appeal mechanism (support email)

#### Scenario: Admin can adjust violation count
- **WHEN** admin reviews user violations
- **THEN** admin MAY manually adjust violation_count if decision was error

### Requirement: Suspicious Activity Detection
System SHALL identify and log suspicious behavior patterns.

#### Scenario: Rapid-fire posts detected
- **WHEN** user posts 5 publications in 5 minutes (within 24h limit)
- **THEN** system SHALL flag account for review in admin dashboard

#### Scenario: Spam reporting pattern detected
- **WHEN** user reports 10 publications in 10 minutes
- **THEN** system SHALL flag as potential false-reporting and reduce report weight

#### Scenario: IP rotation detection
- **WHEN** same user account logs in from 10 different IPs in 1 hour
- **THEN** system SHALL flag possible account compromise and prompt re-authentication

#### Scenario: Suspicious activity logged
- **WHEN** suspicious pattern detected
- **THEN** system SHALL create security_log entry for admin review

#### Scenario: Admin can review flags
- **WHEN** admin opens security dashboard
- **THEN** system SHALL display flagged accounts and suspicious patterns
