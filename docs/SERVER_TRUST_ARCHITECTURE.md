# Server trust architecture (design record)

**Status:** design record with guarded profile-session implementations on this
branch. This document does not replace the macOS/Xcode release gate.

**Current product decision:** self-signed trust remains an explicit per-route
override, and remote HTTP remains an explicit persisted per-profile consent.
Neither setting is a CA importer, pin, or TOFU enrollment. The architecture
below records the current invariants and release gates.

## Current implementation and boundaries

The following describes the code on this branch; it is not a target-state
promise.

- `Server.clientCertConfig.allowSelfSignedServer` and
  `RouteTlsSettings.allowSelfSignedServer` are the current trust override flags.
  New server and local-route defaults are `false` in `store/settings.ts`, and
  persistence normalizes them to `false` unless explicitly enabled.
- `Server.allowInsecureRemoteHttp` is versioned and defaults to `false`.
  Migration never grants consent to an existing HTTP profile; changing the
  remote authority, path, scheme, port, or TLS policy clears the consent.
- The settings form exposes the remote override in the mTLS section and the
  local-route override in the local mTLS section. The form removes disabled
  client-certificate configuration and removes local trust configuration when
  local routing is disabled.
- On Android, the strict path uses the system `X509TrustManager`. The explicit
  override creates a trust manager whose server-chain checks are no-ops in
  `android/app/src/main/java/com/trcmd9000/frigateviewer/ClientCertModule.java`.
  That is a trust-all server-chain override, not a CA import, pin, or TOFU
  record. The OkHttp builder does not install a custom `HostnameVerifier`; host
  verification must remain a separate invariant and must be tested explicitly.
- Android's `network_security_config.xml` has system trust anchors and permits
  cleartext for explicitly configured legacy HTTP endpoints. It is not an
  app-scoped server-anchor store.
- Android KeyChain is currently used for the **client** identity: the app
  retains only the selected alias and asks KeyChain for the private key and
  certificate chain. A client identity is not a server trust anchor.
- User credentials are stored through the platform credential-storage wrapper;
  non-secret server settings are persisted with Redux/AsyncStorage. Current
  profile IDs scope credentials and native sessions, but current trust flags
  are not an encrypted trust-anchor database.
- REST requests, native downloads, protected Media3 playback, and protected
  WebRTC signaling share the profile/route identity machinery. The native media
  registry rejects an in-place trust-policy change for an existing protected
  media profile. The current JavaScript REST path passes the self-signed
  override with client-certificate requests; it does not expose a general
  non-mTLS trust-all fallback.
- iOS REST and media requests now require the profile-isolated native transport.
  Each request uses an ephemeral `URLSession` with a private cookie store; the
  JavaScript bridge rejects the request rather than falling back to global
  `fetch`/`RNBlobUtil` when that capability is unavailable. The iOS path is not
  yet a validated release target for this fork.
- Android native sessions use opaque SHA-256 keys over profile/route identity,
  authentication scope, certificate identity, and trust policy. Edit, delete,
  logout, credential rotation, and route rotation retire only the affected
  OkHttp cookie jar/client and protected Media3 profile; no global cookie clear
  or raw credential key is used.

The current code therefore must not be documented as supporting imported server
certificates, SPKI pinning, certificate pinning, or TOFU. It currently supports
strict native validation by default and an explicit self-signed override on the
native paths that receive that flag.

### iOS profile-session isolation

The iOS transport is intentionally narrower than the Android trust paths:

- `requestServerIdentity` is route-, profile-, endpoint-, trust-, and
  consent-scoped. The iOS native request receives the authentication tuple and
  derives a SHA-256 session key from both; raw credentials are never returned
  as the key or logged.
- Each key owns an ephemeral `URLSession`, a private `HTTPCookieStorage`, and
  no shared credential storage; invalidation clears only that store, never a
  global cookie jar. Requests for the same profile can run in parallel, while
  profiles/accounts, ports, and base paths remain isolated.
- Redirects are accepted only when the destination remains HTTP(S) on the
  original host and effective port, and an HTTPS request cannot downgrade to
  HTTP. This prevents a response from moving the profile cookie scope to
  another authority.
- Snapshot/clip downloads use the same session and a bounded native writer.
  iOS writes only to the reservation-shaped managed cache directory; the JS
  layer validates containment and atomically moves the file to its final name.
  Profile changes retire the old session before persistence, and profile
  deletion retires it before credentials are removed. The REST
  `invalidateServerSession` is also used by profile edit/delete and logout
  lifecycle callers; the Android bridge additionally retires the matching
  protected Media3 profile.
