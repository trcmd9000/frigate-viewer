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
  AccessibilityActionEvent,
  useWindowDimensions,
} from 'react-native';
import {useIntl} from 'react-intl';
import {formatVideoTime} from '../../helpers/locale';
import {useTheme, useStyles} from '../../helpers/colors';
import {PlaybackAction} from '../../helpers/playerFeedback';

interface IProgressBarProps {
  paused: boolean;
  currentTime: number;
  duration: number;
  ended?: boolean;
  onPausePress?: (paused: boolean) => void;
  onSeek?: (pos: number) => void;
  onSkip?: (seconds: number) => void;
  onTransportAction?: (action: PlaybackAction) => void;
  bottomInset?: number;
  leftInset?: number;
  rightInset?: number;
}

export const ProgressBar: FC<IProgressBarProps> = ({
  paused,
  currentTime,
  duration,
  ended = false,
  onPausePress,
  onSeek,
  onSkip,
  onTransportAction,
  bottomInset = 0,
  leftInset = 0,
  rightInset = 0,
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
    playerBarPortrait: {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    transportRow: {
      minHeight: 48,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    timelineRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
    },
    controlButton: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlButtonDisabled: {
      opacity: 0.35,
    },
    playerBarText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.mediaText,
      fontVariant: ['tabular-nums'],
      minWidth: 44,
      textAlign: 'center',
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
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const portrait = windowHeight >= windowWidth;

  const [ballPos, setBallPos] = useState<number | undefined>();
  const [trackWidth, setTrackWidth] = useState(0);

  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const safeCurrentTime = Number.isFinite(currentTime)
    ? Math.max(0, Math.min(safeDuration, currentTime))
    : 0;
  const currentTimeStr = useMemo(
    () => formatVideoTime(safeCurrentTime),
    [safeCurrentTime],
  );
  const durationStr = useMemo(
    () => formatVideoTime(safeDuration),
    [safeDuration],
  );
  const percentage = useMemo(
    () =>
      `${safeDuration > 0 ? (safeCurrentTime / safeDuration) * 100 : 0}%`,
    [safeCurrentTime, safeDuration],
  );

  const play = useCallback(() => {
    onPausePress?.(false);
  }, [onPausePress]);

  const pause = useCallback(() => {
    onPausePress?.(true);
  }, [onPausePress]);

  const togglePause = useCallback(() => {
    onTransportAction?.(ended ? 'replay' : paused ? 'play' : 'pause');
    onPausePress?.(!paused);
  }, [ended, onPausePress, onTransportAction, paused]);

  const skipBackward = useCallback(() => {
    if (safeCurrentTime <= 0) {
      return;
    }
    onTransportAction?.('seekBackward');
    onSkip?.(-10);
  }, [onSkip, onTransportAction, safeCurrentTime]);

  const skipForward = useCallback(() => {
    if (safeDuration <= 0 || safeCurrentTime >= safeDuration) {
      return;
    }
    onTransportAction?.('seekForward');
    onSkip?.(10);
  }, [onSkip, onTransportAction, safeCurrentTime, safeDuration]);

  const adjustTimeline = useCallback(
    (seconds: number) => {
      if (safeDuration <= 0) {
        return;
      }
      const nextPosition = Math.max(
        0,
        Math.min(safeDuration, safeCurrentTime + seconds),
      );
      if (onSeek) {
        onSeek(nextPosition);
      } else {
        onSkip?.(nextPosition - safeCurrentTime);
      }
    },
    [onSeek, onSkip, safeCurrentTime, safeDuration],
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment') {
        adjustTimeline(10);
      } else if (event.nativeEvent.actionName === 'decrement') {
        adjustTimeline(-10);
      }
    },
    [adjustTimeline],
  );

  const seek = useCallback(
    (seekPos: number) => {
      if (onSeek) {
        onSeek(seekPos * safeDuration);
      }
    },
    [onSeek, safeDuration],
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
  const progressValue = intl.formatMessage(
    {
      id: 'cameraEventClip.progressValue',
      defaultMessage: '{currentTime} of {duration}',
    },
    {currentTime: currentTimeStr, duration: durationStr},
  );
  const backwardDisabled = safeCurrentTime <= 0;
  const forwardDisabled =
    safeDuration <= 0 || safeCurrentTime >= safeDuration;
  const controlRipple = {
    color: '#ffffff33',
    borderless: true,
    radius: 24,
  };

  const playButton = (
    <Pressable
      testID="event-player-play-toggle"
      accessibilityLabel={playLabel}
      accessibilityHint={playHint}
      accessibilityRole="button"
      android_ripple={controlRipple}
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
  );

  const backwardButton = (
    <Pressable
      testID="event-player-skip-backward"
      accessibilityLabel={backwardLabel}
      accessibilityHint={backwardHint}
      accessibilityRole="button"
      accessibilityState={{disabled: backwardDisabled}}
      android_ripple={controlRipple}
      disabled={backwardDisabled}
      onPress={skipBackward}
      style={[
        styles.controlButton,
        backwardDisabled && styles.controlButtonDisabled,
      ]}
    >
      <IconOutline
        accessible={false}
        name="backward"
        color={theme.mediaText}
        size={22}
      />
    </Pressable>
  );

  const forwardButton = (
    <Pressable
      testID="event-player-skip-forward"
      accessibilityLabel={forwardLabel}
      accessibilityHint={forwardHint}
      accessibilityRole="button"
      accessibilityState={{disabled: forwardDisabled}}
      android_ripple={controlRipple}
      disabled={forwardDisabled}
      onPress={skipForward}
      style={[
        styles.controlButton,
        forwardDisabled && styles.controlButtonDisabled,
      ]}
    >
      <IconOutline
        accessible={false}
        name="forward"
        color={theme.mediaText}
        size={22}
      />
    </Pressable>
  );

  const timeline = (
    <View
      testID="event-player-timeline"
      accessibilityLabel={progressLabel}
      accessibilityHint={progressHint}
      accessibilityRole="adjustable"
      accessibilityActions={[
        {name: 'increment', label: forwardLabel},
        {name: 'decrement', label: backwardLabel},
      ]}
      accessibilityValue={{
        min: 0,
        now: Math.round(safeCurrentTime),
        max: Math.round(safeDuration),
        text: progressValue,
      }}
      onAccessibilityAction={handleAccessibilityAction}
      onLayout={handleTrackLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={[styles.playerProgressBar]}
    >
      <View testID="event-player-track" style={styles.playerProgressBarTrack}>
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
  );

  return (
    <View
      testID="event-player-progress-bar"
      style={[
        styles.playerBar,
        portrait && styles.playerBarPortrait,
        {
          paddingBottom: 8 + bottomInset,
          paddingLeft: 4 + leftInset,
          paddingRight: 4 + rightInset,
        },
      ]}
    >
      {portrait ? (
        <>
          <View testID="event-player-transport-row" style={styles.transportRow}>
            {backwardButton}
            {playButton}
            {forwardButton}
          </View>
          <View testID="event-player-timeline-row" style={styles.timelineRow}>
            <Text style={styles.playerBarText}>{currentTimeStr}</Text>
            {timeline}
            <Text style={styles.playerBarText}>{durationStr}</Text>
          </View>
        </>
      ) : (
        <>
          {playButton}
          {backwardButton}
          <Text style={styles.playerBarText}>{currentTimeStr}</Text>
          {timeline}
          <Text style={styles.playerBarText}>{durationStr}</Text>
          {forwardButton}
        </>
      )}
    </View>
  );
};
