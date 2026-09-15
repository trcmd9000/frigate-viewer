import React, {
  FC,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  useWindowDimensions,
} from 'react-native';
import {useIntl} from 'react-intl';
import {
  Navigation,
  NavigationFunctionComponent,
} from 'react-native-navigation';
import {selectServer} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {buildServerUrl} from '../../helpers/rest';
import Share from 'react-native-share';
import {clipFilename} from '../camera-events/eventHelpers';
import {ICameraEvent} from '../camera-events/CameraEvent';
import {IconOutline} from '@ant-design/icons-react-native';
import {useTheme, useStyles} from '../../helpers/colors';
import {
  downloadMedia,
  fileUri,
  releaseDownloadedMedia,
  retainDownloadedMedia,
} from '../../helpers/mediaDownload';
import {getUserFriendlyMessage, handleError} from '../../helpers/errorHandler';
import {
  MediaPlayerHandle,
  MediaProgress,
  PlayableMedia,
} from '../../components/media/PlayableMedia';
import {Media3MediaPlayer} from '../../components/media/Media3MediaPlayer';
import {AudioToggle} from '../../components/media/AudioToggle';
import {
  eventVodPath,
  eventClipPath,
  protectedMediaUri,
} from '../../helpers/protectedMedia';
import {useScreenPlaybackLifecycle} from '../../helpers/playbackLifecycle';
import {
  EVENT_PLAYBACK_SPEEDS,
  setEventPlaybackSpeed,
  useEventPlaybackSpeed,
} from '../../helpers/playbackSpeed';
import {
  FEATURE_KEYS,
  useFeatureAction,
  useFeatureEnabled,
} from '../../helpers/entitlements';
import {ProgressBar} from './ProgressBar';
import {PlaybackActionOverlay} from './PlaybackActionOverlay';
import {
  PlaybackAction,
  PlaybackFeedback,
  performTransportHaptic,
} from '../../helpers/playerFeedback';
import {
  ServerScopeScreenProps,
  useServerScopeOwner,
  withServerScopeScreen,
} from '../../helpers/serverScopeScreen';
import {SecureLogger} from '../../helpers/secureLogger';

interface ICameraEventClipProps extends ServerScopeScreenProps {
  event: ICameraEvent;
}

interface IVideoPlayerProps {
  ownerScopeGeneration: number;
  server: ReturnType<typeof selectServer>;
  active?: boolean;
  media?: PlayableMedia;
  mediaError?: boolean;
  onRetry?: () => void;
  shareUrl: string;
  fileName?: string;
  initiallyPaused?: boolean;
  activationId?: number;
  onClose: () => void;
}

const CONTROLS_AUTO_HIDE_DELAY_MS = 3000;
const TOOL_BUTTON_WIDTH = 48;
const TOOLBAR_WIDTH_RESERVE = 8;

