import {IconOutline} from '@ant-design/icons-react-native';
import React, {FC, useCallback, useMemo, useState} from 'react';
import {
  DimensionValue,
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useIntl} from 'react-intl';
import {formatVideoTime} from '../../helpers/locale';
import {useTheme, useStyles} from '../../helpers/colors';

interface IProgressBarProps {
  paused: boolean;
  currentTime: number;
  duration: number;
  ended?: boolean;
  onPausePress?: (paused: boolean) => void;
  onSeek?: (pos: number) => void;
  onSkip?: (seconds: number) => void;
}

export const ProgressBar: FC<IProgressBarProps> = ({
  paused,
  currentTime,
  duration,
  ended = false,
  onPausePress,
  onSeek,
  onSkip,
}) => {
  const styles = useStyles(({theme}) => ({
    playerBar: {
      position: 'absolute',
      left: 0,
      bottom: 0,
      zIndex: 1,
      elevation: 2,
      width: '100%',
      minHeight: 64,
      paddingHorizontal: 4,
      paddingVertical: 8,
      backgroundColor: theme.mediaOverlay,
      flexDirection: 'row',
      alignItems: 'center',
    },
    controlButton: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playerBarText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.mediaText,
      fontVariant: ['tabular-nums'],
    },
    playerProgressBar: {
      flex: 1,
      minHeight: 48,
      justifyContent: 'center',
      marginHorizontal: 4,
    },
    playerProgressBarTrack: {
      position: 'relative',
      height: 6,
      borderRadius: 3,
      overflow: 'visible',
    },
    playerProgressBarTrackBackground: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 3,
      backgroundColor: theme.mediaText,
      opacity: 0.45,
    },
    playerProgressBarProgress: {
      backgroundColor: theme.mediaText,
      height: '100%',
      borderRadius: 3,
      zIndex: 1,
    },
    playerProgressBarBall: {
      position: 'absolute',
      top: -4,
      left: -7,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.mediaText,
      zIndex: 2,
    },
  }));
  const theme = useTheme();
  const intl = useIntl();

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

  const skipBackward = useCallback(() => {
    onSkip?.(-10);
  }, [onSkip]);

  const skipForward = useCallback(() => {
    onSkip?.(10);
  }, [onSkip]);

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

  const playLabel = intl.formatMessage({
    id: ended
      ? 'cameraEventClip.replay'
      : paused
      ? 'cameraEventClip.play'
      : 'cameraEventClip.pause',
    defaultMessage: ended
      ? 'Replay video'
      : paused
      ? 'Play video'
      : 'Pause video',
  });
  const playHint = intl.formatMessage({
    id: ended
      ? 'cameraEventClip.replayHint'
      : paused
      ? 'cameraEventClip.playHint'
      : 'cameraEventClip.pauseHint',
    defaultMessage: ended
      ? 'Replays the video from the beginning'
      : paused
      ? 'Starts video playback'
      : 'Pauses video playback',
  });
  const backwardLabel = intl.formatMessage({
    id: 'cameraEventClip.seekBackward',
    defaultMessage: 'Back 10 seconds',
  });
  const backwardHint = intl.formatMessage({
    id: 'cameraEventClip.seekBackwardHint',
    defaultMessage: 'Seeks back 10 seconds',
  });
  const forwardLabel = intl.formatMessage({
    id: 'cameraEventClip.seekForward',
    defaultMessage: 'Forward 10 seconds',
  });
  const forwardHint = intl.formatMessage({
    id: 'cameraEventClip.seekForwardHint',
    defaultMessage: 'Seeks forward 10 seconds',
  });
  const progressLabel = intl.formatMessage({
    id: 'cameraEventClip.progress',
    defaultMessage: 'Video progress',
  });
  const progressHint = intl.formatMessage({
    id: 'cameraEventClip.progressHint',
    defaultMessage: 'Adjust video position',
  });

  return (
    <View style={[styles.playerBar]}>
      <Pressable
        testID="event-player-play-toggle"
        accessibilityLabel={playLabel}
        accessibilityHint={playHint}
        accessibilityRole="button"
        onPress={togglePause}
        style={styles.controlButton}
      >
        {paused ? (
          <IconOutline
            accessible={false}
            name="caret-right"
            color={theme.mediaText}
            size={24}
          />
        ) : (
          <IconOutline
            accessible={false}
            name="pause"
            color={theme.mediaText}
            size={24}
          />
        )}
      </Pressable>
      <Pressable
        testID="event-player-skip-backward"
        accessibilityLabel={backwardLabel}
        accessibilityHint={backwardHint}
        accessibilityRole="button"
        onPress={skipBackward}
        style={styles.controlButton}
      >
        <IconOutline
          accessible={false}
          name="backward"
          color={theme.mediaText}
          size={22}
        />
      </Pressable>
      <Text style={[styles.playerBarText]}>{currentTimeStr}</Text>
      <View
        testID="event-player-timeline"
        accessibilityLabel={progressLabel}
        accessibilityHint={progressHint}
        accessibilityRole="adjustable"
        accessibilityValue={{
          min: 0,
          now: Math.round(currentTime),
          max: Math.round(duration),
        }}
        onLayout={handleTrackLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={[styles.playerProgressBar]}
      >
        <View
          testID="event-player-track"
          style={styles.playerProgressBarTrack}
        >
          <View
            testID="event-player-track-background"
            style={styles.playerProgressBarTrackBackground}
          />
          <View
            testID="event-player-progress"
            style={[
              styles.playerProgressBarProgress,
              {width: percentage as DimensionValue},
            ]}
          />
          {ballPos !== undefined && (
            <View
              testID="event-player-thumb"
              style={[
                styles.playerProgressBarBall,
                {transform: [{translateX: ballPos}]},
              ]}
            />
          )}
        </View>
      </View>
      <Text style={[styles.playerBarText]}>{durationStr}</Text>
      <Pressable
        testID="event-player-skip-forward"
        accessibilityLabel={forwardLabel}
        accessibilityHint={forwardHint}
        accessibilityRole="button"
        onPress={skipForward}
        style={styles.controlButton}
      >
        <IconOutline
          accessible={false}
          name="forward"
          color={theme.mediaText}
          size={22}
        />
      </Pressable>
    </View>
  );
};
