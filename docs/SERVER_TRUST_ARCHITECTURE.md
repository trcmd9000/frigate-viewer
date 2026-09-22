# Server trust architecture

## Security model

- Remote server profiles are HTTPS-only. Legacy remote HTTP profiles remain
  editable but remote HTTP requests fail closed.
- Local HTTP is not used for authenticated API requests. Local RTSP remains
  available only through `LocalRouteResolver`; both resolved addresses and the
  connected peer must be loopback or private-network addresses. Android
  cleartext traffic is denied globally.
- System certificate and hostname validation is the default for HTTPS.
- A self-signed server is trusted only after explicit leaf-certificate
  enrollment. There is no trust-all manager, custom hostname verifier, silent
  retry, or automatic trust-on-first-use path.
- Client authentication and server authentication are independent. Android
  KeyChain owns the client private key; the app stores only the selected alias.

## Certificate enrollment

Enrollment is available on Android for a configured HTTPS route:

1. The native probe opens a TLS connection and sends no HTTP request, headers,
   cookies, or Frigate credentials.
2. If the route uses mTLS, the probe may use the user-selected KeyChain
   identity for the TLS handshake.
3. HTTPS endpoint identification remains enabled, so the certificate must
   match the configured hostname even during discovery.
4. The app displays the complete SHA-256 leaf-certificate fingerprint and asks
   the user to compare it with a trusted out-of-band source.
5. Only explicit confirmation stores the pin. Merely observing a certificate
   never creates trust.

For a local route, the probe also applies `LocalRouteResolver` address and
connected-peer validation before completing the handshake.

## Pin binding and enforcement

Each pin is bound to:

- the logical route (`remote` or `local`);
- canonical HTTPS scheme, hostname, effective port, and base path; and
- the mTLS KeyChain alias, or an empty alias for non-mTLS routes.

Changing any bound value invalidates the pin. The next authenticated request is
blocked until the user enrolls and confirms a certificate for the new binding.

Android native REST, bounded download, protected media, WebSocket, and
local-healthcheck clients receive only the validated fingerprint or a
fail-closed re-enrollment marker. The native trust manager compares the full
SHA-256 leaf fingerprint with `MessageDigest.isEqual`; OkHttp/JSSE continues
to enforce hostname verification. Redirects remain disabled on protected
Android clients.

Certificate replacement is never accepted from an error dialog. The user must
start the enrollment flow again and compare the new fingerprint independently.

## Migration

Profiles created with the former self-signed trust override do not inherit
trust. Migration sets a re-enrollment marker and blocks requests with
`SERVER_CERT_PIN_MISSING` until the certificate is explicitly registered.

Malformed pins, pins copied to another endpoint, and pins whose route or alias
no longer matches are treated the same way. A presented certificate that
differs from a valid stored pin fails with `SERVER_CERT_PIN_CHANGED`.

Legacy remote HTTP profiles remain stored so the user can edit them, but they
cannot connect until changed to HTTPS. There is no consent flag that can
re-enable remote cleartext.

## Credential and session boundaries

- Android profile identities are scoped by profile, route, endpoint,
  authentication context, client-certificate alias, and trust decision.
- A trust or credential change retires the affected native client, cookie jar,
  and protected-media profile.
- `httpWithClientCert.request` requires a profile identity and never degrades
  to global JavaScript `fetch`.
- Android client private keys and certificate chains never enter JavaScript or
  persisted settings.
- Credentials use platform secure storage and never fall back to AsyncStorage.
  iOS items use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; readable older entries are
  rewritten before use, and migration failure is fail-closed.

## iOS boundary

iOS release builds and iOS mTLS remain unsupported and unvalidated. The
inherited global and module-local trust-all handlers have been removed. The
remaining profile-isolated iOS transport uses default server-trust handling,
ephemeral URL sessions, private cookie stores, and same-authority redirect
checks.

Any future iOS certificate-pinning implementation requires a separate design,
Xcode build, and physical-device validation. Android trust state must not be
described as portable to iOS.

## Error taxonomy

| Code | Meaning | Recovery |
| --- | --- | --- |
| `SERVER_CERT_PIN_MISSING` | A migrated or invalidated route requires enrollment. | Start enrollment and verify the displayed fingerprint out of band. |
| `SERVER_CERT_PIN_CHANGED` | The presented leaf certificate differs from the registered pin. | Investigate the server change, then use the separate re-enrollment flow if legitimate. |
| `TLS_HANDSHAKE_ERROR` | TLS, hostname, validity, or protocol negotiation failed. | Correct server TLS configuration; do not bypass validation. |
| `REMOTE_HTTP_UNSUPPORTED` | A remote profile uses cleartext HTTP. | Change the remote endpoint to HTTPS. |

## Required regression coverage

- system-trusted HTTPS without a pin;
- correct, missing, malformed, and changed pins;
- hostname mismatch during enrollment and normal requests;
- remote and local enrollment with and without mTLS;
- host, port, scheme, base-path, route, and alias invalidation;
- migration from the former trust-all setting without automatic enrollment;
- remote HTTP rejection across REST, downloads, live media, and Media3;
- local HTTP DNS and connected-peer validation, including rebinding cases;
- redirect blocking and profile/cookie isolation;
- absence of trust-all challenge handlers in the iOS source tree; and
- fail-closed credential-storage and transport behavior.

Before release, run the TypeScript, Jest, Android unit, lint/R8, debug, and
release checks documented in `AGENTS.md`, followed by physical-device tests for
strict TLS, enrollment, certificate replacement, mTLS, local routing, media,
downloads, and upgrade migration.