- The bridge and Swift implementation still require a macOS/Xcode build and
  device test before release. Those gates must cover React Native selector
  export, iOS 12.4 deployment compatibility, cookie separation for two
  accounts on one host, redirects, cancellation, and concurrent requests.

### Warning text for the current release

Only copy changes are in scope now. The warning must say what is weakened and
what the user must do; it must not imply that the app has verified the server.
For example:

> **Self-signed server certificate:** this setting disables normal certificate
> trust checks for this server. A device or attacker on the network could
> impersonate the server and read or change Frigate traffic. Enable it only
> after independently verifying the server and only on a network you trust.
> Prefer a certificate trusted by Android.

The copy should be shown next to the explicit per-server/per-route choice,
with no “continue anyway” behavior added elsewhere. This is not a decision to
keep the trust-all mode indefinitely; it is the agreed interim UX while the
architecture is decided.

## Candidate trust models

All candidates below are per profile and per route (remote and local are not
implicitly the same). They are alternatives to evaluate, not an approved
implementation plan.

| Model | Enrollment and first connection | Main security property | Rotation and recovery | Main cost/risk |
| --- | --- | --- | --- | --- |
| Explicit server or CA import | User obtains a DER/PEM server certificate or CA through a trusted out-of-band channel and imports it before use. The app displays subject, validity, hostname/SAN, and SHA-256 fingerprint for confirmation. | Trust is explicit and does not depend on the first network path. A CA anchor supports a certificate chain and can cover planned leaf rotation. | A CA can allow ordinary leaf renewal. A leaf import requires re-import on replacement. Reset deletes the profile anchor and requires another import. | A CA is broader than one leaf and must be scoped to one profile. Platform user-installed CAs may affect other apps; they must not be silently treated as an app-scoped anchor. Import UX and file handling are sensitive. |
| Manually out-of-band verified SHA-256 pin | User compares a full SHA-256 **SPKI** or certificate fingerprint with a trusted source (administrator console, physical label, or other independent channel), then confirms it for this endpoint. | The stored key/certificate identity can authenticate a self-signed deployment without trusting an arbitrary CA. SPKI survives certificate re-issuance with the same key; a certificate pin does not. | A planned rotation can publish current and next SPKI pins. A changed pin must hard-fail and require deliberate re-enrollment; it must never be accepted from the error dialog. | A pin is not hostname identity by itself. SPKI reuse can extend trust if the private key is compromised; certificate pins create frequent outages. A pin-only validator must separately enforce hostname, validity policy, route, and scheme. |
| TOFU | On the first connection, after a prominent warning, the app records the observed certificate or SPKI and uses it on subsequent connections. No automatic acceptance is allowed without an explicit user action. | Detects later replacement on the same profile, but provides no protection against a MITM during first use. | Renewal requires the same key for an SPKI TOFU record, or an explicit reset/re-enrollment. A mismatch blocks and shows old/new fingerprints. | Vulnerable at first use and after an unsafe reset. It is unsuitable for a high-threat deployment unless paired with an independent verification step. It must never be presented as equivalent to OOB verification. |

Questions that must remain open include whether a future pin validates the
normal chain as well as the pin, whether SPKI or leaf pins are supported, and
whether a CA anchor is allowed to trust intermediates. The product must not
silently combine models or turn an unverified observed certificate into a pin.

## Threat model

### Assets

- Server identity, Frigate credentials, session cookies, camera recordings,
  live streams, and REST responses.
- The Android client private key and certificate alias used for mTLS.
- Per-profile server trust anchors, pins, TOFU state, and recovery metadata.
- The association between an endpoint, its configured hostname, and a profile.

### Adversaries and failure modes

- A hostile or compromised Wi-Fi/LAN, DNS, ARP path, proxy, captive portal, or
  local device attempts to impersonate the Frigate endpoint.
- A server certificate is replaced because of compromise, accidental renewal,
  an unplanned reverse-proxy change, or a stale copied profile.
- A lost or unlocked device, malicious backup/restore, another app, or a
  profile-ID collision exposes or reuses trust state.
- A user accepts a warning without comparing an out-of-band fingerprint, or
  resets trust and immediately accepts a new key.
- Remote and local routes, redirects, media URLs, and WebRTC signaling use
  different trust decisions and create a downgrade or policy-bypass path.

### Out of scope

