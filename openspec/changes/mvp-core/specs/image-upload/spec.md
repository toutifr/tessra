## ADDED Requirements

### Requirement: Camera or Gallery Source Selection
User SHALL be able to select image source from either device camera or photo gallery.

#### Scenario: Post initiation displays source options
- **WHEN** user taps "Post Free" or "Post Paid" on square
- **THEN** system SHALL present modal with two options: "Take Photo" and "Choose from Gallery"

#### Scenario: Camera selection opens camera
- **WHEN** user taps "Take Photo" option
- **THEN** system SHALL launch device camera in capture mode

#### Scenario: Gallery selection opens photo picker
- **WHEN** user taps "Choose from Gallery" option
- **THEN** system SHALL launch device photo picker showing available images

#### Scenario: User can cancel source selection
- **WHEN** source selection modal is open
- **THEN** system SHALL provide cancel option to dismiss without selection

### Requirement: Image Size Validation
System SHALL enforce 5MB maximum file size for image uploads.

#### Scenario: Valid size image accepted
- **WHEN** user selects image under 5MB
- **THEN** system SHALL proceed to preview step without error

#### Scenario: Oversized image rejected
- **WHEN** user selects image over 5MB
- **THEN** system SHALL display error: "Image too large (max 5MB)" and allow retry

#### Scenario: Size check happens before upload
- **WHEN** image is selected
- **THEN** system SHALL validate size locally before any server transmission

### Requirement: Image Format Validation
System SHALL accept only JPG and PNG image formats.

#### Scenario: JPG image accepted
- **WHEN** user selects valid .jpg or .jpeg file
- **THEN** system SHALL proceed without format error

#### Scenario: PNG image accepted
- **WHEN** user selects valid .png file
- **THEN** system SHALL proceed without format error

#### Scenario: Unsupported format rejected
- **WHEN** user selects image with unsupported format (.gif, .webp, .bmp, etc.)
- **THEN** system SHALL display error: "Unsupported format. Use JPG or PNG" and allow retry

#### Scenario: Format validation before upload
- **WHEN** image is selected
- **THEN** system SHALL check format extension or MIME type locally

### Requirement: Supabase Storage Upload
System SHALL upload validated image to Supabase Storage bucket.

#### Scenario: Successful upload to bucket
- **WHEN** user confirms image in preview step
- **THEN** system SHALL upload image to Supabase Storage under path: `/publications/{square_id}/{timestamp}.{extension}`

#### Scenario: Upload progress indication
- **WHEN** image upload is in progress
- **THEN** system SHALL display progress indicator (percentage or spinner) during transmission

#### Scenario: Upload error handling
- **WHEN** upload fails (network error, storage quota, etc.)
- **THEN** system SHALL display error message and allow user to retry

#### Scenario: Storage URL generation
- **WHEN** upload completes successfully
- **THEN** system SHALL generate permanent public URL for the uploaded image file

### Requirement: Client-Side Image Compression
System SHALL compress image on client device before upload to optimize file size and delivery.

#### Scenario: Image compressed before upload
- **WHEN** validated image is selected
- **THEN** system SHALL compress image to maximum 80% JPEG quality or equivalent PNG optimization

#### Scenario: Compression reduces file size
- **WHEN** compression is applied to high-resolution image
- **THEN** system SHALL reduce file size by minimum 30% without visible quality degradation

#### Scenario: Compression happens transparently
- **WHEN** user confirms image selection
- **THEN** system SHALL compress image before upload without requiring user interaction

#### Scenario: Compressed image uploaded
- **WHEN** upload begins after compression
- **THEN** system SHALL transmit compressed version, not original

### Requirement: Image Preview Before Confirmation
User SHALL see preview of selected image before confirming publication.

#### Scenario: Preview displays after selection
- **WHEN** user selects image from camera or gallery
- **THEN** system SHALL display full-screen image preview

#### Scenario: Preview shows actual image content
- **WHEN** preview screen displays
- **THEN** system SHALL render the exact image that will be posted at reasonable viewport size

#### Scenario: User can confirm or retake
- **WHEN** image preview is displayed
- **THEN** system SHALL present two buttons: "Confirm" and "Retake"

#### Scenario: Retake returns to source selection
- **WHEN** user taps "Retake" on preview
- **THEN** system SHALL return to camera/gallery selection screen

#### Scenario: Preview includes metadata
- **WHEN** preview displays
- **THEN** system MAY show: file size, format, and dimensions as informational metadata

#### Scenario: Confirm initiates compression and upload
- **WHEN** user taps "Confirm" on preview
- **THEN** system SHALL proceed with compression, upload to Supabase, and publication creation
