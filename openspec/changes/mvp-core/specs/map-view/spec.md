## ADDED Requirements

### Requirement: Mapbox World Map Integration
System SHALL display interactive Mapbox-based world map as primary view.

#### Scenario: Home screen displays map
- **WHEN** user opens app after authentication
- **THEN** system SHALL load and display Mapbox world map centered on user location (if permitted) or default region

#### Scenario: Map loads within timeout
- **WHEN** map component initializes
- **THEN** system SHALL complete map render within 3 seconds including tiles and overlay

#### Scenario: User can pan map
- **WHEN** user performs drag gesture on map
- **THEN** system SHALL pan viewport smoothly to follow user's drag direction

### Requirement: Square Grid Overlay
System SHALL display grid of squares overlaid on map for interactive content squares.

#### Scenario: Grid appears on map
- **WHEN** map loads at zoom level 8 or higher
- **THEN** system SHALL render visible grid squares with clear borders

#### Scenario: Grid tiles match square database
- **WHEN** map grid is displayed
- **THEN** system SHALL fetch square metadata from database corresponding to visible viewport and display current state for each square

#### Scenario: Grid updates on pan
- **WHEN** user pans map to new viewport area
- **THEN** system SHALL load and display new grid squares for visible region within 1 second

### Requirement: Square Status Color Coding
Each square SHALL display distinct color indicating current status.

#### Scenario: Free square appears green
- **WHEN** square with status 'libre' is visible on map
- **THEN** system SHALL render square with green fill color to indicate available for posting

#### Scenario: Occupied square appears blue
- **WHEN** square with status 'occupe_gratuit' is visible
- **THEN** system SHALL render square with blue fill to indicate free publication occupying it

#### Scenario: Paid square appears gold
- **WHEN** square with status 'occupe_payant' is visible
- **THEN** system SHALL render square with gold fill to indicate paid publication

#### Scenario: Expiring square appears orange
- **WHEN** square with status 'en_expiration' is visible
- **THEN** system SHALL render square with orange fill to indicate publication expiring soon

#### Scenario: Blocked square appears red
- **WHEN** square with status 'bloque' is visible
- **THEN** system SHALL render square with red/dark color to indicate blocked from posting

### Requirement: Viewport-Based Square Loading
System SHALL efficiently load squares only for visible map area.

#### Scenario: Viewport fetch on initial map load
- **WHEN** map completes rendering at starting location
- **THEN** system SHALL query backend for squares within visible bounds and current zoom level

#### Scenario: Lazy load new squares on pan
- **WHEN** user pans map beyond current loaded area
- **THEN** system SHALL request new square data for revealed viewport area

#### Scenario: Unload off-screen squares
- **WHEN** squares move outside visible viewport
- **THEN** system MAY unload square data to conserve memory (minimum memory optimization)

### Requirement: Zoom Level Support
System SHALL support multiple zoom levels with adaptive square visibility.

#### Scenario: Zoom out shows regional overview
- **WHEN** user zooms out to level 4-7
- **THEN** system SHALL display sparse square grid with aggregated color indicators

#### Scenario: Zoom in shows detailed squares
- **WHEN** user zooms in to level 10+
- **THEN** system SHALL display fine-grained square grid with individual borders and images

#### Scenario: Squares disappear at low zoom
- **WHEN** user zooms out below level 4
- **THEN** system MAY hide square grid or display minimal overlay to reduce clutter

### Requirement: User Location Display
System SHALL display user's current location on map when location permission granted.

#### Scenario: User location shows on map
- **WHEN** user grants location permission and map loads
- **THEN** system SHALL display user location indicator (blue dot) on map

#### Scenario: Location updates on movement
- **WHEN** user moves while app is in foreground
- **THEN** system SHALL update location indicator every 5-10 seconds (battery-friendly interval)

#### Scenario: No location with permission denied
- **WHEN** user denies location permission
- **THEN** system SHALL display map without location indicator and not request permission again until user changes settings

### Requirement: Square Detail Access via Tap
User SHALL be able to tap on square to view and interact with its content.

#### Scenario: Tapping square opens detail view
- **WHEN** user taps on visible square
- **THEN** system SHALL dismiss map and present square detail view

#### Scenario: Detail view shows current content
- **WHEN** detail view opens for occupied square
- **THEN** system SHALL display: posted image, publication metadata, remaining time until expiration, and interaction options

#### Scenario: Detail view for free square shows posting option
- **WHEN** detail view opens for 'libre' square
- **THEN** system SHALL display "Post Now" button and pricing information

#### Scenario: Back gesture returns to map
- **WHEN** user gestures back or taps close button in detail view
- **THEN** system SHALL dismiss detail view and return to map
