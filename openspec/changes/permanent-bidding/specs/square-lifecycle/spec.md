## MODIFIED Requirements

### Requirement: Square status values
The system SHALL support the following square statuses: `libre`, `occupe`, `signale`, `bloque`.

#### Scenario: New square
- **WHEN** a square has never been published to
- **THEN** its status SHALL be `libre`

#### Scenario: Square with publication
- **WHEN** a user publishes a photo to a square
- **THEN** its status SHALL be `occupe`

#### Scenario: Square reported
- **WHEN** a user reports a square's content
- **THEN** its status SHALL be `signale`

#### Scenario: Square blocked by admin
- **WHEN** an admin blocks a square
- **THEN** its status SHALL be `bloque`

### Requirement: Square publication is permanent
A publication on a square SHALL remain visible indefinitely until replaced by another user's publication or removed by moderation. There SHALL be no automatic expiration.

#### Scenario: Publication persists without time limit
- **WHEN** a publication is created on a square
- **THEN** the publication SHALL remain visible with no expiration timer

#### Scenario: No automatic status change over time
- **WHEN** 24 hours, 7 days, or any amount of time passes after a publication
- **THEN** the square status SHALL remain `occupe` and the publication SHALL remain visible

### Requirement: Square replacement by payment
An occupied square SHALL only be replaceable by another user who pays the minimum price or above. The original publication is archived and the new one takes its place.

#### Scenario: Replacing an occupied square
- **WHEN** a user pays the minimum price or above for an occupied square
- **THEN** the previous publication SHALL be archived (status `replaced`), the new photo SHALL be displayed, and the square SHALL remain `occupe`

#### Scenario: Cannot replace without payment
- **WHEN** a user attempts to replace an occupied square without paying
- **THEN** the system SHALL reject the attempt

### Requirement: Free first publication
A square with status `libre` SHALL accept a publication for free (no payment required).

#### Scenario: Publishing to a free square
- **WHEN** a user selects a `libre` square and uploads a photo
- **THEN** the publication SHALL be created at no cost and the square status SHALL change to `occupe`

## REMOVED Requirements

### Requirement: 24-hour expiration timer
**Reason**: Replaced by permanent publication model. Photos no longer expire.
**Migration**: Remove `expires_at` column from publications. Remove cron job for expiration checks. Remove countdown timer component from client.

### Requirement: Status transitions for expiration
**Reason**: Statuses `en_expiration` and `remplacable` no longer exist in the simplified model.
**Migration**: Migrate existing `en_expiration` and `remplacable` squares to `occupe` status.

### Requirement: Free replacement after expiration
**Reason**: There is no expiration. Replacement is always paid (except first publication on a free square).
**Migration**: Remove free replacement flow from client.
