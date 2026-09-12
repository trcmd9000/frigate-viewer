import React, {
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {SecureLogger} from './secureLogger';

/**
 * Feature identifiers are part of the provider contract. Keep them stable:
 * providers may be deployed independently from the application.
 */
export const FREE_FEATURE_KEYS = Object.freeze([
  'camera_events',
  'camera_live_view',
  'event_playback',
  'event_download',
  'event_sharing',
  'server_management',
  'settings',
] as const);

/** Reserved keys for capabilities that may be entitlement-controlled later. */
export const PREMIUM_FEATURE_KEYS = Object.freeze([
  'event_playback_speed',
] as const);

export type FreeFeatureKey = (typeof FREE_FEATURE_KEYS)[number];
export type PremiumFeatureKey = (typeof PREMIUM_FEATURE_KEYS)[number];
export type FeatureKey = FreeFeatureKey | PremiumFeatureKey;
export type CapabilityKey = FeatureKey;

export const FEATURE_KEYS = Object.freeze({
  cameraEvents: 'camera_events' as const,
  cameraLiveView: 'camera_live_view' as const,
  eventPlayback: 'event_playback' as const,
  eventDownload: 'event_download' as const,
  eventSharing: 'event_sharing' as const,
  serverManagement: 'server_management' as const,
  settings: 'settings' as const,
  eventPlaybackSpeed: 'event_playback_speed' as const,
});

export const CAPABILITY_KEYS = FEATURE_KEYS;

export type EntitlementStatus =
  | 'loading'
  | 'available'
  | 'stale'
  | 'unavailable';

export type FeatureEntitlement = 'enabled' | 'disabled';

export type EntitlementFeatures = Readonly<Record<FeatureKey, boolean>>;

export interface EntitlementSnapshot {
  readonly providerId: string;
  readonly status: EntitlementStatus;
  readonly features: EntitlementFeatures;
  readonly revision: number;
  readonly updatedAt: number | null;
}

export interface EntitlementResolution {
  readonly status: EntitlementStatus;
  readonly features?: Partial<Record<FeatureKey, boolean>>;
  readonly updatedAt?: number | null;
}

export interface EntitlementProvider {
  readonly id: string;
  readonly resolve: () => Promise<EntitlementResolution>;
  readonly subscribe?: (
    listener: (resolution: EntitlementResolution) => void,
  ) => () => void;
}

const allFeatureKeys = [...FREE_FEATURE_KEYS, ...PREMIUM_FEATURE_KEYS] as const;

const allEnabledFeatures = (): EntitlementFeatures => {
  const features = {} as Record<FeatureKey, boolean>;
  allFeatureKeys.forEach(key => {
    features[key] = true;
  });
  return Object.freeze(features);
};

const providerRestrictedFeatures = (): EntitlementFeatures => {
  const features = {} as Record<FeatureKey, boolean>;
  FREE_FEATURE_KEYS.forEach(key => {
    features[key] = true;
  });
  PREMIUM_FEATURE_KEYS.forEach(key => {
    features[key] = false;
  });
  return Object.freeze(features);
};

const isFreeFeatureKey = (
  featureKey: FeatureKey,
): featureKey is FreeFeatureKey =>
  (FREE_FEATURE_KEYS as readonly FeatureKey[]).includes(featureKey);

const isEntitlementResolution = (
  value: unknown,
): value is EntitlementResolution => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as {
    status?: unknown;
    features?: unknown;
    updatedAt?: unknown;
  };
  if (
    candidate.status !== 'loading' &&
    candidate.status !== 'available' &&
    candidate.status !== 'stale' &&
    candidate.status !== 'unavailable'
  ) {
    return false;
  }
  if (
    candidate.updatedAt !== undefined &&
    candidate.updatedAt !== null &&
    typeof candidate.updatedAt !== 'number'
  ) {
    return false;
  }
  if (candidate.features === undefined) {
    return true;
  }
  if (!candidate.features || typeof candidate.features !== 'object') {
    return false;
  }
  return Object.entries(candidate.features).every(
    ([key, enabled]) =>
      (allFeatureKeys as readonly string[]).includes(key) &&
      typeof enabled === 'boolean',
  );
};

const reportProviderFailure = (phase: 'subscription' | 'resolve'): void => {
  // Never pass provider errors or payloads to logging; providers are external.
  SecureLogger.logError(
    new Error('Entitlement provider operation failed'),
    `entitlements.${phase}`,
  );
};

const normalizeFeatures = (
  features: Partial<Record<FeatureKey, boolean>> | undefined,
  fallback: EntitlementFeatures,
): EntitlementFeatures => {
  const normalized = {} as Record<FeatureKey, boolean>;
  allFeatureKeys.forEach(key => {
    normalized[key] = isFreeFeatureKey(key)
      ? true
      : features?.[key] === undefined
      ? fallback[key]
      : features[key] === true;
  });
  return Object.freeze(normalized);
};

