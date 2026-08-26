import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {
  ISecureStorageProvider,
  getStorageProvider,
} from './storage/StorageProvider';

let KeychainModule: any = null;

// Try to load react-native-keychain, gracefully fallback if not available
try {
  KeychainModule = require('react-native-keychain');
} catch (error) {
  console.warn(
    'react-native-keychain not available, using AsyncStorage fallback:',
    error,
  );
  KeychainModule = null;
}

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Secure Storage Helper - Uses Keychain on iOS and Keystore on Android
 * Falls back to AsyncStorage if native modules are not available (development mode)
 *
 * This module serves as the main API for all secure storage operations,
 * delegating to the appropriate storage provider based on platform.
 */

const isKeychainAvailable = (): boolean => {
  return KeychainModule !== null;
};

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
const CERT_PASSWORD_PREFIX = 'cert_password_';

/**
 * Generates a unique keychain service identifier for a server
 */
const getServiceKey = (serverUrl: string): string => {
  return `${KEYCHAIN_PREFIX}${serverUrl}`;
};

// Singleton instance for storage provider
let storageProvider: ISecureStorageProvider | null = null;

const getStorageProviderInstance = (): ISecureStorageProvider => {
  if (!storageProvider) {
    storageProvider = getStorageProvider();
  }
  return storageProvider;
};

/**
 * Save credentials securely to Keychain/Keystore or AsyncStorage (fallback)
 */
export const saveCredentials = async (
  serverUrl: string,
  credentials: Credentials,
): Promise<void> => {
  try {
    if (isKeychainAvailable()) {
      // Use Keychain on iOS and Keystore on Android
      const service = getServiceKey(serverUrl);
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
    } else {
      // Fallback to AsyncStorage for development
      const key = `${KEYCHAIN_PREFIX}${serverUrl}`;
      await AsyncStorage.setItem(key, JSON.stringify(credentials));
    }
  } catch (error) {
    console.error(`Failed to save credentials for ${serverUrl}:`, error);
    throw error;
  }
};

/**
 * Load credentials from Keychain/Keystore or AsyncStorage (fallback)
 */
export const loadCredentials = async (
  serverUrl: string,
): Promise<Credentials | null> => {
  try {
    if (isKeychainAvailable()) {
      const service = getServiceKey(serverUrl);
      const credentials = await KeychainModule.getGenericPassword({service});

      if (!credentials) {
        return null;
      }

      // Credentials are stored as JSON string in password field
      try {
        return JSON.parse(credentials.password);
      } catch {
        // Fallback to old format (if upgrading from old version)
        return {
          username: credentials.username,
          password: credentials.password,
        };
      }
    } else {
      // Fallback to AsyncStorage for development
      const key = `${KEYCHAIN_PREFIX}${serverUrl}`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    }
  } catch (error) {
    console.error(`Failed to load credentials for ${serverUrl}:`, error);
    return null;
  }
};

/**
 * Remove credentials from Keychain/Keystore or AsyncStorage (fallback)
 */
export const removeCredentials = async (serverUrl: string): Promise<void> => {
  try {
    if (isKeychainAvailable()) {
      const service = getServiceKey(serverUrl);
      await KeychainModule.resetGenericPassword({service});
    } else {
      const key = `${KEYCHAIN_PREFIX}${serverUrl}`;
      await AsyncStorage.removeItem(key);
    }
  } catch (error) {
    console.error(`Failed to remove credentials for ${serverUrl}:`, error);
  }
};

/**
 * Save certificate password (RAM-only, not persisted across app restarts)
 * This is stored in-memory only for security
 */
const certPasswordCache = new Map<string, string>();

export const saveCertificatePassword = async (
  serverId: string,
  password: string,
): Promise<void> => {
  const key = `${CERT_PASSWORD_PREFIX}${serverId}`;
  certPasswordCache.set(key, password);
};

/**
 * Alias for saveCertificatePassword with old signature for backward compatibility
 */
export const saveCertPassword = async (
  serverUrl: string,
  certAlias: string,
  password: string,
): Promise<void> => {
  const key = `${CERT_PASSWORD_PREFIX}${serverUrl}:${certAlias}`;
  certPasswordCache.set(key, password);
};

/**
 * Load certificate password from RAM cache (not persistent)
 */
export const loadCertificatePassword = async (
  serverId: string,
): Promise<string | null> => {
  const key = `${CERT_PASSWORD_PREFIX}${serverId}`;
  return certPasswordCache.get(key) || null;
};

/**
 * Alias for loadCertificatePassword with old signature for backward compatibility
 */
export const loadCertPassword = async (
  serverUrl: string,
  certAlias: string,
): Promise<string | null> => {
  const key = `${CERT_PASSWORD_PREFIX}${serverUrl}:${certAlias}`;
  return certPasswordCache.get(key) || null;
};

/**
 * Remove certificate password from RAM cache
 */
export const clearCertificatePassword = async (
  serverId: string,
): Promise<void> => {
  const key = `${CERT_PASSWORD_PREFIX}${serverId}`;
  certPasswordCache.delete(key);
};

/**
 * Alias for clearCertificatePassword with old signature for backward compatibility
 */
export const removeCertPassword = async (
  serverUrl: string,
  certAlias: string,
): Promise<void> => {
  const key = `${CERT_PASSWORD_PREFIX}${serverUrl}:${certAlias}`;
  certPasswordCache.delete(key);
};

/**
 * Clear all certificate passwords from RAM cache
 */
export const clearAllCertPasswords = (): void => {
  certPasswordCache.clear();
};

/**
 * Migrate old AsyncStorage credentials to Keychain/Keystore
 * This is called on app initialization to handle upgrades
 */
export const migrateAsyncStorageCredentials = async (): Promise<void> => {
  if (!isKeychainAvailable()) {
    return; // No migration needed if keychain is not available
  }

  try {
    // Get all keys from AsyncStorage
    const allKeys = await AsyncStorage.getAllKeys();
    const credentialKeys = allKeys.filter(key =>
      key.startsWith(KEYCHAIN_PREFIX),
    );

    let migratedCount = 0;
    for (const key of credentialKeys) {
      try {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const credentials = JSON.parse(data);
          const serverUrl = key.substring(KEYCHAIN_PREFIX.length);

          // Save to keychain
          await saveCredentials(serverUrl, credentials);

          // Remove from AsyncStorage after successful migration
          await AsyncStorage.removeItem(key);
          migratedCount++;
          console.log(`Migrated credentials for ${serverUrl} to Keychain`);
        }
      } catch (error) {
        console.error(`Failed to migrate credentials for ${key}:`, error);
      }
    }

    if (migratedCount > 0) {
      console.log(
        `Successfully migrated ${migratedCount} credential(s) to secure storage`,
      );
    }
  } catch (error) {
    console.error('Error during credential migration:', error);
  }
};

/**
 * Initialize secure storage on app startup
 * Performs necessary migrations and setup
 */
export const initializeSecureStorage = async (): Promise<void> => {
  try {
    // Run migration if needed
    await migrateAsyncStorageCredentials();

    // Initialize storage provider
    getStorageProviderInstance();

    console.log(`Secure storage initialized (Platform: ${getPlatform()})`);
  } catch (error) {
    console.error('Failed to initialize secure storage:', error);
  }
};
