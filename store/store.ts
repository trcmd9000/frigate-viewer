import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  createTransform,
} from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {configureStore} from '@reduxjs/toolkit';
import {TypedUseSelectorHook, useDispatch, useSelector} from 'react-redux';
import {
  settingsMigrations,
  settingsStore,
  State as SettingsState,
} from './settings';
import {eventsStore} from './events';
import {migrateAsyncStorageCredentials} from '../helpers/secureStorage';
import {SecureLogger} from '../helpers/secureLogger';

/**
 * Transform to handle credentials securely:
 * - Credentials are never persisted to AsyncStorage
 * - Client cert passwords are NOT persisted (RAM-only)
 * Credentials are loaded in-memory when needed (e.g., in ServerForm)
 */
const credentialsTransform = createTransform(
  // Inbound: pass through (credentials will be loaded separately)
  (inboundState: SettingsState) => inboundState,
  // Outbound: remove credentials and password cache from persisted state
  (outboundState: SettingsState) => {
    if (!outboundState || !outboundState.v1 || !outboundState.v1.servers) {
      return outboundState;
    }

    return {
      ...outboundState,
      v1: {
        ...outboundState.v1,
        servers: outboundState.v1.servers.map(server => ({
          ...server,
          // Never persist credentials
          credentials: {username: '', password: ''},
        })),
        // Never persist password cache
        clientCertPasswordCache: {},
      },
    };
  },
);

const settingsReducer = persistReducer<SettingsState>(
  {
    key: 'settings',
    storage: AsyncStorage,
    transforms: [
      credentialsTransform,
      createTransform(
        state => state,
        state => ({...state, ...settingsMigrations(state)}),
      ),
    ],
  },
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
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const persistor = persistStore(store);

// Run migration on app startup
export const initializeSecureStorage = async () => {
  try {
    await migrateAsyncStorageCredentials();
  } catch (error) {
    SecureLogger.logError(error as Error, 'secure-storage-initialization');
  }
};
