# Android Client Certificate Authentication

This guide covers the Android mTLS implementation included in Frigate Viewer
`14.3.1`. iOS mTLS is not part of the validated release.

## How it works

Android applications cannot enumerate or export arbitrary user client
identities. Frigate Viewer therefore opens Android's protected system
certificate chooser. After the user grants access, Android supplies the
selected private key and certificate chain to the native TLS client.

The app stores the selected certificate alias in the server configuration. It
does not store the certificate import password and does not export the private
key to JavaScript or app storage.

## Prerequisites

- An Android device running API 23 or newer.
- A client identity containing both the certificate and private key, normally
  distributed as a password-protected PKCS#12 (`.p12` or `.pfx`) file.
- A Frigate endpoint or reverse proxy configured to request and validate that
  client certificate.

## Install the identity in Android

Menu names vary by Android version and manufacturer:

1. Transfer the PKCS#12 file to the device through a trusted method.
2. Open Android **Settings** and locate the credential or certificate
   installation screen.
3. Choose the option for a VPN and app certificate.
4. Select the PKCS#12 file and enter its import password.
5. Confirm the installation and assign a recognizable name.
6. Securely delete the transferred PKCS#12 file when it is no longer needed.

The password is used by Android during import. Frigate Viewer does not request
or retain it.

## Configure Frigate Viewer

1. Add or edit a server.
2. Use `https` and enter the server connection details.
3. In **Client Certificate (mTLS)**, choose **Select certificate**.
4. Select the installed identity in Android's system dialog.
5. Save the server.

Cancelling the system dialog leaves the existing selection unchanged. Use the
remove action in the server form to stop using the selected identity.

Each configured server can use a different Android identity.

## Server certificate validation

Client authentication and server authentication are independent:

- The client certificate proves the app's identity to the server.
- The server certificate proves the server's identity to the app.

Server certificate and hostname validation remains enabled by default. Prefer a
certificate trusted by Android. The **Allow self-signed server certificate**
option disables those server checks for the selected server and should be used
only when the risk is understood and the network is otherwise trusted.

## Troubleshooting

### The expected identity is not shown

- Confirm that the PKCS#12 file contained a private key, not only a certificate.
- Reinstall it as a VPN and app credential.
- Check whether a device policy restricts certificate use.
- The app cannot bypass or replace Android's system chooser.

### Android reports that the certificate is unavailable

The identity may have been removed, replaced, or denied. Remove the saved
selection in Frigate Viewer and select the identity again.

### The TLS connection fails

- Confirm that the server requests a client certificate from the correct CA.
- Check certificate validity, key usage, chain, and expiration.
- Confirm that the hostname matches the server certificate.
- Inspect Frigate or reverse-proxy logs for the TLS rejection reason.
- Test the same identity from a controlled client before changing app settings.

Configured mTLS failures are returned as errors. The app does not silently retry
the request without a client certificate.

## Rotation and removal

To rotate an identity, install the replacement in Android, select it in each
affected server configuration, test access, and then remove the old identity
through Android settings.

Removing a server from the app does not remove its certificate from Android
KeyChain.

## Security guidance

- Never commit or publish PKCS#12 files, private keys, passwords, server
  addresses, or certificate fingerprints tied to a private deployment.
- Use a separate client identity per person or device when possible.
- Set a reasonable certificate lifetime and maintain a revocation process.
- Protect the Android device with a secure lock screen.
- Prefer normal trusted server certificates over the self-signed override.
- Review server access logs and revoke lost-device identities promptly.

For support, open a
[GitHub issue](https://github.com/trcmd9000/frigate-viewer/issues) containing
only sanitized reproduction steps, Android/app versions, and non-sensitive
error text.
