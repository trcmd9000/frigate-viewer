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
import {useAppDispatch, useAppSelector} from '../../store/store';
import {
  selectLiveStreamPreference,
  selectServer,
  setLiveStreamPreference,
} from '../../store/settings';
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
  selectProtectedLiveStreamOptions,
  selectProtectedLiveStreams,
} from '../../helpers/protectedLive';
import type {ProtectedLiveStream} from '../../helpers/protectedLive';
import {ProtectedWebRTCPlayer} from '../../components/media/ProtectedWebRTCPlayer';
import {LocalRtspPlayer} from '../../components/media/LocalRtspPlayer';
import {
  protectedMseMediaUri,
  protectedMediaProfileId,
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
import {LiveStreamControl} from './LiveStreamControl';
import type {ProtectedAudioStatus} from '../../helpers/protectedAudio';
import {
  fetchStreamMetadata,
  invalidateStreamMetadataCache,
  planProtectedLiveStreams,
  probeDeviceCodecCapability,
  protectedMseProbeEnabled,
} from '../../helpers/hevcTransport';
import type {
  CodecFamily,
  DeviceCodecCapability,
  MediaDescriptor,
  PlannedLiveStream,
  StreamMetadata,
} from '../../helpers/hevcTransport';
import {
  invalidateLiveConfigCache,
  loadLiveConfig,
} from '../../helpers/liveDiscovery';

type LivePreviewProps = PropsWithChildren<{
  cameraName: string;
  startupStartedAt?: number;
  startupTraceId?: number;
}>;

const LIVE_PREVIEW_REFRESH_MS = 1000;
const LIVE_FIRST_FRAME_TIMEOUT_MS = 15_000;
const LIVE_HEDGE_DELAY_MS = 2_500;

const formatCodec = (codec?: CodecFamily): string | undefined =>
  codec === 'h264'
    ? 'H.264'
    : codec === 'h265'
      ? 'H.265'
      : codec && codec !== 'unknown'
        ? codec.toUpperCase()
        : undefined;

const formatStreamOptionLabel = (
  stream: ProtectedLiveStream,
  descriptor?: MediaDescriptor,
): string => {
  if (!descriptor || descriptor.codec === 'unknown') {
    return stream.label;
  }
  const codec = formatCodec(descriptor.codec) as string;
  const normalizedLabel = stream.label.toLowerCase().replace(/[^a-z0-9]/g, '');
  const codecAlreadyNamed = normalizedLabel.includes(descriptor.codec) ||
    (descriptor.codec === 'h265' && normalizedLabel.includes('hevc'));
  const details = codecAlreadyNamed ? [] : [codec];
  if (descriptor.width && descriptor.height) {
    details.push(`${descriptor.width} x ${descriptor.height}`);
  }
  if (descriptor.frameRate) {
    const frameRate = Number.isInteger(descriptor.frameRate)
      ? String(descriptor.frameRate)
      : String(Number(descriptor.frameRate.toFixed(1)));
    details.push(`${frameRate} fps`);
  }
  return details.length > 0
    ? `${stream.label} - ${details.join(', ')}`
    : stream.label;
};

const releaseDownloadedMediaSafely = (path?: string) => {
  try {
    Promise.resolve(releaseDownloadedMedia(path)).catch(() => undefined);
  } catch {
    // A native cache adapter may throw before returning its promise.
  }
};

export const LivePreview: FC<LivePreviewProps> = ({
  cameraName,
  startupStartedAt,
  startupTraceId,
}) => {
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
    mediaTapSurface: {
      position: 'absolute',
      top: 48,
      right: 32,
      bottom: 72,
      left: 32,
      zIndex: 2,
    },
    streamMenuDismissSurface: {
      position: 'absolute',
      top: 48,
      right: 32,
      bottom: 72,
      left: 32,
      zIndex: 3,
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
      maxWidth: '68%',
      flexShrink: 0,
      marginLeft: 'auto',
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
    hedgedPlayer: {
      opacity: 0,
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
  const dispatch = useAppDispatch();
  const server = useAppSelector(selectServer);
  const streamPreference = useAppSelector(state =>
    selectLiveStreamPreference(state, server.profileId, cameraName),
  );
  const interval = useRef<NodeJS.Timeout>();
  const currentPath = useRef<string>();
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const getRef = useRef(useRest().get);
  const {active: playbackActive, activationId} = useScreenPlaybackLifecycle();
  const [streamNames, setStreamNames] = useState<string[]>([]);
  const [streamOptions, setStreamOptions] = useState<ProtectedLiveStream[]>(
    [],
  );
  const [streamOptionLabels, setStreamOptionLabels] = useState<
    Record<string, string>
  >({});
  const [streamIndex, setStreamIndex] = useState(0);
  const [streamCodecs, setStreamCodecs] = useState<CodecFamily[]>([]);
  const [streamFrameRates, setStreamFrameRates] = useState<
    Array<number | undefined>
  >([]);
  const [firstCompatibleStreamIndex, setFirstCompatibleStreamIndex] =
    useState(0);
  const streamName = streamNames[streamIndex];
  const activeStreamType = formatCodec(streamCodecs[streamIndex]);
  const activeStreamFrameRate = streamFrameRates[streamIndex];
  const [livePhase, setLivePhase] =
    useState<LivePreviewPhase>('snapshot');
  const [rtspMedia, setRtspMedia] = useState<PlayableMedia>();
  const [mseMedia, setMseMedia] = useState<PlayableMedia>();
  const [mseStreamName, setMseStreamName] = useState<string>();
  const [webRtcStreamName, setWebRtcStreamName] = useState<string>();
  const [transport, setTransport] = useState<LivePreviewTransport>();
  const transportRef = useRef<LivePreviewTransport>();
  const [decoded, setDecoded] = useState(false);
  const [fallbackReason, setFallbackReason] =
    useState<ProtectedLiveFailureReason>();
  const [transientOverlayVisible, setTransientOverlayVisible] = useState(true);
  const [streamSelectorOpen, setStreamSelectorOpen] = useState(false);
  const [overlayOpacity] = useState(() => new Animated.Value(1));
  const overlayTimer = useRef<ReturnType<typeof setTimeout>>();
  const overlayGeneration = useRef(0);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [discoveryGeneration, setDiscoveryGeneration] = useState(0);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const hedgeTimer = useRef<ReturnType<typeof setTimeout>>();
  const firstFrameTimer = useRef<ReturnType<typeof setTimeout>>();
  const firstFrameExpired = useRef(false);
  const winningTransport = useRef<LivePreviewTransport>();
  const streamNamesRef = useRef<string[]>([]);
  const [startupClock] = useState(
    () => startupStartedAt ?? performance.now(),
  );
  const [traceId] = useState(
    () => startupTraceId ?? Date.now() % 1_000_000_000,
  );
  const logStartup = useCallback(
    (stage: string, details?: string) => {
      const elapsedMs = Math.max(
        0,
        Math.round(performance.now() - startupClock),
      );
      SecureLogger.logInfo(
        `trace=${traceId}, stage=${stage}, elapsedMs=${elapsedMs}${
          details ? `, ${details}` : ''
        }`,
        'live-startup',
      );
    },
    [startupClock, traceId],
  );
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
    if (
      streamSelectorOpen ||
      !playbackActive ||
      (livePhase !== 'live' && livePhase !== 'fallback' && livePhase !== 'degraded')
    ) {
      return;
    }
    overlayTimer.current = setTimeout(
      hideTransientOverlay,
      livePhase === 'live' ? 3000 : 6000,
    );
  }, [
    clearOverlayTimer,
    hideTransientOverlay,
    livePhase,
    playbackActive,
    streamSelectorOpen,
  ]);
  const revealTransientOverlays = useCallback(() => {
    overlayGeneration.current += 1;
    clearOverlayTimer();
    overlayOpacity.stopAnimation();
    overlayOpacity.setValue(1);
    setTransientOverlayVisible(true);
    scheduleOverlayHide();
  }, [clearOverlayTimer, overlayOpacity, scheduleOverlayHide]);
  const handleDecodedMediaPress = useCallback(() => {
    revealTransientOverlays();
  }, [revealTransientOverlays]);
  const retryLiveDiscovery = useCallback(() => {
    invalidateLiveConfigCache(server);
    invalidateStreamMetadataCache(server);
    setDiscoveryGeneration(current => current + 1);
  }, [server]);
  const handleStreamSelectorOpenChange = useCallback((open: boolean) => {
    setStreamSelectorOpen(open);
    if (open) {
      revealTransientOverlays();
      clearOverlayTimer();
      return;
    }
    scheduleOverlayHide();
  }, [clearOverlayTimer, revealTransientOverlays, scheduleOverlayHide]);
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
        if (hedgeTimer.current) {
          clearTimeout(hedgeTimer.current);
          hedgeTimer.current = undefined;
        }
        if (firstFrameTimer.current) {
          clearTimeout(firstFrameTimer.current);
          firstFrameTimer.current = undefined;
        }
        firstFrameExpired.current = true;
        const winner = winningTransport.current;
        if (winner !== 'mse') {
          setMseMedia(undefined);
          setMseStreamName(undefined);
        }
        if (winner !== 'webrtc') {
          setWebRtcStreamName(undefined);
        }
        if (winner !== 'rtsp' && rtspMedia) {
          releaseProtectedMediaUri(rtspMedia.uri);
          setRtspMedia(undefined);
        }
        overlayOpacity.setValue(1);
        setTransientOverlayVisible(true);
        setMuted(true);
        setWebrtcAudioAvailable(false);
        setWebrtcAudioStatus({state: 'inactive'});
      } else {
        if (!wasActive) {
          setDiscoveryGeneration(current => current + 1);
        }
        scheduleOverlayHide();
      }
    });
    return () => listener.remove();
  }, [
    cancelTransientOverlay,
    overlayOpacity,
    rtspMedia,
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
  const livePlaying = useCallback((source: LivePreviewTransport) => {
    if (
      firstFrameExpired.current ||
      !appActiveRef.current ||
      winningTransport.current
    ) {
      return;
    }
    winningTransport.current = source;
    logStartup('first-frame', `transport=${source}`);
    setActiveTransport(source);
    if (hedgeTimer.current) {
      clearTimeout(hedgeTimer.current);
      hedgeTimer.current = undefined;
    }
    if (source !== 'mse') {
      setMseMedia(undefined);
      setMseStreamName(undefined);
    }
    if (source !== 'rtsp') {
      if (rtspMedia) {
        releaseProtectedMediaUri(rtspMedia.uri);
      }
      setRtspMedia(undefined);
    }
    if (source !== 'webrtc') {
      setWebRtcStreamName(undefined);
    } else {
      const winnerIndex = streamNamesRef.current.indexOf(webRtcStreamName || '');
      if (winnerIndex >= 0) {
        setStreamIndex(winnerIndex);
      }
    }
    reconnectAttempts.current = 0;
    setFallbackReason(undefined);
    setDecoded(true);
    setLivePhase('live');
    if (firstFrameTimer.current) {
      clearTimeout(firstFrameTimer.current);
      firstFrameTimer.current = undefined;
    }
  }, [
    logStartup,
    rtspMedia,
    setActiveTransport,
    webRtcStreamName,
  ]);
  const handleWebRtcAudioAvailabilityChange = useCallback(
    (available: boolean) => {
      if (!mounted.current || audioScopeRef.current !== audioScope) {
        return;
      }
      if (transportRef.current !== 'webrtc' && !winningTransport.current) {
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
      audioScopeRef.current !== audioScope ||
      (transportRef.current !== 'webrtc' && !winningTransport.current)
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
    (
      source: LivePreviewTransport,
      reason?: ProtectedLiveFailureReason,
    ) => {
      if (
        firstFrameExpired.current ||
        (winningTransport.current && winningTransport.current !== source)
      ) {
        return;
      }
      logStartup('transport-failed', `transport=${source}`);
      if (!winningTransport.current) {
        if (source === 'mse' && webRtcStreamName) {
          setMseMedia(undefined);
          setMseStreamName(undefined);
          setMseAudioAvailable(false);
          return;
        }
        if (source === 'rtsp' && webRtcStreamName) {
          if (rtspMedia) {
            releaseProtectedMediaUri(rtspMedia.uri);
          }
          setRtspMedia(undefined);
          return;
        }
        if (source === 'webrtc' && (mseMedia || rtspMedia)) {
          setWebRtcStreamName(undefined);
          return;
        }
      }
      winningTransport.current = undefined;
      setMuted(true);
      setWebrtcAudioAvailable(false);
      setWebrtcAudioStatus({state: 'inactive'});
      setFallbackReason(reason);
      if (source === 'mse') {
        setMseMedia(undefined);
        setMseStreamName(undefined);
        setMseAudioAvailable(false);
        if (firstCompatibleStreamIndex < streamNames.length) {
          setStreamIndex(firstCompatibleStreamIndex);
          setWebRtcStreamName(streamNames[firstCompatibleStreamIndex]);
          setActiveTransport('webrtc');
          setConnectionAttempt(0);
          reconnectAttempts.current = 0;
          setLivePhase('connecting');
          return;
        }
        if (firstFrameTimer.current) {
          clearTimeout(firstFrameTimer.current);
          firstFrameTimer.current = undefined;
        }
        setLivePhase('fallback');
        return;
      }
      if (source === 'rtsp') {
        if (rtspMedia) {
          releaseProtectedMediaUri(rtspMedia.uri);
        }
        setRtspMedia(undefined);
        setWebRtcStreamName(streamName);
        setActiveTransport('webrtc');
        setConnectionAttempt(0);
        reconnectAttempts.current = 0;
        setLivePhase('connecting');
        return;
      }
      setWebRtcStreamName(undefined);
      setDecoded(false);
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
          const nextStreamName = streamNames[streamIndex + 1];
          reconnectAttempts.current = 0;
          setStreamIndex(current => current + 1);
          setWebRtcStreamName(nextStreamName);
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
        setWebRtcStreamName(streamName);
        setConnectionAttempt(current => current + 1);
        setLivePhase('connecting');
      }, reconnect.delayMs);
    },
    [
      playbackActive,
      firstCompatibleStreamIndex,
      logStartup,
      mseMedia,
      rtspMedia,
      setActiveTransport,
      streamIndex,
      streamName,
      streamNames,
      streamNames.length,
      webRtcStreamName,
    ],
  );
  const handleMsePlaying = useCallback(
    () => livePlaying('mse'),
    [livePlaying],
  );
  const handleRtspPlaying = useCallback(
    () => livePlaying('rtsp'),
    [livePlaying],
  );
  const handleWebRtcPlaying = useCallback(
    () => livePlaying('webrtc'),
    [livePlaying],
  );
  const handleWebRtcFailure = useCallback(
    (reason?: ProtectedLiveFailureReason) => liveFailed('webrtc', reason),
    [liveFailed],
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
    logStartup('discovery-start');
    invalidatePendingSnapshot();
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = undefined;
    }
    if (firstFrameTimer.current) {
      clearTimeout(firstFrameTimer.current);
      firstFrameTimer.current = undefined;
    }
    if (hedgeTimer.current) {
      clearTimeout(hedgeTimer.current);
      hedgeTimer.current = undefined;
    }
    firstFrameExpired.current = false;
    winningTransport.current = undefined;
    streamNamesRef.current = [];
    reconnectAttempts.current = 0;
    setConnectionAttempt(0);
    setStreamIndex(0);
    setFirstCompatibleStreamIndex(0);
    setMuted(true);
    setWebrtcAudioAvailable(false);
    setWebrtcAudioStatus({state: 'inactive'});
    setMseAudioAvailable(false);
    setDecoded(false);
    setRtspMedia(undefined);
    setMseMedia(undefined);
    setMseStreamName(undefined);
    setWebRtcStreamName(undefined);
    transportRef.current = undefined;
    setTransport(undefined);
    setStreamNames([]);
    setStreamCodecs([]);
    setStreamFrameRates([]);
    setStreamOptions([]);
    setStreamOptionLabels({});
    setFallbackReason(undefined);
    setLivePhase('snapshot');
    const armFirstFrameTimeout = () => {
      if (firstFrameTimer.current) {
        clearTimeout(firstFrameTimer.current);
      }
      firstFrameTimer.current = setTimeout(() => {
        firstFrameExpired.current = true;
        logStartup('first-frame-timeout');
        setMuted(true);
        setDecoded(false);
        setFallbackReason('timeout');
        setRtspMedia(undefined);
        setMseMedia(undefined);
        setMseStreamName(undefined);
        setWebRtcStreamName(undefined);
        setLivePhase('fallback');
        firstFrameTimer.current = undefined;
      }, LIVE_FIRST_FRAME_TIMEOUT_MS);
    };
    if (!playbackActive || Platform.OS !== 'android') {
      return () => {
        active = false;
      };
    }

    const deviceCapabilityRequest = probeDeviceCodecCapability();
    const profileRegistrationRequest = protectedMseProbeEnabled()
      ? protectedMediaProfileId(server).then(() => true).catch(() => false)
      : Promise.resolve(false);

    loadLiveConfig(
      server,
      () => getRef.current<Parameters<typeof selectProtectedLiveStreams>[0]>(
        server,
        'config',
      ),
    )
      .then(config => {
        if (!active) {
          return;
        }
        logStartup('config-ready');
        const configuredStreamOptions = selectProtectedLiveStreamOptions(
          config,
          cameraName,
        );
        const selectedStreams = configuredStreamOptions.length > 0
          ? configuredStreamOptions.map(stream => stream.name)
          : selectProtectedLiveStreams(config, cameraName);
        if (selectedStreams.length === 0) {
          setLivePhase('fallback');
          return;
        }
        const effectiveStreamPreference =
          streamPreference?.mode === 'manual' &&
          !selectedStreams.includes(streamPreference.streamName)
            ? {mode: 'auto'} as const
            : streamPreference || {mode: 'auto'} as const;
        if (
          effectiveStreamPreference.mode === 'auto' &&
          streamPreference?.mode === 'manual' &&
          server.profileId
        ) {
          dispatch(
            setLiveStreamPreference({
              profileId: server.profileId,
              cameraName,
              preference: {mode: 'auto'},
            }),
          );
        }
        setLivePhase('preparing');
        armFirstFrameTimeout();

        const metadata: Array<StreamMetadata | undefined> =
          Array(selectedStreams.length).fill(undefined);
        const metadataRequestSettled =
          Array(selectedStreams.length).fill(false);
        const failedCandidates = new Set<string>();
        let device: DeviceCodecCapability | undefined;
        let primaryCandidate: PlannedLiveStream | undefined;
        let metadataSettled = 0;
        let mseStartRequest: Promise<boolean> | undefined;
        let webRtcStarted = false;
        let rtspRequested = false;

        const applyPlan = (nextPlan: PlannedLiveStream[]) => {
          const plan = primaryCandidate
            ? [
                primaryCandidate,
                ...nextPlan.filter(candidate =>
                  candidate.name !== primaryCandidate?.name ||
                  candidate.transport !== primaryCandidate.transport,
                ),
              ]
            : nextPlan;
          const names = plan.map(candidate => candidate.name);
          streamNamesRef.current = names;
          setStreamNames(names);
          setStreamCodecs(plan.map(candidate => candidate.codec));
          setStreamFrameRates(plan.map(candidate => {
            const streamMetadata = metadata[
              selectedStreams.indexOf(candidate.name)
            ];
            return streamMetadata?.video?.find(
              descriptor => descriptor.codec === candidate.codec,
            )?.frameRate;
          }));
          setStreamOptions(configuredStreamOptions);
          setStreamOptionLabels(Object.fromEntries(
            configuredStreamOptions.map((stream, index) => {
              const candidate = plan.find(item => item.name === stream.name);
              const video = metadata[index]?.video || [];
              const descriptor = video.find(
                item => item.codec === candidate?.codec,
              ) || video[0];
              return [
                stream.name,
                formatStreamOptionLabel(stream, descriptor),
              ];
            }),
          ));
          const compatibleIndex = plan.findIndex(
            candidate => candidate.transport === 'webrtc',
          );
          setFirstCompatibleStreamIndex(
            compatibleIndex >= 0 ? compatibleIndex : plan.length,
          );
        };

        const startWebRtc = (
          candidate: PlannedLiveStream,
          hedged: boolean,
        ) => {
          if (
            webRtcStarted ||
            !active ||
            firstFrameExpired.current ||
            winningTransport.current
          ) {
            return;
          }
          webRtcStarted = true;
          setWebRtcStreamName(candidate.name);
          logStartup(
            hedged ? 'hedge-start' : 'transport-start',
            'transport=webrtc',
          );
          if (!primaryCandidate) {
            primaryCandidate = candidate;
            applyPlan([candidate]);
            setStreamIndex(0);
            setActiveTransport('webrtc');
          }
          setConnectionAttempt(0);
          setLivePhase('connecting');

          if (!hedged && !rtspRequested) {
            rtspRequested = true;
            void prepareLocalRtspMedia(
              server,
              config,
              cameraName,
              candidate.name,
            )
              .then(media => {
                if (
                  !active ||
                  firstFrameExpired.current ||
                  winningTransport.current
                ) {
                  releaseProtectedMediaUri(media.uri);
                  return;
                }
                logStartup('hedge-start', 'transport=rtsp');
                setRtspMedia(media);
              })
              .catch(error => {
                SecureLogger.logError(error as Error, 'preparing-local-live');
              });
          }
        };

        const startMse = (
          candidate: PlannedLiveStream,
          streamMetadata?: StreamMetadata,
          hedged = false,
        ): Promise<boolean> => {
          if (mseStartRequest) {
            return mseStartRequest;
          }
          mseStartRequest = (async () => {
            try {
              if (!(await profileRegistrationRequest)) {
                throw new Error('The protected MSE profile is unavailable');
              }
              const uri = await protectedMseMediaUri(server, candidate.name);
              if (
                !active ||
                firstFrameExpired.current ||
                winningTransport.current
              ) {
                releaseProtectedMediaUri(uri);
                return false;
              }
              if (!primaryCandidate) {
                primaryCandidate = candidate;
                applyPlan([candidate]);
                setStreamIndex(0);
                setActiveTransport('mse');
              }
              logStartup(
                hedged ? 'hedge-start' : 'transport-start',
                'transport=mse',
              );
              setMseAudioAvailable((streamMetadata?.audio.length || 0) > 0);
              setMseStreamName(candidate.name);
              setMseMedia({
                uri,
                mimeType: 'video/mp4',
                mode: 'direct',
              });
              setLivePhase('connecting');
              return true;
            } catch (error) {
              failedCandidates.add(`mse:${candidate.name}`);
              mseStartRequest = undefined;
              SecureLogger.logError(error as Error, 'protected-mse-prepare');
              return false;
            }
          })();
          return mseStartRequest;
        };

        const attemptPlan = () => {
          if (
            !active ||
            !device ||
            firstFrameExpired.current
          ) {
            return;
          }
          if (
            effectiveStreamPreference.mode === 'manual' &&
            !metadataRequestSettled[selectedStreams.indexOf(
              effectiveStreamPreference.streamName,
            )]
          ) {
            return;
          }
          const mseEnabled = protectedMseProbeEnabled();
          const plan = planProtectedLiveStreams({
            streams: selectedStreams.map((name, index) => ({
              name,
              metadata: metadata[index],
            })),
            device,
            selection: effectiveStreamPreference,
            mseEnabled,
          }).filter(candidate =>
            !failedCandidates.has(`${candidate.transport}:${candidate.name}`),
          );
          if (plan.length === 0) {
            if (metadataSettled === selectedStreams.length) {
              logStartup('plan-unavailable');
              setLivePhase('fallback');
            }
            return;
          }
          applyPlan(plan);
          if (winningTransport.current) {
            return;
          }
          if (!primaryCandidate) {
            const candidate = plan[0];
            if (candidate.transport === 'mse') {
              void startMse(
                candidate,
                metadata[selectedStreams.indexOf(candidate.name)],
              ).then(started => {
                if (!started) {
                  primaryCandidate = undefined;
                }
                attemptPlan();
              });
            } else {
              startWebRtc(candidate, false);
              attemptPlan();
            }
            return;
          }

          const alternative = plan.find(candidate =>
            candidate.transport !== primaryCandidate?.transport,
          );
          if (!alternative || hedgeTimer.current) {
            return;
          }
          hedgeTimer.current = setTimeout(() => {
            hedgeTimer.current = undefined;
            if (
              !active ||
              firstFrameExpired.current ||
              winningTransport.current
            ) {
              return;
            }
            if (alternative.transport === 'webrtc') {
              startWebRtc(alternative, true);
            } else {
              void startMse(
                alternative,
                metadata[selectedStreams.indexOf(alternative.name)],
                true,
              );
            }
          }, LIVE_HEDGE_DELAY_MS);
        };

        void deviceCapabilityRequest
          .then(capability => {
            if (!active) {
              return;
            }
            device = capability;
            logStartup('capability-ready');
            SecureLogger.logInfo(
              `availability=${capability.availability}, hardware=${capability.hardware}, software=${capability.software}, maxWidth=${capability.maxWidth ?? 'unknown'}, maxHeight=${capability.maxHeight ?? 'unknown'}, maxFrameRate=${capability.maxFrameRate ?? 'unknown'}, mseEnabled=${protectedMseProbeEnabled()}`,
              'protected-live-capability',
            );
            attemptPlan();
          })
          .catch(error => {
            SecureLogger.logError(error as Error, 'probing-live-codecs');
            if (active) {
              setLivePhase('fallback');
            }
          });

        selectedStreams.forEach((selectedStream, index) => {
          void fetchStreamMetadata(server, selectedStream)
            .then(value => {
              if (!active) {
                return;
              }
              metadata[index] = value;
              const audioCodecs = new Set(
                value.audio.map(descriptor => descriptor.codec),
              );
              logStartup('metadata-ready', `streamIndex=${index}`);
              SecureLogger.logInfo(
                `streamIndex=${index}, metadataAvailable=true, malformed=${value.malformed}, aac=${audioCodecs.has('aac')}, opus=${audioCodecs.has('opus')}, pcma=${audioCodecs.has('pcma')}, pcmu=${audioCodecs.has('pcmu')}`,
                'protected-live-codecs',
              );
              metadataSettled += 1;
              metadataRequestSettled[index] = true;
              attemptPlan();
            })
            .catch(error => {
              if (active) {
                SecureLogger.logError(error as Error, 'loading-live-metadata');
                SecureLogger.logInfo(
                  `streamIndex=${index}, metadataAvailable=false`,
                  'protected-live-codecs',
                );
              }
              metadataSettled += 1;
              metadataRequestSettled[index] = true;
              attemptPlan();
            });
        });
      })
      .catch(error => {
        SecureLogger.logError(error as Error, 'loading-live-stream-config');
        if (active) {
          if (firstFrameTimer.current) {
            clearTimeout(firstFrameTimer.current);
            firstFrameTimer.current = undefined;
          }
          if (hedgeTimer.current) {
            clearTimeout(hedgeTimer.current);
            hedgeTimer.current = undefined;
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
    logStartup,
    playbackActive,
    setActiveTransport,
    server,
    streamPreference,
    dispatch,
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
        pointerEvents="box-none"
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
        mseMedia &&
        (livePhase === 'connecting' || livePhase === 'live') && (
          <Media3MediaPlayer
            key={`${activationId}:mse:${mseStreamName}`}
            media={mseMedia}
            paused={false}
            muted={muted}
            style={[
              styles.livePlayer,
              transport !== 'mse' && styles.hedgedPlayer,
              !decoded && transport === 'mse' && styles.snapshotPending,
            ]}
            onProgress={() => undefined}
            onEnd={() => liveFailed('mse', 'timeout')}
            onError={() => liveFailed('mse', 'codec')}
            onFirstFrame={handleMsePlaying}
          />
        )}
      {playbackActive &&
        rtspMedia &&
        (livePhase === 'connecting' || livePhase === 'live') && (
          <LocalRtspPlayer
            key={`${activationId}:rtsp`}
            media={rtspMedia}
            active
            muted={muted}
            style={[
              styles.livePlayer,
              transport !== 'rtsp' && styles.hedgedPlayer,
              !decoded && transport === 'rtsp' && styles.snapshotPending,
            ]}
            onPlaying={handleRtspPlaying}
            onError={() => liveFailed('rtsp', 'timeout')}
          />
        )}
      {playbackActive &&
        webRtcStreamName &&
        (livePhase === 'connecting' || livePhase === 'live') && (
          <ProtectedWebRTCPlayer
            key={`${activationId}:${webRtcStreamName}:${connectionAttempt}`}
            server={server}
            streamName={webRtcStreamName}
            muted={muted}
            style={[
              styles.livePlayer,
              transport !== 'webrtc' && styles.hedgedPlayer,
            ]}
            onPlaying={handleWebRtcPlaying}
            onError={handleWebRtcFailure}
            onAudioAvailabilityChange={handleWebRtcAudioAvailabilityChange}
            onAudioStatusChange={handleWebRtcAudioStatusChange}
          />
        )}
      {playbackActive && decoded && livePhase === 'live' && (
        <Pressable
          testID="camera-preview-media-tap"
          accessible={false}
          pointerEvents="auto"
          style={styles.mediaTapSurface}
          onPress={handleDecodedMediaPress}
        />
      )}
      {streamSelectorOpen && (
        <Pressable
          testID="camera-preview-stream-menu-dismiss"
          accessible={false}
          style={styles.streamMenuDismissSurface}
          onPress={() => handleStreamSelectorOpenChange(false)}
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
              testID="camera-preview-retry"
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel={intl.formatMessage({
                id: 'cameraPreview.retry',
              })}
              onPress={retryLiveDiscovery}
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
              streamType={activeStreamType}
              frameRate={activeStreamFrameRate}
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
            streamControl={
              streamOptions.length > 1 && server.profileId ? (
                <LiveStreamControl
                  open={streamSelectorOpen}
                  onOpenChange={handleStreamSelectorOpenChange}
                  value={
                    streamName || (streamPreference?.mode === 'manual'
                      ? streamPreference.streamName
                      : 'auto')
                  }
                  options={[
                    {
                      value: 'auto',
                      label: intl.formatMessage({
                        id: 'cameraPreview.stream.auto',
                        defaultMessage: 'Auto (prefer HEVC)',
                      }),
                    },
                    ...streamOptions.map(stream => ({
                      value: stream.name,
                      label: streamOptionLabels[stream.name] || stream.label,
                    })),
                  ]}
                  onValueChange={value => {
                    dispatch(
                      setLiveStreamPreference({
                        profileId: server.profileId as string,
                        cameraName,
                        preference:
                          value === 'auto'
                            ? {mode: 'auto'}
                            : {mode: 'manual', streamName: value},
                      }),
                    );
                  }}
                />
              ) : undefined
            }
          />
        )}
      </View>
    </View>
  );
};
