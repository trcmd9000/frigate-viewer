# Changelog

All notable changes to this project will be documented in this file.

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
