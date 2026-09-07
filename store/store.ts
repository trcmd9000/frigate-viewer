import {
  persistStore,
  persistReducer,
  getStoredState,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  createTransform,
} from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {configureStore, isAction, Middleware} from '@reduxjs/toolkit';
import {TypedUseSelectorHook, useDispatch, useSelector} from 'react-redux';
import {settingsMigrations, settingsStore} from './settings';
import type {ISettings, Server, State as SettingsState} from './settings';
import {eventsStore} from './events';
import {
  loadCredentials,
  migrateAsyncStorageCredentials,
  removeCredentials,
  saveCredentials,
} from '../helpers/secureStorage';
import {SecureLogger} from '../helpers/secureLogger';
import {
  clearLegacyPersistedCredential,
  credentialsPersistenceTransform,
  getLegacyPersistedCredentialsForIdentity,
  getLegacyPersistedCredentialsForProfile,
} from '../helpers/settingsPersistence';
import {
  legacyServerIdentity,
  serverIdentity,
  serverUsesClientCertificate,
} from '../helpers/serverIdentity';

const PERSISTED_SETTINGS_KEY = 'persist:settings';
let preloadedSettings: string | null | undefined;
let rehydrationError: unknown;
let persistenceWriteError: Error | undefined;

const guardedStorage = {
  getItem: (key: string): Promise<string | null> => {
    if (key === PERSISTED_SETTINGS_KEY && preloadedSettings !== undefined) {
      const settings = preloadedSettings;
      preloadedSettings = undefined;
      return Promise.resolve(settings);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string): Promise<void> =>
    AsyncStorage.setItem(key, value),
  removeItem: (key: string): Promise<void> => AsyncStorage.removeItem(key),
};

const preflightStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const value = await AsyncStorage.getItem(key);
    if (key === PERSISTED_SETTINGS_KEY) {
      preloadedSettings = value;
    }
    return value;
  },
  setItem: (key: string, value: string): Promise<void> =>
    AsyncStorage.setItem(key, value),
  removeItem: (key: string): Promise<void> => AsyncStorage.removeItem(key),
};

const captureRehydrationError: Middleware = () => next => action => {
  if (
    isAction(action) &&
    action.type === REHYDRATE &&
    'key' in action &&
    action.key === 'settings' &&
    'err' in action
  ) {
    rehydrationError = action.err;
  }
  return next(action);
};

/**
 * Transform to handle credentials securely:
 * - Credentials are never persisted to AsyncStorage
 * Credentials are loaded into memory after settings rehydration.
 */
const settingsTransforms = [
  credentialsPersistenceTransform,
  createTransform(
    (state: ISettings) => state,
    (state: ISettings) => settingsMigrations(state),
    {whitelist: ['v1']},
  ),
];

const settingsPersistConfig = {
  key: 'settings',
  storage: guardedStorage,
  writeFailHandler: (error: Error) => {
    persistenceWriteError = error;
  },
  transforms: settingsTransforms,
};

const settingsReducer = persistReducer<SettingsState>(
  settingsPersistConfig,
  settingsStore.reducer,
);

export const store = configureStore({
  reducer: {
    settings: settingsReducer,
    events: eventsStore.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).concat(captureRehydrationError),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
const manualPersistOptions = {
  manualPersist: true,
} as Parameters<typeof persistStore>[1] & {manualPersist: boolean};
export const persistor = persistStore(store, manualPersistOptions);

const credentialProfileKey = (server: Server): string => {
  const profileId = server.profileId?.trim();
  if (!profileId) {
    throw new Error('Server profile identifier is unavailable');
  }
  return profileId;
};

const legacyCredentialServiceKey = (server: Server): string =>
  serverIdentity(
    server,
    serverUsesClientCertificate(server) ? server.clientCertConfig?.alias : '',
  );

let secureStorageInitialization: Promise<void> | undefined;

const persistHydratedSettings = async (): Promise<void> => {
  // Resume only after all credentials have been moved to secure storage.
  persistor.persist();
  // Force a post-resume update so the scrubbed/migrated state replaces any
  // legacy snapshot (including the removed certificate password cache).
  store.dispatch(
    settingsStore.actions.saveSettings(store.getState().settings.v1),
  );
  persistenceWriteError = undefined;
  await persistor.flush();
  if (persistenceWriteError) {
    throw persistenceWriteError;
  }
};

const rehydratePersistedSettings = async (): Promise<void> => {
  if (persistor.getState().bootstrapped) {
    if (rehydrationError) {
      throw rehydrationError;
    }
    return;
  }

  // Fully deserialize and migrate before starting redux-persist. Failures can
  // then be retried without leaving the persisted reducer bootstrapped against
  // an empty state. The real bootstrap receives the exact snapshot read here.
  await getStoredState({
    ...settingsPersistConfig,
    storage: preflightStorage,
  });
  rehydrationError = undefined;

  const bootstrapped = new Promise<void>(resolve => {
    const unsubscribe = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) {
        unsubscribe();
        resolve();
      }
    });
  });

  persistor.persist();
  // PERSIST starts the cached read synchronously. PAUSE then suppresses every
  // write until credentials have been migrated and the state is sanitized.
  persistor.pause();
  await bootstrapped;

  if (rehydrationError) {
    throw rehydrationError;
  }
};

