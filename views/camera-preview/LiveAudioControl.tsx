import React, {FC} from 'react';
import {Text, View} from 'react-native';
import {useIntl} from 'react-intl';
import {AudioToggle} from '../../components/media/AudioToggle';
import {useStyles} from '../../helpers/colors';
import type {ProtectedAudioStatus} from '../../helpers/protectedAudio';

interface LiveAudioControlProps {
  muted: boolean;
  onToggle: () => void;
  disabled?: boolean;
  status?: ProtectedAudioStatus;
}

export const LiveAudioControl: FC<LiveAudioControlProps> = ({
  muted,
  onToggle,
  disabled = false,
  status,
}) => {
  const intl = useIntl();
  const hint = status?.state === 'pending'
    ? intl.formatMessage({id: 'cameraPreview.audio.pending', defaultMessage: 'Activating audio… Tap to cancel.'})
    : disabled
      ? intl.formatMessage({id: 'cameraPreview.audio.unavailableHint', defaultMessage: 'No audio is available in this live stream.'})
      : status?.state === 'failed'
        ? intl.formatMessage({
            id: `cameraPreview.audio.failure.${status.reason}`,
            defaultMessage: status.reason === 'timeout'
              ? 'Audio activation timed out. Tap to retry.'
              : status.reason === 'focus-denied'
                ? 'Audio focus was not granted. Tap to retry.'
                : 'Audio could not be activated. Tap to retry.',
          })
        : undefined;
  const styles = useStyles(({theme}) => ({
    audioControls: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 24,
      zIndex: 4,
      alignItems: 'center',
    },
    hint: {
      color: theme.mediaText,
      backgroundColor: theme.mediaOverlay,
      borderRadius: 8,
      padding: 8,
      marginTop: 4,
      marginHorizontal: 16,
      textAlign: 'center',
    },
  }));

  return (
    <View testID="camera-preview-audio-container" pointerEvents="box-none" style={styles.audioControls}>
      <AudioToggle
        testID="camera-preview-audio"
        slashTestID="camera-preview-audio-slash"
        muted={muted}
        onToggle={onToggle}
        disabled={disabled}
        status={status}
        hint={hint}
      />
      {hint && (
        <View pointerEvents="none">
          <Text testID="camera-preview-audio-hint" accessibilityLiveRegion="polite" style={styles.hint}>{hint}</Text>
        </View>
      )}
    </View>
  );
};
