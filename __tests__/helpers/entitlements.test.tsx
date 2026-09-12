import React from 'react';
import {Text} from 'react-native';
import {act, render} from '@testing-library/react-native';
import {SecureLogger} from '../../helpers/secureLogger';
import {
  EntitlementProvider,
  EntitlementStore,
  EntitlementsProvider,
  FEATURE_KEYS,
  FeatureUnavailableError,
  FREE_FEATURE_KEYS,
  PREMIUM_FEATURE_KEYS,
  assertFeatureEnabled,
  guardFeatureAction,
  initialAllEnabledProvider,
  selectFeatureEnabled,
  selectFeatureEntitlement,
  useFeatureEnabled,
} from '../../helpers/entitlements';

const provider = (
  id: string,
  resolve: EntitlementProvider['resolve'],
): EntitlementProvider => ({id, resolve});

describe('entitlements', () => {
  it('starts with every stable feature enabled through the explicit initial provider', () => {
    const store = new EntitlementStore(initialAllEnabledProvider);
    const snapshot = store.getSnapshot();

    expect(snapshot.providerId).toBe('initial-all-enabled');
    expect(snapshot.status).toBe('available');
    expect(
      [...FREE_FEATURE_KEYS, ...PREMIUM_FEATURE_KEYS].every(
        featureKey => snapshot.features[featureKey],
      ),
    ).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.features)).toBe(true);
    expect(Object.isFrozen(FREE_FEATURE_KEYS)).toBe(true);
    expect(Object.isFrozen(PREMIUM_FEATURE_KEYS)).toBe(true);
    expect(FEATURE_KEYS.eventPlaybackSpeed).toBe('event_playback_speed');
  });

  it('keeps free features enabled while an unavailable provider denies premium', async () => {
    const store = new EntitlementStore();
    const events: string[] = [];
    const unsubscribe = store.subscribe(() => {
      events.push(store.getSnapshot().status);
    });

    await store.setProvider(
      provider('future-provider', async () => {
        await Promise.resolve();
        return {
          status: 'unavailable',
          features: {event_playback_speed: true},
        };
      }),
    );

    expect(events).toEqual(['loading', 'unavailable']);
    expect(selectFeatureEntitlement(store.getSnapshot(), 'event_playback')).toBe(
      'enabled',
    );
    expect(selectFeatureEnabled(store.getSnapshot(), 'event_playback')).toBe(
      true,
    );
    expect(store.getSnapshot().features.event_playback).toBe(true);
    expect(
      selectFeatureEnabled(store.getSnapshot(), 'event_playback_speed'),
    ).toBe(false);
    expect(store.getSnapshot().features.event_playback_speed).toBe(false);
    unsubscribe();
  });

  it('treats malformed provider results as unavailable without logging payloads', async () => {
    const logError = jest
      .spyOn(SecureLogger, 'logError')
      .mockImplementation(() => undefined);
    const store = new EntitlementStore();
    const malformedProvider = provider(
      'malformed-provider',
      async () =>
        ({
          status: 'not-a-status',
          features: {
            event_playback: false,
            event_playback_speed: true,
          },
        }) as never,
    );

    await store.setProvider(malformedProvider);

    expect(store.getSnapshot().status).toBe('unavailable');
    expect(selectFeatureEnabled(store.getSnapshot(), 'event_playback')).toBe(
      true,
    );
    expect(
      selectFeatureEnabled(store.getSnapshot(), 'event_playback_speed'),
    ).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Entitlement provider operation failed',
      }),
      'entitlements.resolve',
    );
    expect(logError.mock.calls[0][0].message).not.toContain(
      'not-a-status',
    );
    logError.mockRestore();
  });

  it('reports provider resolution failures while preserving free access', async () => {
    const logError = jest
      .spyOn(SecureLogger, 'logError')
      .mockImplementation(() => undefined);
    const store = new EntitlementStore();

    await store.setProvider(
      provider('failing-provider', async () => {
        throw new Error('provider payload must not be logged');
      }),
    );

    expect(store.getSnapshot().status).toBe('unavailable');
    expect(selectFeatureEnabled(store.getSnapshot(), 'camera_events')).toBe(
      true,
    );
    expect(
      selectFeatureEnabled(store.getSnapshot(), 'event_playback_speed'),
    ).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Entitlement provider operation failed',
      }),
      'entitlements.resolve',
    );
    expect(logError.mock.calls[0][0].message).not.toContain(
      'provider payload',
    );
    logError.mockRestore();
  });

  it('keeps the last known decision visible while a refresh is stale', async () => {
    const store = new EntitlementStore();
    await store.setProvider(
      provider('future-provider', async () => ({
        status: 'available',
        features: {event_playback: false, camera_events: true},
      })),
    );

    await store.setProvider(
      provider('future-provider', async () => ({
        status: 'stale',
      })),
    );

    expect(store.getSnapshot().status).toBe('stale');
    expect(selectFeatureEnabled(store.getSnapshot(), 'event_playback')).toBe(
      true,
    );
    expect(selectFeatureEnabled(store.getSnapshot(), 'camera_events')).toBe(
      true,
    );
  });

  it('enforces the entitlement at the action boundary', async () => {
    const store = new EntitlementStore();
    const action = jest.fn((value: string) => value.toUpperCase());
    const guarded = guardFeatureAction(
      'event_playback_speed',
      action,
      store.getSnapshot,
    );

    expect(guarded('blocked')).toBe('BLOCKED');
    expect(action).toHaveBeenCalledTimes(1);

    await store.setProvider(
      provider('denied-provider', async () => ({
        status: 'available',
        features: {event_playback_speed: false},
      })),
    );
    expect(guarded('denied')).toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);

    expect(() =>
      assertFeatureEnabled(
        store.getSnapshot(),
        'event_playback_speed',
      ),
    ).toThrow(FeatureUnavailableError);
  });

  it('exposes provider updates through the observable hook', async () => {
    const futureProvider = provider('hook-provider', async () => ({
      status: 'available',
      features: {event_playback_speed: true},
    }));
    const store = new EntitlementStore(futureProvider);
    const Probe = () => (
      <Text>
        {useFeatureEnabled('event_playback_speed') ? 'enabled' : 'disabled'}
      </Text>
    );
    const view = render(
      <EntitlementsProvider provider={futureProvider} store={store}>
        <Probe />
      </EntitlementsProvider>,
    );

    expect(view.getByText('disabled')).toBeTruthy();
    await act(async () => {
      await store.setProvider(futureProvider);
    });
    expect(view.getByText('enabled')).toBeTruthy();
  });
});
