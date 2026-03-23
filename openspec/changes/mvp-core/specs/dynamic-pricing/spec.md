## ADDED Requirements

### Requirement: Base Price Per Square
System SHALL establish a configurable base price for each square.

#### Scenario: Base price assigned to square
- **WHEN** system initializes square pricing
- **THEN** system SHALL assign base_price value (in currency units) to square record in database

#### Scenario: Base price consistent globally
- **WHEN** multiple users view same square
- **THEN** system SHALL calculate final price from same base_price before multipliers applied

#### Scenario: Base price retrievable for pricing calculation
- **WHEN** pricing calculation is needed
- **THEN** system SHALL retrieve square base_price from database

### Requirement: Demand-Based Price Multiplier
System SHALL calculate dynamic price multiplier based on recent demand for square.

#### Scenario: Demand factors tracked
- **WHEN** users view, attempt posts, or occupy square
- **THEN** system SHALL track: view count (last 24h), failed post attempts, current occupancy status

#### Scenario: Multiplier increases with demand
- **WHEN** square receives multiple views or takeover attempts
- **THEN** system SHALL increase demand_multiplier value based on activity level

#### Scenario: Multiplier reflects recency
- **WHEN** calculating demand
- **THEN** system SHALL weight recent activity (last 24h) more heavily than older activity

#### Scenario: No multiplier on zero demand
- **WHEN** square has no recent views or attempts (demand_multiplier = 0)
- **THEN** system SHALL display base price without markup

### Requirement: Dynamic Price Formula
System SHALL calculate final price using formula: final_price = base_price * (1 + demand_multiplier).

#### Scenario: Formula applied consistently
- **WHEN** user requests price for any square
- **THEN** system SHALL calculate: final_price = base_price * (1 + demand_multiplier)

#### Scenario: Multiplier range bounded
- **WHEN** calculating demand_multiplier
- **THEN** system SHALL cap multiplier between 0 (min) and 2.0 (max, doubling price)

#### Scenario: Price reflects current demand
- **WHEN** demand changes (new views, posts)
- **THEN** system SHALL recalculate final_price to reflect new demand_multiplier

#### Scenario: Example: High demand square
- **WHEN** square has demand_multiplier = 0.5
- **THEN** system SHALL calculate final_price = base_price * 1.5 (50% markup)

#### Scenario: Example: Very high demand square
- **WHEN** square has demand_multiplier = 1.0 (max capped)
- **THEN** system SHALL calculate final_price = base_price * 2.0 (100% markup, double)

### Requirement: Price Display Before Purchase
System SHALL display calculated final price to user before payment is required.

#### Scenario: Price shown on square detail
- **WHEN** user views free ('libre') square
- **THEN** system SHALL display: "Post Paid: [currency] [final_price]" prominently

#### Scenario: Price shown with multiplier breakdown
- **WHEN** user views price
- **THEN** system MAY display breakdown: "Base: [base_price] + [X]% demand markup = [final_price]"

#### Scenario: Price updates dynamically
- **WHEN** user views square detail and demand changes
- **THEN** system SHALL refresh displayed price within 5 seconds if significant change occurs

#### Scenario: Takeover price shown for occupied square
- **WHEN** user views 'occupe_payant' square not owned by them
- **WHEN** takeover is available (not during cooldown)
- **THEN** system SHALL display "Take Over: [currency] [final_price]"

#### Scenario: Free post option always available
- **WHEN** user views 'libre' square
- **THEN** system SHALL also display "Post Free" option without charge

### Requirement: Price Reset After Inactivity
System SHALL reset demand multiplier for squares with extended inactivity.

#### Scenario: Multiplier decays over time
- **WHEN** square receives no posts or views for 24 hours
- **THEN** system SHALL gradually reduce demand_multiplier toward 0

#### Scenario: Reset completes after 48 hours inactivity
- **WHEN** square has been inactive (no views, posts, occupancy changes) for 48 hours
- **THEN** system SHALL set demand_multiplier = 0 and final_price = base_price

#### Scenario: Full reset when square becomes libre
- **WHEN** 'remplacable' square times out and transitions back to 'libre'
- **THEN** system SHALL reset demand_multiplier = 0 and associated price tracking

#### Scenario: Activity resumes tracking immediately
- **WHEN** inactive square receives view or post attempt
- **THEN** system SHALL resume demand calculation and begin increasing multiplier again

### Requirement: Price Consistency During Transaction
System SHALL lock price between display and purchase completion.

#### Scenario: Price locked after user views
- **WHEN** user initiates purchase with displayed price
- **THEN** system SHALL lock final_price for 30 seconds to prevent race condition

#### Scenario: Locked price used for payment
- **WHEN** user completes payment within lock window
- **THEN** system SHALL charge locked_price, not recalculated price

#### Scenario: Price expired message
- **WHEN** user attempts payment after 30-second lock expires
- **THEN** system SHALL display new price and require user confirmation before re-payment
