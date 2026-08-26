# Frigate Viewer

This repository is an independently maintained fork of
[sp-engineering/frigate-viewer](https://github.com/sp-engineering/frigate-viewer).

A lightweight, unofficial mobile client for Frigate NVR, built with React Native. This app allows you to easily browse camera events and monitor your Frigate instance on the go.

## Features

- 📱 Browse camera events and live feeds
- 🔐 Support for multiple authentication methods (Basic Auth, Frigate Auth, mTLS)
- 🔒 **Client Certificate Authentication (mTLS)** - for secure mutual TLS authentication
- 🌍 Multi-language support
- 🎨 Light/Dark mode
- 📸 Event snapshots and clips
- ⚙️ Configurable settings per server

## Client Certificate Authentication (mTLS)

If your Frigate server requires client certificate authentication, this app has built-in support for it:

- **Android:** Automatically uses certificates from your device's Keystore
- **iOS:** Automatically uses certificates from your device's Keychain
- **Per-server configuration:** Each server can use a different certificate
- **Seamless integration:** Certificate selection happens in the server settings

For detailed setup instructions, see [Client Certificate Setup Guide](./docs/CLIENT_CERT_SETUP.md).

## Support & Contact

If you encounter any issues or have questions regarding the app:

- **Issues:** Please open a [GitHub Issue](https://github.com/trcmd9000/frigate-viewer/issues) with a description of the problem.

## Platforms

- **Android:** Fully supported
- **iOS:**
  - No RTSP support yet

---

_Disclaimer: This is an unofficial application and is not affiliated with the official Frigate NVR project._
