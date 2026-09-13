# Android R8 hardening batch

This document records the deliberately small `experiment-r8-hardening` batch.
The release-only switch is in `android/app/build.gradle`; debug builds are not
changed. The batch is independently reversible by reverting that switch,
`shrinkResources`, and this document.

## Release configuration

`release` now has both:

```groovy
minifyEnabled true
shrinkResources true
```

The existing `proguard-android.txt` and `proguard-rules.pro` inputs remain in
use. No signing configuration, manifest setting, ABI, or debug setting was
changed.

## Rule audit

The only project-specific rules are four narrow VLC class-name keeps and two
VLC JNI callback-member keeps. No project-wide keep or `-dontwarn` rule was
added. The application uses the dependency-provided consumer rules wherever
they are published:

- React Native `ReactAndroid/proguard-rules.pro` retains `NativeModule`
  implementations and their methods (including `@ReactMethod`), annotated
  `@ReactProp` members, bridge/TurboModule internals, and JNI native methods.
- `react-native-webrtc` publishes `consumer-rules.pro` for `org.webrtc.**`.
- Reanimated and SVG publish their own consumer rules.

The app's `ClientCertModule` is a `NativeModule`, and `ClientCertPackage` is
added by a direct call from `MainApplication`; the generated `PackageList`
also directly constructs the autolinked packages. Consequently these paths do
not need duplicate application keep rules. KeyChain and OkHttp calls are
ordinary statically linked Java calls.

The new Swift client-certificate bridge is iOS-only and is not part of the
Android DEX/R8 input. The Android bridge is the `ClientCertModule` path above;
its `@ReactMethod` methods are covered by React Native's published consumer
rules.

The protected Media3 plugin is directly instantiated in `MainApplication` and
registered with `ReactNativeVideoManager`; its interface callbacks are reached
through that registration. The VLC view manager and WebRTC package are direct
entries in `PackageList`. WebRTC's `System.loadLibrary` path is covered by its
published `org.webrtc.**` consumer rule. The VLC AAR exports JNI symbols for
`LibVLC`, `Media`, and `MediaPlayer`, and its `VLCObject` bytecode contains
private `dispatchEventFromNative` and `dispatchEventFromWeakNative` callbacks
with no consumer rule. The React Native VLC wrapper also does not publish its
local `proguard-rules.pro` as consumer rules. The targeted rules preserve only
those class names and callback signatures; they do not keep the rest of the
VLC package. No other project-owned reflection or JNI lookup was found.

`newArchEnabled=false` remains unchanged. There are no app TurboModule/codegen
classes active in this build; React Native and Reanimated retain the relevant
framework internals through their own consumer rules. Enabling the New
Architecture later requires a fresh R8 warning and runtime audit rather than a
pre-emptive package-wide keep.

Rules were intentionally not added for `com.trcmd9000.frigateviewer.**`, whole
third-party packages, or the full Media3, OkHttp, VLC, KeyChain, or navigation
surfaces. Such rules would hide shrinker regressions and are not justified by
the current static registration paths.

React Native packages JavaScript image imports as generated Android drawable
resources. React Native Navigation resolves the three bottom-tab icons by
their generated resource names, so Android's static resource analysis cannot
observe the runtime references. `res/raw/keep.xml` narrowly retains those
three drawables while resource shrinking remains enabled. The release APK
check verifies that each retained icon is present in the packaged artifact.

## Validation status

The first release R8 attempt was:

```text
android\gradlew.bat :app:minifyReleaseWithR8 --no-daemon --stacktrace
```

It did not reach R8. Compilation stopped at
`:react-native-navigation:compileReactNative71ReleaseKotlin` with the already
known React Native 0.75/navigation incompatibility:

- `ReactViewGroup.kt`: unresolved `ReactViewBackgroundDrawable.fullBorderRadius`
- `LayoutDirectionApplier.kt`: Kotlin smart-cast failure for
  `currentReactContext`
- `ModalContentLayout.kt`: nullable `MotionEvent`/`EventDispatcher` type
  mismatches

The checked-in `patches/react-native-navigation+7.51.2.patch` contains the
corresponding compatibility edits, but the current `node_modules` checkout is
unpatched (`git apply --check` passes without modifying it). This batch does
not edit `node_modules` or the patch and therefore leaves that exact gate open.
No mapping, seeds, usage report, minified APK, or class-presence result is
claimed until the dependency patch is applied by the normal reproducible
install.

An `:app:assembleRelease` attempt with the existing local signing
configuration reached the same navigation Kotlin compile gate. The focused
Gradle property check succeeded, and the existing Jest suite passed (63
suites, 475 tests); neither result can substitute for the blocked R8/APK
validation.

## Required follow-up gate

After a clean `npm ci` applies the checked-in navigation patch, rerun:

```powershell
Set-Location android
.\gradlew.bat :app:assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
```

Archive and inspect the generated mapping, seeds, and usage reports only as
build output. Compare the release APK size with the pre-hardening artifact and
confirm that the APK still contains the `ClientCertModule` bridge,
`ProtectedMediaPlugin`/Media3 integration, WebRTC native libraries, and the
VLC view path. Do not commit those generated artifacts.

Physical regression coverage must include navigation stacks/modals, Android
KeyChain selection/cancellation and mTLS requests, ordinary TLS and explicit
self-signed mode, protected HLS/MP4 and local RTSP playback, VLC playback,
WebRTC calls, resource loading, and a debug build check confirming unchanged
behavior. New Architecture/TurboModule behavior remains out of scope while
the project flag is disabled.
