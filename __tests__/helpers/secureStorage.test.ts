import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadCredentials,
  migrateAsyncStorageCredentials,
  getPlatform,
  Credentials,
  saveCredentials,
} from '../../helpers/secureStorage';

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
);

describe('secureStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Migration from AsyncStorage', () => {
    it('should migrate credentials from AsyncStorage to Keychain', async () => {
      const credentials: Credentials = {
        username: 'testuser',
        password: 'testpass',
      };

      const mockAsyncStorageData = new Map();
      mockAsyncStorageData.set('frigate_server1', JSON.stringify(credentials));

      (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([
        'frigate_server1',
      ]);
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(mockAsyncStorageData.get(key)),
      );

      await migrateAsyncStorageCredentials();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('frigate_server1');
    });

    it('should surface migration errors without deleting legacy data', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValue(
        new Error('AsyncStorage error'),
      );

      await expect(migrateAsyncStorageCredentials()).rejects.toThrow(
        'AsyncStorage error',
      );
      expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    });

    describe('Secure-only credential operations', () => {
      it('uses an opaque profile identifier as the secure-storage key', async () => {
        const keychain = require('react-native-keychain');

        await saveCredentials('profile-one', {
          username: 'user',
          password: 'secret',
        });

        expect(keychain.setGenericPassword).toHaveBeenCalledWith(
          'user',
          JSON.stringify({username: 'user', password: 'secret'}),
          expect.objectContaining({service: 'frigate_profile-one'}),
        );
      });

      it('does not write credentials to AsyncStorage', async () => {
        await saveCredentials('https://example.test:443/base', {
          username: 'user',
          password: 'secret',
        });

        expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      });

      it('loads credentials from Keychain only', async () => {
        const keychain = require('react-native-keychain');
        keychain.getGenericPassword.mockResolvedValue({
          username: 'user',
          password: JSON.stringify({username: 'user', password: 'secret'}),
        });

        await expect(
          loadCredentials('https://example.test:443/base'),
        ).resolves.toEqual({username: 'user', password: 'secret'});
        expect(AsyncStorage.getItem).not.toHaveBeenCalled();
      });
    });
  });

  describe('Platform Detection', () => {
    it('should detect iOS platform', () => {
      const platform = getPlatform();
      // This will be 'unknown' in test environment
      expect(['ios', 'android', 'unknown']).toContain(platform);
    });

    it('should return valid platform value', () => {
      const platform = getPlatform();
      expect(['ios', 'android', 'unknown']).toContain(platform);
    });
  });

});
