# Google Play preparation

This document is a preparation checklist, not a record that the app has passed
Google Play review.

## Application identity

- App name: `Frigate Viewer`
- Package ID: `com.trcmd9000.frigateviewer`
- Current version name: `14.3.1`
- Current version code: `21`
- Minimum Android version: API 23
- Target Android version: API 35
- Current testing ABI: `arm64-v8a`
- Suggested category: House & Home
- Ads: No
- In-app purchases: No

Increment `versionCode` for every Play Console upload, including replaced
internal-test builds.

## Store listing draft

### App title

Frigate Viewer

### Short description

Securely view Frigate cameras, events, clips, and live feeds on Android.

### Full description

Frigate Viewer is an unofficial Android client for user-operated Frigate NVR
servers.

Browse camera events, snapshots, and clips, monitor live feeds, and configure
multiple Frigate servers from one app. The app supports standard Frigate
authentication methods and Android client-certificate authentication for
servers protected by mutual TLS.

Connections are made directly from the Android device to servers configured by
the user. The app does not include advertising, analytics, Firebase, or
automatic crash reporting.

Frigate Viewer is independently maintained and is not affiliated with the
official Frigate NVR project.

## Privacy policy

Current public URL:

`https://github.com/trcmd9000/frigate-viewer/blob/main/PRIVACY-POLICY.md`

Recommended GitHub Pages URL after publication:

`https://trcmd9000.github.io/frigate-viewer/privacy/`

The page must remain reachable without authentication. Keep the policy text in
the repository as the source of truth.

Public support email:

`trcmd9000@gmail.com`

## Data Safety draft

Validate these answers against the exact uploaded build and current Play
definitions:

- Data collected by the developer: No.
- Data shared with third parties by the developer: No.
- Advertising or analytics SDKs: None.
- Developer-operated accounts: None.
- Account deletion requirement: Not applicable.
- User-requested sharing: Snapshots or clips may be handed to an app selected by
  the user through Android's share interface.
- Local processing: Server settings, credentials, client-certificate alias,
  camera metadata, events, snapshots, clips, and preferences.
- Network destinations: Only user-configured servers and links explicitly
  opened by the user.

The app supports both HTTP and HTTPS for compatibility with private networks.
Do not claim that every possible connection is encrypted in transit. Recommend
HTTPS or a trusted VPN in the store listing and support material.

## Permissions and app access

The release manifest requests only `android.permission.INTERNET`.

The app requires a user-operated Frigate server. For Play review, provide a
temporary reviewer-accessible test server and credentials in the private App
Access instructions. Never place review credentials in this repository, store
listing, screenshots, or public release notes.

If the reviewer environment cannot support mTLS, provide a normal test account
that exercises the main app flow and describe mTLS as an optional feature.

## Content and audience

- The app is a private camera/NVR utility, not a social network.
- It does not provide public user-generated content.
- Camera images may contain people or private property, depending on the user's
  own installation.
- The app is not designed for children. Select an adult/general audience
  consistent with the completed Play questionnaire.
- Complete the content-rating questionnaire using the actual reviewer test
  content.

## Required assets

- High-resolution app icon derived from the committed launcher artwork.
- Feature graphic without private camera images or third-party trademarks.
- Phone screenshots from a sanitized test server.
- Optional tablet screenshots only after tablet behavior is tested.

Screenshots must not expose server names, addresses, credentials, certificate
names, camera locations, faces, license plates, or private property unless the
content is synthetic and intentionally publishable.

## Internal testing checklist

1. Back up the upload key and credentials outside the repository.
2. Increment `versionCode` if an AAB with code 21 has already been uploaded.
3. Build and verify the signed AAB as described in `ANDROID_RELEASE.md`.
4. Upload to an internal testing track.
5. Add only intended tester accounts or groups.
6. Install through Google Play on a physical arm64 device.
7. Test normal authentication and Android mTLS.
8. Test cancellation, certificate removal, strict TLS, self-signed opt-in,
   playback, downloads, sharing, and app upgrades.
9. Review Android vitals, pre-launch reports, and policy warnings.
10. Promote only after the physical-device checklist passes.

## Maintainer actions still required

- Provide private Play reviewer credentials for a sanitized test server.
- Capture sanitized screenshots and create the feature graphic.
- Complete Data Safety, content rating, target audience, app access, and policy
  declarations in Play Console.
- Decide whether a future build should add `armeabi-v7a`.
