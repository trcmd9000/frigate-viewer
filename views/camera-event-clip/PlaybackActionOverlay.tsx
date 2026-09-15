import {IconOutline} from '@ant-design/icons-react-native';
import React, {FC, useEffect, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useTheme, useStyles} from '../../helpers/colors';
import {PlaybackFeedback} from '../../helpers/playerFeedback';
import {SecureLogger} from '../../helpers/secureLogger';

interface PlaybackActionOverlayProps {
  feedback?: PlaybackFeedback;
  leftInset?: number;
  rightInset?: number;
  onHidden: (id: number) => void;
}

const ENTER_DURATION_MS = 120;
const VISIBLE_DURATION_MS = 650;
const EXIT_DURATION_MS = 180;

export const PlaybackActionOverlay: FC<PlaybackActionOverlayProps> = ({
  feedback,
  leftInset = 0,
  rightInset = 0,
  onHidden,
}) => {
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.92));
  const [reduceMotion, setReduceMotion] = useState(false);
  const styles = useStyles(({theme}) => ({
    wrapper: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 2,
      justifyContent: 'center',
    },
    center: {
      alignSelf: 'center',
    },
    backward: {
      alignSelf: 'flex-start',
    },
    forward: {
      alignSelf: 'flex-end',
    },
    badge: {
      minWidth: 64,
      minHeight: 64,
      borderRadius: 32,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mediaOverlay,
    },
    amount: {
      color: theme.mediaText,
      fontSize: 30,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
  }));
  const theme = useTheme();

  useEffect(() => {
    let mounted = true;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .then(enabled => {
        if (mounted && enabled !== undefined) {
          setReduceMotion(enabled);
        }
      })
      .catch(error => {
        SecureLogger.logError(
          error instanceof Error ? error : new Error(String(error)),
          'PlaybackActionOverlay.reduce-motion-state',
        );
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!feedback) {
      opacity.setValue(0);
      return;
    }

    opacity.stopAnimation();
    scale.stopAnimation();
    opacity.setValue(0);
    scale.setValue(reduceMotion ? 1 : 0.92);

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: reduceMotion ? 0 : ENTER_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: reduceMotion ? 0 : ENTER_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(VISIBLE_DURATION_MS),
      Animated.timing(opacity, {
        toValue: 0,
        duration: reduceMotion ? 0 : EXIT_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({finished}) => {
      if (finished) {
        onHidden(feedback.id);
      }
    });
    return () => animation.stop();
  }, [feedback, onHidden, opacity, reduceMotion, scale]);

  if (!feedback) {
    return null;
  }

  const isSeek = feedback.action === 'seekBackward' ||
    feedback.action === 'seekForward';
  const placement = feedback.action === 'seekBackward'
    ? styles.backward
    : feedback.action === 'seekForward'
    ? styles.forward
    : styles.center;
  const iconName = feedback.action === 'pause'
    ? 'pause'
    : feedback.action === 'replay'
    ? 'reload'
    : 'caret-right';

  return (
    <View
      testID="event-player-action-overlay"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.wrapper,
        {paddingLeft: leftInset + 20, paddingRight: rightInset + 20},
      ]}
    >
      <Animated.View
        testID="event-player-action-feedback"
        style={[placement, {opacity, transform: [{scale}]}]}
      >
        <View style={styles.badge}>
          {isSeek ? (
            <Text testID="event-player-seek-feedback" style={styles.amount}>
              {`${(feedback.amount ?? 0) > 0 ? '+' : ''}${feedback.amount ?? 0}`}
            </Text>
          ) : (
            <IconOutline
              accessible={false}
              name={iconName}
              color={theme.mediaText}
              size={30}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
};