/**
 * Migrate legacy credentials and hydrate them into Redux memory after
 * redux-persist has rehydrated the non-secret server settings.
 */
export const initializeSecureStorage = (): Promise<void> => {
  if (!secureStorageInitialization) {
    secureStorageInitialization = (async () => {
      await rehydratePersistedSettings();
      await migrateAsyncStorageCredentials();

      const rawSettings = store.getState().settings.v1;
      const settings = settingsMigrations(rawSettings);
      const legacyIdentityCounts = new Map<string, number>();
      settings.servers.forEach(server => {
        const legacyIdentity = legacyServerIdentity(server);
        legacyIdentityCounts.set(
          legacyIdentity,
          (legacyIdentityCounts.get(legacyIdentity) || 0) + 1,
        );
      });
      const claimedOldIdentities = new Set<string>();
      const claimedLegacyIdentities = new Set<string>();
      let changed = settings !== rawSettings;
      const servers: Server[] = [];

      // Process in settings order so an ambiguous legacy key is assigned to
      // exactly one deterministic profile instead of hydrating duplicates.
      for (const server of settings.servers) {
        const profileKey = credentialProfileKey(server);
        const oldIdentity = legacyCredentialServiceKey(server);
        const endpointIdentity = legacyServerIdentity(server);
        const profilePersistedCredentials = server.profileId
          ? getLegacyPersistedCredentialsForProfile(server.profileId)
          : undefined;
        const identityPersistedEntries =
          getLegacyPersistedCredentialsForIdentity(oldIdentity);
        const identityPersistedEntry =
          identityPersistedEntries.find(
            entry => entry.profileId === server.profileId,
          ) ||
          identityPersistedEntries.find(entry => !entry.profileId);
        const identityPersistedCredentials =
          identityPersistedEntry?.credentials;
        const persistedCredentials =
          profilePersistedCredentials || identityPersistedCredentials;
        const persistedCredentialsProfileId = profilePersistedCredentials
          ? server.profileId
          : identityPersistedEntry?.profileId;

        let credentials = persistedCredentials
          ? await loadCredentials(profileKey)
          : server.auth === 'none' || !server.host
          ? null
          : await loadCredentials(profileKey);

        if (credentials && persistedCredentials) {
          clearLegacyPersistedCredential(
            oldIdentity,
            persistedCredentialsProfileId,
          );
        }

        // The current pre-profile key includes endpoint, path, and certificate
        // alias. Read it once, then move it to the opaque profile key.
        if (
          server.auth !== 'none' &&
          server.host &&
          !claimedOldIdentities.has(oldIdentity)
        ) {
          claimedOldIdentities.add(oldIdentity);
          if (!credentials) {
            credentials = await loadCredentials(oldIdentity);
            if (credentials) {
              await saveCredentials(profileKey, credentials);
              await removeCredentials(oldIdentity);
              clearLegacyPersistedCredential(
                oldIdentity,
                persistedCredentialsProfileId,
              );
            }
          }
        }

        // Also support the older endpoint-only key. It is only safe to use
        // when one configured profile can claim that key.
        if (
          !credentials &&
          server.auth !== 'none' &&
          server.host &&
          endpointIdentity !== oldIdentity &&
          legacyIdentityCounts.get(endpointIdentity) === 1 &&
          !claimedLegacyIdentities.has(endpointIdentity)
        ) {
          claimedLegacyIdentities.add(endpointIdentity);
          credentials = await loadCredentials(endpointIdentity);
          if (credentials) {
            await saveCredentials(profileKey, credentials);
            await removeCredentials(endpointIdentity);
          }
        }

        if (!credentials && persistedCredentials) {
          await saveCredentials(profileKey, persistedCredentials);
          credentials = persistedCredentials;
          clearLegacyPersistedCredential(
            oldIdentity,
            persistedCredentialsProfileId,
          );
        }

        if (credentials) {
          changed = true;
          servers.push({...server, credentials});
        } else {
          servers.push(server);
        }
      }

      if (changed) {
        store.dispatch(
          settingsStore.actions.saveSettings({...settings, servers}),
        );
      }

      await persistHydratedSettings();
    })().catch(error => {
      SecureLogger.logError(error as Error, 'secure-storage-initialization');
      throw error;
    });
  }

  return secureStorageInitialization;
};

export const resetSecureStorageInitialization = (): void => {
  secureStorageInitialization = undefined;
};

export const retrySecureStorageInitialization = (): Promise<void> => {
  resetSecureStorageInitialization();
  return initializeSecureStorage();
};
