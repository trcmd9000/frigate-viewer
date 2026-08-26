---
layout: default
title: Privacy Policy
permalink: /privacy/
---

# Privacy Policy

Effective date: August 26, 2026

## Scope

This policy applies to the independently maintained Frigate Viewer application
with Android package ID `com.trcmd9000.frigateviewer`.

Frigate Viewer is a client for servers selected and operated by the user. The
maintainer does not operate a relay, cloud backend, analytics service, or user
account service for the app.

## Data processed by the app

To provide its functionality, the app processes data supplied by the user or by
the configured Frigate server, including:

- Server addresses, ports, paths, and connection preferences.
- Authentication credentials and session information.
- The alias and public metadata of a client certificate selected through the
  Android system certificate chooser.
- Camera names, events, snapshots, clips, and live video returned by the
  configured server.
- App preferences such as theme, language, and per-server settings.

Server credentials are stored through the platform credential-storage layer.
Non-secret configuration is stored in the app's local storage. Android client
certificate private keys remain under Android KeyChain control; the app stores
the selected alias and does not export the private key.

## Network communication

The app communicates directly from the device to the server addresses
configured by the user. The maintainer does not receive or proxy this traffic.
Users are responsible for the privacy policy, security, and retention practices
of their own servers.

The app does not include advertising, analytics, Firebase, Crashlytics, or
automatic diagnostic uploads.

## Files and sharing

Snapshots and clips may be cached, downloaded, or passed to Android's sharing
interface when the user requests those actions. Files shared with another app
are then subject to that app's privacy practices.

## Support and external services

The "Report a Problem" action opens GitHub rather than uploading diagnostics.
Submitting an issue is optional and is governed by GitHub's privacy policy.
Public issues must not contain credentials, tokens, certificates, private keys,
private server addresses, camera images, or other sensitive information.

Links opened from the app or documentation are governed by the destination
website's privacy policy.

## Retention and deletion

The maintainer does not receive app data and therefore does not retain it.
Locally stored app data can be removed by deleting configured servers, clearing
the app's storage, or uninstalling the app. Certificates installed in Android
KeyChain must be managed separately through Android settings.

## Security

Use HTTPS with a certificate trusted by Android whenever possible. Support for
self-signed server certificates is disabled by default and must be enabled
explicitly for each server. Enabling that option weakens server authentication.

No software or transmission method can guarantee absolute security. Users are
responsible for securing their device, network, Frigate server, certificates,
and credentials.

## Children's privacy

The app is not directed to children and the maintainer does not knowingly
collect personal information from children.

## Changes and contact

Material changes will be published in this repository with a revised effective
date. Privacy questions can be sent to
[trcmd9000@gmail.com](mailto:trcmd9000@gmail.com). General project questions
can also be raised through
[GitHub Issues](https://github.com/trcmd9000/frigate-viewer/issues). Do not
include credentials, private server information, or other sensitive data in
email or public issues.
