# Android release

## Versioning

This fork continues the upstream Android version sequence. Every published build
must increment both values in `android/app/build.gradle`:

- `versionName`: user-visible semantic version, next release candidate
  `18.0.11`
- `versionCode`: monotonically increasing Play Store build number, next
  release candidate `36`

## Local prerequisites

- JDK 17
- Android SDK Platform 36
- Android Build Tools 36.0.0
- Android Gradle Plugin 9.3.2 through the Gradle 9.5 wrapper
- Node.js 18 or newer
- An `arm64-v8a` Android device. Published Android artifacts currently target
  only this ABI.

Set `JAVA_HOME` and `ANDROID_HOME`, then install JavaScript dependencies with
`npm ci`.

On Windows, use a short checkout path for native release builds. Long paths in
React Native dependencies can exceed Windows and Ninja path limits.

## Signing

Release keys and passwords must never be committed. Create
`android/signing.properties` locally:

```properties
storeFile=C:\\path\\to\\frigate-viewer-upload.jks
storePassword=...
keyAlias=frigate-viewer-upload
keyPassword=...
```

CI can provide the equivalent `MYAPP_UPLOAD_*` Gradle properties instead.
Back up the upload key and its credentials in a secure, independent location.
The build fails rather than producing an unsigned release when signing is not
configured.

## Validation and artifacts

From the repository root:

```powershell
npm ci
npm run licenses:check
npm test -- --runInBand
npx tsc --noEmit
Set-Location android
.\gradlew.bat assembleDebug
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:analyzeReleaseR8Config
.\gradlew.bat :app:lintVitalRelease
.\gradlew.bat assembleRelease
.\gradlew.bat bundleRelease
```

The Android source compile, debug APK packaging, debug unit tests, release R8
configuration analysis, and release-critical lint were validated with this
toolchain. A signed release APK/AAB and physical-device checks remain required
before any Play upload.

React Native 0.75 currently requires `android.newDsl=false` and
`android.builtInKotlin=false` in `android/gradle.properties` for AGP 9
compatibility. These are temporary modes and must be removed only after the
affected dependencies are upgraded and revalidated.

Generated artifacts:

- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Sideloadable release APK:
  `android/app/build/outputs/apk/release/app-release.apk`
- Play Store bundle: `android/app/build/outputs/bundle/release/app-release.aab`

Verify the APK with Android's `apksigner`, verify the AAB with `jarsigner`, and
record both SHA-256 checksums before uploading them as GitHub release assets.
Do not commit APKs, AABs, signing properties, keystores, or credentials.

Install and exercise the debug APK on a physical Android device before
publishing. In particular, verify the Android system certificate chooser, a
successful mTLS request, cancellation, certificate removal, strict server TLS,
and the explicit self-signed-server option.

Review `PRIVACY-POLICY.md` before each public release and ensure its statements
still match the shipped dependencies and runtime behavior.

The app bundles offline notices for JavaScript and native Android
dependencies. `npm run licenses:generate` regenerates the tracked JavaScript
catalog from production dependencies and fails when required license text is
missing. CI runs `npm run licenses:check` to prevent stale notices. The Android
release build uses Google's OSS Licenses plugin to generate the native library
catalog.

## Pending network policy decision

`AndroidManifest.xml` currently permits cleartext traffic because the product
still exposes explicitly configured HTTP servers. This means the release does
not have a strict global cleartext default. Before production approval, decide
whether to retain that compatibility exception with its risk accepted, or
remove HTTP support and set both the manifest and network-security cleartext
policy to deny it. Normal HTTPS uses the Android system trust store; user-added
CA certificates are not globally trusted by this configuration, and the
per-server self-signed option remains a separate native mTLS override.
