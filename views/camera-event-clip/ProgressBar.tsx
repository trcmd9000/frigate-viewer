import {IconOutline} from '@ant-design/icons-react-native';
import React, {FC, useCallback, useMemo, useState} from 'react';
import {
  DimensionValue,
  GestureResponderEvent,
  LayoutChangeEvent,
  Text,
  View,
} from 'react-native';
import {TouchableHighlight} from 'react-native-gesture-handler';
import {formatVideoTime} from '../../helpers/locale';
import {useTheme, useStyles} from '../../helpers/colors';

interface IProgressBarProps {
  paused: boolean;
  currentTime: number;
  duration: number;
  onPausePress?: (paused: boolean) => void;
  onSeek?: (pos: number) => void;
}

export const ProgressBar: FC<IProgressBarProps> = ({
  paused,
  currentTime,
  duration,
  onPausePress,
  onSeek,
}) => {
  const styles = useStyles(({theme}) => ({
    playerBar: {
      position: 'absolute',
      left: 0,
      bottom: 0,
      width: '100%',
      padding: 1,
      backgroundColor: theme.overlay,
      flexDirection: 'row',
      alignItems: 'center',
    },
    playerBarText: {
      fontSize: 10,
      fontWeight: '600',
      color: theme.text,
    },
    playerProgressBar: {
      flex: 1,
      marginHorizontal: 8,
    },
    playerProgressBarTrack: {
      height: 3,
      borderColor: theme.text,
      borderBottomWidth: 1,
    },
    playerProgressBarProgress: {
      backgroundColor: theme.text,
      height: '100%',
    },
    playerProgressBarBall: {
      position: 'absolute',
      top: -2,
      left: -4,
      width: 7,
      height: 7,
      backgroundColor: theme.text,
    },
  }));
  const theme = useTheme();

  const [ballPos, setBallPos] = useState<number | undefined>();
  const [trackWidth, setTrackWidth] = useState(0);

  const currentTimeStr = useMemo(
    () => formatVideoTime(currentTime),
    [currentTime],
  );
  const durationStr = useMemo(() => formatVideoTime(duration), [duration]);
  const percentage = useMemo(
    () => `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
    [currentTime, duration],
  );

  const play = useCallback(() => {
    onPausePress?.(false);
  }, [onPausePress]);

  const pause = useCallback(() => {
    onPausePress?.(true);
  }, [onPausePress]);

  const togglePause = useCallback(() => {
    onPausePress?.(!paused);
  }, [onPausePress, paused]);

  const seek = useCallback(
    (seekPos: number) => {
      if (onSeek) {
        onSeek(seekPos * duration);
      }
    },
    [duration, onSeek],
  );

  const clampPosition = useCallback(
    (position: number) => Math.max(0, Math.min(position, trackWidth)),
    [trackWidth],
  );

  const updatePosition = useCallback(
    (locationX: number) => {
      if (trackWidth <= 0) {
        return;
      }

      const nextBallPos = clampPosition(locationX);
      setBallPos(nextBallPos);
      seek(nextBallPos / trackWidth);
    },
    [clampPosition, seek, trackWidth],
  );

  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      pause();
      updatePosition(event.nativeEvent.locationX);
    },
    [pause, updatePosition],
  );

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      updatePosition(event.nativeEvent.locationX);
    },
    [updatePosition],
  );

  const handleTouchEnd = useCallback(() => {
    play();
    setBallPos(undefined);
  }, [play]);

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View style={[styles.playerBar]}>
      <TouchableHighlight onPress={togglePause}>
        {paused ? (
          <IconOutline name="pause" color={theme.text} />
        ) : (
          <IconOutline name="caret-right" color={theme.text} />
        )}
      </TouchableHighlight>
      <Text style={[styles.playerBarText]}>{currentTimeStr}</Text>
      <View style={[styles.playerProgressBar]}>
        <View
          style={styles.playerProgressBarTrack}
          onLayout={handleTrackLayout}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <View
            style={[
              styles.playerProgressBarProgress,
              {width: percentage as DimensionValue},
            ]}
          />
          {ballPos !== undefined && (
            <View
              style={[
                styles.playerProgressBarBall,
                {transform: [{translateX: ballPos}]},
              ]}
            />
          )}
        </View>
      </View>
      <Text style={[styles.playerBarText]}>{durationStr}</Text>
    </View>
  );
};