const VideoPlayer: FC<IVideoPlayerProps> = ({
  ownerScopeGeneration,
  server,
  active = true,
  media,
  mediaError,
  onRetry,
  shareUrl,
  fileName = 'clip.mp4',
  initiallyPaused = false,
  activationId = 0,
  onClose,
}) => {
  const {isCurrentScope} = useServerScopeOwner(ownerScopeGeneration);
  const actionIdentity = useRef({
    active,
    activationId,
    server,
    shareUrl,
    fileName,
  });
  useLayoutEffect(() => {
    actionIdentity.current = {
      active,
      activationId,
      server,
      shareUrl,
      fileName,
    };
  }, [activationId, active, fileName, server, shareUrl]);
  const isCurrentAction = useCallback(
    (identity: typeof actionIdentity.current): boolean => {
      const current = actionIdentity.current;
      return (
        isCurrentScope() &&
        current.active &&
        current.active === identity.active &&
        current.activationId === identity.activationId &&
        current.server === identity.server &&
        current.shareUrl === identity.shareUrl &&
        current.fileName === identity.fileName
      );
    },
    [isCurrentScope],
  );
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const systemInsets = useMemo(() => {
    let statusBarHeight = 0;
    try {
      statusBarHeight = Navigation.constantsSync?.().statusBarHeight ?? 0;
    } catch (error) {
      SecureLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        'CameraEventClip.system-insets',
      );
    }
    const screen = Dimensions.get('screen');
    const verticalSystemInset = Math.max(0, screen.height - windowHeight);
    const horizontalSystemInset = Math.max(0, screen.width - windowWidth);
    return {
      top: Math.max(0, statusBarHeight),
      bottom: Math.max(0, verticalSystemInset - statusBarHeight),
      left: horizontalSystemInset,
      right: horizontalSystemInset,
    };
  }, [windowHeight, windowWidth]);
  const overflowMenuMargin = 8;
  const overflowMenuAnchorLeft = systemInsets.left + 96;
  const overflowMenuWidth = Math.max(
    1,
    Math.min(
      280,
      windowWidth -
        systemInsets.left -
        systemInsets.right -
        overflowMenuMargin * 2,
    ),
  );
  const overflowMenuScreenLeft = Math.max(
    systemInsets.left + overflowMenuMargin,
    Math.min(
      overflowMenuAnchorLeft,
      windowWidth -
        systemInsets.right -
        overflowMenuMargin -
        overflowMenuWidth,
    ),
  );
  const overflowMenuLeft =
    overflowMenuScreenLeft - overflowMenuAnchorLeft;
  const styles = useStyles(({theme}) => ({
    wrapper: {
      backgroundColor: theme.mediaBackground,
      flex: 1,
    },
    player: {
      flex: 1,
    },
    overlayWrapper: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.mediaBackground,
    },
    errorText: {
      color: theme.mediaText,
      fontSize: 18,
      textAlign: 'center',
      marginBottom: 16,
      paddingHorizontal: 24,
    },
    loadingText: {
      color: theme.mediaText,
      marginTop: 12,
    },
    loadingContent: {
      alignItems: 'center',
    },
    retryText: {
      color: theme.mediaText,
      fontSize: 16,
      fontWeight: '600',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    tools: {
      position: 'absolute',
      zIndex: 3,
      elevation: 2,
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.mediaOverlay,
      overflow: 'visible',
    },
    toolButton: {
      minWidth: 48,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    speedMenuAnchor: {
      position: 'relative',
      zIndex: 5,
    },
    speedMenu: {
      position: 'absolute',
      left: 0,
      top: 48,
      minWidth: 96,
      paddingVertical: 4,
      backgroundColor: theme.surface,
    },
    speedMenuItem: {
      minHeight: 48,
      flexDirection: 'row',
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    speedMenuItemSelected: {
      backgroundColor: theme.highlighted,
    },
    speedMenuText: {
      flexShrink: 1,
      color: theme.text,
      fontSize: 14,
      marginLeft: 12,
    },
    overflowMenu: {
      position: 'absolute',
      top: 48,
      minWidth: 1,
      paddingVertical: 4,
      backgroundColor: theme.surface,
      borderRadius: 8,
      zIndex: 20,
      elevation: 8,
    },
    menuDismiss: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
    },
    mediaTap: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 72,
      zIndex: 0,
    },
    controlScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: theme.mediaOverlay,
      opacity: 0.08,
    },
  }));
  const theme = useTheme();
  const intl = useIntl();
  const shareLabel = intl.formatMessage({
    id: 'cameraEventClip.share',
    defaultMessage: 'Share clip',
  });
  const shareHint = intl.formatMessage({
    id: 'cameraEventClip.shareHint',
    defaultMessage: 'Shares the clip using another app',
  });
  const moreLabel = intl.formatMessage({
    id: 'cameraEventClip.more',
    defaultMessage: 'More event actions',
  });
  const moreHint = intl.formatMessage({
    id: 'cameraEventClip.moreHint',
    defaultMessage: 'Opens more event actions',
  });
  const moreMenuLabel = intl.formatMessage({
    id: 'cameraEventClip.moreMenu',
    defaultMessage: 'Event actions',
  });
  const downloadLabel = intl.formatMessage({
    id: 'cameraEventClip.download',
    defaultMessage: 'Save to device',
  });
  const downloadHint = intl.formatMessage({
    id: 'cameraEventClip.downloadHint',
    defaultMessage: 'Saves a copy of the clip on this device',
  });
  const closeLabel = intl.formatMessage({
    id: 'cameraEventClip.close',
    defaultMessage: 'Close player',
  });
  const closeHint = intl.formatMessage({
    id: 'cameraEventClip.closeHint',
    defaultMessage: 'Returns to events',
  });
  const toggleControlsLabel = intl.formatMessage({
    id: 'cameraEventClip.toggleControls',
    defaultMessage: 'Show or hide player controls',
  });
  const toggleControlsHint = intl.formatMessage({
    id: 'cameraEventClip.toggleControlsHint',
    defaultMessage: 'Shows or hides player controls',
  });
  const formatPlaybackSpeed = useCallback(
    (speed: (typeof EVENT_PLAYBACK_SPEEDS)[number]) =>
      `${intl.formatNumber(speed)}x`,
    [intl],
  );

  const [paused, setPaused] = useState(initiallyPaused);
  const [ended, setEnded] = useState(false);
  const [progressInfo, setProgressInfo] = useState<MediaProgress>();
  const player = useRef<MediaPlayerHandle>(null);
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  const [playerError, setPlayerError] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const playbackPositionRef = useRef(0);
  const [muted, setMuted] = useState(true);
  const wasActive = useRef(active);
  const previousInitiallyPaused = useRef(initiallyPaused);
  const playbackSpeed = useEventPlaybackSpeed();
  const canChangePlaybackSpeed = useFeatureEnabled(
    FEATURE_KEYS.eventPlaybackSpeed,
  );
  const setPlaybackSpeed = useFeatureAction(
    FEATURE_KEYS.eventPlaybackSpeed,
    setEventPlaybackSpeed,
  );
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [playbackFeedback, setPlaybackFeedback] =
    useState<PlaybackFeedback>();
  const playbackFeedbackRef = useRef<PlaybackFeedback>();
  const playbackFeedbackId = useRef(0);
  const autoHideTimer = useRef<ReturnType<typeof setTimeout>>();
  const progressAvailable = progressInfo !== undefined;
  const directMediaActions =
    progressAvailable &&
    windowWidth - systemInsets.left - systemInsets.right >=
      TOOL_BUTTON_WIDTH *
        (canChangePlaybackSpeed ? 5 : 4) +
        TOOLBAR_WIDTH_RESERVE;

  useEffect(() => {
    setPlayerError(false);
    setMuted(true);
    setSpeedMenuOpen(false);
    setOverflowMenuOpen(false);
    setControlsVisible(true);
    setPlaybackFeedback(undefined);
    playbackFeedbackRef.current = undefined;
  }, [active, media?.uri]);

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimer.current) {
      clearTimeout(autoHideTimer.current);
      autoHideTimer.current = undefined;
    }
  }, []);

  const scheduleAutoHide = useCallback(() => {
    clearAutoHideTimer();
    if (
      !controlsVisible ||
      !progressAvailable ||
      paused ||
      ended ||
      screenReaderEnabled ||
      speedMenuOpen ||
      overflowMenuOpen
    ) {
      return;
    }
    autoHideTimer.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_AUTO_HIDE_DELAY_MS);
  }, [
    clearAutoHideTimer,
    controlsVisible,
    ended,
    overflowMenuOpen,
    paused,
    progressAvailable,
    screenReaderEnabled,
    speedMenuOpen,
  ]);

  useEffect(() => {
    let mounted = true;
    const updateScreenReaderState = (enabled: boolean) => {
      if (!mounted) {
        return;
      }
      setScreenReaderEnabled(enabled);
      if (enabled) {
        setControlsVisible(true);
      }
    };
    AccessibilityInfo.isScreenReaderEnabled()
      .then(updateScreenReaderState)
      .catch(error => {
        SecureLogger.logError(
          error instanceof Error ? error : new Error(String(error)),
          'CameraEventClip.screen-reader-state',
        );
      });
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      updateScreenReaderState,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    scheduleAutoHide();
    return clearAutoHideTimer;
  }, [clearAutoHideTimer, scheduleAutoHide]);

  useEffect(() => {
    if (!controlsVisible) {
      setSpeedMenuOpen(false);
      setOverflowMenuOpen(false);
    }
  }, [controlsVisible]);

  useEffect(() => {
    if (directMediaActions) {
      setOverflowMenuOpen(false);
    }
  }, [directMediaActions]);

  useEffect(() => {
    if (!speedMenuOpen && !overflowMenuOpen) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSpeedMenuOpen(false);
      setOverflowMenuOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [overflowMenuOpen, speedMenuOpen]);

  useEffect(() => {
    const becameActive = active && !wasActive.current;
    const initiallyPausedChanged =
      initiallyPaused !== previousInitiallyPaused.current;

    if (!active || becameActive) {
      setPaused(true);
      setMuted(true);
    } else if (initiallyPausedChanged) {
      setPaused(initiallyPaused);
    }

    wasActive.current = active;
    previousInitiallyPaused.current = initiallyPaused;
  }, [active, initiallyPaused]);

  useEffect(() => {
    if (!canChangePlaybackSpeed) {
      setSpeedMenuOpen(false);
    }
  }, [canChangePlaybackSpeed]);

  const onProgress = useCallback((info: MediaProgress) => {
    playbackPositionRef.current = info.currentTime;
    setPlaybackPosition(info.currentTime);
    setProgressInfo(info);
    if (info.duration > 0 && info.currentTime < info.duration) {
      setEnded(false);
    }
  }, []);

  const seek = useCallback((position: number) => {
    playbackPositionRef.current = position;
    setPlaybackPosition(position);
    player.current?.seek(position);
  }, []);

  const skip = useCallback(
    (seconds: number) => {
      if (!progressInfo || progressInfo.duration <= 0) {
        return;
      }
      seek(
        Math.max(
          0,
          Math.min(
            progressInfo.duration,
            playbackPositionRef.current + seconds,
          ),
        ),
      );
    },
    [progressInfo, seek],
  );

  const onEnd = useCallback(() => {
    clearAutoHideTimer();
    setPaused(true);
    setEnded(true);
    setControlsVisible(true);
    if (progressInfo) {
      playbackPositionRef.current = progressInfo.duration;
      setPlaybackPosition(progressInfo.duration);
      setProgressInfo({...progressInfo, currentTime: progressInfo.duration});
    }
  }, [clearAutoHideTimer, progressInfo]);

  const onPausedChange = useCallback(
    (nextPaused: boolean) => {
      if (!nextPaused && ended) {
        player.current?.seek(0);
        setEnded(false);
      }
      setPaused(nextPaused);
    },
    [ended],
  );

  const onTransportAction = useCallback((action: PlaybackAction) => {
    const previous = playbackFeedbackRef.current;
    const delta =
      action === 'seekBackward' ? -10 : action === 'seekForward' ? 10 : 0;
    const amount =
      delta !== 0 &&
      previous?.action === action &&
      previous.amount !== undefined
        ? previous.amount + delta
        : delta || undefined;
    const feedback: PlaybackFeedback = {
      action,
      amount,
      id: ++playbackFeedbackId.current,
    };
    playbackFeedbackRef.current = feedback;
    setPlaybackFeedback(feedback);
    performTransportHaptic();
  }, []);

  const onPlaybackFeedbackHidden = useCallback((id: number) => {
    if (playbackFeedbackRef.current?.id !== id) {
      return;
    }
    playbackFeedbackRef.current = undefined;
    setPlaybackFeedback(undefined);
  }, []);

  const share = async () => {
    const identity = actionIdentity.current;
    if (!isCurrentAction(identity) || sharing || sharingRef.current) {
      return;
    }
    sharingRef.current = true;
    setSharing(true);
    setOverflowMenuOpen(false);
    let path: string | undefined;
    try {
      path = await downloadMedia(server, shareUrl);
      retainDownloadedMedia(path, 'share');
      if (!isCurrentAction(identity)) {
        return;
      }
      await Share.open({
        url: fileUri(path),
        filename: fileName,
        type: 'video/mp4',
      });
    } catch (error) {
      if (!isCurrentAction(identity)) {
        return;
      }
      const appError = await handleError(error, 'CameraEventClip.share');
      if (!isCurrentAction(identity)) {
        return;
      }
      const message = getUserFriendlyMessage(appError);
      if (Platform.OS === 'android') {
        ToastAndroid.show(message, ToastAndroid.LONG);
      } else {
        Alert.alert(message);
      }
    } finally {
      try {
        await releaseDownloadedMedia(path, 'share');
      } catch {
        // Cleanup must not leave the action locked if cache release fails.
      } finally {
        sharingRef.current = false;
        if (isCurrentScope()) {
          setSharing(false);
        }
      }
    }
  };

  const toggleSpeedMenu = useCallback(() => {
    if (!canChangePlaybackSpeed) {
      return;
    }
    setOverflowMenuOpen(false);
    setSpeedMenuOpen(open => !open);
  }, [canChangePlaybackSpeed]);

  const selectPlaybackSpeed = useCallback(
    (speed: (typeof EVENT_PLAYBACK_SPEEDS)[number]) => {
      if (setPlaybackSpeed(speed) !== undefined) {
        setSpeedMenuOpen(false);
      }
    },
    [setPlaybackSpeed],
  );

  const download = useCallback(async () => {
    const identity = actionIdentity.current;
    if (!isCurrentAction(identity) || sharing || sharingRef.current) {
      return;
    }
    sharingRef.current = true;
    setSharing(true);
    setOverflowMenuOpen(false);
    let path: string | undefined;
    try {
      path = await downloadMedia(server, shareUrl);
      retainDownloadedMedia(path, 'share');
      if (!isCurrentAction(identity)) {
        return;
      }
      await Share.open({
        url: fileUri(path),
        filename: fileName,
        type: 'video/mp4',
        saveToFiles: true,
      });
    } catch (error) {
      if (!isCurrentAction(identity)) {
        return;
      }
      const appError = await handleError(error, 'CameraEventClip.download');
      if (!isCurrentAction(identity)) {
        return;
      }
      const message = getUserFriendlyMessage(appError);
      if (Platform.OS === 'android') {
        ToastAndroid.show(message, ToastAndroid.LONG);
      } else {
        Alert.alert(message);
      }
    } finally {
      try {
        await releaseDownloadedMedia(path, 'share');
      } catch {
        // Cleanup must not leave the action locked if cache release fails.
      } finally {
        sharingRef.current = false;
        if (isCurrentScope()) {
          setSharing(false);
        }
      }
    }
  }, [fileName, isCurrentAction, isCurrentScope, server, shareUrl, sharing]);

  const closeButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={closeLabel}
      accessibilityHint={closeHint}
      onPress={onClose}
      style={styles.toolButton}
      testID="event-player-close"
    >
      <IconOutline
        accessible={false}
        name="close"
        color={theme.mediaText}
        size={24}
      />
    </Pressable>
  );
  const directShareButton = (
    <Pressable
      style={styles.toolButton}
      accessibilityRole="button"
      accessibilityLabel={shareLabel}
      accessibilityHint={shareHint}
      disabled={sharing}
      hitSlop={12}
      onPress={share}
      testID="event-player-share"
    >
      <IconOutline
        accessible={false}
        name="share-alt"
        color={theme.mediaText}
        size={20}
      />
    </Pressable>
  );
  const directDownloadButton = (
    <Pressable
      style={styles.toolButton}
      accessibilityRole="button"
      accessibilityLabel={downloadLabel}
      accessibilityHint={downloadHint}
      disabled={sharing}
      hitSlop={12}
      onPress={download}
      testID="event-player-download"
    >
      <IconOutline
        accessible={false}
        name="download"
        color={theme.mediaText}
        size={20}
      />
    </Pressable>
  );
  const closeOnlyTools = (
    <View
      style={[
        styles.tools,
        {left: systemInsets.left, top: systemInsets.top},
      ]}
    >
      {closeButton}
    </View>
  );

  if (mediaError || playerError) {
    const errorMessage = intl.formatMessage({
      id: 'cameraEventClip.error',
      defaultMessage:
        'Unable to play media. Check your connection and try again.',
    });
    const retryMessage = intl.formatMessage({
      id: 'cameraEventClip.retry',
      defaultMessage: 'Retry media',
    });
    return (
      <View accessibilityLiveRegion="assertive" style={styles.overlayWrapper}>
        {closeOnlyTools}
        <Text accessibilityRole="alert" style={styles.errorText}>
          {errorMessage}
        </Text>
        {onRetry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={retryMessage}
            onPress={() => {
              setPlayerError(false);
              onRetry();
            }}
            testID="protected-media-retry"
          >
            <Text style={styles.retryText}>{retryMessage}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (!media) {
    const loadingMessage = intl.formatMessage({
      id: 'cameraEventClip.loading',
      defaultMessage: 'Preparing media',
    });
    return (
      <View style={styles.overlayWrapper}>
        {closeOnlyTools}
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={loadingMessage}
          accessibilityState={{busy: true}}
          style={styles.loadingContent}
        >
          <ActivityIndicator
            testID="event-player-loading-indicator"
            size="large"
            color={theme.mediaText}
          />
          <Text style={styles.loadingText}>{loadingMessage}</Text>
        </View>
      </View>
    );
  }

  return (
    <View onTouchStart={scheduleAutoHide} style={styles.wrapper}>
      <Media3MediaPlayer
        ref={player}
        paused={paused || !active}
        initialPosition={playbackPosition}
        media={media}
        playbackRate={canChangePlaybackSpeed ? playbackSpeed : 1}
        style={styles.player}
        onProgress={onProgress}
        onEnd={onEnd}
        onError={() => {
          playbackFeedbackRef.current = undefined;
          setPlaybackFeedback(undefined);
          setPlayerError(true);
        }}
        muted={muted}
      />
      <PlaybackActionOverlay
        feedback={playbackFeedback}
        leftInset={systemInsets.left}
        rightInset={systemInsets.right}
        onHidden={onPlaybackFeedbackHidden}
      />
      {controlsVisible && (
        <View
          testID="event-player-control-scrim"
          pointerEvents="none"
          style={styles.controlScrim}
        />
      )}
      {progressInfo && (
        <Pressable
          testID="event-player-scrim-toggle"
          accessibilityRole="button"
          accessibilityLabel={toggleControlsLabel}
          accessibilityHint={toggleControlsHint}
          onPress={() => setControlsVisible(visible => !visible)}
          style={styles.mediaTap}
        />
      )}
      {progressInfo && controlsVisible && (
        <ProgressBar
          paused={paused}
          currentTime={progressInfo.currentTime}
          duration={progressInfo.duration}
          bottomInset={systemInsets.bottom}
          leftInset={systemInsets.left}
          rightInset={systemInsets.right}
          ended={ended}
          onPausePress={onPausedChange}
          onSeek={seek}
          onSkip={skip}
          onTransportAction={onTransportAction}
        />
      )}
      {(overflowMenuOpen || speedMenuOpen) && (
        <Pressable
          testID="event-player-menu-dismiss"
          accessibilityElementsHidden
          onPress={() => {
            setSpeedMenuOpen(false);
            setOverflowMenuOpen(false);
          }}
          style={styles.menuDismiss}
        />
      )}
      {controlsVisible && (
        <View
          testID="event-player-tools"
          style={[
            styles.tools,
            {left: systemInsets.left, top: systemInsets.top},
          ]}
        >
          {closeButton}
          <AudioToggle
            testID="event-player-audio"
            muted={muted}
            onToggle={() => setMuted(current => !current)}
          />
          {progressInfo && directMediaActions && (
            <>
              {directShareButton}
              {directDownloadButton}
            </>
          )}
          {progressInfo && !directMediaActions && (
            <>
              <View style={styles.speedMenuAnchor}>
                <Pressable
                  style={styles.toolButton}
                  accessibilityRole="button"
                  accessibilityLabel={moreLabel}
                  accessibilityHint={moreHint}
                  accessibilityState={{expanded: overflowMenuOpen}}
                  hitSlop={12}
                  onPress={() => {
                    setSpeedMenuOpen(false);
                    setOverflowMenuOpen(open => !open);
                  }}
                  testID="event-player-overflow"
                >
                  <IconOutline
                    accessible={false}
                    name="ellipsis"
                    color={theme.mediaText}
                    size={20}
                  />
                </Pressable>
                {overflowMenuOpen && (
                  <View
                    accessibilityRole="menu"
                    accessibilityLabel={moreMenuLabel}
                    style={[
                      styles.overflowMenu,
                      {left: overflowMenuLeft, width: overflowMenuWidth},
                    ]}
                    testID="event-player-overflow-menu"
                  >
                    <Pressable
                      accessibilityRole="menuitem"
                      accessibilityLabel={shareLabel}
                      accessibilityHint={shareHint}
                      disabled={sharing}
                      onPress={share}
                      style={styles.speedMenuItem}
                      testID="event-player-share"
                    >
                      <IconOutline
                        accessible={false}
                        name="share-alt"
                        color={theme.text}
                        size={20}
                      />
                      <Text style={styles.speedMenuText}>{shareLabel}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="menuitem"
                      accessibilityLabel={downloadLabel}
                      accessibilityHint={downloadHint}
                      disabled={sharing}
                      onPress={download}
                      style={styles.speedMenuItem}
                      testID="event-player-download"
                    >
                      <IconOutline
                        accessible={false}
                        name="download"
                        color={theme.text}
                        size={20}
                      />
                      <Text style={styles.speedMenuText}>{downloadLabel}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </>
          )}
          {canChangePlaybackSpeed && progressInfo && (
            <View
              style={styles.speedMenuAnchor}
              testID="event-playback-speed-anchor"
            >
              <Pressable
                style={styles.toolButton}
                accessibilityRole="button"
                accessibilityLabel={intl.formatMessage({
                  id: 'cameraEventClip.playbackSpeed',
                  defaultMessage: 'Playback speed',
                })}
                accessibilityHint={intl.formatMessage({
                  id: 'cameraEventClip.playbackSpeedHint',
                  defaultMessage: 'Choose playback speed',
                })}
                accessibilityState={{expanded: speedMenuOpen}}
                hitSlop={12}
                onPress={toggleSpeedMenu}
                testID="event-playback-speed"
              >
                <IconOutline
                  accessible={false}
                  name="dashboard"
                  color={theme.mediaText}
                  size={20}
                />
              </Pressable>
              {speedMenuOpen && (
                <View
                  accessibilityRole="menu"
                  accessibilityLabel={intl.formatMessage({
                    id: 'cameraEventClip.playbackSpeedMenu',
                    defaultMessage: 'Playback speed options',
                  })}
                  style={styles.speedMenu}
                  testID="event-playback-speed-menu"
                >
                  {EVENT_PLAYBACK_SPEEDS.map(speed => (
                    <Pressable
                      key={speed}
                      accessibilityRole="menuitem"
                      accessibilityLabel={formatPlaybackSpeed(speed)}
                      accessibilityState={{
                        selected: speed === playbackSpeed,
                      }}
                      onPress={() => selectPlaybackSpeed(speed)}
                      style={[
                        styles.speedMenuItem,
                        speed === playbackSpeed && styles.speedMenuItemSelected,
                      ]}
                      testID={`event-playback-speed-${speed}`}
                    >
                      <Text style={styles.speedMenuText}>
                        {formatPlaybackSpeed(speed)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const CameraEventClipContent: NavigationFunctionComponent<
  ICameraEventClipProps
> = ({componentId, event, ownerScopeGeneration}) => {
  const {generation, isCurrentScope} = useServerScopeOwner(ownerScopeGeneration);
  const server = useAppSelector(selectServer);
  const [preparedMedia, setPreparedMedia] = useState<{
    activationId: number;
    media: PlayableMedia;
  }>();
  const [mediaError, setMediaError] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const preparationInFlight = useRef(false);
  const preparationQueued = useRef(false);
  const mounted = useRef(true);
  const playbackLifecycle = useScreenPlaybackLifecycle();
  const {active: playbackActive, activationId} = playbackLifecycle;
  const media =
    playbackActive && preparedMedia?.activationId === activationId
      ? preparedMedia.media
      : undefined;

  const clipUrl = useMemo(
    () =>
      `${buildServerUrl(server)?.replace(/\/+$/, '')}${eventClipPath(event.id)}`,
    [event.id, server],
  );

  const fileName = useMemo(() => clipFilename(event), [event]);
  const close = useCallback(
    () =>
      Promise.resolve(Navigation.dismissModal(componentId)).catch(error =>
        handleError(error, 'CameraEventClip.close'),
      ),
    [componentId],
  );
  const retryPreparation = useCallback(() => {
    if (!isCurrentScope()) {
      return;
    }
    if (preparationInFlight.current) {
      preparationQueued.current = true;
      return;
    }
    setPreparedMedia(undefined);
    setMediaError(false);
    setRetryAttempt(current => current + 1);
  }, [isCurrentScope]);

  useEffect(() => {
    if (!playbackActive || !isCurrentScope()) {
      return;
    }
    setPreparedMedia(undefined);
    setMediaError(false);
    if (preparationInFlight.current) {
      preparationQueued.current = true;
      return;
    }
    let active = true;
    let downloadedPath: string | undefined;
    let downloadedPathReleased = false;
    preparationInFlight.current = true;
    const releaseDownloadedPath = () => {
      if (downloadedPath && !downloadedPathReleased) {
        downloadedPathReleased = true;
        releaseDownloadedMedia(downloadedPath, 'display').catch(
          () => undefined,
        );
      }
    };
    const prepareMedia = Promise.resolve().then(
      async (): Promise<PlayableMedia | undefined> => {
        if (!active || !isCurrentScope()) {
          return undefined;
        }
        if (Platform.OS === 'android') {
          const resourcePath = event.has_clip
            ? eventClipPath(event.id)
            : eventVodPath(event.id);
          const uri = await protectedMediaUri(
            server,
            resourcePath,
          );
          return {
            uri,
            mimeType: event.has_clip ? 'video/mp4' : 'application/x-mpegURL',
            mode: 'direct',
          };
        }
        const path = await downloadMedia(server, clipUrl);
        downloadedPath = path;
        retainDownloadedMedia(path, 'display');
        return {
          uri: fileUri(path),
          mimeType: 'video/mp4',
          mode: 'local',
        };
      },
    );

    prepareMedia
      .then(uri => {
        if (uri && active && isCurrentScope()) {
          setPreparedMedia({activationId, media: uri});
        } else {
          releaseDownloadedPath();
        }
      })
      .catch(async error => {
        if (!active || !isCurrentScope()) {
          return;
        }
        await handleError(error, 'CameraEventClip.prepare');
        if (active && isCurrentScope()) {
          setMediaError(true);
        }
      })
      .finally(() => {
        preparationInFlight.current = false;
        if (
          preparationQueued.current &&
          mounted.current &&
          isCurrentScope()
        ) {
          preparationQueued.current = false;
          setRetryAttempt(current => current + 1);
        } else if (!mounted.current || !isCurrentScope()) {
          preparationQueued.current = false;
        }
      });
    return () => {
      active = false;
      releaseDownloadedPath();
    };
  }, [
    clipUrl,
    event.has_clip,
    event.id,
    activationId,
    playbackActive,
    retryAttempt,
    server,
    isCurrentScope,
  ]);

  useEffect(
    () => () => {
      mounted.current = false;
      preparationQueued.current = false;
    },
    [],
  );

  return (
    <VideoPlayer
      ownerScopeGeneration={generation}
      server={server}
      active={playbackActive}
      media={media}
      mediaError={mediaError}
      onRetry={retryPreparation}
      shareUrl={clipUrl}
      fileName={fileName}
      initiallyPaused={activationId > 0}
      activationId={activationId}
      onClose={close}
    />
  );
};

export const CameraEventClip = withServerScopeScreen(CameraEventClipContent);
