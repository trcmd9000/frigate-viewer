import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';

/**
 * Interface for secure storage providers
 * Defines the contract for different storage implementations
 */
export interface ISecureStorageProvider {
  /**
   * Save a key-value pair securely
   */
  save(key: string, value: string, options?: StorageOptions): Promise<void>;

  /**
   * Load a value by key
   */
  load(key: string): Promise<string | null>;

  /**
   * Remove a key-value pair
   */
  remove(key: string): Promise<void>;

  /**
   * Check if a key exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get all keys
   */
  getAllKeys(): Promise<string[]>;

  /**
   * Clear all stored data
   */
  clear(): Promise<void>;

  /**
   * Get the storage provider type
   */
  getType(): StorageType;

  /**
   * Get the platform this provider is for
   */
  getPlatform(): 'ios' | 'android' | 'unknown';
}

/**
 * Storage configuration options
 */
export interface StorageOptions {
  /**
   * Service identifier (used for Keychain/Keystore)
   */
  service?: string;

  /**
   * Access level for the stored data
   */
  accessible?: 'whenUnlocked' | 'whenUnlockedThisDeviceOnly';

  /**
   * Whether this is sensitive data (e.g., passwords)
   */
  sensitive?: boolean;
}

/**
 * Storage provider types
 */
export enum StorageType {
  KEYCHAIN = 'keychain',
  KEYSTORE = 'keystore',
  ASYNC_STORAGE = 'asyncStorage',
  UNKNOWN = 'unknown',
}

let KeychainModule: any = null;

// Try to load react-native-keychain, gracefully fallback if not available
try {
  KeychainModule = require('react-native-keychain');
} catch (error) {
  console.warn(
    'react-native-keychain not available, using AsyncStorage fallback',
  );
  KeychainModule = null;
}

/**
 * iOS Keychain Storage Provider
 * Uses native iOS Keychain for secure credential storage
 */
class KeychainStorageProvider implements ISecureStorageProvider {
  private readonly keyPrefix = 'frigate_';

  async save(
    key: string,
    value: string,
    options?: StorageOptions,
  ): Promise<void> {
    if (!KeychainModule) {
      throw new Error('Keychain module not available');
    }

    try {
      const fullKey = this.keyPrefix + key;
      const service = options?.service || 'com.frigate.viewer';

      await KeychainModule.setGenericPassword(fullKey, value, {
        service,
        accessible:
          options?.accessible === 'whenUnlockedThisDeviceOnly'
            ? KeychainModule.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
            : KeychainModule.ACCESSIBLE.WHEN_UNLOCKED,
      });
    } catch (error) {
      console.error(`Failed to save to Keychain: ${key}`, error);
      throw error;
    }
  }

