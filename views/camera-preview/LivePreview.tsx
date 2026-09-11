import React, {FC, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {PropsWithChildren} from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  ImageStyle,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {useIntl} from 'react-intl';
import {useAppSelector} from '../../store/store';
import {selectServer} from '../../store/settings';
import {buildServerApiUrl} from '../../helpers/rest';
import {ZoomableImage} from '../../components/ZoomableImage';
import {useStyles} from '../../helpers/colors';
import {
  downloadMedia,
  fileUri,
  removeDownloadedMedia,
  releaseDownloadedMedia,
  retainDownloadedMedia,
} from '../../helpers/mediaDownload';
import {SecureLogger} from '../../helpers/secureLogger';
import {useRest} from '../../helpers/rest';
import {
  prepareLocalRtspMedia,
  selectProtectedLiveStreams,
} from '../../helpers/protectedLive';
import {ProtectedWebRTCPlayer} from '../../components/media/ProtectedWebRTCPlayer';
import {LocalRtspPlayer} from '../../components/media/LocalRtspPlayer';
import {
  protectedMseMediaUri,
  releaseProtectedMediaUri,
} from '../../helpers/protectedMedia';
import {Media3MediaPlayer} from '../../components/media/Media3MediaPlayer';
import {useScreenPlaybackLifecycle} from '../../helpers/playbackLifecycle';
import {nextLiveReconnect} from '../../helpers/liveReconnect';
import {
  commitSnapshotHandoff,
  discardSnapshotHandoff,
  queueSnapshotHandoff,
} from '../../helpers/snapshotHandoff';
import type {SnapshotHandoffState} from '../../helpers/snapshotHandoff';
import type {
  LivePreviewPhase,
  LivePreviewTransport,
} from '../../helpers/livePreviewStatus';
import type {PlayableMedia} from '../../components/media/PlayableMedia';
import {LiveStatusBadge} from '../../components/media/LiveStatusBadge';
import type {ProtectedLiveFailureReason} from '../../helpers/protectedLiveDiagnostics';
import {LiveAudioControl} from './LiveAudioControl';
import type {ProtectedAudioStatus} from '../../helpers/protectedAudio';
import {
  fetchStreamMetadata,
  probeProtectedMseContract,
  protectedMseProbeEnabled,
  protectedMseProbeFailure,
} from '../../helpers/hevcTransport';

type LivePreviewProps = PropsWithChildren<{
  cameraName: string;
}>;

const LIVE_PREVIEW_REFRESH_MS = 1000;
const LIVE_FIRST_FRAME_TIMEOUT_MS = 15_000;

const releaseDownloadedMediaSafely = (path?: string) => {
  try {
    Promise.resolve(releaseDownloadedMedia(path)).catch(() => undefined);
  } catch {
    // A native cache adapter may throw before returning its promise.
  }
};

export const LivePreview: FC<LivePreviewProps> = ({cameraName}) => {
  const {width, height} = useWindowDimensions();
  const landscape = width > height;
  const styles = useStyles(({theme}) => ({
    container: {
      flex: 1,
      backgroundColor: theme.mediaBackground,
    },
    mediaFrame: {
      flex: 1,
      position: 'relative',
      backgroundColor: theme.mediaBackground,
    },
    topOverlay: {
      position: 'absolute',
      top: 12,
      left: 16,
      right: 12,
      zIndex: 4,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    cameraTitle: {
      flex: 1,
      minWidth: 0,
      marginRight: 8,
      color: theme.mediaText,
      fontSize: 18,
      fontWeight: '700',
    },
    statusOverlay: {
      maxWidth: '52%',
      flexShrink: 0,
      alignItems: 'flex-end',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    snapshotSurface: {
      ...StyleSheet.absoluteFillObject,
    },
    snapshotPending: {
      opacity: 0,
    },
    livePlayer: {
      ...StyleSheet.absoluteFillObject,
    },
    fallbackPanel: {
      position: 'absolute',
      left: 8,
      right: 8,
      bottom: 8,
      alignItems: 'center',
      alignSelf: 'center',
      maxWidth: 520,
      backgroundColor: theme.mediaOverlayPanel || theme.mediaOverlay,
      borderRadius: 8,
      padding: 6,
      flexDirection: 'column',
    },
    fallbackLandscape: {
      flexDirection: 'row',
      paddingHorizontal: 10,
      maxWidth: 520,
    },
    fallbackLandscapeText: {
      marginBottom: 0,
      marginRight: 8,
    },
    fallbackText: {
      color: theme.textInverse,
      flexShrink: 1,
      marginBottom: 4,
      textAlign: 'center',
    },
    retryText: {
      color: theme.link,
      fontSize: 16,
      fontWeight: '600',
    },
    retryButton: {
      minWidth: 48,
      minHeight: 48,
      justifyContent: 'center',
      alignItems: 'center',
    },
  }));

  const [snapshotState, setSnapshotState] = useState<SnapshotHandoffState>({});
  const [mediaWidth, setMediaWidth] = useState<number>();
  const server = useAppSelector(selectServer);
  const interval = useRef<NodeJS.Timeout>();
  const currentPath = useRef<string>();
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const getRef = useRef(useRest().get);
  const {active: playbackActive, activationId} = useScreenPlaybackLifecycle();
  const [streamNames, setStreamNames] = useState<string[]>([]);
  const [streamIndex, setStreamIndex] = useState(0);
  const streamName = streamNames[streamIndex];
  const [livePhase, setLivePhase] =
    useState<LivePreviewPhase>('snapshot');
  const [rtspMedia, setRtspMedia] = useState<PlayableMedia>();
  const [mseMedia, setMseMedia] = useState<PlayableMedia>();
  const [transport, setTransport] = useState<LivePreviewTransport>();
  const transportRef = useRef<LivePreviewTransport>();
  const [decoded, setDecoded] = useState(false);
  const [fallbackReason, setFallbackReason] =
    useState<ProtectedLiveFailureReason>();
  const [transientOverlayVisible, setTransientOverlayVisible] = useState(true);
  const [overlayOpacity] = useState(() => new Animated.Value(1));
  const overlayTimer = useRef<ReturnType<typeof setTimeout>>();
  const overlayGeneration = useRef(0);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [discoveryGeneration, setDiscoveryGeneration] = useState(0);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const firstFrameTimer = useRef<ReturnType<typeof setTimeout>>();
  const firstFrameExpired = useRef(false);
  const [muted, setMuted] = useState(true);
  const mutedIntentRef = useRef(muted);
  const [webrtcAudioAvailable, setWebrtcAudioAvailable] = useState(false);
  const [mseAudioAvailable, setMseAudioAvailable] = useState(false);
  const [webrtcAudioStatus, setWebrtcAudioStatus] =
    useState<ProtectedAudioStatus>({state: 'inactive'});
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );
  const appActiveRef = useRef(appActive);
  const audioScope = useMemo(() => ({
    activationId, cameraName, connectionAttempt, server, streamName,
    playbackActive, appActive, transport,
  }), [
    activationId, cameraName, connectionAttempt, server, streamName,
    playbackActive, appActive, transport,
  ]);
  const audioScopeRef = useRef(audioScope);
  useLayoutEffect(() => {
    audioScopeRef.current = audioScope;
    mutedIntentRef.current = muted;
  }, [audioScope, muted]);
  const pendingImageRef = useRef<SnapshotHandoffState['pending']>();
  const nextHandoffId = useRef(0);
  const intl = useIntl();
  const clearOverlayTimer = useCallback(() => {
    if (overlayTimer.current) {
      clearTimeout(overlayTimer.current);
      overlayTimer.current = undefined;
    }
  }, []);
  const hideTransientOverlay = useCallback(() => {
    if (!mounted.current) {
      return;
    }
    const generation = overlayGeneration.current;
    const announcement =
      livePhase === 'fallback' || livePhase === 'degraded'
        ? intl.formatMessage({
            id: fallbackReason
              ? `cameraPreview.fallback.${fallbackReason}`
              : 'cameraPreview.fallback.message',
            defaultMessage:
              'Live unavailable; protected snapshots are shown instead.',
          })
        : intl.formatMessage({
            id: 'cameraPreview.status.live',
            defaultMessage: 'Live stream',
          });
    AccessibilityInfo.announceForAccessibility?.(announcement);
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (
        finished &&
        mounted.current &&
        generation === overlayGeneration.current
      ) {
        setTransientOverlayVisible(false);
      }
    });
  }, [fallbackReason, intl, livePhase, overlayOpacity]);
  const scheduleOverlayHide = useCallback(() => {
    clearOverlayTimer();
    if (!playbackActive || (livePhase !== 'live' && livePhase !== 'fallback' && livePhase !== 'degraded')) {
      return;
    }
    overlayTimer.current = setTimeout(
      hideTransientOverlay,
      livePhase === 'live' ? 3000 : 6000,
    );
  }, [clearOverlayTimer, hideTransientOverlay, livePhase, playbackActive]);
  const revealTransientOverlays = useCallback(() => {
    overlayGeneration.current += 1;
    clearOverlayTimer();
    overlayOpacity.stopAnimation();
    overlayOpacity.setValue(1);
    setTransientOverlayVisible(true);
    scheduleOverlayHide();
  }, [clearOverlayTimer, overlayOpacity, scheduleOverlayHide]);
  const cancelTransientOverlay = useCallback(() => {
    overlayGeneration.current += 1;
    clearOverlayTimer();
    overlayOpacity.stopAnimation();
  }, [clearOverlayTimer, overlayOpacity]);
  const handleMediaLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0) {
      setMediaWidth(current => (current === nextWidth ? current : nextWidth));
    }
  }, []);

  useEffect(() => {
    overlayGeneration.current += 1;
    clearOverlayTimer();
    overlayOpacity.stopAnimation();
    overlayOpacity.setValue(1);
    setTransientOverlayVisible(true);
    scheduleOverlayHide();
    return cancelTransientOverlay;
  }, [
    cancelTransientOverlay,
    activationId,
    cameraName,
    clearOverlayTimer,
    decoded,
    fallbackReason,
    height,
    livePhase,
    overlayOpacity,
    playbackActive,
    scheduleOverlayHide,
    width,
  ]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', nextState => {
      const nextActive = nextState === 'active';
      const wasActive = appActiveRef.current;
      appActiveRef.current = nextActive;
      setAppActive(nextActive);
      if (!nextActive) {
        cancelTransientOverlay();
        overlayOpacity.setValue(1);
        setTransientOverlayVisible(true);
        setMuted(true);
        setWebrtcAudioAvailable(false);
        setWebrtcAudioStatus({state: 'inactive'});
      } else {
        if (!wasActive) {
          setConnectionAttempt(current => current + 1);
        }
        scheduleOverlayHide();
      }
    });
    return () => listener.remove();
  }, [
    cancelTransientOverlay,
    overlayOpacity,
    scheduleOverlayHide,
  ]);
  const setActiveTransport = useCallback((next: LivePreviewTransport) => {
    transportRef.current = next;
    setTransport(next);
  }, []);
  const invalidatePendingSnapshot = useCallback(() => {
    const pending = pendingImageRef.current;
    if (!pending) {
      return;
    }
    pendingImageRef.current = undefined;
    setSnapshotState(state => discardSnapshotHandoff(state, pending.handoffId));
    releaseDownloadedMediaSafely(pending.path);
  }, []);
  const livePlaying = useCallback(() => {
    if (firstFrameExpired.current || !appActiveRef.current) {
      return;
    }
    reconnectAttempts.current = 0;
    setFallbackReason(undefined);
    setDecoded(true);
    setLivePhase('live');
    if (firstFrameTimer.current) {
      clearTimeout(firstFrameTimer.current);
      firstFrameTimer.current = undefined;
    }
  }, []);
  const handleWebRtcAudioAvailabilityChange = useCallback(
    (available: boolean) => {
      if (!mounted.current || audioScopeRef.current !== audioScope) {
        return;
      }
      if (!appActiveRef.current) {
        setWebrtcAudioAvailable(false);
        setWebrtcAudioStatus({state: 'inactive'});
        setMuted(true);
        return;
      }
      setWebrtcAudioAvailable(available);
      if (!available) {
        setWebrtcAudioStatus({state: 'inactive'});
        setMuted(true);
      }
    },
    [audioScope],
  );
  const handleWebRtcAudioStatusChange = useCallback((status: ProtectedAudioStatus) => {
    if (
      !mounted.current || !appActiveRef.current || !playbackActive ||
      audioScopeRef.current !== audioScope
    ) {
      return;
    }
    if (
      mutedIntentRef.current &&
      (status.state === 'pending' || status.state === 'active')
    ) {
      return;
    }
    setWebrtcAudioStatus(status);
    if (status.state === 'failed' || status.state === 'inactive') {
      mutedIntentRef.current = true;
      setMuted(true);
    }
  }, [audioScope, playbackActive]);
  const liveFailed = useCallback(
    (reason?: ProtectedLiveFailureReason) => {
      if (firstFrameExpired.current) {
        return;
      }
      setMuted(true);
      setWebrtcAudioAvailable(false);
      setWebrtcAudioStatus({state: 'inactive'});
      setMseAudioAvailable(false);
      setDecoded(false);
      setFallbackReason(reason);
      if (transportRef.current === 'mse') {
        setMseMedia(undefined);
        if (firstFrameTimer.current) {
          clearTimeout(firstFrameTimer.current);
          firstFrameTimer.current = undefined;
        }
        setLivePhase('fallback');
        return;
      }
      if (transportRef.current === 'rtsp') {
        setRtspMedia(undefined);
        setActiveTransport('webrtc');
        setConnectionAttempt(0);
        reconnectAttempts.current = 0;
        setLivePhase('connecting');
        return;
      }
      if (!playbackActive || !streamName) {
        if (firstFrameTimer.current) {
          clearTimeout(firstFrameTimer.current);
          firstFrameTimer.current = undefined;
        }
        setLivePhase('fallback');
        return;
      }
      if (reason === 'codec') {
        if (streamIndex + 1 < streamNames.length) {
          reconnectAttempts.current = 0;
          setStreamIndex(current => current + 1);
          setConnectionAttempt(0);
          setLivePhase('connecting');
        } else {
          if (firstFrameTimer.current) {
            clearTimeout(firstFrameTimer.current);
            firstFrameTimer.current = undefined;
          }
          setLivePhase('fallback');
        }
        return;
      }
      const reconnect = nextLiveReconnect(reconnectAttempts.current);
      if (!reconnect) {
        if (streamIndex + 1 < streamNames.length) {
          reconnectAttempts.current = 0;
          setStreamIndex(current => current + 1);
          setConnectionAttempt(0);
          setLivePhase('connecting');
        } else {
          if (firstFrameTimer.current) {
            clearTimeout(firstFrameTimer.current);
            firstFrameTimer.current = undefined;
          }
          setLivePhase('fallback');
        }
        return;
      }
      reconnectAttempts.current = reconnect.attempt;
      setLivePhase('reconnecting');
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = undefined;
        setConnectionAttempt(current => current + 1);
        setLivePhase('connecting');
      }, reconnect.delayMs);
    },
    [
      playbackActive,
      setActiveTransport,
      streamIndex,
      streamName,
      streamNames.length,
    ],
  );

  const getLastImageUrl = useCallback(
    () =>
      `${buildServerApiUrl(
        server,
      )}/${cameraName}/latest.jpg?bbox=1&ts=${new Date().toISOString()}`,
    [cameraName, server],
  );

  const updateLastImageUrl = useCallback(async () => {
    if (!mounted.current || inFlight.current) {
      return;
    }
    inFlight.current = true;
    const currentRequest = ++requestId.current;
    try {
      const nextPath = await downloadMedia(server, getLastImageUrl());
      if (!mounted.current || currentRequest !== requestId.current) {
        await removeDownloadedMedia(nextPath);
        return;
      }
      const pending = {
        handoffId: ++nextHandoffId.current,
        path: nextPath,
        src: fileUri(nextPath),
      };
      const previousPending = pendingImageRef.current;
      retainDownloadedMedia(nextPath);
      pendingImageRef.current = pending;
      setSnapshotState(state => queueSnapshotHandoff(state, pending));
      if (previousPending) {
        await Promise.resolve(releaseDownloadedMedia(previousPending.path));
      }
    } catch (error) {
      SecureLogger.logError(error as Error, 'loading-live-preview');
    } finally {
      inFlight.current = false;
    }
  }, [getLastImageUrl, server]);

  useEffect(() => {
    if (!playbackActive) {
      requestId.current += 1;
      const path = currentPath.current;
      currentPath.current = undefined;
      const pending = pendingImageRef.current;
      pendingImageRef.current = undefined;
      setSnapshotState({});
      releaseDownloadedMediaSafely(path);
      releaseDownloadedMediaSafely(pending?.path);
      return;
    }
    if (decoded) {
      return;
    }
    const removeRefreshing = () => {
      if (interval.current) {
        clearInterval(interval.current);
      }
      requestId.current += 1;
    };
    removeRefreshing();
    updateLastImageUrl();
    interval.current = setInterval(() => {
      updateLastImageUrl();
    }, LIVE_PREVIEW_REFRESH_MS);
    return removeRefreshing;
  }, [decoded, playbackActive, updateLastImageUrl]);

  useEffect(() => {
    let active = true;
    invalidatePendingSnapshot();
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = undefined;
    }
    if (firstFrameTimer.current) {
      clearTimeout(firstFrameTimer.current);
      firstFrameTimer.current = undefined;
    }
    firstFrameExpired.current = false;
    reconnectAttempts.current = 0;
    setConnectionAttempt(0);
    setStreamIndex(0);
    setMuted(true);
    setWebrtcAudioAvailable(false);
    setWebrtcAudioStatus({state: 'inactive'});
    setMseAudioAvailable(false);
    setDecoded(false);
    setRtspMedia(undefined);
    setMseMedia(undefined);
    transportRef.current = undefined;
    setTransport(undefined);
    setStreamNames([]);
    setFallbackReason(undefined);
    setLivePhase('snapshot');
    const armFirstFrameTimeout = () => {
      if (firstFrameTimer.current) {
        clearTimeout(firstFrameTimer.current);
      }
      firstFrameTimer.current = setTimeout(() => {
        firstFrameExpired.current = true;
        setMuted(true);
        setDecoded(false);
        setFallbackReason('timeout');
        setRtspMedia(undefined);
        setLivePhase('fallback');
        firstFrameTimer.current = undefined;
      }, LIVE_FIRST_FRAME_TIMEOUT_MS);
    };
    if (!playbackActive || Platform.OS !== 'android') {
      return () => {
        active = false;
      };
    }

    getRef
      .current<Parameters<typeof selectProtectedLiveStreams>[0]>(
        server,
        'config',
      )
      .then(config => {
        if (!active) {
          return;
        }
        const selectedStreams = selectProtectedLiveStreams(config, cameraName);
        if (selectedStreams.length === 0) {
          setLivePhase('fallback');
          return;
        }
        setStreamNames(selectedStreams);
        setLivePhase('preparing');
        armFirstFrameTimeout();

        const metadataRequests = selectedStreams.map((selectedStream, index) =>
          fetchStreamMetadata(server, selectedStream)
            .then(metadata => {
              if (!active) {
                return undefined;
              }
              const audioCodecs = new Set(
                metadata.audio.map(descriptor => descriptor.codec),
              );
              SecureLogger.logInfo(
                `streamIndex=${index}, metadataAvailable=true, malformed=${metadata.malformed}, aac=${audioCodecs.has('aac')}, opus=${audioCodecs.has('opus')}, pcma=${audioCodecs.has('pcma')}, pcmu=${audioCodecs.has('pcmu')}`,
                'protected-live-codecs',
              );
              if (active && index === 0) {
                setMseAudioAvailable(audioCodecs.size > 0);
              }
                return metadata;
            })
            .catch(() => {
              if (active) {
                SecureLogger.logInfo(
                  `streamIndex=${index}, metadataAvailable=false`,
                  'protected-live-codecs',
                );
              }
                return undefined;
              }),
          );

          (async () => {
            const primaryMetadata = await metadataRequests[0];
            if (!active || firstFrameExpired.current) {
              return;
            }
            if (
              protectedMseProbeEnabled() &&
              primaryMetadata?.video.some(
                descriptor => descriptor.codec === 'h265',
              )
            ) {
              try {
                const result = await probeProtectedMseContract(
                  server,
                  selectedStreams[0],
                );
                if (active) {
                  SecureLogger.logInfo(
                    `streamIndex=0, success=true, mimeH265=${result.mimeH265}, ftyp=${result.ftyp}, moov=${result.moov}, moof=${result.moof}, mdat=${result.mdat}, bytesObserved=${result.bytesObserved}`,
                    'protected-mse-probe',
                  );
                }
                if (
                  result.mimeH265 && result.ftyp && result.moov &&
                  result.moof && result.mdat
                ) {
                  const uri = await protectedMseMediaUri(
                    server,
                    selectedStreams[0],
                  );
                  if (!active || firstFrameExpired.current) {
                    releaseProtectedMediaUri(uri);
                    return;
                  }
                  armFirstFrameTimeout();
                  setMseMedia({
                    uri,
                    mimeType: 'video/mp4',
                    mode: 'direct',
                  });
                  setRtspMedia(undefined);
                  setActiveTransport('mse');
                  setLivePhase('connecting');
                  return;
                }
              } catch (error) {
                if (active) {
                  SecureLogger.logInfo(
                    `streamIndex=0, success=false, reason=${protectedMseProbeFailure(error)}`,
                    'protected-mse-probe',
                  );
                }
              }
            }
            if (!active || firstFrameExpired.current) {
              return;
            }
            prepareLocalRtspMedia(server, config, cameraName)
              .then(media => {
                if (!active || firstFrameExpired.current) {
                  releaseProtectedMediaUri(media.uri);
                  return;
                }
                armFirstFrameTimeout();
                setRtspMedia(media);
                setActiveTransport('rtsp');
                setLivePhase('connecting');
              })
              .catch(error => {
                // A local route is optional. Its failure must not delay protected
                // WebRTC, and the error is intentionally not exposed to the UI.
                SecureLogger.logError(error as Error, 'preparing-local-live');
                if (active && !firstFrameExpired.current) {
                  armFirstFrameTimeout();
                  setActiveTransport('webrtc');
                  setLivePhase('connecting');
                }
              });
          })();
      })
      .catch(error => {
        SecureLogger.logError(error as Error, 'loading-live-stream-config');
        if (active) {
          if (firstFrameTimer.current) {
            clearTimeout(firstFrameTimer.current);
            firstFrameTimer.current = undefined;
          }
          setLivePhase('fallback');
        }
      });

    return () => {
      active = false;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = undefined;
      }
      if (firstFrameTimer.current) {
        clearTimeout(firstFrameTimer.current);
        firstFrameTimer.current = undefined;
      }
    };
  }, [
    activationId,
    cameraName,
    discoveryGeneration,
    invalidatePendingSnapshot,
    playbackActive,
    setActiveTransport,
    server,
  ]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelTransientOverlay();
      requestId.current += 1;
      if (interval.current) {
        clearInterval(interval.current);
      }
      const path = currentPath.current;
      const pending = pendingImageRef.current;
      currentPath.current = undefined;
      pendingImageRef.current = undefined;
      releaseDownloadedMediaSafely(path);
      releaseDownloadedMediaSafely(pending?.path);
    };
  }, [cancelTransientOverlay]);

  const fallbackMessageId = fallbackReason
    ? `cameraPreview.fallback.${fallbackReason}`
    : 'cameraPreview.fallback.message';
  const fallbackDetailedText = intl.formatMessage({
    id: fallbackMessageId,
    defaultMessage:
      'Live unavailable; protected snapshots are shown instead.',
  });
  const fallbackVisibleText = landscape
    ? intl.formatMessage({
        id: 'cameraPreview.fallback.landscape',
        defaultMessage: 'Live unavailable — showing snapshots',
      })
    : fallbackDetailedText;
  const statusOverlayVisible =
    livePhase === 'live' || transientOverlayVisible;
  const statusOverlayOpacity = useMemo(
    () => ({opacity: livePhase === 'live' ? 1 : overlayOpacity}),
    [livePhase, overlayOpacity],
  );

  return (
    <View style={styles.container}>
      <View
        testID="camera-preview-media"
        style={styles.mediaFrame}
        onLayout={handleMediaLayout}
        onTouchEnd={revealTransientOverlays}
      >
      {!decoded && snapshotState.displayed && (
        <ZoomableImage
          key={`snapshot-${snapshotState.displayed.handoffId}`}
          source={{
            uri: snapshotState.displayed.src,
          }}
          style={[styles.image, styles.snapshotSurface] as ImageStyle}
          fadeDuration={0}
          resizeMode="contain"
          resizeMethod="scale"
        />
      )}
      {!decoded && snapshotState.pending && (
        <ZoomableImage
          key={`snapshot-${snapshotState.pending.handoffId}`}
          source={{
            uri: snapshotState.pending.src,
          }}
          style={
            [
              styles.image,
              styles.snapshotSurface,
              styles.snapshotPending,
            ] as ImageStyle
          }
          fadeDuration={0}
          resizeMode="contain"
          resizeMethod="scale"
          onLoad={() => {
            const pending = pendingImageRef.current;
            if (
              !pending ||
              pending.handoffId !== snapshotState.pending?.handoffId
            ) {
              return;
            }
            const previousPath = currentPath.current;
            currentPath.current = pending.path;
            pendingImageRef.current = undefined;
            setSnapshotState(state =>
              commitSnapshotHandoff(state, pending.handoffId),
            );
            releaseDownloadedMediaSafely(previousPath);
          }}
          onError={() => {
            const pending = pendingImageRef.current;
            if (
              !pending ||
              pending.handoffId !== snapshotState.pending?.handoffId
            ) {
              return;
            }
            pendingImageRef.current = undefined;
            setSnapshotState(state =>
              discardSnapshotHandoff(state, pending.handoffId),
            );
            releaseDownloadedMediaSafely(pending.path);
          }}
        />
      )}
      {playbackActive &&
        transport === 'mse' &&
        mseMedia &&
        (livePhase === 'connecting' || livePhase === 'live') && (
          <Media3MediaPlayer
            key={`${activationId}:mse:${streamName}`}
            media={mseMedia}
            paused={false}
            muted={muted}
            style={[styles.livePlayer, !decoded && styles.snapshotPending]}
            onProgress={() => undefined}
            onEnd={() => liveFailed('timeout')}
            onError={() => liveFailed('codec')}
            onFirstFrame={livePlaying}
          />
        )}
      {playbackActive &&
        transport === 'rtsp' &&
        rtspMedia &&
        (livePhase === 'connecting' || livePhase === 'live') && (
          <LocalRtspPlayer
            key={`${activationId}:rtsp`}
            media={rtspMedia}
            active
            muted={muted}
            style={[styles.livePlayer, !decoded && styles.snapshotPending]}
            onPlaying={livePlaying}
            onError={reason =>
              liveFailed(reason === 'native' ? 'timeout' : 'timeout')
            }
          />
        )}
      {playbackActive &&
        transport === 'webrtc' &&
        streamName &&
        (livePhase === 'connecting' || livePhase === 'live') && (
          <ProtectedWebRTCPlayer
            key={`${activationId}:${streamName}:${connectionAttempt}`}
            server={server}
            streamName={streamName}
            muted={muted}
            style={styles.livePlayer}
            onPlaying={livePlaying}
            onError={liveFailed}
            onAudioAvailabilityChange={handleWebRtcAudioAvailabilityChange}
            onAudioStatusChange={handleWebRtcAudioStatusChange}
          />
        )}
      {playbackActive &&
        (livePhase === 'degraded' || livePhase === 'fallback') && (
          <Animated.View
            accessibilityElementsHidden={!transientOverlayVisible}
            importantForAccessibility={
              transientOverlayVisible ? 'yes' : 'no-hide-descendants'
            }
            accessibilityLiveRegion="assertive"
            pointerEvents={transientOverlayVisible ? 'box-none' : 'none'}
            style={[
              styles.fallbackPanel,
              landscape && styles.fallbackLandscape,
              {opacity: overlayOpacity},
            ]}
          >
            <Text
              accessibilityRole="alert"
              accessibilityLabel={fallbackDetailedText}
              style={[
                styles.fallbackText,
                landscape && styles.fallbackLandscapeText,
              ]}
            >
              {fallbackVisibleText}
            </Text>
            <Pressable
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel={intl.formatMessage({
                id: 'cameraPreview.retry',
              })}
              onPress={() => setDiscoveryGeneration(current => current + 1)}
            >
              <Text style={styles.retryText}>
                {intl.formatMessage({id: 'cameraPreview.retry'})}
              </Text>
            </Pressable>
          </Animated.View>
        )}
        <View testID="camera-preview-top-overlay" style={styles.topOverlay}>
          <Text
            testID="camera-preview-title"
            accessibilityRole="header"
            accessibilityLabel={cameraName}
            numberOfLines={2}
            ellipsizeMode="tail"
            style={styles.cameraTitle}
          >
            {cameraName}
          </Text>
          <Animated.View
            accessibilityElementsHidden={!statusOverlayVisible}
            importantForAccessibility={
              statusOverlayVisible ? 'yes' : 'no-hide-descendants'
            }
            pointerEvents="none"
            style={[
              styles.statusOverlay,
              statusOverlayOpacity,
            ]}
          >
            <LiveStatusBadge
              state={livePhase}
              transport={transport}
              viewportWidth={mediaWidth}
            />
          </Animated.View>
        </View>
        {appActive &&
          playbackActive &&
          decoded &&
          livePhase === 'live' &&
          (transport === 'rtsp' || transport === 'webrtc' || transport === 'mse') && (
          <LiveAudioControl
            muted={transport === 'webrtc' ? webrtcAudioStatus.state !== 'active' : muted}
            status={transport === 'webrtc' ? webrtcAudioStatus : undefined}
            disabled={
              (transport === 'webrtc' && !webrtcAudioAvailable) ||
              (transport === 'mse' && !mseAudioAvailable)
            }
            onToggle={() => {
              const nextMuted = !mutedIntentRef.current;
              mutedIntentRef.current = nextMuted;
              setMuted(nextMuted);
              if (transport === 'webrtc') {
                setWebrtcAudioStatus({state: nextMuted ? 'inactive' : 'pending'});
              }
              revealTransientOverlays();
            }}
          />
        )}
      </View>
    </View>
  );
};
