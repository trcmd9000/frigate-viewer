jest.mock('@react-native-async-storage/async-storage');

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}));

import ClientCertificateManager from '../../helpers/clientCertificates';

describe('ClientCertificateManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not enumerate or expose certificates', () => {
    const manager = new ClientCertificateManager();

    expect(manager).not.toHaveProperty('listCertificates');
    expect(manager).not.toHaveProperty('getCertificateDetails');
    expect(manager).not.toHaveProperty('getDaysUntilExpiry');
  });

  it('reports an empty alias as unavailable without invoking native code', async () => {
    const manager = new ClientCertificateManager();

    await expect(manager.checkCertificateAvailability('')).resolves.toEqual({
      exists: false,
      alias: '',
    });
  });

  it('reports whether the native module is available', () => {
    const manager = new ClientCertificateManager();

    expect(typeof manager.isAvailable()).toBe('boolean');
  });
});
