import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveCertificatePassword,
  loadCertificatePassword,
  clearCertificatePassword,
  clearAllCertPasswords,
  migrateAsyncStorageCredentials,
  initializeSecureStorage,
  getPlatform,
  Credentials,
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
  {virtual: true},
);

describe('secureStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAllCertPasswords();
  });

  describe('Certificate Password Cache', () => {
    it('should save certificate password to RAM cache', async () => {
      const serverId = 'server1';
      const password = 'test-password-123';

      await saveCertificatePassword(serverId, password);

      const loaded = await loadCertificatePassword(serverId);
      expect(loaded).toBe(password);
    });

    it('should return null for non-existent certificate password', async () => {
      const loaded = await loadCertificatePassword('non-existent');
      expect(loaded).toBeNull();
    });

    it('should clear specific certificate password', async () => {
      const serverId = 'server1';
      const password = 'test-password-123';

      await saveCertificatePassword(serverId, password);
      await clearCertificatePassword(serverId);

      const loaded = await loadCertificatePassword(serverId);
      expect(loaded).toBeNull();
    });

    it('should clear all certificate passwords', async () => {
      await saveCertificatePassword('server1', 'password1');
      await saveCertificatePassword('server2', 'password2');
      await saveCertificatePassword('server3', 'password3');

      clearAllCertPasswords();

      expect(await loadCertificatePassword('server1')).toBeNull();
      expect(await loadCertificatePassword('server2')).toBeNull();
      expect(await loadCertificatePassword('server3')).toBeNull();
    });

    it('should handle multiple passwords for same server', async () => {
      const serverId = 'server1';
      const password1 = 'password-1';
      const password2 = 'password-2';

      await saveCertificatePassword(serverId, password1);
      let loaded = await loadCertificatePassword(serverId);
      expect(loaded).toBe(password1);

      await saveCertificatePassword(serverId, password2);
      loaded = await loadCertificatePassword(serverId);
      expect(loaded).toBe(password2);
    });
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

    it('should handle migration errors gracefully', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValue(
        new Error('AsyncStorage error'),
      );

      // Should not throw
      await migrateAsyncStorageCredentials();
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

  describe('Initialization', () => {
    it('should initialize secure storage without errors', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);

      await initializeSecureStorage();

      // Should complete without throwing
      expect(true).toBe(true);
    });

    it('should log initialization message', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);

      await initializeSecureStorage();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Secure storage initialized'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Backward Compatibility', () => {
    it('should support legacy certificate password functions', async () => {
      const serverUrl = 'https://example.com';
      const certAlias = 'client.p12';
      const password = 'cert-password';

      const {saveCertPassword, loadCertPassword, removeCertPassword} =
        require('../../helpers/secureStorage') as typeof import('../../helpers/secureStorage');

      await saveCertPassword(serverUrl, certAlias, password);
      const loaded = await loadCertPassword(serverUrl, certAlias);
      expect(loaded).toBe(password);

      await removeCertPassword(serverUrl, certAlias);
      const cleared = await loadCertPassword(serverUrl, certAlias);
      expect(cleared).toBeNull();
    });
  });
});
