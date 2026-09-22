# HEVC transport experiment plan

Status: The native MSE/Media3 path and stream-selection policy are implemented
for the Android 18.0.0 release candidate. The public production release remains
blocked on the documented worker build, device matrix, and Play Internal
Testing of the exact final AAB.

## Separate WebView evaluation (8 September 2026)

An independent comparison of the existing Frigate web player in Android WebView
is now approved for investigation, including a possible later production
proposal. It does not change the native Phase B/C acceptance boundaries below
or authorize shipping a WebView, changing server configuration, adding routes,
exposing go2rtc ports, or bypassing transport policy. No WebView implementation
or compatibility result is included in the current source changes.

First compare the same source and the actual selected transport: Frigate's web
player normally prefers MSE, which can carry AAC, while WebRTC audio requires
Opus or PCMA/PCMU. Browser audio success is not evidence that native WebRTC
receives compatible audio. Verify against the installed Frigate and WebView
versions; do not change server codecs as part of this comparison.

Time-box the comparison to one day for a single-camera diagnostic player and
two more for security/lifecycle feasibility. Inventory existing UI resources
before approving any client allow-list expansion; assume no stable standalone
embed route. Do not rely on DOM scraping to create a production interface.

Android WebView supports KeyChain client-certificate and HTTP-auth callbacks,
but its default cookie store and cached host/port certificate decisions do not
provide the application's profile isolation. Require same-origin/different-user
and different-certificate A-B-A tests, including WebSocket, storage and service
worker state. Separate views, initial headers, or clearCache are not proof of
isolation. TLS errors must be cancelled, never ignored. Unsupported profiles
must retain the existing native path, not silently lose their trust policy.

Require muted startup, cancellable playback, actual decoded frame progression,
audible output, five-minute stability, lifecycle/renderer-crash recovery and
measured resource use against the native baseline. Do not request microphone,
camera, location or broad file permissions or expose an unrestricted native
bridge. Only a separately reviewed implementation proposal with passing
security and device evidence can authorize an optional production transport.

## Non-negotiable boundaries

The experiment must work with the Frigate deployment as it exists today:

- No Frigate source, configuration, go2rtc configuration, or server behavior
  changes.
- No new server routes, query parameters, camera tokens, or bearer-token
  schemes.
- Do not expose a go2rtc port or connect to a go2rtc port directly.
- The only allowed media/signaling surfaces are:
  - the existing protected `/api/go2rtc/streams/<encoded-name>` resource;
  - existing WebRTC signaling at `/live/webrtc/api/ws?src=<configured-name>`;
  - the existing `/live/mse/api/ws` WebSocket.
- Keep the current profile registry, user authentication, Android KeyChain
  client certificate support, hostname verification, and local-route policy.
- No WebView is a production implementation. A WebView may be used only as a
  disposable diagnostic comparison during the spike.

The existing protected playback transport remains the fallback while the
experiment is running.

## Decision question and hypothesis

Question: can an Android client accept an HEVC stream from the existing Frigate
and go2rtc surfaces while preserving authentication and the app's native
security boundary?

Hypothesis: an authenticated WebRTC path may be able to deliver HEVC when the
device and injected WebRTC factories support it. If that fails, the existing
MSE WebSocket may expose an ordered fragmented-MP4 byte stream that Media3 can
consume, but this is explicitly uncertain and must be treated as a feasibility
spike, not as an assumed architecture.

## Phase 0: baseline and experiment harness

Before changing playback:

1. Record the current Android build, Media3/react-native-video versions, device
   model/API level, Frigate version, go2rtc version, camera stream name, and
   whether the source is H.264 or HEVC.
2. Capture a known-good H.264 event/live playback run using the current native
   path. Record time to first frame, audio behavior, failures, and logs after
   redaction.
3. Add a developer-only experiment flag that is off by default and cannot
   bypass authentication or route validation.
4. Build a test fixture with synthetic codec metadata and a sanitized test
   server. Never store a real host, credential, token, certificate alias, or
   camera identifier in the repository.

Abort the experiment if the baseline regresses, the flag can select an
unapproved host, or any secret appears in JavaScript props, logs, fixtures, or
crash text.

