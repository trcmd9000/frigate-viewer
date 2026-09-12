import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadCredentials,
  saveCredentials,
} from '../../helpers/secureStorage';

jest.mock('@react-native-async-storage/async-storage');
jest.mock(
  'react-native-keychain',
  () => {
    throw new Error('secure storage unavailable');
  },
);

describe('secureStorage without a platform provider', () => {
  it('fails closed instead of writing credentials to AsyncStorage', async () => {
    await expect(
      saveCredentials('https://example.test:443', {
        username: 'user',
        password: 'secret',
      }),
    ).rejects.toMatchObject({code: 'SECURE_STORAGE_UNAVAILABLE'});

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('fails closed instead of reading credentials from AsyncStorage', async () => {
    await expect(
      loadCredentials('https://example.test:443'),
    ).rejects.toMatchObject({code: 'SECURE_STORAGE_UNAVAILABLE'});

    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });
});
