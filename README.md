# Frigate Viewer

Frigate Viewer is an independently maintained, unofficial React Native client
for Frigate NVR. This fork is based on
[sp-engineering/frigate-viewer](https://github.com/sp-engineering/frigate-viewer)
and currently focuses on a secure Android release.

## Features

- Browse camera events, snapshots, clips, and live feeds.
- Configure multiple Frigate servers.
- Use Basic Auth, Frigate authentication, or Android client-certificate
  authentication (mTLS).
- Select an installed client identity through Android's protected system
  certificate chooser.
- Store server credentials through the platform credential-storage layer.
- Use light and dark themes and the included translations.

## Android mTLS

Android mTLS uses `KeyChain.choosePrivateKeyAlias`. The app stores only the
selected alias and asks Android to use the protected private key during TLS
authentication. The private key is not exported to JavaScript or app storage.

Server certificate validation remains strict by default. Trusting a self-signed
server certificate is an explicit, per-server opt-in.

See [Client Certificate Setup](./docs/CLIENT_CERT_SETUP.md) for installation,
configuration, and troubleshooting.

## Releases

Version `14.3.1` is available as an Android pre-release for internal testing.
See the [GitHub releases](https://github.com/trcmd9000/frigate-viewer/releases)
for signed artifacts. Validate mTLS on a physical device before production use.

## Privacy and security

The app does not include analytics, advertising, Firebase, or automatic crash
reporting. It communicates directly with the servers configured by the user.
See the [Privacy Policy](./PRIVACY-POLICY.md) for details.

Never include credentials, access tokens, certificates, private keys, server
addresses, or diagnostic data in a public issue.

## Platform status

- **Android:** Actively maintained by this fork.
- **iOS:** Inherited source is present but is not part of the current release
  validation. Android mTLS support must not be assumed to work on iOS.

## Development

- [Android release process](./docs/ANDROID_RELEASE.md)
- [Changelog](./CHANGELOG.md)

Report reproducible problems through
[GitHub Issues](https://github.com/trcmd9000/frigate-viewer/issues), after
removing all sensitive data.

This project is not affiliated with the official Frigate NVR project.
