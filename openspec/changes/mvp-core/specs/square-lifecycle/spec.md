## ADDED Requirements

### Requirement: Square Status State Machine
System SHALL manage square state through defined status transitions representing complete publication lifecycle.

#### Scenario: Square lifecycle states defined
- **WHEN** system initializes square management
- **THEN** system SHALL support 8 distinct status values: libre, occupe_gratuit, occupe_payant, en_expiration, remplacable, signale, en_moderation, bloque

#### Scenario: Status persistence
- **WHEN** square status changes
- **THEN** system SHALL persist status in database with timestamp of last transition

#### Scenario: User visibility matches status
- **WHEN** user views square on map
- **THEN** system SHALL display color and interactions matching current status

### Requirement: Free to Occupied Transition (Free Post)
System SHALL allow transition from 'libre' to 'occupe_gratuit' when user posts without payment.

#### Scenario: Free post on libre square
- **WHEN** user posts image to 'libre' square without payment
- **THEN** system SHALL: validate image, set square status to 'occupe_gratuit', record publication owner, start 24-hour timer

#### Scenario: Free post requires authentication
- **WHEN** unauthenticated user attempts free post
- **THEN** system SHALL reject action and present sign in screen

#### Scenario: Free post subject to rate limits
- **WHEN** user attempts free post
- **THEN** system SHALL check: user max 5 posts per 24h, 10-minute cooldown on this square, then proceed if limits allow

### Requirement: Free to Occupied Transition (Paid Post)
System SHALL allow transition from 'libre' to 'occupe_payant' when user posts with payment.

#### Scenario: Paid post on libre square
- **WHEN** user posts image to 'libre' square and completes payment
- **THEN** system SHALL: validate image, charge user via in-app purchase, set square status to 'occupe_payant', start 24-hour timer

#### Scenario: Payment required before status change
- **WHEN** user initiates paid post
- **THEN** system SHALL complete payment processing before transitioning square status

### Requirement: Occupied to Expiration Transition
System SHALL automatically transition occupied square to 'en_expiration' when 24-hour timer ends.

#### Scenario: Timer counts down for occupied square
- **WHEN** square transitions to 'occupe_gratuit' or 'occupe_payant'
- **THEN** system SHALL start countdown timer for exactly 24 hours from publication timestamp

#### Scenario: Expiration countdown visible to user
- **WHEN** user views publication with active timer
- **THEN** system SHALL display remaining time in format "Expires in Xh Ym"

#### Scenario: Auto-transition on timer expiration
- **WHEN** 24-hour timer reaches zero
- **THEN** system SHALL automatically transition square to 'en_expiration' status

#### Scenario: Push notification before expiration
- **WHEN** 1 hour remains on publication timer
- **THEN** system SHALL send push notification to publication owner (if opted-in): "Your publication expires soon"

### Requirement: Expiration to Replacement Window
System SHALL transition 'en_expiration' to 'remplacable' to allow temporary takeover window.

#### Scenario: Grace period after expiration
- **WHEN** square reaches 'en_expiration' status
- **THEN** system SHALL set 1-hour grace period during which square accepts takeover attempts

#### Scenario: Square status becomes remplacable
- **WHEN** grace period begins
- **THEN** system SHALL transition square status to 'remplacable'

#### Scenario: User can pay to take over
- **WHEN** square is 'remplacable' and user posts with payment
- **THEN** system SHALL accept payment, replace publication, and transition to 'occupe_payant'

### Requirement: Replacement Window to Libre Transition
System SHALL transition 'remplacable' square back to 'libre' if no replacement during window.

#### Scenario: One-hour replacement window
- **WHEN** square enters 'remplacable' status
- **THEN** system SHALL start 1-hour timer for replacement window

#### Scenario: Auto-reset if not replaced
- **WHEN** 1-hour replacement window expires without takeover
- **THEN** system SHALL transition square back to 'libre' status and clear publication data

### Requirement: Report to Moderation Transition
System SHALL transition square to 'signale' when user reports publication.

#### Scenario: User reports publication
- **WHEN** user taps report button on occupied square and submits reason
- **THEN** system SHALL: validate report rate limits, create moderation record, transition square to 'signale'

#### Scenario: Reported content visibility
- **WHEN** square status is 'signale'
- **THEN** system SHALL blur/obscure reported image for other users

#### Scenario: Owner sees report status
- **WHEN** publication owner views their square during 'signale' status
- **THEN** system SHALL display notification that publication has been reported

### Requirement: Report Review Moderation Workflow
System SHALL transition 'signale' to 'en_moderation' when admin review begins.

#### Scenario: Admin review assignment
- **WHEN** admin opens moderation queue and reviews reported content
- **THEN** system SHALL transition square to 'en_moderation' and record review start timestamp

#### Scenario: Content remains inaccessible during review
- **WHEN** square is in 'en_moderation' status
- **THEN** system SHALL continue blurring image and display "Under Review" status to users

### Requirement: Moderation Decision Transitions
System SHALL transition 'en_moderation' to either 'bloque' (violation found) or 'libre' (cleared) based on admin decision.

#### Scenario: Admin dismisses report
- **WHEN** admin reviews publication and determines it complies with policies
- **THEN** system SHALL: transition square to 'libre' (clear image), remove publication, notify original poster

#### Scenario: Admin blocks publication for violation
- **WHEN** admin determines publication violates policies
- **THEN** system SHALL: transition square to 'bloque', remove publication, notify owner, increment user violation count

#### Scenario: Blocked square prevents new posts
- **WHEN** square status is 'bloque'
- **THEN** system SHALL reject all post attempts with message "This square is temporarily blocked"

### Requirement: Status-Based User Actions
System SHALL present different interaction options based on square status.

#### Scenario: Libre square allows posting
- **WHEN** user views 'libre' square
- **THEN** system SHALL display "Post Free" and "Post Paid" options with respective pricing

#### Scenario: Occupe square allows payment takeover
- **WHEN** user views 'occupe_payant' square not owned by them
- **THEN** system SHALL display "Take Over for [price]" button if payment payment is enabled

#### Scenario: User sees only view option for owned publication
- **WHEN** user views their own occupied square
- **THEN** system SHALL display view-only mode without takeover option

#### Scenario: Signale square shows report pending
- **WHEN** user views 'signale' square
- **THEN** system SHALL display blurred image and "Report Pending Review" status

#### Scenario: Bloque square disabled
- **WHEN** user attempts to interact with 'bloque' square
- **THEN** system SHALL disable all posting and takeover options
