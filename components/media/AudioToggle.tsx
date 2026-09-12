import {LucideProvider, Volume, VolumeX} from 'lucide-react-native';
import React, {FC} from 'react';
import {ActivityIndicator, Pressable, View} from 'react-native';
import {useIntl} from 'react-intl';
import {useStyles, useTheme} from '../../helpers/colors';
import type {ProtectedAudioStatus} from '../../helpers/protectedAudio';

interface AudioToggleProps {
  muted: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testID?: string;
  status?: ProtectedAudioStatus;
  hint?: string;
}

export const AudioToggle: FC<AudioToggleProps> = ({
  muted,
  onToggle,
  disabled = false,
  testID,
  status,
  hint,
}) => {
  const theme = useTheme();
  const intl = useIntl();
  const pending = status?.state === 'pending';
  const failed = status?.state === 'failed';
  const unavailable = disabled && !pending;
  const styles = useStyles(({theme: palette}) => ({
    button: {
      width: 48,
      height: 48,
      minWidth: 48,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
      backgroundColor: palette.mediaOverlay,
    },
    iconContainer: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }));
  const AudioIcon = muted ? VolumeX : Volume;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={intl.formatMessage({
        id: pending
          ? 'cameraPreview.audio.cancel'
          : unavailable
          ? 'cameraPreview.audio.unavailable'
          : failed
            ? 'cameraPreview.audio.retry'
          : muted
            ? 'cameraPreview.audio.enable'
            : 'cameraPreview.audio.mute',
        defaultMessage: pending
          ? 'Cancel audio activation'
          : unavailable
          ? 'Audio unavailable'
          : failed
            ? 'Retry audio'
          : muted
            ? 'Enable audio'
            : 'Disable audio',
      })}
      accessibilityHint={hint}
      accessibilityState={
        pending ? {checked: false, busy: true} : unavailable
          ? {checked: false, disabled: true} : {checked: !muted}
      }
      onPress={onToggle}
      style={styles.button}
      disabled={unavailable ? true : undefined}
    >
      <View style={styles.iconContainer}>
        {pending ? <ActivityIndicator color={theme.mediaText} /> : (
          <LucideProvider color={theme.mediaText} size={22}>
            <AudioIcon />
          </LucideProvider>
        )}
      </View>
    </Pressable>
  );
};
