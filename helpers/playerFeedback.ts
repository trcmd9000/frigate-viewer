import {NativeModules, Platform} from 'react-native';
import {SecureLogger} from './secureLogger';

export type PlaybackAction =
  | 'play'
  | 'pause'
  | 'replay'
  | 'seekBackward'
  | 'seekForward';

export interface PlaybackFeedback {
  action: PlaybackAction;
  amount?: number;
  id: number;
}

interface NativePlayerFeedbackModule {
  performTransportFeedback(): Promise<boolean>;
}

const nativePlayerFeedback = NativeModules.PlayerFeedbackModule as
  | NativePlayerFeedbackModule
  | undefined;

export const performTransportHaptic = (): void => {
  if (Platform.OS !== 'android') {
    return;
  }

  if (!nativePlayerFeedback?.performTransportFeedback) {
    SecureLogger.logError(
      new Error('PlayerFeedbackModule is unavailable'),
      'player-feedback.haptic',
    );
    return;
  }

  nativePlayerFeedback.performTransportFeedback().catch(error => {
    SecureLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      'player-feedback.haptic',
    );
  });
};
