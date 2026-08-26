# Agent Guide

This file applies to the entire repository. It records project-specific
decisions that future maintainers and coding agents must preserve.

## Project status

- This repository is an independently maintained fork of
  `sp-engineering/frigate-viewer`.
- Keep `main` based on the exact upstream history. Add fork changes on top;
  never rewrite inherited upstream commits merely to change their metadata.
- The public maintainer identity is
  `trcmd9000 <trcmd9000@users.noreply.github.com>`. Do not introduce real names,
  workplace addresses, private email addresses, or other personal metadata.
- Android is the actively maintained and validated target. Inherited iOS source
  is present, but iOS mTLS and release builds are not currently supported or
  validated.
- Current release version: `14.3.1` with Android `versionCode 21`.

## Public repository rules

Treat every tracked file, commit, tag, issue, build log, and release note as
public.

Never commit:

- Credentials, access tokens, server URLs, IP addresses, or private diagnostic
  data.
- Client certificates, private keys, PKCS#12 files, certificate fingerprints
  tied to a private deployment, or certificate passwords.
- `android/local.properties`, `android/signing.properties`, keystores, JKS
  files, APKs, AABs, environment files, or generated build directories.
- Personal author identities or non-public email addresses.

Do not add example values that resemble real credentials or private
infrastructure. Use clearly synthetic placeholders.

Before publication, inspect staged filenames and content for secrets and
personal metadata. Confirm the commit author, committer, and annotated tagger
all use the public maintainer identity.

## Android client-certificate invariants

Android client authentication must use the platform `KeyChain` APIs:

1. Open `KeyChain.choosePrivateKeyAlias` for user-mediated identity selection.
2. Resolve the granted identity with `KeyChain.getPrivateKey` and
   `KeyChain.getCertificateChain`.
3. Use an alias-specific `X509ExtendedKeyManager` for the native OkHttp client.

Do not:

- Attempt to enumerate arbitrary Android user identities.
- Import or export private keys through JavaScript or application storage.
- Add a certificate-password field. Import passwords are handled by Android
  when the identity is installed.
- Silently retry an mTLS-configured request without its client identity.
- Add a global trust-all manager or hostname verifier.

Normal server certificate and hostname validation must remain enabled by
default. The self-signed server option is an explicit per-server override and
must stay clearly labeled as a security reduction.

The primary implementation surfaces are:

- `android/app/src/main/java/com/trcmd9000/frigateviewer/ClientCertModule.java`
- `helpers/clientCertificates.ts`
- `helpers/httpWithClientCert.ts`
- `views/settings/ServerForm.tsx`

## Data handling and privacy

- The app communicates directly with user-configured servers. Do not add a
  maintainer-operated relay or cloud dependency without an explicit design and
  privacy review.
- Do not add analytics, advertising, automatic diagnostics, Firebase,
  Crashlytics, or another telemetry service by default.
- Problem reporting must remain user-initiated and must not upload
  configuration or logs automatically.
- Credentials use the platform credential-storage layer. Non-secret settings
  may use application storage.
- Keep `PRIVACY-POLICY.md`, `README.md`, and the runtime behavior consistent.
  Do not claim support for features that have not been implemented and
  validated.

## Android identity and release configuration

- Android namespace and application ID:
  `com.trcmd9000.frigateviewer`.
- App name: `Frigate Viewer`.
- Compile and target SDK: API 35.
- Release signing comes from ignored `android/signing.properties` or CI
  `MYAPP_UPLOAD_*` Gradle properties.
- A release build must fail when signing is not configured; never produce a
  success-shaped unsigned release.
- Keep upload keys and passwords outside the repository and back them up
  securely.
- Increment both `versionName` and the monotonically increasing `versionCode`
  for every published Android build.
- The current Play testing artifact is built for `arm64-v8a`. Expanding ABI
  support is a release decision and must be documented and tested.

See `docs/ANDROID_RELEASE.md` for commands and the physical-device release
checklist.

## Dependencies and compatibility

- React Native and its Babel, Metro, ESLint, and TypeScript tooling must remain
  version-aligned.
- `react-native-navigation` requires the checked-in
  `patches/react-native-navigation+7.51.2.patch` for React Native 0.75
  compatibility.
- `npm ci` must successfully apply the patch through `patch-package`.
- Do not edit `node_modules` without updating the reproducible patch.
- Do not run `npm audit fix --force`. It currently proposes breaking React
  Native and navigation upgrades. Review dependency changes deliberately and
  validate native builds.
- Firebase and Crashlytics were intentionally removed. Do not reintroduce them
  incidentally through copied upstream configuration.

## Validation

Use the smallest relevant checks during development, then run the complete
release checks before publishing:

```powershell
npm ci
npm test -- --runInBand --silent --forceExit
npx tsc --noEmit
Set-Location android
.\gradlew.bat assembleDebug
.\gradlew.bat bundleRelease -PreactNativeArchitectures=arm64-v8a
```

Also run targeted ESLint on changed JavaScript and TypeScript files and
`git diff --check`.

For Android release artifacts:

- Verify package ID, version name, version code, minimum SDK, and target SDK.
- Verify APK/AAB signatures and record SHA-256 checksums.
- Never log or display signing passwords.
- Test the system certificate chooser, cancellation, successful mTLS, removed
  identities, strict server TLS, explicit self-signed mode, and ordinary
  non-mTLS servers on a physical Android device.

On Windows, use a short checkout path for native release builds. React Native
native build paths can exceed Windows or Ninja limits. Avoid setting
`JAVA_TOOL_OPTIONS` while AGP 8.6.1 invokes Prefab: its banner on stderr can be
misreported as `[CXX1210] No compatible library found`.

## Change discipline

- Preserve existing behavior unless the requested change intentionally alters
  it.
- Prefer precise, typed changes and existing helpers over duplicate logic.
- Do not add broad exception handling, silent fallbacks, or security-shaped
  no-ops.
- Update tests when behavior changes and update public documentation when a
  documented capability, dependency, privacy behavior, or release procedure
  changes.
- Remove temporary planning, migration, PR-description, and phase-summary
  documents before publication. Keep public documentation concise and current.
- Do not delete or rewrite unrelated user work.

## Commit and release hygiene

- Use focused Conventional Commit titles.
- Keep `main` synchronized with the public repository and verify the fork is
  not behind upstream after history operations.
- Do not move published release tags casually. If a pre-release tag must move,
  update the annotated tag, release metadata, and local reference together,
  then verify the public target.
- Re-run the public-tree secret and identity audit after any history rewrite or
  repository migration.
