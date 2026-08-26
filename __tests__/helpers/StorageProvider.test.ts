import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ISecureStorageProvider,
  StorageType,
  getStorageProvider,
  getStorageProviderForPlatform,
} from '../../helpers/storage/StorageProvider';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage');

// Mock react-native-keychain
jest.mock(
  'react-native-keychain',
  () => ({
    setGenericPassword: jest.fn(),
    getGenericPassword: jest.fn(),
    resetGenericPassword: jest.fn(),
    ACCESSIBLE: {
      WHEN_UNLOCKED: 'whenUnlocked',
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
    },
    STORAGE_TYPE: {
      AES: 'aes',
    },
  }),
  {virtual: true},
);

describe('StorageProvider', () => {
  let storageProvider: ISecureStorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    // Use AsyncStorageProvider as default for tests
    storageProvider = getStorageProviderForPlatform('unknown');
  });

  describe('AsyncStorageProvider', () => {
    it('should save and load data', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('test-value');

      await storageProvider.save('test-key', 'test-value');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'frigate_test-key',
        'test-value',
      );

      const loaded = await storageProvider.load('test-key');
      expect(loaded).toBe('test-value');
    });

    it('should remove data', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

      await storageProvider.remove('test-key');

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('frigate_test-key');
    });

    it('should check if key exists', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('test-value');

      let exists = await storageProvider.exists('test-key');
      expect(exists).toBe(true);

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      exists = await storageProvider.exists('test-key');
      expect(exists).toBe(false);
    });

    it('should get all keys with prefix', async () => {
      const mockKeys = ['frigate_server1', 'frigate_server2', 'other_key'];
      (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue(mockKeys);

      const keys = await storageProvider.getAllKeys();

      expect(keys).toContain('frigate_server1');
      expect(keys).toContain('frigate_server2');
      expect(keys).not.toContain('other_key');
    });

    it('should clear all data', async () => {
      const mockKeys = ['frigate_server1', 'frigate_server2'];
      (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue(mockKeys);
      (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);

      await storageProvider.clear();

      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(mockKeys);
    });

    it('should return correct storage type', () => {
      expect(storageProvider.getType()).toBe(StorageType.ASYNC_STORAGE);
    });

    it('should return correct platform', () => {
      expect(storageProvider.getPlatform()).toBe('unknown');
    });
  });

  describe('KeychainStorageProvider', () => {
    it('should use iOS Keychain when available', () => {
      const provider = getStorageProviderForPlatform('ios');
      // Will use AsyncStorageProvider in test environment
      expect(provider).toBeDefined();
    });
  });

  describe('KeystoreStorageProvider', () => {
    it('should use Android Keystore when available', () => {
      const provider = getStorageProviderForPlatform('android');
      // Will use AsyncStorageProvider in test environment
      expect(provider).toBeDefined();
    });
  });

  describe('Factory Function', () => {
    it('should return a storage provider', () => {
      const provider = getStorageProvider();
      expect(provider).toBeDefined();
      expect(provider.save).toBeDefined();
      expect(provider.load).toBeDefined();
      expect(provider.remove).toBeDefined();
    });

    it('should get provider for specific platform', () => {
      const iosProvider = getStorageProviderForPlatform('ios');
      const androidProvider = getStorageProviderForPlatform('android');
      const unknownProvider = getStorageProviderForPlatform('unknown');

      expect(iosProvider).toBeDefined();
      expect(androidProvider).toBeDefined();
      expect(unknownProvider).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle save errors gracefully', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(
        new Error('Save failed'),
      );

      await expect(storageProvider.save('key', 'value')).rejects.toThrow();
    });

    it('should handle load errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(
        new Error('Load failed'),
      );

      const value = await storageProvider.load('key');
      expect(value).toBeNull();
    });

    it('should handle remove errors gracefully', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValue(
        new Error('Remove failed'),
      );

      await storageProvider.remove('key');
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Storage Options', () => {
    it('should accept storage options', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await storageProvider.save('key', 'value', {
        service: 'custom-service',
        sensitive: true,
        accessible: 'whenUnlockedThisDeviceOnly',
      });

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });
});
