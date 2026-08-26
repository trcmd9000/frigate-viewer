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

## Validation and artifacts

From the repository root:

```powershell
npm ci
npm test -- --runInBand
npx tsc --noEmit
Set-Location android
.\gradlew.bat assembleDebug
.\gradlew.bat bundleRelease
```

Generated artifacts:

- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Play Store bundle: `android/app/build/outputs/bundle/release/app-release.aab`

Install and exercise the debug APK on a physical Android device before
publishing. In particular, verify the Android system certificate chooser, a
successful mTLS request, cancellation, certificate removal, strict server TLS,
and the explicit self-signed-server option.
