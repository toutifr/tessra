## REMOVED Requirements

### Requirement: Expiration warning notification
**Reason**: Publications no longer expire. There is no expiration to warn about.
**Migration**: Remove the 1-hour-before-expiration notification trigger. Remove "Extend Now" action from notifications.

## MODIFIED Requirements

### Requirement: Takeover notification
The system SHALL send a push notification to the previous owner when their square is replaced. The notification SHALL include the square location and the price paid by the new owner.

#### Scenario: Owner notified of replacement
- **WHEN** a user's publication is replaced by another user paying 5€
- **THEN** the previous owner SHALL receive a notification: "Quelqu'un a pris ta place sur [location] pour 5€"

#### Scenario: Notification respects opt-out
- **WHEN** a user has disabled takeover alerts
- **THEN** no notification SHALL be sent when their square is replaced