/**
 * This provider is deliberately explicit rather than an implicit fallback.
 * It preserves the current production behavior until a real provider is
 * selected, while keeping provider failures fail-closed.
 */
export const initialAllEnabledProvider: EntitlementProvider = Object.freeze({
  id: 'initial-all-enabled',
  resolve: async (): Promise<EntitlementResolution> => ({
    status: 'available',
    features: allEnabledFeatures(),
  }),
});

export const createAllEnabledProvider = (): EntitlementProvider =>
  initialAllEnabledProvider;

const initialSnapshot = (): EntitlementSnapshot =>
  Object.freeze({
    providerId: initialAllEnabledProvider.id,
    status: 'available' as const,
    features: allEnabledFeatures(),
    revision: 0,
    updatedAt: null,
  });

export type EntitlementListener = () => void;

/**
 * Small observable store kept outside Redux. Entitlements are runtime state,
 * not user settings, server profile data, or persisted application state.
 */
export class EntitlementStore {
  private provider: EntitlementProvider;
  private providerSubscription: (() => void) | undefined;
  private requestId = 0;
  private snapshot: EntitlementSnapshot;
  private lastKnownFeatures: EntitlementFeatures;
  private readonly listeners = new Set<EntitlementListener>();

  public constructor(
    provider: EntitlementProvider = initialAllEnabledProvider,
  ) {
    this.provider = provider;
    this.snapshot =
      provider === initialAllEnabledProvider
        ? initialSnapshot()
        : Object.freeze({
            providerId: provider.id,
            status: 'loading' as const,
            features: providerRestrictedFeatures(),
            revision: 0,
            updatedAt: null,
          });
    this.lastKnownFeatures = this.snapshot.features;
  }

  public getSnapshot = (): EntitlementSnapshot => this.snapshot;

