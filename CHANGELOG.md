# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

No unreleased changes.

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
- Kept normal server certificate validation strict by default.
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