## Phase A: codec metadata and capability model

Goal: make a transport decision from observed metadata and device capability,
without changing the transport.

### Work items

1. Define an internal media capability model containing codec family/profile,
   level, bit depth, chroma, frame rate, dimensions, HDR indicators when
   available, audio codec, and source/transport identity. Treat unknown fields
   as unknown rather than as supported.
2. Parse only metadata available from the existing protected stream or
   authenticated signaling. Do not fetch a new discovery endpoint.
3. Add a native capability probe for the target Android device/API level:
   hardware and software decoder names, supported MIME/profile/level, secure
   playback requirements, and encoder/decoder factory availability for WebRTC.
4. Expose a safe decision result to the player: `supported`, `unsupported`,
   or `unknown`, with a user-safe diagnostic reason. Do not expose credentials,
   private URLs, or certificate details.
5. Keep H.264 behavior unchanged. Unknown or unsupported HEVC must select the
   existing fallback, not a new unauthenticated route.

### Phase A acceptance

- Unit tests cover H.264, HEVC, malformed metadata, unknown fields, profile and
  level limits, and capability disagreement.
- Device-matrix evidence exists for at least the T Phone 3 and one known
  HEVC-capable Android device, if available.
- The capability result is deterministic for a fixed metadata/device pair.
- No server or route changes are required.

Phase A does not prove that a frame can be rendered. It only produces a
capability decision and instrumentation for Phase B.

### Phase A implementation notes

The Phase A observer uses only the existing protected
`GET /api/go2rtc/streams/<encoded-name>` request through the profile-aware
authenticated HTTP stack. It retains no producer URL, host, token, or unknown
response field. The parser accepts the producer `medias` text and equivalent
video/audio descriptor forms, but only keeps a small allow-listed descriptor;
the UTF-8 response budget is 64 KiB. A missing, malformed, non-JSON, or
oversized response is an explicit `unknown` result. Android codec discovery is
static aggregate `MediaCodecList` inspection (API 24 through the current
target), so it does not initialize a decoder or prove that WebRTC can negotiate
HEVC. Hardware/software labels are emitted only on API 29+, where the platform
classification APIs exist. HEVC remains experiment-only and the default
decision keeps the existing fallback transport; H.264/VP8/VP9 eligibility is
unchanged. A `supported` Phase A decision is capability/flag eligibility only,
never evidence that a frame was decoded.

## Phase B: time-boxed WebRTC AAR and factory spike

This is the first transport spike and is limited to three engineering days
including device testing. It is the preferred experiment because it reuses the
existing WebRTC signaling and candidate policy.

### Result: aborted on Jitsi WebRTC 124.0.0

The installed `react-native-webrtc` 124.0.8 dependency resolves to
`org.jitsi:webrtc:124.0.0`. Its Android core and hardware decoder factory expose
H.265, while the React Native wrapper normally filters hardware codecs to H.264.
An isolated arm64 build allowed H.265 through that existing factory without
changing signaling, authentication, or candidate handling.

On the T Phone 3, the resulting offer advertised H.265 and the go2rtc answer
accepted an active video section containing H.265. Before a decoded HEVC frame
could be proven, `libjingle_peerconnection_so.so` dereferenced a null pointer on
its worker thread and terminated the foreground process with `SIGSEGV`. The
experiment therefore fails the decoded-frame and stability criteria. The
decoder-factory change is not retained. Continue with Phase C rather than
shipping or widening this WebRTC experiment.

### Work items

1. In an isolated branch/build variant, substitute the candidate GetStream
   `stream-webrtc-android` AAR. Record the exact version, artifact checksum,
   transitive dependencies, license, and ABI impact.
2. Inject the candidate WebRTC encoder and decoder factories at the native
   peer-connection construction boundary. Do not create a second signaling
   protocol or a direct go2rtc connection.
3. Feed signaling only through the existing authenticated WebSocket. Preserve
   the current opaque profile, TLS trust, mTLS identity, allowed-host checks,
   retry budget, candidate handling, and muted startup.
4. Test an actual HEVC offer/answer and require a decoded frame delivered to
   the real native surface. Metadata or a successful SDP exchange is not
   acceptance.