  public subscribe = (listener: EntitlementListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public setProvider = (provider: EntitlementProvider): Promise<void> => {
    if (this.providerSubscription) {
      try {
        this.providerSubscription();
      } catch {
        reportProviderFailure('subscription');
      }
    }
    this.providerSubscription = undefined;
    const sameProvider = this.provider.id === provider.id;
    this.provider = provider;
    const requestId = ++this.requestId;
    if (!sameProvider) {
      this.lastKnownFeatures = providerRestrictedFeatures();
    }

    this.publish({
      providerId: provider.id,
      status: 'loading',
      features: providerRestrictedFeatures(),
      updatedAt: null,
    });

    if (provider.subscribe) {
      try {
        this.providerSubscription = provider.subscribe(resolution => {
          if (requestId === this.requestId) {
            this.acceptResolution(provider.id, requestId, resolution);
          }
        });
      } catch {
        this.markUnavailable(provider.id, requestId, 'subscription');
        return Promise.resolve();
      }
    }

    return Promise.resolve()
      .then(() => provider.resolve())
      .then(resolution => {
        if (requestId === this.requestId) {
          this.acceptResolution(provider.id, requestId, resolution);
        }
      })
      .catch(() => {
        this.markUnavailable(provider.id, requestId, 'resolve');
      });
  };

  public refresh = (): Promise<void> => this.setProvider(this.provider);

  private acceptResolution = (
    providerId: string,
    requestId: number,
    resolution: unknown,
  ): void => {
    try {
      if (!isEntitlementResolution(resolution)) {
        this.markUnavailable(providerId, requestId, 'resolve');
        return;
      }
      this.applyResolution(providerId, resolution);
    } catch {
      this.markUnavailable(providerId, requestId, 'resolve');
    }
  };

  private applyResolution = (
    providerId: string,
    resolution: EntitlementResolution,
  ): void => {
    if (resolution.status === 'loading') {
      this.publish({
        providerId,
        status: 'loading',
        features: providerRestrictedFeatures(),
        updatedAt: null,
      });
      return;
    }

    const fallback =
      resolution.status === 'unavailable'
        ? providerRestrictedFeatures()
        : this.lastKnownFeatures;
    const features =
      resolution.status === 'unavailable'
        ? providerRestrictedFeatures()
        : normalizeFeatures(resolution.features, fallback);
    if (resolution.status === 'available' || resolution.status === 'stale') {
      this.lastKnownFeatures = features;
    } else if (resolution.status === 'unavailable') {
      this.lastKnownFeatures = providerRestrictedFeatures();
    }
    this.publish({
      providerId,
      status: resolution.status,
      features,
      updatedAt:
        resolution.updatedAt === undefined ? Date.now() : resolution.updatedAt,
    });
  };

  private markUnavailable = (
    providerId: string,
    requestId: number,
    phase: 'subscription' | 'resolve',
  ): void => {
    if (requestId !== this.requestId) {
      return;
    }
    reportProviderFailure(phase);
    this.lastKnownFeatures = providerRestrictedFeatures();
    this.publish({
      providerId,
      status: 'unavailable',
      features: providerRestrictedFeatures(),
      updatedAt: null,
    });
  };

  private publish = ({
    providerId,
    status,
    features,
    updatedAt,
  }: {
    providerId: string;
    status: EntitlementStatus;
    features: EntitlementFeatures;
    updatedAt: number | null;
  }): void => {
    this.snapshot = Object.freeze({
      providerId,
      status,
      features: Object.isFrozen(features)
        ? features
        : Object.freeze({...features}),
      revision: this.snapshot.revision + 1,
      updatedAt,
    });
    this.listeners.forEach(listener => listener());
  };
}

export const entitlementStore = new EntitlementStore();

const EntitlementStoreContext = React.createContext<EntitlementStore>(
  entitlementStore,
);

export interface EntitlementsProviderProps {
  readonly children: ReactNode;
  readonly provider?: EntitlementProvider;
  readonly store?: EntitlementStore;
}

export const EntitlementsProvider = ({
  children,
  provider = initialAllEnabledProvider,
  store,
}: EntitlementsProviderProps) => {
  const [defaultStore] = useState(
    () =>
      store ||
      (provider === initialAllEnabledProvider
        ? entitlementStore
        : new EntitlementStore(provider)),
  );
  const providerRef = useRef<EntitlementProvider>();

  useEffect(() => {
    if (
      providerRef.current?.id !== provider.id ||
      defaultStore.getSnapshot().providerId !== provider.id
    ) {
      providerRef.current = provider;
      defaultStore.setProvider(provider);
    }
  }, [defaultStore, provider]);

  return (
    <EntitlementStoreContext.Provider value={defaultStore}>
      {children}
    </EntitlementStoreContext.Provider>
  );
};

export const useEntitlementStore = (): EntitlementStore =>
  useContext(EntitlementStoreContext);

export const useEntitlementSnapshot = (): EntitlementSnapshot => {
  const store = useEntitlementStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
};

export const selectEntitlementStatus = (
  snapshot: EntitlementSnapshot,
): EntitlementStatus => snapshot.status;

export const selectEntitlementFeatures = (
  snapshot: EntitlementSnapshot,
): EntitlementFeatures => snapshot.features;

export const selectFeatureEntitlement = (
  snapshot: EntitlementSnapshot,
  featureKey: FeatureKey,
): FeatureEntitlement =>
  isFreeFeatureKey(featureKey) ||
  (snapshot.status !== 'unavailable' &&
    snapshot.status !== 'loading' &&
    snapshot.features[featureKey])
    ? 'enabled'
    : 'disabled';

export const selectFeatureEnabled = (
  snapshot: EntitlementSnapshot,
  featureKey: FeatureKey,
): boolean => selectFeatureEntitlement(snapshot, featureKey) === 'enabled';

export const selectCapabilityEnabled = selectFeatureEnabled;

export const useFeatureEntitlement = (
  featureKey: FeatureKey,
): FeatureEntitlement =>
  selectFeatureEntitlement(useEntitlementSnapshot(), featureKey);

export const useFeatureEnabled = (featureKey: FeatureKey): boolean =>
  useFeatureEntitlement(featureKey) === 'enabled';

export const useCapabilityEnabled = useFeatureEnabled;

export class FeatureUnavailableError extends Error {
  public readonly featureKey: FeatureKey;
  public readonly status: EntitlementStatus;

  public constructor(featureKey: FeatureKey, status: EntitlementStatus) {
    super(`Feature "${featureKey}" is not available (${status})`);
    this.name = 'FeatureUnavailableError';
    this.featureKey = featureKey;
    this.status = status;
  }
}

export const assertFeatureEnabled = (
  snapshot: EntitlementSnapshot,
  featureKey: FeatureKey,
): void => {
  if (!selectFeatureEnabled(snapshot, featureKey)) {
    throw new FeatureUnavailableError(featureKey, snapshot.status);
  }
};

export const guardFeatureAction = <Args extends unknown[], Result>(
  featureKey: FeatureKey,
  action: (...args: Args) => Result,
  getSnapshot: () => EntitlementSnapshot = entitlementStore.getSnapshot,
): ((...args: Args) => Result | undefined) =>
  (...args: Args): Result | undefined => {
    const snapshot = getSnapshot();
    return selectFeatureEnabled(snapshot, featureKey)
      ? action(...args)
      : undefined;
  };

export const useFeatureAction = <Args extends unknown[], Result>(
  featureKey: FeatureKey,
  action: (...args: Args) => Result,
): ((...args: Args) => Result | undefined) => {
  const store = useEntitlementStore();
  useEntitlementSnapshot();
  return useCallback(
    (...args: Args): Result | undefined =>
      selectFeatureEnabled(store.getSnapshot(), featureKey)
        ? action(...args)
        : undefined,
    [action, featureKey, store],
  );
};

export const guardAction = guardFeatureAction;
export const guardCapabilityAction = guardFeatureAction;
