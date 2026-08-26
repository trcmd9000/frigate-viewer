# Android release

## Versioning

This fork continues the upstream Android version sequence. Every published build
must increment both values in `android/app/build.gradle`:

- `versionName`: user-visible semantic version, currently `14.3.1`
- `versionCode`: monotonically increasing Play Store build number, currently `21`

## Local prerequisites

- JDK 17
- Android SDK Platform 35
- Android Build Tools 35.0.0
- Node.js 18 or newer

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
npm test -- --runInBand
npx tsc --noEmit
Set-Location android
.\gradlew.bat assembleDebug
.\gradlew.bat bundleRelease -PreactNativeArchitectures=arm64-v8a
```

Generated artifacts:

- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Play Store bundle: `android/app/build/outputs/bundle/release/app-release.aab`

Verify the AAB with `jarsigner -verify` and record its SHA-256 checksum before
uploading it. Do not commit APKs, AABs, signing properties, keystores, or
credentials.

Install and exercise the debug APK on a physical Android device before
publishing. In particular, verify the Android system certificate chooser, a
successful mTLS request, cancellation, certificate removal, strict server TLS,
and the explicit self-signed-server option.

Review `PRIVACY-POLICY.md` before each public release and ensure its statements
still match the shipped dependencies and runtime behavior.