5. Record codec, selected factory, first-frame time, resolution, frame
   continuity, audio state, reconnect behavior, background/foreground behavior,
   and memory/CPU. Redact all URLs and identities.

### Phase B success criteria

Phase B succeeds only when all are true on the target device:

- The stream is obtained through existing authenticated signaling.
- At least ten consecutive seconds of real HEVC frames render without a black
  or stale surface, decoder error, or fallback.
- H.264 still passes the baseline tests.
- Startup remains muted and lifecycle stop/restart remains bounded.
- No secret or private endpoint crosses the JavaScript boundary or appears in
  logs.
- The AAR can be distributed under the project's licensing and notice rules.

### Phase B abort criteria

Stop at the end of the time box, or earlier if the AAR cannot be built,
license/provenance is unclear, factory injection requires server changes,
candidate/authentication behavior changes, the device cannot decode actual
frames, or the implementation needs a WebView. Do not extend the time box to
chase a driver-specific dead end. If B fails, proceed to Phase C only after
writing a short failure record.

## Phase C: conditional native MSE WebSocket feasibility spike

Run this phase only if Phase B fails and the failure record shows that a
server-provided fMP4 byte stream could still be useful. Time-box this spike to
five engineering days. It is not a commitment to ship.

### Contract probe implementation

The first Phase C milestone is implemented behind the Android property
`enableProtectedMseProbe`, whose release-candidate default is enabled and which
remains an explicit build-time emergency disable switch. It reuses the native media profile's OkHttp
client, cookies, Basic Auth, TLS and mTLS policy, and opens only the fixed
`/live/mse/api/ws` path. JavaScript supplies an opaque profile ID and validated
stream name; it never receives the resolved URL, credentials, cookies or media
bytes.

The probe requests only `hvc1.1.6.L153.B0`, requires a bounded `video/mp4`
response containing `hvc1`, and scans binary messages for top-level `ftyp`,
`moov`, `moof` and `mdat` boxes. It limits each binary message to 2 MiB
(bounded by the same total probe budget),
total observed data to 2 MiB and startup to ten seconds. It closes on success,
failure, profile replacement, app pause or bridge invalidation. Its public
result contains only codec/box booleans and a byte count.

### Media3 bridge result: sustained frames on T Phone 3

The experiment now creates a dedicated opaque `frigate-media://.../mse/...`
handle after the contract probe succeeds. A native Media3 `DataSource` resolves
that handle to the profile-scoped WebSocket, gates binary data on the validated
HEVC MIME response, and exposes an ordered progressive stream to Media3. Media
bytes, resolved endpoints, cookies and credentials remain native. The queue is
bounded to 4 MiB, individual messages to 2 MiB, startup to ten seconds and an
idle read to fifteen seconds. Profile retirement cancels the shared OkHttp
dispatcher and closes the stream.

On 10 September 2026, arm64 experiment build
`20260910-133733-d18e6fe35f93` rendered the real Lumus HEVC stream on a T Phone
3 for more than ten seconds without a playback exception or native crash.
Camera-only frame hashes at 1, 6 and 12 seconds were distinct. Media3 selected
`c2.qti.hevc.decoder` for `video/hevc` at 3840x2176. The stream identified as
`hvc1.1.6.L186`, and Media3 warned that this exceeded the decoder's declared
profile-level capability, but decoded frames remained stable during the test.

This satisfies the single-device decoded-frame gate, not production release.
The bridge is default-enabled in the 18.0.0 release candidate but remains
strictly gated at runtime. Lifecycle transitions, authentication failures,
H.264 regression behavior, a longer soak test, and Play Internal Testing are
still required before public promotion.

### Proposed shape

1. Open a native OkHttp WebSocket to the existing authenticated
   `/live/mse/api/ws` surface only. Authenticate through the existing profile
   cookie/basic-auth/mTLS machinery; do not invent a token or expose an
   endpoint to the server.
2. Verify the message contract and whether the bytes form an ordered,
   decodable fragmented-MP4 stream. Treat the contract as unknown until
   observed from a sanitized fixture and a real authenticated session.
3. Build a bounded queue with explicit backpressure, cancellation, maximum
   buffered bytes, message-size limits, idle timeout, total startup deadline,
   and a clean close path.
