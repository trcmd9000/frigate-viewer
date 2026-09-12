const mockNativeModule = {
  acquireAudioFocus: jest.fn(),
  releaseAudio: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

let mockFocusListener: ((event: unknown) => void) | undefined;

jest.mock('react-native', () => {
  class MockNativeEventEmitter {
    addListener(_eventName: string, listener: (event: unknown) => void) {
      mockFocusListener = listener;
      return {remove: jest.fn()};
    }
  }
  return {
    Platform: {OS: 'android'},
    NativeModules: {
      ProtectedAudioModule: mockNativeModule,
    },
    NativeEventEmitter: MockNativeEventEmitter,
  };
});

import {NativeModules, Platform} from 'react-native';
import {SecureLogger} from '../../helpers/secureLogger';
import {
  acquireProtectedAudio,
  addProtectedAudioFocusLostListener,
  releaseProtectedAudio,
} from '../../helpers/protectedAudio';

describe('protected audio native bridge', () => {
  beforeAll(() => {
    jest.spyOn(SecureLogger, 'logError');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as {OS: string}).OS = 'android';
    Object.defineProperty(NativeModules, 'ProtectedAudioModule', {
      configurable: true,
      value: mockNativeModule,
    });
    mockNativeModule.acquireAudioFocus.mockResolvedValue('owner-token-123456');
  });

  it('verifies the registered bridge contract', () => {
    expect(typeof NativeModules.ProtectedAudioModule.acquireAudioFocus).toBe(
      'function',
    );
    expect(typeof NativeModules.ProtectedAudioModule.releaseAudio).toBe(
      'function',
    );
  });

  it('requires the registered native module on Android', async () => {
    const acquire = mockNativeModule.acquireAudioFocus;
    mockNativeModule.acquireAudioFocus = undefined as never;

    await expect(acquireProtectedAudio()).rejects.toThrow(
      'Protected audio native module is unavailable',
    );

    mockNativeModule.acquireAudioFocus = acquire;
  });

  it('rejects invalid native owner tokens', async () => {
    expect(Platform.OS).toBe('android');
    expect(typeof mockNativeModule.acquireAudioFocus).toBe('function');
    expect(typeof mockNativeModule.releaseAudio).toBe('function');
    expect(typeof mockNativeModule.addListener).toBe('function');
    expect(typeof mockNativeModule.removeListeners).toBe('function');
    mockNativeModule.acquireAudioFocus.mockResolvedValue('bad');

    await expect(acquireProtectedAudio()).rejects.toThrow(
      'Protected audio returned an invalid lease',
    );
    expect(SecureLogger.logError).toHaveBeenCalled();
  });

  it('passes opaque owner tokens and focus-loss ownership through the bridge', async () => {
    const listener = jest.fn();
    const subscription = addProtectedAudioFocusLostListener(listener);
    const token = await acquireProtectedAudio();

    expect(token).toBe('owner-token-123456');
    expect(mockNativeModule.acquireAudioFocus).toHaveBeenCalledWith(null);
    mockFocusListener?.({ownerToken: token});
    expect(listener).toHaveBeenCalledWith(token);
    if (!token) {
      throw new Error('Expected an owner token');
    }
    await releaseProtectedAudio(token);
    expect(mockNativeModule.releaseAudio).toHaveBeenCalledWith(token);
    subscription?.remove();
  });

  it('has explicit no-op semantics off Android', async () => {
    (Platform as {OS: string}).OS = 'ios';

    await expect(acquireProtectedAudio()).resolves.toBe('platform-managed-audio');
    await expect(releaseProtectedAudio('platform-managed-audio')).resolves.toBeUndefined();
    expect(addProtectedAudioFocusLostListener(jest.fn())).toBeUndefined();
  });
});
