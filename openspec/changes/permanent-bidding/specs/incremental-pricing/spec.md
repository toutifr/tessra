## ADDED Requirements

### Requirement: Incremental price calculation
The system SHALL calculate the minimum replacement price for a square as `replacement_count × 1.00€`. When `replacement_count` is 0, the square is free to claim.

#### Scenario: First publication on a free square
- **WHEN** a square has `replacement_count = 0`
- **THEN** the minimum price SHALL be 0€ (free)

#### Scenario: Second publication on a square
- **WHEN** a square has `replacement_count = 1`
- **THEN** the minimum price SHALL be 1€

#### Scenario: Nth publication on a square
- **WHEN** a square has `replacement_count = 5`
- **THEN** the minimum price SHALL be 5€

### Requirement: Free pricing above minimum
The system SHALL accept any payment amount that is greater than or equal to the minimum price for that square. The user MAY choose to pay more than the minimum.

#### Scenario: User pays exact minimum
- **WHEN** a square has minimum price 3€ and user pays 3€
- **THEN** the system SHALL accept the payment and complete the replacement

#### Scenario: User pays above minimum
- **WHEN** a square has minimum price 3€ and user pays 10€
- **THEN** the system SHALL accept the payment and complete the replacement

#### Scenario: User pays below minimum
- **WHEN** a square has minimum price 3€ and user pays 2€
- **THEN** the system SHALL reject the payment with a clear error message showing the minimum price

### Requirement: Price tracking per square
The system SHALL store `replacement_count` and `last_price` on each square. `replacement_count` SHALL increment by 1 on each successful replacement. `last_price` SHALL be set to the amount actually paid.

#### Scenario: Replacement updates price tracking
- **WHEN** a square with `replacement_count = 2` and `last_price = 5.00` is replaced with a payment of 7€
- **THEN** the square SHALL have `replacement_count = 3` and `last_price = 7.00`

#### Scenario: Free first publication
- **WHEN** a free square with `replacement_count = 0` receives its first publication
- **THEN** the square SHALL have `replacement_count = 1` and `last_price = 0.00`

### Requirement: Price display
The system SHALL display the current minimum price on occupied squares. For free squares, the system SHALL display "Gratuit".

#### Scenario: Occupied square shows minimum price
- **WHEN** user views an occupied square with `replacement_count = 4`
- **THEN** the system SHALL display "4€ minimum" (or equivalent)

#### Scenario: Free square shows free label
- **WHEN** user views a free square
- **THEN** the system SHALL display "Gratuit"

### Requirement: Atomic price validation
The system SHALL validate the payment amount server-side within a transaction that locks the square row, preventing race conditions where two users attempt to replace the same square simultaneously.

#### Scenario: Concurrent replacement attempts
- **WHEN** two users attempt to replace the same square at the same time
- **THEN** only one replacement SHALL succeed, and the other SHALL receive an error indicating the square was just replaced
