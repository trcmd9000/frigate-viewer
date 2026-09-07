import {IconOutline} from '@ant-design/icons-react-native';
import React, {FC, useCallback, useMemo, useState} from 'react';
import Animated, {
  LightSpeedInLeft,
  LightSpeedInRight,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {StyleSheet, Text, View, ViewProps} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {useIntl} from 'react-intl';
import {formatVideoTime} from '../../helpers/locale';
import {useStyles, useTheme} from '../../helpers/colors';

const staticStyles = StyleSheet.create({
  wrapper: {
    width: '100%',
    height: '100%',
  },
  hud: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  left: {},
  center: {},
  right: {},
  icon: {
    textShadowRadius: 20,
  },
});

interface PanGestureEvent {
  translationX: number;
}

interface IVideoHUDProps extends ViewProps {
  paused: boolean;
  ended?: boolean;
  currentTime?: number;
  duration?: number;
  onPaused?: (paused: boolean) => void;
  onSeek?: (pos: number) => void;
}

const Baunce = () => {
  'worklet';
  return {
    initialValues: {
      opacity: 0,
      transform: [{scale: 0}],
    },
    animations: {
      opacity: withSequence(withTiming(1), withDelay(500, withTiming(0))),
      transform: [{scale: withSpring(1)}],
    },
  };
};

const BackwardIcon: FC<{color: string}> = ({color}) => (
  <Animated.View entering={LightSpeedInRight}>
    <IconOutline
      accessible={false}
      style={staticStyles.icon}
      name="backward"
      color={color}
      size={80}
    />
  </Animated.View>
);

const ForwardIcon: FC<{color: string}> = ({color}) => (
  <Animated.View entering={LightSpeedInLeft}>
    <IconOutline
      accessible={false}
      style={staticStyles.icon}
      name="forward"
      color={color}
      size={80}
    />
  </Animated.View>
);

const PauseIcon: FC<{color: string}> = ({color}) => (
  <Animated.View entering={Baunce}>
    <IconOutline
      accessible={false}
      style={staticStyles.icon}
      name="pause"
      color={color}
      size={80}
    />
  </Animated.View>
);

const PlayIcon: FC<{color: string}> = ({color}) => (
  <Animated.View entering={Baunce}>
    <IconOutline
      accessible={false}
      style={staticStyles.icon}
      name="caret-right"
      color={color}
      size={80}
    />
  </Animated.View>
);

export const VideoHUD: FC<IVideoHUDProps> = ({
  paused,
  ended = false,
  currentTime,
  duration,
  onPaused,
  onSeek,
  children,
}) => {
  const theme = useTheme();
  const intl = useIntl();
  const styles = useStyles(({theme: palette}) => ({
    bigText: {
      fontSize: 60,
      color: palette.mediaText,
      textShadowRadius: 20,
    },
  }));
  const [seekTime, setSeekTime] = useState<number>();

  const play = useCallback(() => {
    if (onPaused) {
      onPaused(false);
    }
  }, [onPaused]);

  const pause = useCallback(() => {
    if (onPaused) {
      onPaused(true);
    }
  }, [onPaused]);

  const togglePlay = useCallback(() => {
    if (onPaused) {
      onPaused(!paused);
    }
  }, [paused, onPaused]);

  const seek = useCallback(
    (pos?: number) => {
      if (onSeek && pos !== undefined) {
        onSeek(pos);
      }
    },
    [onSeek],
  );

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      togglePlay();
    });

  const longPressGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(50)
    .onStart(() => {
      pause();
    })
    .onUpdate((event: PanGestureEvent) => {
      if (currentTime !== undefined && duration !== undefined) {
        const position = currentTime / duration;
        const distance = event.translationX;
        const minmax = (value: number, min: number, max: number) =>
          Math.max(min, Math.min(max, value));
        const desiredPos = minmax(position + distance / 200, 0, 1);
        setSeekTime(desiredPos * duration);
      }
    })
    .onEnd(() => {
      seek(seekTime || 0);
      play();
      setSeekTime(undefined);
    });

  const formattedSeekTime = useMemo(
    () =>
      seekTime !== undefined &&
      duration !== undefined &&
      currentTime !== undefined
        ? `${seekTime > currentTime ? '+' : ''}${formatVideoTime(
            seekTime - currentTime,
          )}`
        : undefined,
    [seekTime, duration, currentTime],
  );

  const direction = useMemo(
    () =>
      seekTime !== undefined && currentTime !== undefined
        ? seekTime < currentTime
          ? -1
          : 1
        : 0,
    [seekTime, currentTime],
  );

  const gestures = Gesture.Exclusive(longPressGesture, tapGesture);
  const accessibilityLabel = intl.formatMessage({
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
  const accessibilityHint = intl.formatMessage({
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

  return (
    <GestureDetector gesture={gestures}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{disabled: !onPaused}}
        style={staticStyles.wrapper}
      >
        {children}
        <View style={staticStyles.hud}>
          <View style={staticStyles.left}>
            {direction === -1 ? (
              <BackwardIcon color={theme.mediaText} />
            ) : (
              <></>
            )}
          </View>
          <View style={staticStyles.center}>
            {formattedSeekTime ? (
              <Text style={styles.bigText}>{formattedSeekTime}</Text>
            ) : (
              <View>
                {paused && <PauseIcon color={theme.mediaText} />}
                {!paused && <PlayIcon color={theme.mediaText} />}
              </View>
            )}
          </View>
          <View style={staticStyles.right}>
            {direction === 1 ? (
              <ForwardIcon color={theme.mediaText} />
            ) : (
              <></>
            )}
          </View>
        </View>
      </View>
    </GestureDetector>
  );
};
