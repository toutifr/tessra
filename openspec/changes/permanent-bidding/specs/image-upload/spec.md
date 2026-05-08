## MODIFIED Requirements

### Requirement: Upload flow adapts to square status
The image upload flow SHALL adapt based on whether the target square is free or occupied:
- Free square: standard upload flow (no payment)
- Occupied square: upload flow includes price input and payment step

#### Scenario: Upload to free square
- **WHEN** user selects a `libre` square and picks a photo
- **THEN** the system SHALL proceed directly to upload without any payment step

#### Scenario: Upload to occupied square
- **WHEN** user selects an `occupe` square and picks a photo
- **THEN** the system SHALL display the minimum price, a price input field (pre-filled with minimum), and require payment before uploading

### Requirement: Price input for replacement
When replacing an occupied square, the system SHALL display a numeric input for the price, pre-filled with the minimum price. The user MAY increase the amount. The system SHALL validate that the entered amount is ≥ the minimum price before initiating payment.

#### Scenario: User accepts minimum price
- **WHEN** user views replacement screen with minimum 3€ and taps "Confirm" without changing the price
- **THEN** the system SHALL initiate a 3€ payment

#### Scenario: User enters custom price
- **WHEN** user views replacement screen with minimum 3€ and changes the price to 7€
- **THEN** the system SHALL initiate a 7€ payment

#### Scenario: User enters price below minimum
- **WHEN** user views replacement screen with minimum 3€ and enters 1€
- **THEN** the system SHALL show a validation error and prevent submission

## REMOVED Requirements

### Requirement: Expiration-aware upload messaging
**Reason**: No expiration exists. Upload messaging no longer references 24h visibility.
**Migration**: Update copy from "Visible pendant 24h" to "Visible tant que personne ne prend ta place".