An already-compromised operating system, Android KeyChain/Keystore, Frigate
server private key, or administrator intentionally configuring a malicious
endpoint cannot be repaired by this client architecture. Such assumptions must
be explicit in security review.

## Target-state invariants to decide and preserve

### Trust state and enrollment

1. A trust record is bound to a profile ID **and** route, canonical scheme,
   hostname, port, and base path. Changing the host, scheme, or port invalidates
   the record; it is never silently carried to a new endpoint.
2. A future trust record has a version, mode, algorithm, full digest, creation
   time, last successful verification, and (where needed) a planned next
   digest. No SHA-1 or truncated digest may be the stored security decision.
3. Strict system validation is the default. There is no global trust-all
   manager, hostname verifier, or silent retry without the selected trust
   decision.
4. Trust enrollment completes before credentials, cookies, or client-authenticated
   application requests are sent. A client certificate proves the client to the
   server; it does not prove the server to the client.
5. Remote and local endpoints have independent trust records and independent
   first-use decisions. HTTP cleartext is a separate transport policy, not a
   successful trust enrollment.

### Android KeyChain versus server trust anchors

Android's protected KeyChain chooser is the right boundary for a client
certificate and private key. It must not be reused as a server-CA picker by
implication:

- The stored client alias identifies a KeyChain identity; the private key never
  enters JavaScript or app storage.
- A server certificate/CA or pin is public material but security-sensitive
  policy. It needs an app-scoped, profile-bound trust store, not an assumption
  that a user-installed Android CA is available or safe for every application.
- If a later design deliberately uses an Android user-installed CA, the product
  must explain its system-wide scope, removal behavior, backup behavior, and
  device-policy differences. It must not be silently imported by Frigate
  Viewer.
- A missing client alias and a missing server trust anchor are different
  errors and require different recovery actions.

### Profile-bound encrypted storage

Current non-secret Redux settings and current secure credentials are separate.
Any future CA, pin, or TOFU record must be treated as security policy rather
than ordinary AsyncStorage data:

- Encrypt the record at rest with a platform-backed, non-exportable key (or an
  equivalent reviewed platform secure-storage primitive), and include the
  profile ID and canonical route in authenticated metadata.
- Do not store private keys, import passwords, or a copy of the Android
  KeyChain identity. Store only the minimum anchor/pin metadata needed by the
  selected model.
- Delete trust state when a profile is deleted or trust is reset; retire native
  sessions and cookies for the old policy.
- Prevent profile-ID reuse from inheriting an old trust record. A copied profile
  must not share a mutable trust record by accident.
- Do not log anchors, private URLs, credentials, or full profile exports.

### First connection and fingerprint display

Before a future non-system trust decision is committed, show:

- the exact scheme, hostname (or IP), port, and route label;
- certificate subject, issuer, validity dates, SANs, and whether the digest is
  of the certificate DER or the Subject Public Key Info (SPKI);
- the complete SHA-256 digest in a stable, copyable, accessible grouping (not
  only a shortened visual form); and
- a clear statement that mTLS client authentication is independent.

An explicit import or manual pin requires the user to compare the displayed
value with a trusted out-of-band source. TOFU requires a separate “record this
identity” confirmation and a first-use warning that it cannot protect against
an attacker present on that first connection. Credentials and login must wait
until this gate completes.

### Hostname binding and redirects

Hostname verification is a separate invariant for every model, including
pinning and self-signed deployments:

- Match the configured canonical hostname/IP against certificate SAN rules;
  do not use CN-only fallback. IP literals require IP SANs.
- Keep the original scheme, host, port, and approved base path bound to the
  profile. Never let a redirect change the trust scope or downgrade HTTPS to
  HTTP.
- Normalize IDNs, brackets, ports, and paths consistently with
  `helpers/serverIdentity.ts`; do not use a display string as the security key.
- A pin match must not be treated as permission to connect to another host.

### Certificate changes and rotation

- An expired, invalid, hostname-mismatched, or changed identity is a hard
  trust error, not an authentication retry.
- The error view may show old and observed fingerprints, subject/issuer,
  validity, and the configured endpoint. It must offer verify/re-enroll,
  inspect details, or reset—not a one-tap “accept new certificate”.
- A CA model can rotate leaf certificates under the same approved anchor. A
  certificate pin changes on every certificate renewal. An SPKI pin can
  survive re-issuance with the same key, but key reuse and key compromise must
  be part of the risk decision.
