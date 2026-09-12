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
    const credentialString = JSON.stringify(credentials);

    await KeychainModule.setGenericPassword(
      credentials.username,
      credentialString,
      {
        service,
        accessible: Platform.select({
          ios: KeychainModule.ACCESSIBLE.WHEN_UNLOCKED,
          android: KeychainModule.ACCESSIBLE.WHEN_UNLOCKED,
        }),
        storage: Platform.select({
          android: KeychainModule.STORAGE_TYPE.AES,
        }),
      },
    );
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

    // Credentials are stored as JSON string in the Keychain password field.
    try {
      return JSON.parse(credentials.password);
    } catch {
      // Preserve compatibility with the old Keychain format.
      return {
        username: credentials.username,
        password: credentials.password,
      };
    }
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
          const credentials = JSON.parse(data);
          const storageKey = key.substring(KEYCHAIN_PREFIX.length);

          // Save to keychain
          await saveCredentials(storageKey, credentials);

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
