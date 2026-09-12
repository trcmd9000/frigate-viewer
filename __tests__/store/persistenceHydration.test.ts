jest.mock('@react-native-async-storage/async-storage');
jest.mock(
  'react-native-keychain',
  () => ({
    setGenericPassword: jest.fn(),
    getGenericPassword: jest.fn(),
    resetGenericPassword: jest.fn(),
    ACCESSIBLE: {WHEN_UNLOCKED: 'whenUnlocked'},
    STORAGE_TYPE: {AES: 'aes'},
  }),
  {virtual: true},
);
jest.mock('redux-persist', () => {
  const actual = jest.requireActual('redux-persist');
  let bootstrapped = false;
  const listeners = new Set<() => void>();
  const persist = jest.fn(() => {
    bootstrapped = true;
    listeners.forEach(listener => listener());
  });
  return {
    ...actual,
    persistStore: jest.fn(() => ({
      getState: () => ({bootstrapped, registry: []}),
      subscribe: jest.fn((listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      pause: jest.fn(),
      persist,
      flush: jest.fn().mockResolvedValue(undefined),
      purge: jest.fn(),
      dispatch: jest.fn(),
    })),
  };
});

import {persistStore} from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeSecureStorage,
  resetSecureStorageInitialization,
} from '../../store/store';

describe('secure hydration persistence lifecycle', () => {
  it('does not start persistence when the settings snapshot cannot be read', async () => {
    const testPersistor = (persistStore as jest.Mock).mock.results[0].value as {
      persist: jest.Mock;
    };
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error('storage read failed'),
    );

    await expect(initializeSecureStorage()).rejects.toThrow(
      'storage read failed',
    );
    expect(testPersistor.persist).not.toHaveBeenCalled();

    resetSecureStorageInitialization();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('pauses writes during startup and resumes only after secure hydration', async () => {
    const testPersistor = (persistStore as jest.Mock).mock.results[0].value as {
      pause: jest.Mock;
      persist: jest.Mock;
      flush: jest.Mock;
    };

    expect(testPersistor.pause).not.toHaveBeenCalled();
    expect(testPersistor.persist).not.toHaveBeenCalled();

    await initializeSecureStorage();

    expect(testPersistor.persist).toHaveBeenCalledTimes(2);
    expect(testPersistor.pause).toHaveBeenCalledTimes(1);
    expect(testPersistor.flush).toHaveBeenCalledTimes(1);
    expect(testPersistor.persist.mock.invocationCallOrder[0]).toBeLessThan(
      testPersistor.flush.mock.invocationCallOrder[0],
    );
  });
});
