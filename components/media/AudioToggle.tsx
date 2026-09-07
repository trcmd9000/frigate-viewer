import {IconOutline} from '@ant-design/icons-react-native';
import React, {FC} from 'react';
import {Pressable, View} from 'react-native';
import {useIntl} from 'react-intl';
import {useStyles, useTheme} from '../../helpers/colors';

interface AudioToggleProps {
  muted: boolean;
  onToggle: () => void;
  testID?: string;
  slashTestID?: string;
}

export const AudioToggle: FC<AudioToggleProps> = ({
  muted,
  onToggle,
  testID,
  slashTestID,
}) => {
  const theme = useTheme();
  const intl = useIntl();
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
    slash: {
      position: 'absolute',
      width: 27,
      height: 2,
      borderRadius: 1,
      backgroundColor: palette.mediaText,
      transform: [{rotate: '-45deg'}],
    },
  }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={intl.formatMessage({
        id: muted ? 'cameraPreview.audio.enable' : 'cameraPreview.audio.mute',
        defaultMessage: muted ? 'Enable audio' : 'Disable audio',
      })}
      accessibilityState={{checked: !muted}}
      onPress={onToggle}
      style={styles.button}
    >
      <View style={styles.iconContainer}>
        <IconOutline
          accessible={false}
          name="sound"
          color={theme.mediaText}
          size={22}
        />
        {muted && (
          <View
            testID={slashTestID}
            accessible={false}
            pointerEvents="none"
            style={styles.slash}
          />
        )}
      </View>
    </Pressable>
  );
};
