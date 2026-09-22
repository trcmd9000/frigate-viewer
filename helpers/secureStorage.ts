import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {SecureLogger} from './secureLogger';

let KeychainModule: any = null;

// Try to load react-native-keychain. Secure credentials never use AsyncStorage.
try {
  KeychainModule = require('react-native-keychain');
} catch {
  KeychainModule = null;
}

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Secure Storage Helper - Uses Keychain on iOS and Keystore on Android.
 *
 * This module serves as the main API for all secure storage operations,
 * delegating to the appropriate storage provider based on platform.
 */

const isKeychainAvailable = (): boolean => {
  return KeychainModule !== null;
};

const secureStorageUnavailable = (): Error & {code: string} =>
  Object.assign(
    new Error('Platform secure credential storage is unavailable'),
    {code: 'SECURE_STORAGE_UNAVAILABLE'},
  );

const secureStorageWriteFailed = (): Error & {code: string} =>
  Object.assign(new Error('Platform secure credential storage write failed'), {
    code: 'SECURE_STORAGE_WRITE_FAILED',
  });

// Platform detection
export const getPlatform = (): 'ios' | 'android' | 'unknown' => {
  if (Platform.OS === 'ios') {
    return 'ios';
  }
  if (Platform.OS === 'android') {
    return 'android';
  }
  return 'unknown';
};

const KEYCHAIN_PREFIX = 'frigate_';

/**
 * Generates a unique keychain service identifier for a profile or legacy key.
 */
const getServiceKey = (storageKey: string): string => {
  return `${KEYCHAIN_PREFIX}${storageKey}`;
};

const isCredentials = (value: unknown): value is Credentials => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Credentials>;
  return (
    typeof candidate.username === 'string' &&
    typeof candidate.password === 'string'
  );
};

const writeCredentials = async (
  service: string,
  credentials: Credentials,
): Promise<void> => {
  if (!isCredentials(credentials)) {
    throw new Error('Invalid credentials for secure storage');
  }

  const result = await KeychainModule.setGenericPassword(
    credentials.username,
    JSON.stringify(credentials),
    {
      service,
      accessible: Platform.select({
        ios: KeychainModule.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        android: KeychainModule.ACCESSIBLE.WHEN_UNLOCKED,
      }),
      storage: Platform.select({
        android: KeychainModule.STORAGE_TYPE.AES,
      }),
    },
  );

  if (result === false) {
    throw secureStorageWriteFailed();
  }
};

/**
 * Save credentials securely to Keychain/Keystore.
 */
export const saveCredentials = async (
  storageKey: string,
  credentials: Credentials,
): Promise<void> => {
  try {
    if (!isKeychainAvailable()) {
      throw secureStorageUnavailable();
    }
    const service = getServiceKey(storageKey);
    await writeCredentials(service, credentials);
  } catch (error) {
    SecureLogger.logError(error as Error, 'secure-storage.save');
    throw error;
  }
};

/**
 * Load credentials from Keychain/Keystore.
 */
export const loadCredentials = async (
  storageKey: string,
): Promise<Credentials | null> => {
  try {
    if (!isKeychainAvailable()) {
      throw secureStorageUnavailable();
    }
    const service = getServiceKey(storageKey);
    const credentials = await KeychainModule.getGenericPassword({service});

    if (!credentials) {
      return null;
    }
    if (
      typeof credentials.username !== 'string' ||
      typeof credentials.password !== 'string'
    ) {
      throw new Error('Invalid credentials in secure storage');
    }

    let parsedCredentials: Credentials = {
      username: credentials.username,
      password: credentials.password,
    };
    let parsed: unknown;
    try {
      parsed = JSON.parse(credentials.password);
    } catch {
      // Preserve compatibility with the old Keychain format.
    }
    if (parsed !== undefined) {
      if (!isCredentials(parsed)) {
        throw new Error('Invalid credentials in secure storage');
      }
      parsedCredentials = parsed;
    }

    // iOS does not expose an entry's accessibility on read. Rewriting it is
    // the only way to migrate readable legacy items to device-only storage.
    // Do not return the secret unless the stronger write succeeds.
    if (Platform.OS === 'ios') {
      await writeCredentials(service, parsedCredentials);
    }
    return parsedCredentials;
  } catch (error) {
    SecureLogger.logError(error as Error, 'secure-storage.load');
    throw error;
  }
};

/**
 * Remove credentials from Keychain/Keystore.
 */
export const removeCredentials = async (storageKey: string): Promise<void> => {
  try {
    if (!isKeychainAvailable()) {
      throw secureStorageUnavailable();
    }
    const service = getServiceKey(storageKey);
    await KeychainModule.resetGenericPassword({service});
  } catch (error) {
    SecureLogger.logError(error as Error, 'secure-storage.remove');
    throw error;
  }
};

/**
 * Migrate old AsyncStorage credentials to Keychain/Keystore
 * This is called on app initialization to handle upgrades
 */
export const migrateAsyncStorageCredentials = async (): Promise<void> => {
  if (!isKeychainAvailable()) {
    throw secureStorageUnavailable();
  }

  try {
    // Get all keys from AsyncStorage
    const allKeys = await AsyncStorage.getAllKeys();
    const credentialKeys = allKeys.filter(key =>
      key.startsWith(KEYCHAIN_PREFIX),
    );

    let migratedCount = 0;
    let migrationError: unknown;
    for (const key of credentialKeys) {
      try {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const parsed: unknown = JSON.parse(data);
          if (!isCredentials(parsed)) {
            throw new Error('Invalid credentials in legacy storage');
          }
          const storageKey = key.substring(KEYCHAIN_PREFIX.length);

          // Save to keychain
          await saveCredentials(storageKey, parsed);

          // Remove from AsyncStorage after successful migration
          await AsyncStorage.removeItem(key);
          migratedCount++;
          SecureLogger.logAuth('credentials-migrated');
        }
      } catch (error) {
        SecureLogger.logError(error as Error, 'secure-storage.migrate-item');
        migrationError ||= error;
      }
    }

    if (migrationError) {
      throw migrationError;
    }

    if (migratedCount > 0) {
      SecureLogger.logAuth('credentials-migration-complete');
    }
  } catch (error) {
    SecureLogger.logError(error as Error, 'secure-storage.migrate');
    throw error;
  }
};