4. Investigate a native Media3 `DataSource`/extractor bridge that can consume
   the ordered byte stream and surface actual frames. Do not assume that a
   WebSocket is seekable or that Media3 progressive extraction accepts an
   arbitrary push stream.
5. Keep all URL construction, authentication, TLS, mTLS, peer checks, and
   redacted diagnostics native. JavaScript receives only an opaque player handle
   and status.

### Remaining feasibility uncertainty

The tested `/live/mse/api/ws` session provided an ordered fMP4 contract and the
Media3 extractor accepted it within bounded buffering. It remains unknown how
portable that behavior is across Frigate/go2rtc versions, Android vendors and
HEVC profiles. A single successful device is not production success.

### Phase C success and abort

Success requires real decoded HEVC frames, bounded memory under a sustained
stream, cancellation on lifecycle changes, correct authentication and TLS
failure behavior, H.264 regression safety, and a distributable legal dependency
set. Abort if the stream is not ordered/decodable, framing is undocumented and
unstable, Media3 requires an unbounded or seek-dependent bridge, buffering
exceeds the agreed limit, or production would require a WebView. The fallback
then remains the supported path.

## Security boundaries and threat checks

- All requests must resolve against the configured profile and approved route;
  reject scheme changes, cross-host redirects, traversal, and HTTPS downgrades.
- Reuse the existing cookie/authentication and Android KeyChain/mTLS layers.
  Private keys remain in KeyChain. Never log credentials, cookies, aliases,
  tokens, SDP, ICE candidates, private URLs, or raw media bytes.
- Do not persist media or signaling data for the experiment unless an explicit
  test requires it; delete fixtures and captures after review.
- Keep camera names and stream names sanitized in tests and reports.
- Verify that pause, screen deactivation, app backgrounding, retry, and
  certificate failure close sockets, release decoders, and clear buffers.
- Consent rules for insecure credentials and local RTSP remain unchanged; HEVC
  work must not broaden them.

## Test plan

- Model: codec metadata parsing, capability decisions, unsupported/unknown
  fallback, malformed input, and stable serialization.
- Native security: auth success/failure, mTLS success/failure, hostname and
  certificate-enrollment behavior, route allow-list rejection, no secret
  logging.
- WebRTC: existing H.264 regression, HEVC offer/answer, injected factory
  selection, actual-frame assertion, mute-by-default, retry, lifecycle, and
  media replacement.
- MSE spike: WebSocket authentication, ordering/framing, fMP4 initialization
  and media samples, bounded queue/backpressure, cancellation, timeout,
  malformed messages, and decoder error.
- Device: T Phone 3 first; then a documented HEVC-capable device if available.
  Test API 24 baseline behavior and the release ABI.
- Release: both TypeScript configurations, focused unit tests, native build,
  relevant lint, dependency/license scan, and `git diff --check`.

## Rollback

Keep the experiment behind the off-by-default flag. Roll back by removing the
candidate AAR/factory bridge, deleting the native MSE spike code, and restoring
the last known-good build variant. Do not migrate persisted settings or media
state. A failed experiment must leave the current protected playback and
WebRTC paths byte-for-byte behaviorally unchanged.

## Licensing and legal gate

Before building or distributing either spike:

1. Obtain the AAR/POM/source provenance and the complete transitive dependency
   list.
2. Review licenses, notices, patents, redistribution terms, ABI packaging, and
   compatibility with this repository's license.
3. Update third-party notices only after approval and only for a dependency that
   survives the spike.
4. Do not ship an artifact or publish performance claims while provenance or
   HEVC patent/licensing obligations are unresolved.

## Deliverables and decision record

Each phase produces:

- a short dated experiment log with device/build/source metadata;
- redacted logs and repeatable test commands;
- capability and actual-frame results;
- dependency checksums and license review status;
- measured first-frame, continuity, resource, and lifecycle results;
- a clear pass/fail/abort decision and rationale.

The final decision must state whether to keep the existing path, ship the
Phase B WebRTC integration, or open a separately approved Phase C
implementation. No experiment result alone authorizes Frigate changes,
additional routes, exposed ports, camera tokens, or a WebView production path.