  async load(key: string): Promise<string | null> {
    if (!KeychainModule) {
      return null;
    }

    try {
      const fullKey = this.keyPrefix + key;
      const service = 'com.frigate.viewer';

      const result = await KeychainModule.getGenericPassword({service});

      if (!result || result.username !== fullKey) {
        return null;
      }

      return result.password;
    } catch (error) {
      console.error(`Failed to load from Keychain: ${key}`, error);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    if (!KeychainModule) {
      return;
    }

    try {
      const service = 'com.frigate.viewer';
      await KeychainModule.resetGenericPassword({service});
    } catch (error) {
      console.error(`Failed to remove from Keychain: ${key}`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.load(key);
    return value !== null;
  }

  async getAllKeys(): Promise<string[]> {
    return [];
  }

  async clear(): Promise<void> {
    console.warn('Keychain does not support clearing all items at once');
  }

  getType(): StorageType {
    return StorageType.KEYCHAIN;
  }

  getPlatform(): 'ios' | 'android' | 'unknown' {
    return 'ios';
  }
}

/**
 * Android Keystore Storage Provider
 * Uses native Android Keystore for secure credential storage
 */
class KeystoreStorageProvider implements ISecureStorageProvider {
  private readonly keyPrefix = 'frigate_';

  async save(
    key: string,
    value: string,
    options?: StorageOptions,
  ): Promise<void> {
    if (!KeychainModule) {
      throw new Error('Keystore module not available');
    }

    try {
      const fullKey = this.keyPrefix + key;
      const service = options?.service || 'com.frigate.viewer';

      await KeychainModule.setGenericPassword(fullKey, value, {
        service,
        accessible: KeychainModule.ACCESSIBLE.WHEN_UNLOCKED,
        storage: KeychainModule.STORAGE_TYPE.AES,
      });
    } catch (error) {
      console.error(`Failed to save to Keystore: ${key}`, error);
      throw error;
    }
  }

  async load(key: string): Promise<string | null> {
    if (!KeychainModule) {
      return null;
    }

    try {
      const fullKey = this.keyPrefix + key;
      const service = 'com.frigate.viewer';

      const result = await KeychainModule.getGenericPassword({service});

      if (!result || result.username !== fullKey) {
        return null;
      }

      return result.password;
    } catch (error) {
      console.error(`Failed to load from Keystore: ${key}`, error);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    if (!KeychainModule) {
      return;
    }

    try {
      const service = 'com.frigate.viewer';
      await KeychainModule.resetGenericPassword({service});
    } catch (error) {
      console.error(`Failed to remove from Keystore: ${key}`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.load(key);
    return value !== null;
  }

  async getAllKeys(): Promise<string[]> {
    return [];
  }

  async clear(): Promise<void> {
    console.warn('Keystore does not support clearing all items at once');
  }

  getType(): StorageType {
    return StorageType.KEYSTORE;
  }

  getPlatform(): 'ios' | 'android' | 'unknown' {
    return 'android';
  }
}

/**
 * AsyncStorage Fallback Provider
 * Uses React Native AsyncStorage as fallback (less secure, for development)
 */
class AsyncStorageProvider implements ISecureStorageProvider {
  private readonly keyPrefix = 'frigate_';

  async save(
    key: string,
    value: string,
    _options?: StorageOptions,
  ): Promise<void> {
    try {
      const fullKey = this.keyPrefix + key;
      await AsyncStorage.setItem(fullKey, value);
    } catch (error) {
      console.error(`Failed to save to AsyncStorage: ${key}`, error);
      throw error;
    }
  }

  async load(key: string): Promise<string | null> {
    try {
      const fullKey = this.keyPrefix + key;
      return await AsyncStorage.getItem(fullKey);
    } catch (error) {
      console.error(`Failed to load from AsyncStorage: ${key}`, error);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const fullKey = this.keyPrefix + key;
      await AsyncStorage.removeItem(fullKey);
    } catch (error) {
      console.error(`Failed to remove from AsyncStorage: ${key}`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.load(key);
    return value !== null;
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      return allKeys.filter(k => k.startsWith(this.keyPrefix));
    } catch (error) {
      console.error('Failed to get all keys from AsyncStorage', error);
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.getAllKeys();
      await AsyncStorage.multiRemove(keys);
    } catch (error) {
      console.error('Failed to clear AsyncStorage', error);
    }
  }

  getType(): StorageType {
    return StorageType.ASYNC_STORAGE;
  }

  getPlatform(): 'ios' | 'android' | 'unknown' {
    return 'unknown';
  }
}

/**
 * Factory function to get the appropriate storage provider
 * Uses platform detection to select the best available storage
 */
export const getStorageProvider = (): ISecureStorageProvider => {
  if (Platform.OS === 'ios' && KeychainModule) {
    console.log('Using iOS Keychain storage provider');
    return new KeychainStorageProvider();
  }

  if (Platform.OS === 'android' && KeychainModule) {
    console.log('Using Android Keystore storage provider');
    return new KeystoreStorageProvider();
  }

  console.log('Using AsyncStorage fallback provider');
  return new AsyncStorageProvider();
};

/**
 * Get storage provider for a specific platform (useful for testing)
 */
export const getStorageProviderForPlatform = (
  platform: 'ios' | 'android' | 'unknown',
): ISecureStorageProvider => {
  switch (platform) {
    case 'ios':
      return KeychainModule
        ? new KeychainStorageProvider()
        : new AsyncStorageProvider();
    case 'android':
      return KeychainModule
        ? new KeystoreStorageProvider()
        : new AsyncStorageProvider();
    default:
      return new AsyncStorageProvider();
  }
};
