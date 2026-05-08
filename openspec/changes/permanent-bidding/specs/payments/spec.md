## MODIFIED Requirements

### Requirement: Payment types
The system SHALL support a single payment type: `replace_square`. The `extend_visibility` payment type SHALL be removed.

#### Scenario: Replace square payment
- **WHEN** a user pays to replace an occupied square
- **THEN** the payment SHALL be recorded with type `replace_square` and the amount paid

#### Scenario: No extend visibility option
- **WHEN** a user views their own occupied square
- **THEN** no "Extend" or "Prolong" payment option SHALL be displayed

### Requirement: Variable pricing IAP
The payment system SHALL support variable amounts (1€, 2€, 3€, ... up to the store's maximum) for square replacements. The system SHALL use consumable IAP products with tiered pricing or a single product with server-validated pricing.

#### Scenario: Payment matches entered price
- **WHEN** user confirms replacement at 5€
- **THEN** the IAP charge SHALL be exactly 5€ (or nearest store tier)

### Requirement: Server-side price validation
After receipt validation, the server SHALL verify that the amount paid is ≥ the square's current minimum price before completing the replacement. This prevents stale-price exploits.

#### Scenario: Price increased between client display and payment
- **WHEN** user initiates payment at 3€ minimum but another user replaces the square first (new minimum is now 4€)
- **THEN** the server SHALL reject the 3€ payment and return an error with the updated minimum price

## REMOVED Requirements

### Requirement: Extend visibility purchase
**Reason**: Publications are permanent — there is no visibility to extend.
**Migration**: Remove `extend_visibility` IAP product. Remove "Prolonger" button from square detail screen. Remove `extend_visibility` payment type from backend.
