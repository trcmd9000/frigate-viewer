# Dependency security

Last reviewed: August 26, 2026

## Current baseline

`npm audit` currently reports 19 dependency findings:

- 0 critical
- 10 high
- 9 moderate

All compatible updates offered by `npm audit fix` have been applied. The
remaining automated fixes require breaking React Native, React Native
Navigation, Metro, or related toolchain upgrades. Do not use
`npm audit fix --force`.

CI blocks newly introduced critical production advisories. Dependabot opens
reviewable dependency pull requests; passing CI is required but does not replace
native device testing.

## Remaining dependency groups

### React Native and Metro

Affected packages include `react-native`, Metro, `image-size`,
`fast-xml-parser`, and React Native CLI packages.

These are primarily build and development tools. The proposed automated fix
upgrades React Native from 0.75 to 0.87 and must be handled as a coordinated
framework migration. React Native core, Babel, Metro, ESLint, TypeScript
configuration, native libraries, and the Android build must remain aligned.

### React Native Navigation and Lodash

React Native Navigation 7 depends on Lodash 4.17.x. The automated fix upgrades
React Native Navigation to 8.x. This requires an API compatibility review and
replacement or removal of the checked-in 7.51.2 compatibility patch.

Lodash is also used transitively by Formik and React Native UI Lib. Do not force
an unsupported override without validating all consumers.

### React Native SVG Charts and d3-color

The chart package uses an older D3 dependency chain containing `d3-color`.
Resolving it safely requires upgrading or replacing the chart stack and testing
chart rendering and interaction. A cross-major D3 override is not considered a
safe patch.

### react-native-asset, xcode, and uuid

This chain is development-only and is used by the asset-copying tool. The
reported `uuid` version currently has no compatible fix through that package.
Do not process untrusted Xcode projects or UUID buffers through this tool.

## Upgrade acceptance criteria

For each dependency pull request:

1. Review release notes and native compatibility requirements.
2. Run Jest, TypeScript, ESLint, and a clean Android debug build.
3. Reapply and verify `patch-package`.
4. Build a signed release AAB for framework or native dependency changes.
5. Test camera events, live playback, downloads, sharing, authentication, and
   Android mTLS on a physical device.
6. Re-run `npm audit` and update this baseline.

Security findings that become remotely exploitable in normal app operation take
priority over routine version updates.
