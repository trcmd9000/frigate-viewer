import React, {FC, useCallback, useEffect, useRef, useState} from 'react';
import type {PropsWithChildren} from 'react';
import {
  ImageStyle,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
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
import {releaseProtectedMediaUri} from '../../helpers/protectedMedia';
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

type LivePreviewProps = PropsWithChildren<{
  cameraName: string;
}>;

const LIVE_PREVIEW_REFRESH_MS = 1000;
const LIVE_FIRST_FRAME_TIMEOUT_MS = 15_000;

export const LivePreview: FC<LivePreviewProps> = ({cameraName}) => {
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
      left: 16,
      right: 16,
      bottom: 16,
      alignItems: 'center',
      backgroundColor: theme.mediaOverlay,
      borderRadius: 8,
      padding: 8,
    },
    fallbackText: {
      color: theme.textInverse,
      marginBottom: 8,
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
  const [transport, setTransport] = useState<LivePreviewTransport>();
  const transportRef = useRef<LivePreviewTransport>();
  const [decoded, setDecoded] = useState(false);
  const [fallbackReason, setFallbackReason] =
    useState<ProtectedLiveFailureReason>();
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [discoveryGeneration, setDiscoveryGeneration] = useState(0);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const firstFrameTimer = useRef<ReturnType<typeof setTimeout>>();
  const firstFrameExpired = useRef(false);
  const [muted, setMuted] = useState(true);
  const pendingImageRef = useRef<SnapshotHandoffState['pending']>();
  const nextHandoffId = useRef(0);
  const intl = useIntl();
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
    releaseDownloadedMedia(pending.path).catch(() => undefined);
  }, []);
  const livePlaying = useCallback(() => {
    if (firstFrameExpired.current) {
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
  const liveFailed = useCallback(
    (reason?: ProtectedLiveFailureReason) => {
      if (firstFrameExpired.current) {
        return;
      }
      setMuted(true);
      setDecoded(false);
      setFallbackReason(reason);
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
        await releaseDownloadedMedia(previousPending.path);
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
      releaseDownloadedMedia(path).catch(() => undefined);
      releaseDownloadedMedia(pending?.path).catch(() => undefined);
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
    setDecoded(false);
    setRtspMedia(undefined);
    transportRef.current = undefined;
    setTransport(undefined);
    setStreamNames([]);
    setFallbackReason(undefined);
    setLivePhase('snapshot');
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
        firstFrameTimer.current = setTimeout(() => {
          firstFrameExpired.current = true;
          setMuted(true);
          setDecoded(false);
          setFallbackReason('timeout');
          setRtspMedia(undefined);
          setLivePhase('fallback');
          firstFrameTimer.current = undefined;
        }, LIVE_FIRST_FRAME_TIMEOUT_MS);
        prepareLocalRtspMedia(server, config, cameraName)
          .then(media => {
            if (!active || firstFrameExpired.current) {
              releaseProtectedMediaUri(media.uri);
              return;
            }
            setRtspMedia(media);
            setActiveTransport('rtsp');
            setLivePhase('connecting');
          })
          .catch(error => {
            // A local route is optional. Its failure must not delay protected
            // WebRTC, and the error is intentionally not exposed to the UI.
            SecureLogger.logError(error as Error, 'preparing-local-live');
            if (active && !firstFrameExpired.current) {
              setActiveTransport('webrtc');
              setLivePhase('connecting');
            }
          });
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
      requestId.current += 1;
      if (interval.current) {
        clearInterval(interval.current);
      }
      const path = currentPath.current;
      const pending = pendingImageRef.current;
      currentPath.current = undefined;
      pendingImageRef.current = undefined;
      releaseDownloadedMedia(path).catch(() => undefined);
      releaseDownloadedMedia(pending?.path).catch(() => undefined);
    };
  }, []);

  return (
    <View style={styles.container}>
      <View
        testID="camera-preview-media"
        style={styles.mediaFrame}
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
            releaseDownloadedMedia(previousPath).catch(() => undefined);
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
            releaseDownloadedMedia(pending.path).catch(() => undefined);
          }}
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
          />
        )}
      {playbackActive &&
        (livePhase === 'degraded' || livePhase === 'fallback') && (
          <View style={styles.fallbackPanel}>
            <Text style={styles.fallbackText}>
              {intl.formatMessage({
                id: fallbackReason
                  ? `cameraPreview.fallback.${fallbackReason}`
                  : 'cameraPreview.fallback.message',
              })}
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
          </View>
        )}
        <LiveStatusBadge state={livePhase} transport={transport} />
        {decoded && (transport === 'rtsp' || transport === 'webrtc') && (
          <LiveAudioControl
            muted={muted}
            onToggle={() => setMuted(current => !current)}
          />
        )}
      </View>
    </View>
  );
};
