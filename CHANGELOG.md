# Changelog

All notable changes to this project will be documented in this file.

## [18.0.12] - 2026-09-18

- Kept Android status-bar surfaces and icon contrast synchronized with light,
  dark, and media themes under enforced edge-to-edge rendering.
- Applied native system-bar styling after React Native Navigation updates to
  prevent API 37 from restoring unreadable status-bar icons.

## [18.0.11] - 2026-09-18

- Corrected Pixel portrait system-bar and safe-area handling for playback and
  app screens.

## [18.0.10] - 2026-09-18

- Reworked Problem Reporting as a manual, privacy-safe GitHub Issue draft
  without automatic diagnostics, credentials, server URLs, or logs.
- Kept the Android status bar visible and respected in portrait media playback
  while preserving immersive camera and event playback in landscape.

## [18.0.9] - 2026-09-17

- Simplified the app shell to keep Cameras and Events as the permanent
  destinations.
- Moved Settings and secondary destinations into a shared More-menu stack with
  reliable Back navigation.
- Added consistent horizontal/fade transitions and theme-stable system-bar
  behavior for secondary screens.

## [18.0.8] - 2026-09-15

- Standardized the app's visible name as Frigate Viewer.
- Clarified the app's independent relationship to the Frigate project across
  the app, store listing, and documentation.
- Stopped presenting Frigate detection FPS as the selected live stream's FPS.

## [18.0.7] - 2026-09-15

- Fixed Android event playback for generated Frigate clips by using the
  documented event MP4 endpoint when `has_clip` is true.
- Retained the documented event-scoped HLS VOD route for events without a
  generated clip.

## [18.0.6] - 2026-09-15

- Added tactile feedback and animated action overlays for event playback
  controls, including aggregated forward and reverse seek feedback.
- Added a searchable offline JavaScript license catalog and Android OSS license
  entry point.
- Modernized the About screen with the current app version, project links,
  release notes, privacy, and license information.

## [18.0.5] - 2026-09-13

- Polished camera and event grids with adaptive columns, consistent gutters,
  compact metadata, and smaller semantic media radii.
- Simplified settings grouping and navigation typography while preserving
  existing server-profile actions.
- Improved event-player controls with safe insets, an explicit close action,
  responsive seeking, and screen-reader support.

## [18.0.4] - 2026-09-13

- Switched Android event playback to Frigate's documented event HLS VOD route.
- Made the Android status bar transparent while preserving theme-aware icon
  contrast.
- Removed only the outer horizontal gutters from camera and event previews
  while preserving card spacing, vertical spacing, and internal content.

## [18.0.3] - 2026-09-13

- Fixed Android event playback on Frigate servers where timestamp-based VOD is
  unavailable by using the existing protected event clip endpoint when a clip
  has been generated.
- Simplified event playback messages to refer to media rather than protected
  media.

## [18.0.2] - 2026-09-13

- Fixed an Android release startup crash where resource shrinking removed the
  dynamically resolved React Native Navigation tab icons.

## [18.0.1] - 2026-09-12

- Fixed an Android release startup crash where R8 removed React Native inspector
  JNI classes required by the native runtime.

## [18.0.0] - 2026-09-12

- Added per-camera, per-server-profile live stream selection with an `Auto`
  default that prefers a verified H.265 MSE stream and otherwise selects a
  compatible H.264, VP8, or VP9 WebRTC stream.
- Added a guarded native H.265 MSE path for Android. Decoder capability,
  stream metadata, the protected fMP4 contract, and the first decoded frame
  must all succeed; a failure falls back to a compatible stream or snapshots.
- Consolidated camera title, transport status, and audio controls into one
  bounded live-preview overlay and removed the duplicate native `LIVE` badge.
- Added a compact, theme-aware stream selector behind a player gear control and
  replaced the ambiguous audio glyph with conventional speaker icons.
- Hid Android system bars for live and event playback modals while preserving
  Android predictive-back behavior.
- Reduced repeated live-start preparation by reusing validated stream metadata
  briefly within the active server profile.
- Switched event clip playback to protected Frigate VOD HLS through the
  Media3/react-native-video transport extension.
- Added Android Frigate/go2rtc WebRTC live preview with native protected
  WebSocket signaling, muted startup, bounded reconnects, and authenticated
  snapshot fallback.
- Raised the minimum Android version to API 24 for the current WebRTC runtime.

## [14.3.1] - 2026-08-26

### Added

- Android client-certificate authentication through the protected system
  certificate chooser and Android KeyChain.
- Per-server client identity selection and explicit self-signed server mode.
- Certificate metadata and availability checks.
- Independent Android application ID `com.trcmd9000.frigateviewer`.
- Android adaptive launcher icons and release documentation.
- Local and CI release-signing configuration without tracked secrets.

### Changed

- Continued upstream versioning at `14.3.1` with Android `versionCode 21`.
- Updated the Android build to compile and target API 35.
- Aligned React Native build and test tooling with React Native 0.75.2.
- Updated React Native Navigation and added a reproducible compatibility patch.
- Replaced the obsolete certificate password UI with Android's system-managed
  identity access.
- Changed problem reporting to open a GitHub issue.

### Security

- Removed the global TLS and hostname-verification bypass.
- Kept native mTLS server certificate validation strict by default.
- Documented the unresolved Android cleartext compatibility exception; HTTP
  remains available only when explicitly configured by the user.
- Removed silent fallback to unauthenticated HTTP after an mTLS failure.
- Removed Firebase and Crashlytics dependencies and automatic telemetry.
- Sanitized development logging and retained production error visibility.
- Removed the tracked Android debug private key.

### Validation

- 141 Jest tests pass.
- TypeScript validation passes.
- Targeted ESLint validation has no errors.
- Debug APK and signed arm64-v8a release AAB build successfully.

### Platform status

- Android is the validated release target.
- iOS mTLS is not part of this release and must not be considered supported.
- The release remains a pre-release until physical-device mTLS testing is
  complete.
