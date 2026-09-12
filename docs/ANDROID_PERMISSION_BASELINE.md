# Android permission baseline

Reviewed: 2026-09-08

This records the release-manifest check for `react-native-blob-util` 0.19.11
and `react-native-keychain` 10.0.0. The generated manifests are build
intermediates and are intentionally not committed.

## Reproduce the check

From the repository root, with the locked JavaScript dependencies installed:

```powershell
Set-Location android
.\gradlew.bat :app:processReleaseMainManifest --no-daemon --console=plain
$manifest = "app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml"
Select-String -Path $manifest -Pattern '<uses-permission' |
  ForEach-Object { $_.Line.Trim() }
```

The same command is used before and after a manifest change. For a clean
comparison, remove `android/app/build` first; Gradle regenerates the release
merge output.

## Findings

Before the removal rules, the release merged manifest contained:

```text
android.permission.INTERNET
android.permission.USE_BIOMETRIC
android.permission.USE_FINGERPRINT
android.permission.WAKE_LOCK
android.permission.ACCESS_NETWORK_STATE
android.permission.ACCESS_WIFI_STATE
android.permission.WRITE_EXTERNAL_STORAGE
android.permission.READ_EXTERNAL_STORAGE
android.permission.DOWNLOAD_WITHOUT_NOTIFICATION
com.trcmd9000.frigateviewer.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
```

Before these rules, the app source manifest declared only `INTERNET`. The two
external-storage permissions came from
`react-native-blob-util/android/src/main/AndroidManifest.xml`.
The app's Android download branch uses its native profile-aware HTTP path; the
Blob Util file-cache fallback is not selected on Android. The app therefore
adds manifest-merger removal rules for only `READ_EXTERNAL_STORAGE` and
`WRITE_EXTERNAL_STORAGE`.

The other Blob Util permissions remain deliberately unchanged:

- `WAKE_LOCK`: declared by the dependency for download lifecycle handling.
- `ACCESS_NETWORK_STATE` and `ACCESS_WIFI_STATE`: declared for network-state
  checks used by Blob Util options.
- `DOWNLOAD_WITHOUT_NOTIFICATION`: declared for the dependency's download
  manager integration.

These permissions were not removed speculatively because this task does not
establish that every supported Blob Util path and option is unused.

`USE_BIOMETRIC` and `USE_FINGERPRINT` came from
`react-native-keychain/android/src/main/AndroidManifest.xml`. The dependency
contains active biometric capability checks and biometric-prompt code. This
app currently calls generic Keychain/Android Keystore operations with
`WHEN_UNLOCKED` and AES storage, and no app code calls a biometric API or
passes a biometric access-control option. That is not sufficient to prove that
removing the permissions is compatible with all `react-native-keychain`
initialization and version behavior, so biometric permission removal is
deferred to a separate, device-tested change.

## Expected after-state

After this change, the release merged manifest must contain all baseline
permissions except:

```text
android.permission.WRITE_EXTERNAL_STORAGE
android.permission.READ_EXTERNAL_STORAGE
```

The removal rules are in
`android/app/src/main/AndroidManifest.xml` and use
`tools:node="remove"` so the result remains reproducible when the dependency
manifest is merged again.

The clean release-merge run on 2026-09-08 produced this observed after-state:

```text
android.permission.INTERNET
android.permission.USE_BIOMETRIC
android.permission.USE_FINGERPRINT
android.permission.WAKE_LOCK
android.permission.ACCESS_NETWORK_STATE
android.permission.ACCESS_WIFI_STATE
android.permission.DOWNLOAD_WITHOUT_NOTIFICATION
com.trcmd9000.frigateviewer.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
```

The release manifest merger report also records both external-storage nodes as
`REJECTED` from `react-native-blob-util`, confirming that the rules were applied
to the dependency contribution rather than merely omitting an app declaration.

`assembleRelease` was attempted for APK inspection. The normal checkout path
hit the documented Windows CMake path-length limit; a short junction checkout
then reached `:react-native-navigation:compileReactNative71ReleaseKotlin` but
failed on existing dependency compilation errors (`fullBorderRadius` and
`ModalContentLayout.kt`). No APK was produced, so `aapt`/`apkanalyzer` could
not be run against a finished artifact. The merged release manifest and its
merger report are the applicable artifact checks for this change.
