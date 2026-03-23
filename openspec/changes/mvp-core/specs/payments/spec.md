## ADDED Requirements

### Requirement: In-App Purchase Integration
System SHALL support monetized actions via react-native-iap library for iOS and Android.

#### Scenario: In-app purchase library initialized
- **WHEN** app launches on iOS or Android
- **THEN** system SHALL initialize react-native-iap connection to App Store and Google Play

#### Scenario: Products configured in stores
- **WHEN** system initializes payments
- **THEN** system SHALL have pre-configured products in App Store and Google Play for: "extend_visibility", "takeover_square"

#### Scenario: Purchase flow triggered by user
- **WHEN** user taps "Post Paid" or "Take Over" button
- **THEN** system SHALL initiate react-native-iap purchase flow

### Requirement: Extend Visibility Purchase Option
User SHALL be able to purchase 24-hour visibility extension on existing publication.

#### Scenario: Extend option available on owned publication
- **WHEN** user views their own occupied square with remaining time
- **THEN** system SHALL display "Extend 24 Hours: [price]" button

#### Scenario: Extension available before expiration
- **WHEN** publication is in 'occupe_gratuit' or 'occupe_payant' status (not yet in 'en_expiration')
- **THEN** system SHALL allow extension purchase

#### Scenario: Purchase extends timer
- **WHEN** user completes payment for extension
- **THEN** system SHALL add 24 hours to publication timer and extend end_time timestamp

#### Scenario: Multiple extensions allowed
- **WHEN** user extends publication multiple times
- **THEN** system SHALL allow unlimited extensions (within reason) and maintain cumulative time

#### Scenario: Extension updates remaining time display
- **WHEN** extension is purchased
- **THEN** system SHALL immediately update displayed "Expires in..." countdown on map and detail view

### Requirement: Takeover Occupied Square Purchase
User SHALL be able to purchase right to replace occupied square content.

#### Scenario: Takeover available for occupied paid squares
- **WHEN** square is in 'occupe_payant' or 'remplacable' status
- **THEN** system SHALL display "Take Over: [price]" button to users not owning it

#### Scenario: Takeover initiated with payment
- **WHEN** user taps "Take Over" and completes payment
- **THEN** system SHALL deduct payment from user account

#### Scenario: Old publication replaced after payment
- **WHEN** takeover payment completes successfully
- **THEN** system SHALL: clear old publication data, accept user's new image, transition square to 'occupe_payant', start new 24-hour timer

#### Scenario: Original owner notified of replacement
- **WHEN** square is taken over
- **THEN** system SHALL send push notification to original owner (if opted-in): "Your square was taken over"

#### Scenario: Takeover restricted by cooldown
- **WHEN** square was just posted to (less than 10 minutes ago)
- **THEN** system SHALL disable takeover button with message "10-minute cooldown active"

### Requirement: Server-Side Receipt Validation
System SHALL validate all in-app purchase receipts server-side before granting benefits.

#### Scenario: Client submits receipt after purchase
- **WHEN** react-native-iap completes purchase transaction
- **THEN** system SHALL send receipt to backend with purchase details

#### Scenario: Server validates receipt authenticity
- **WHEN** backend receives receipt
- **THEN** system SHALL validate receipt signature against App Store or Google Play certificates

#### Scenario: Invalid receipt rejected
- **WHEN** receipt validation fails (tampered, expired, or invalid)
- **THEN** system SHALL reject payment, log security incident, and present error to user: "Payment verification failed"

#### Scenario: Receipt validation prevents double-spending
- **WHEN** server validates receipt
- **THEN** system SHALL check if receipt_id already exists in database to prevent duplicate benefit granting

#### Scenario: Validated receipt stored
- **WHEN** receipt validation succeeds
- **THEN** system SHALL store receipt hash, transaction_id, and validation timestamp in database

### Requirement: Payment Status Tracking
System SHALL maintain clear status for each payment transaction.

#### Scenario: Payment states tracked
- **WHEN** payment is initiated
- **THEN** system SHALL track states: pending, validating, completed, failed, refunded

#### Scenario: Pending status during processing
- **WHEN** user completes purchase in app
- **THEN** system SHALL set status = 'pending' until server receipt validation completes

#### Scenario: Completed status after validation
- **WHEN** server validates receipt successfully
- **THEN** system SHALL set status = 'completed' and grant benefits (extend timer, accept takeover)

#### Scenario: Failed status on validation error
- **WHEN** receipt validation fails
- **THEN** system SHALL set status = 'failed' and log error with validation details

#### Scenario: Refund tracking
- **WHEN** user requests refund through app store
- **THEN** system SHALL detect refund in receipt and set status = 'refunded', reversing benefits if applicable

#### Scenario: User can view payment history
- **WHEN** user navigates to account settings or payment history section
- **THEN** system SHALL display list of past transactions with: date, amount, type, and status

### Requirement: Payment Error Recovery
System SHALL handle payment failures gracefully with user-friendly recovery options.

#### Scenario: Network error during payment
- **WHEN** network connection lost during purchase
- **THEN** system SHALL display: "Connection error. Please retry." and allow user to try again

#### Scenario: User cancels purchase prompt
- **WHEN** user dismisses purchase dialog before confirmation
- **THEN** system SHALL cancel transaction and return to previous screen

#### Scenario: Purchase retry after failure
- **WHEN** payment fails
- **THEN** system SHALL present button: "Retry Payment" to attempt transaction again

#### Scenario: Payment state persists
- **WHEN** app crashes or closes during payment
- **THEN** system SHALL recover payment state on next launch and attempt validation/retry if needed

### Requirement: Currency and Pricing Display
System SHALL display prices in user's local currency.

#### Scenario: Currency determined by app store region
- **WHEN** app store account is in specific region (US, EU, etc.)
- **THEN** system SHALL display prices in corresponding currency (USD, EUR, etc.)

#### Scenario: Price displayed before payment prompt
- **WHEN** user initiates purchase
- **THEN** system SHALL show final amount and currency before app store prompt appears

#### Scenario: Tax and fees applied transparently
- **WHEN** app store processes payment
- **THEN** any applicable taxes or fees SHALL be shown by app store before final confirmation