- If planned overlap is supported, store an explicit current/next set with an
  expiry and require the next value to be provisioned through the chosen
  trusted channel. Never learn the next value from a failed connection.
- A host, scheme, port, or route change starts enrollment again even when the
  presented key is unchanged.

### Recovery, reset, copy, and deletion

- “Reset server trust” removes only the trust record, retires native sessions,
  and leaves credentials untouched but unusable until re-enrollment (unless the
  user separately deletes the profile).
- “Delete profile” removes credentials and trust metadata from app storage and
  retires remote/local media and REST sessions. It does not uninstall the
  client identity from Android KeyChain; that remains an Android Settings
  operation.
- Copying a profile copies endpoint display settings only by default. Copying
  credentials or trust must be a separate, explicit action with a fresh
  profile binding and re-confirmation. A profile copy must not silently inherit
  a TOFU record.
- If the user is locked out by a changed certificate, recovery is re-import,
  out-of-band re-verification, or an administrator-approved reset—not an
  automatic fallback to trust-all.

### Migration of existing trust-all profiles

No automatic conversion is safe because the current mode does not prove which
certificate was intended. A later migration must answer all of these questions:

1. Does an upgrade preserve a legacy profile temporarily, mark it visibly as
   `legacy-trust-all`, or block it until the user chooses a new model?
2. How long is the legacy exception supported, and what is the rollback path?
3. Is the user required to import/verify a new anchor before the next request,
   or may the old mode remain available only with repeated warnings?
4. How are profiles with the same endpoint but different profile IDs migrated?
5. How are remote and local route records migrated independently?

The safe baseline for evaluation is: do not silently capture the currently
observed certificate, do not silently create a TOFU record, do not merge trust
between profiles, and do not remove the Android KeyChain client identity.
Migration must be staged, reversible, and observable through local UI only.

### Backup and restore

There is currently no approved portable trust-backup format. Any future design
must decide whether:

- encrypted backups include CA certificates or pins only, protected by a
  user-supplied passphrase and bound to a new profile on restore;
- credentials are excluded (the current secure-storage invariant);
- Android KeyChain aliases are exported (the default must be no—reselect the
  identity after restore);
- a restored TOFU record is marked unverified until the user confirms the
  endpoint; and
- restore refuses an endpoint or profile-ID collision rather than overwriting
  live trust state.

Cloud sync or a maintainer-operated relay is out of scope. A backup must never
turn a public certificate fingerprint into a portable, silently trusted
identity without user confirmation.

### mTLS independence and transport consistency

The eventual trust policy must be applied consistently to every operation that
can expose server data:

- REST login and API calls;
- native authenticated downloads and clip/VOD retrieval;
- Media3 HLS playlists, segments, initialization ranges, and keys;
- WebRTC/WSS signaling used by camera live preview; and
- local-route operations, including the separately configured local endpoint
  and any native RTSP adapter policy.

All of these paths must use one profile/route trust decision and the same
hostname, redirect, and downgrade rules. A JavaScript fallback must not bypass a
native trust failure. The current protected-media registry already scopes a
native session and rejects an in-place remote trust-policy change; a future
trust model must extend that invariant rather than adding a second policy path.

HTTPS/WSS server trust is not the same as WebRTC media security: DTLS-SRTP and
candidate reachability are separate. The design must document what is
authenticated by the signaling connection and what is guaranteed by the media
transport. mTLS remains optional and independent of server trust in every
model.

## UX and error taxonomy

The UI should distinguish, without exposing credentials:

- system CA/hostname failure;
- missing or unavailable Android client identity;
- missing or malformed imported anchor;
- pin/TOFU mismatch (show old versus observed digest);
- expired/not-yet-valid certificate;
- hostname/SAN mismatch;
- HTTP authentication failure after trust succeeded; and
- local-route policy or reachability failure.

Trust errors should identify the profile and route, show safe certificate
metadata, state whether the failure happened before any credentials were sent,
and offer only a valid recovery action. Error text must not say “certificate
trusted” when the app merely observed a certificate. Fingerprints are user
input for comparison, not a substitute for a server name or route binding.

## Decision questions

The product and security review must answer:

1. Which candidate model(s), if any, are needed: CA import, SPKI pin, leaf pin,
   TOFU, or a combination with an explicit precedence rule?
2. Is a pin an additional check on normal validation or an explicit override for
   private/self-signed deployments? What validity and hostname checks remain?
3. Is an imported anchor a leaf, a CA, or a constrained chain, and how is its
   scope enforced on Android?
