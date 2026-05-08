## MODIFIED Requirements

### Requirement: Square color coding by status
The map SHALL display squares with color coding based on simplified statuses:
- `libre`: green (#4CAF50)
- `occupe`: blue (#2196F3)
- `signale`: red (#FF5722)
- `bloque`: dark red (#B71C1C)

#### Scenario: Occupied square display
- **WHEN** the map renders a square with status `occupe`
- **THEN** the square SHALL be displayed in blue

#### Scenario: Free square display
- **WHEN** the map renders a square with status `libre`
- **THEN** the square SHALL be displayed in green

### Requirement: Price overlay on occupied squares
The map SHALL display the minimum replacement price on or near occupied squares at high zoom levels (zoom ≥ 10).

#### Scenario: Price visible at high zoom
- **WHEN** user views the map at zoom level 12 with occupied squares visible
- **THEN** each occupied square SHALL show its minimum replacement price

#### Scenario: Price hidden at low zoom
- **WHEN** user views the map at zoom level 6
- **THEN** no price labels SHALL be displayed on squares

## REMOVED Requirements

### Requirement: Expiration-based color coding
**Reason**: Statuses `en_expiration` (orange) and `remplacable` (grey) no longer exist.
**Migration**: Remove orange and grey color entries from STATUS_COLORS. Remove `occupe_gratuit` / `occupe_payant` distinction (both become `occupe` blue).

### Requirement: Countdown timer display on map
**Reason**: No expiration timer exists in the new model.
**Migration**: Remove any timer overlay from map squares.
