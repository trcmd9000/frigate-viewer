# Capability and entitlement architecture

The app exposes stable, provider-neutral feature keys from
`helpers/entitlements.tsx`. `FREE_FEATURE_KEYS` describes the currently free
capabilities. `PREMIUM_FEATURE_KEYS` reserves entitlement-ready keys without
implementing or changing those capabilities; this currently includes
`event_playback_speed`.

`EntitlementsProvider` supplies an observable, immutable
`EntitlementSnapshot`. Its status is one of:

- `available`: the provider returned a current decision.
- `stale`: the last decision is usable, but the provider needs refreshing.
- `loading`: no premium decision is usable yet.
- `unavailable`: the provider could not provide a premium decision.

The explicit `initial-all-enabled` provider is the default so existing
production behavior remains fully enabled. Free capabilities are intrinsic to
the app and remain enabled regardless of provider state. Loading, unavailable,
malformed, or explicitly denied provider decisions fail closed for premium
keys only. A stale snapshot keeps its last known premium decisions until
replaced.

Use `useFeatureEnabled`/`useFeatureEntitlement` for observable reads and
`useFeatureAction` or `guardFeatureAction` at action boundaries. Entitlements
are runtime-only state: they are intentionally not part of Redux, Redux
Persist, server profiles, or application logs.