4. Should the app use an app-scoped encrypted store only, or deliberately
   support system-installed CAs with their wider scope?
5. Are remote and local routes always enrolled separately? Can one profile use
   different trust models on those routes?
6. What is the approved rotation mechanism, including current/next pins and
   emergency key compromise?
7. What warning and OOB verification language is localized and accessible?
8. What is the lifetime and rollback policy for existing trust-all profiles?
9. What does profile copy, deletion, backup, and restore mean for trust and
   Android KeyChain aliases?
10. Is Android the only release target for the first implementation, with iOS
    deferred until its native transport has a separately reviewed policy?
11. Which operations must be blocked until trust enrollment succeeds, and how
    are REST, downloads, Media3, WebRTC signaling, and local RTSP tested as one
    matrix?

## Phases and release gates

### Phase 0 — current change: warning only

- Keep the existing schema and transport behavior.
- Add or refine only the explicit warning copy after product review.
- Do not capture fingerprints, add storage, import certificates, change native
  trust managers, or migrate profiles.
- Gate: documentation matches the current code and `git diff --check` passes.

### Phase 1 — architecture decision

- Choose the candidate model(s), scope, hostname rules, storage primitive,
  rotation, backup, migration, and Android/iOS boundary.
- Produce a data-flow diagram and a threat-model review covering all native
  paths.
- Gate: security review sign-off, UX/accessibility copy sign-off, and an
  explicit decision for every question above.

### Phase 2 — isolated prototype and tests

- Prototype behind a non-default feature boundary without changing existing
  profile behavior.
- Test real certificate chains, self-signed leaves, CA rotation, SPKI
  re-issuance, hostname mismatch, redirects, local/remote routes, mTLS and
  non-mTLS, and KeyChain identity removal.
- Gate: no credential is sent before enrollment; all REST/media/WebRTC paths
  agree; logs and persisted state pass a secret review; failure recovery is
  deterministic on supported Android API levels.

### Phase 3 — opt-in migration

- Add an explicit migration screen for legacy trust-all profiles. Never infer a
  pin from an unverified connection.
- Support reset, profile copy/delete, encrypted backup semantics (if approved),
  and a rollback path before enabling a new default.
- Gate: migration tests cover duplicate endpoints, profile IDs, route
  separation, app reinstall/restore, and unavailable KeyChain aliases.

### Phase 4 — default and deprecation decision

- Only after operational evidence decide whether strict system trust,
  imported anchors, verified pins, or another model becomes the default.
- Define a dated removal or containment policy for legacy trust-all, with
  release notes and support guidance.
- Gate: physical-device matrix, security sign-off, localized UX, upgrade and
  rollback validation, and no unreviewed trust-all path in native or fallback
  transports.

## Test inventory for a future implementation

The later implementation must include, at minimum:

- serialization and migration tests for every trust mode, profile binding,
  route separation, reset, copy, deletion, and backup/restore behavior;
- certificate tests for CA import, SPKI and leaf digest calculation, malformed
  input, expiry, SAN/hostname mismatch, changed key, same-key re-issuance,
  planned overlap, and redirect/downgrade rejection;
- first-connection tests proving no credentials or client-authenticated
  request is sent before explicit enrollment;
- Android instrumented tests for KeyChain chooser cancellation, unavailable or
  removed aliases, system trust anchors, app-scoped anchors, and API-level
  differences;
- an operation matrix covering strict, each future trust model, mTLS and
  non-mTLS, remote and local routes, REST, login, downloads, HLS/VOD,
  WebRTC/WSS signaling, and local RTSP policy; and
- negative tests proving that a pin mismatch cannot be accepted through an
  error retry, a JavaScript fallback, a profile copy, or a stale native media
  session.

## Code and documentation checked for this record

- `store/settings.ts`
- `helpers/serverIdentity.ts`
- `helpers/settingsPersistence.ts`
- `helpers/secureStorage.ts`
- `helpers/rest.ts`
- `helpers/httpWithClientCert.ts`
- `helpers/mediaDownload.ts`
- `helpers/protectedMedia.ts`
- `helpers/protectedLive.ts`
- `android/app/src/main/java/com/trcmd9000/frigateviewer/ClientCertModule.java`
- `android/app/src/main/java/com/trcmd9000/frigateviewer/MediaProfileRegistry.java`
- `android/app/src/main/res/xml/network_security_config.xml`
- `docs/CLIENT_CERT_SETUP.md`
- `docs/MEDIA_PLAYBACK.md`
