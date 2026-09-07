import React, {FC} from 'react';
import {View} from 'react-native';
import {AudioToggle} from '../../components/media/AudioToggle';
import {useStyles} from '../../helpers/colors';

interface LiveAudioControlProps {
  muted: boolean;
  onToggle: () => void;
}

export const LiveAudioControl: FC<LiveAudioControlProps> = ({
  muted,
  onToggle,
}) => {
  const styles = useStyles(() => ({
    audioControls: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 24,
      zIndex: 4,
      alignItems: 'center',
    },
  }));

  return (
    <View testID="camera-preview-audio-container" style={styles.audioControls}>
      <AudioToggle
        testID="camera-preview-audio"
        slashTestID="camera-preview-audio-slash"
        muted={muted}
        onToggle={onToggle}
      />
    </View>
  );
};
