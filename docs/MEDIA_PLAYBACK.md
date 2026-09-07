# Protected media playback

Android event playback uses Media3 through the `react-native-video` 6.19.2
ExoPlayer extension. JavaScript receives an opaque `frigate-media://` URI. The
native profile registry resolves it with the configured KeyChain identity,
profile CookieJar, and OkHttp client; credentials and resolved server URLs never
enter the player props.

The checked-in `patch-package` change only teaches the upstream source parser to
accept the opaque scheme; transport and policy remain project-owned native code.

## Event VOD

Frigate exposes timestamp-based camera VOD at:

```text
/vod/{camera}/start/{startTimestamp}/end/{endTimestamp}/master.m3u8
```

The same native data source handles the master/media playlist, relative or
absolute segments, initialization ranges, and AES-128 key requests.

## Security and cache decisions

- Only the registered profile host, port, and base path are allowed.
- Traversal, unexpected schemes, cross-host requests, and HTTPS-to-HTTP
  downgrades are rejected.
- Redirects are disabled for protected playback.
- A Frigate `401` joins one profile-scoped login flight and retries the failed
  request once at most. `403` and other failures are not reauthenticated.
- Media3 and OkHttp disk caches are disabled initially; buffering is in memory.
- Logs and JavaScript errors contain no credentials, aliases, cookies, private
  URLs, or private-key material.

## Camera live preview

Android uses Frigate/go2rtc WebRTC for the dedicated camera preview. The app
selects a stream exposed by the camera's sanitized Frigate configuration and
signals through the fixed endpoint:

```text
/live/webrtc/api/ws?src={configuredStreamName}
```

The WebSocket is opened natively with the same opaque profile, KeyChain
identity, strict trust policy, CookieJar, and Frigate or Basic authentication as
protected event playback. JavaScript receives no server URL, credentials,
certificate alias, or cookies. SDP and ICE messages are ephemeral and are
neither persisted nor logged.

Sessions start muted, stop when the screen or app becomes inactive, and retry
three times with bounded exponential backoff and jitter. The most recent
authenticated snapshot remains visible until the first decoded WebRTC frame.
After the retry budget, a visible snapshot fallback offers a manual retry.
iOS retains authenticated snapshots in this stage.

## Local RTSP adapter

Local RTSP is opt-in and is prepared through the native profile registry. The
configured local endpoint is resolved and its connected peer is checked against
private, ULA, and link-local address policy before Media3 receives a one-shot
opaque handle. Stream paths come only from the configured Frigate/go2rtc stream
names. Media3 negotiates UDP and TCP automatically; startup is muted and the
adapter reports bounded preparation and first-frame failures. UDP inactivity is
bounded to 5 seconds, leaving time for TCP fallback within the outer 15-second
first-frame deadline. Frigate
credentials are omitted unless `allowInsecureCredentials` was explicitly
enabled. The opaque handle, endpoint, credentials, and certificate aliases are
not persisted or passed through player props.

WebRTC media is encrypted with DTLS-SRTP. Candidate connectivity is separate
from HTTPS/WSS signaling, so the configured Frigate/go2rtc deployment must make
its WebRTC candidates reachable without relying on an external STUN service.

Clip sharing remains a separate bounded MP4 download. VLC remains an untouched
emergency adapter and is not used for event playback.
