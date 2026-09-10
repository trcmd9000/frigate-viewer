import {
  EmitterSubscription,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';

import {SecureLogger} from './secureLogger';

export const PROTECTED_AUDIO_FOCUS_LOST_EVENT = 'protectedAudioFocusLost';
export type ProtectedAudioLease = string;
export type ProtectedAudioStatus =
  | {state: 'inactive' | 'pending' | 'active'}
  | {state: 'failed'; reason: 'focus-denied' | 'native' | 'timeout'};
const PLATFORM_MANAGED_AUDIO_LEASE = 'platform-managed-audio';

interface NativeProtectedAudioModule {
  acquireAudioFocus: (
    ownerToken: string | null,
  ) => Promise<string | null>;
  releaseAudio: (ownerToken: string) => void;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
}

const nativeModuleError = (): Error =>
  new Error('Protected audio native module is unavailable');

const getNativeModule = (): NativeProtectedAudioModule => {
  if (Platform.OS !== 'android') {
    throw new Error('Protected audio is Android-only');
  }
  const native = NativeModules.ProtectedAudioModule as
    | Partial<NativeProtectedAudioModule>
    | undefined;
  if (
    !native ||
    typeof native.acquireAudioFocus !== 'function' ||
    typeof native.releaseAudio !== 'function' ||
    typeof native.addListener !== 'function' ||
    typeof native.removeListeners !== 'function'
  ) {
    const error = nativeModuleError();
    SecureLogger.logError(error, 'protected-audio.native-module');
    throw error;
  }
  return native as NativeProtectedAudioModule;
};

const logAndRethrow = (error: unknown): never => {
  const normalized = error instanceof Error ? error : nativeModuleError();
  SecureLogger.logError(normalized, 'protected-audio.native-call');
  throw error;
};

export const acquireProtectedAudio = async (
  ownerToken?: ProtectedAudioLease,
): Promise<ProtectedAudioLease | null> => {
  if (Platform.OS !== 'android') {
    return Platform.OS === 'ios' ? PLATFORM_MANAGED_AUDIO_LEASE : null;
  }
  try {
    const result = await getNativeModule().acquireAudioFocus(ownerToken ?? null);
    if (
      result !== null &&
      (typeof result !== 'string' || result.length < 16 || result.length > 64)
    ) {
      throw new Error('Protected audio returned an invalid lease');
    }
    return result;
  } catch (error: unknown) {
    return logAndRethrow(error);
  }
};

export const releaseProtectedAudio = async (
  ownerToken: ProtectedAudioLease,
): Promise<void> => {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    getNativeModule().releaseAudio(ownerToken);
  } catch (error: unknown) {
    logAndRethrow(error);
  }
};

export const addProtectedAudioFocusLostListener = (
  listener: (ownerToken: ProtectedAudioLease | null) => void,
): EmitterSubscription | undefined => {
  if (Platform.OS !== 'android') {
    return undefined;
  }
  const native = getNativeModule();
  const emitter = new NativeEventEmitter(native);
  return emitter.addListener(
    PROTECTED_AUDIO_FOCUS_LOST_EVENT,
    (event: unknown) => {
      const token =
        typeof event === 'object' &&
        event !== null &&
        'ownerToken' in event &&
        typeof (event as {ownerToken?: unknown}).ownerToken === 'string'
          ? (event as {ownerToken: string}).ownerToken
          : null;
      listener(token);
    },
  );
};
