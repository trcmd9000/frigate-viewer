import React, {useEffect, useRef, useState} from 'react';
import {StyleProp, StyleSheet, ViewStyle} from 'react-native';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
} from 'react-native-webrtc';
import type {MediaStreamTrack} from 'react-native-webrtc';
import type {Server} from '../../store/settings';
import {
  openProtectedLiveSocket,
  ProtectedLiveSocket,
  hasAcceptedVideoMedia,
  hasAcceptedAudioMedia,
  summarizeAudioMedia,
  summarizeVideoMedia,
} from '../../helpers/protectedLive';
import {
  acquireProtectedAudio,
  addProtectedAudioFocusLostListener,
  releaseProtectedAudio,
} from '../../helpers/protectedAudio';
import type {ProtectedAudioStatus} from '../../helpers/protectedAudio';
import {
  classifyProtectedLiveTimeout,
  formatProtectedLiveDiagnostics,
} from '../../helpers/protectedLiveDiagnostics';
import type {
  ProtectedLiveDiagnostics,
  ProtectedLiveFailureReason,
} from '../../helpers/protectedLiveDiagnostics';
import {SecureLogger} from '../../helpers/secureLogger';

interface ProtectedWebRTCPlayerProps {
  server: Server;
  streamName: string;
  muted: boolean;
  style: StyleProp<ViewStyle>;
  onPlaying: () => void;
  onError: (reason?: ProtectedLiveFailureReason) => void;
  onAudioAvailabilityChange?: (available: boolean) => void;
  onAudioActivationChange?: (active: boolean) => void;
  onAudioStatusChange?: (status: ProtectedAudioStatus) => void;
}

interface Go2RtcMessage {
  type?: string;
  value?: string;
}

interface FirstFrameTimeoutToken {
  generation: number;
  status: 'armed' | 'running' | 'cancelled';
}

const playerStyles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
});
export const WEBRTC_FIRST_FRAME_TIMEOUT_MS = 15_000;
export const AUDIO_ACTIVATION_TIMEOUT_MS = 5_000;
const DIAGNOSTICS_TIMEOUT_MS = 1_000;
export const PROTECTED_LIVE_RECHECK_DELAYS_MS = [100, 500, 1_500] as const;

export const ProtectedWebRTCPlayer = ({
  server,
  streamName,
  muted,
  style,
  onPlaying,
  onError,
  onAudioAvailabilityChange,
  onAudioActivationChange,
  onAudioStatusChange,
}: ProtectedWebRTCPlayerProps) => {
  const [remoteStream, setRemoteStream] = useState<MediaStream>();
  const [frameReady, setFrameReady] = useState(false);
  const [renderedConnectionGeneration, setRenderedConnectionGeneration] =
    useState(0);
  const remoteStreamRef = useRef<MediaStream>();
  const playingReportedRef = useRef(false);
  const mutedRef = useRef(muted);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const cancelConnectionTimeoutRef = useRef<() => void>(() => undefined);
  const frameReadyRef = useRef(false);
  const audioTrackAvailableRef = useRef(false);
  const audioActiveRef = useRef(false);
  const syncAudioRef = useRef<() => void>(() => undefined);
  const audioGenerationRef = useRef({value: 0});
  const componentGenerationRef = useRef({value: 0});
  const mountedRef = useRef(false);
  const audioLeaseRef = useRef<string>();
  // A cancelled native call cannot be aborted. Queue retries until it settles.
  const nativeAcquireInFlightRef = useRef(false);
  const pendingAcquireRef = useRef<{
    componentGeneration: number;
    audioGeneration: number;
    desiredMuted: boolean;
    trackAvailable: boolean;
    requestedOwnerToken?: string;
    tombstoned: boolean;
    timer?: ReturnType<typeof setTimeout>;
    start?: () => void;
  }>();
  const onAudioAvailabilityChangeRef = useRef(onAudioAvailabilityChange);
  const onAudioActivationChangeRef = useRef(onAudioActivationChange);
  const onAudioStatusChangeRef = useRef(onAudioStatusChange);
  const postFrameDiagnosticsRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    onAudioAvailabilityChangeRef.current = onAudioAvailabilityChange;
    onAudioActivationChangeRef.current = onAudioActivationChange;
    onAudioStatusChangeRef.current = onAudioStatusChange;
  }, [onAudioActivationChange, onAudioAvailabilityChange, onAudioStatusChange]);

  useEffect(() => {
    mutedRef.current = muted;
    remoteStreamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = false;
    });
    syncAudioRef.current();
  }, [muted]);

  useEffect(() => {
    let active = true;
    const componentGenerationState = componentGenerationRef.current;
    const componentGeneration = ++componentGenerationState.value;
    mountedRef.current = true;
    const isCurrentConnection = () =>
      active &&
      mountedRef.current &&
      componentGenerationState.value === componentGeneration;
    const audioGeneration = audioGenerationRef.current;
    let failed = false;
    let socket: ProtectedLiveSocket | undefined;
    let signalingChain = Promise.resolve();
    let remoteDescriptionSet = false;
    const pendingCandidates: RTCIceCandidate[] = [];
    const receivedTracks = new Map<string, MediaStreamTrack>();
    const receiverAudioTracks = new Set<MediaStreamTrack>();
    const streamAudioTracks = new Set<MediaStreamTrack>();
    const tombstonedTracks = new Set<MediaStreamTrack>();
    const inboundAudioPacketsRef = {value: undefined as number | undefined};
    const inboundAudioBytesRef = {value: undefined as number | undefined};
    const trackSubscriptions = new Map<
      MediaStreamTrack,
      {
        onended: MediaStreamTrack['onended'];
        onmute: MediaStreamTrack['onmute'];
        onunmute: MediaStreamTrack['onunmute'];
        endedHandler: NonNullable<MediaStreamTrack['onended']>;
        muteHandler: NonNullable<MediaStreamTrack['onmute']>;
        unmuteHandler: NonNullable<MediaStreamTrack['onunmute']>;
      }
    >();
    const streamSubscriptions = new Map<
      MediaStream,
      {
        onaddtrack: MediaStream['onaddtrack'];
        onremovetrack: MediaStream['onremovetrack'];
        addHandler: NonNullable<MediaStream['onaddtrack']>;
        removeHandler: NonNullable<MediaStream['onremovetrack']>;
      }
    >();
    let audioAccepted: boolean | undefined;
    let audioAvailabilityReported = false;
    let audioActivationReported = false;
    let audioStatus: ProtectedAudioStatus = {state: 'inactive'};
    let activationFailed = false;
    let routedAudioTracks = new Set<MediaStreamTrack>();
    const reportAudioStatus = (status: ProtectedAudioStatus) => {
      if (!isCurrentConnection()) {
        return;
      }
      audioStatus = status;
      // Intentionally independent of the legacy boolean's deduplication.
      onAudioStatusChangeRef.current?.(status);
    };
    const diagnosticsLogCounts = new Map<
      'answer' | 'frame-ready' | 'post-answer' | 'post-frame' | 'timeout',
      number
    >();
    const postAnswerTimers = new Set<ReturnType<typeof setTimeout>>();
    const postFrameTimers = new Set<ReturnType<typeof setTimeout>>();
    const diagnosticsTimeoutTimers = new Set<ReturnType<typeof setTimeout>>();
    const clearDiagnosticsTimers = () => {
      postAnswerTimers.forEach(timer => clearTimeout(timer));
      postFrameTimers.forEach(timer => clearTimeout(timer));
      diagnosticsTimeoutTimers.forEach(timer => clearTimeout(timer));
      postAnswerTimers.clear();
      postFrameTimers.clear();
      diagnosticsTimeoutTimers.clear();
    };
    let timeoutToken: FirstFrameTimeoutToken | undefined;
    const cancelConnectionTimeout = () => {
      if (timeoutToken) {
        timeoutToken.status = 'cancelled';
        timeoutToken = undefined;
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = undefined;
      }
    };
    cancelConnectionTimeoutRef.current = cancelConnectionTimeout;
    const peer = new RTCPeerConnection({
      bundlePolicy: 'max-bundle',
      iceServers: [],
    });
    peer.addTransceiver('video', {direction: 'recvonly'});
    peer.addTransceiver('audio', {direction: 'recvonly'});
    frameReadyRef.current = false;
    audioTrackAvailableRef.current = false;
    audioActiveRef.current = false;
    onAudioAvailabilityChangeRef.current?.(false);
    onAudioActivationChangeRef.current?.(false);
    reportAudioStatus({state: 'inactive'});
    const reportAudioAvailability = (available: boolean) => {
      if (audioAvailabilityReported === available) {
        return;
      }
      audioAvailabilityReported = available;
      audioTrackAvailableRef.current = available;
      onAudioAvailabilityChangeRef.current?.(available);
    };
    const reportAudioActivation = (activeAudio: boolean) => {
      if (audioActivationReported === activeAudio) {
        return;
      }
      audioActivationReported = activeAudio;
      audioActiveRef.current = activeAudio;
      onAudioActivationChangeRef.current?.(activeAudio);
    };
    const disableAudioTracks = () => {
      [...receivedTracks.values()]
        .filter(track => track.kind === 'audio')
        .forEach(track => {
          track.enabled = false;
        });
    };
    const isUsableAudioTrack = (track: MediaStreamTrack) =>
      track.kind === 'audio' && track.readyState !== 'ended';
    const refreshAudioAvailability = () => {
      if (!isCurrentConnection()) {
        return;
      }
      const liveAudioTracks = [...receivedTracks.values()].filter(
        track =>
          isUsableAudioTrack(track) &&
          (receiverAudioTracks.has(track) || streamAudioTracks.has(track)),
      );
      reportAudioAvailability(
        audioAccepted === true &&
          liveAudioTracks.length > 0,
      );
    };
    const tombstonePendingAcquire = () => {
      const pending = pendingAcquireRef.current;
      if (!pending) {
        return;
      }
      pending.tombstoned = true;
      clearTimeout(pending.timer);
      pendingAcquireRef.current = undefined;
    };
    const releaseAudioLease = (token = audioLeaseRef.current) => {
      if (!token) {
        return;
      }
      if (audioLeaseRef.current === token) {
        audioLeaseRef.current = undefined;
        routedAudioTracks.clear();
      }
      releaseProtectedAudio(token).catch(error => {
        SecureLogger.logError(
          error instanceof Error
            ? error
            : new Error('Protected audio release failed'),
          'protected-live-audio',
        );
      });
    };
    const releaseStaleAcquireToken = (token: string) => {
      if (audioLeaseRef.current === token) {
        return;
      }
      releaseAudioLease(token);
    };
    const syncAudio = () => {
      if (!isCurrentConnection()) {
        return;
      }
      const usableTracks = [...receivedTracks.values()].filter(
        track =>
          isUsableAudioTrack(track) &&
          (receiverAudioTracks.has(track) || streamAudioTracks.has(track)),
      );
      const canActivate =
        active &&
        frameReadyRef.current &&
        audioTrackAvailableRef.current &&
        usableTracks.length > 0 &&
        !mutedRef.current;
      if (!canActivate) {
        ++audioGeneration.value;
        tombstonePendingAcquire();
        disableAudioTracks();
        releaseAudioLease();
        reportAudioActivation(false);
        if (mutedRef.current) {
          activationFailed = false;
        }
        if (audioStatus.state !== 'failed' && audioStatus.state !== 'inactive') {
          reportAudioStatus({state: 'inactive'});
        }
        return;
      }
      if (activationFailed) {
        return;
      }
      const pending = pendingAcquireRef.current;
      if (
        pending &&
        !pending.tombstoned &&
        !pending.desiredMuted &&
        pending.trackAvailable &&
        usableTracks.length > 0
      ) {
        return;
      }
      if (
        audioLeaseRef.current &&
        usableTracks.length === routedAudioTracks.size &&
        usableTracks.every(track => routedAudioTracks.has(track))
      ) {
        usableTracks.forEach(track => { track.enabled = true; });
        reportAudioActivation(true);
        return;
      }
      ++audioGeneration.value;
      tombstonePendingAcquire();
      const generation = audioGeneration.value;
      const acquire: NonNullable<typeof pendingAcquireRef.current> = {
        componentGeneration,
        audioGeneration: generation,
        desiredMuted: mutedRef.current,
        trackAvailable: audioTrackAvailableRef.current,
        requestedOwnerToken: audioLeaseRef.current,
        tombstoned: false,
      };
      pendingAcquireRef.current = acquire;
      const failActivation = (reason: 'focus-denied' | 'native' | 'timeout') => {
        activationFailed = true;
        ++audioGeneration.value;
        tombstonePendingAcquire();
        disableAudioTracks();
        releaseAudioLease();
        reportAudioActivation(false);
        reportAudioStatus({state: 'failed', reason});
      };
      reportAudioStatus({state: 'pending'});
      acquire.timer = setTimeout(() => {
        if (isCurrentConnection() && pendingAcquireRef.current === acquire) {
          failActivation('timeout');
        }
      }, AUDIO_ACTIVATION_TIMEOUT_MS);
      acquire.start = () => {
        if (
          nativeAcquireInFlightRef.current ||
          !isCurrentConnection() ||
          acquire.tombstoned ||
          pendingAcquireRef.current !== acquire
        ) {
          return;
        }
        nativeAcquireInFlightRef.current = true;
        acquireProtectedAudio(acquire.requestedOwnerToken)
        .then(ownerToken => {
          const currentPending = pendingAcquireRef.current === acquire;
          const usableTracksAtCompletion = [...receivedTracks.values()].filter(
            isUsableAudioTrack,
          );
          const leaseStillOwned =
            !acquire.requestedOwnerToken ||
            audioLeaseRef.current === acquire.requestedOwnerToken;
          const completionIsCurrent =
            currentPending &&
            !acquire.tombstoned &&
            mountedRef.current &&
            active &&
            componentGenerationState.value === componentGeneration &&
            generation === audioGeneration.value &&
            acquire.audioGeneration === generation &&
            acquire.desiredMuted === mutedRef.current &&
            !mutedRef.current &&
            audioTrackAvailableRef.current &&
            usableTracksAtCompletion.length > 0 &&
            leaseStillOwned;
          if (
            !completionIsCurrent
          ) {
            if (ownerToken) {
              releaseStaleAcquireToken(ownerToken);
            }
            return;
          }
          if (!ownerToken) {
            failActivation('focus-denied');
            return;
          }
          clearTimeout(acquire.timer);
          pendingAcquireRef.current = undefined;
          audioLeaseRef.current = ownerToken;
          const tracksToEnable = usableTracksAtCompletion;
          if (tracksToEnable.length === 0) {
            releaseAudioLease(ownerToken);
            disableAudioTracks();
            reportAudioAvailability(false);
            reportAudioActivation(false);
            return;
          }
          [...receivedTracks.values()]
            .filter(track => track.kind === 'audio' && tracksToEnable.includes(track))
            .forEach(track => {
              track.enabled = true;
            });
          reportAudioActivation(true);
          routedAudioTracks = new Set(tracksToEnable);
          reportAudioStatus({state: 'active'});
        })
        .catch(() => {
          const currentPending = pendingAcquireRef.current === acquire;
          if (
            !currentPending ||
            acquire.tombstoned ||
            !mountedRef.current ||
            !active ||
            componentGenerationState.value !== componentGeneration ||
            generation !== audioGeneration.value
          ) {
            return;
          }
          failActivation('native');
        })
        .finally(() => {
          nativeAcquireInFlightRef.current = false;
          pendingAcquireRef.current?.start?.();
        });
      };
      acquire.start();
    };
    syncAudioRef.current = syncAudio;
    let focusLostSubscription: ReturnType<
      typeof addProtectedAudioFocusLostListener
    >;
    try {
      focusLostSubscription = addProtectedAudioFocusLostListener(ownerToken => {
        if (!isCurrentConnection()) {
          return;
        }
        if (ownerToken && ownerToken !== audioLeaseRef.current) {
          if (!pendingAcquireRef.current) {
            return;
          }
          tombstonePendingAcquire();
          activationFailed = true;
          disableAudioTracks();
          releaseAudioLease();
          reportAudioActivation(false);
          reportAudioStatus({state: 'failed', reason: 'focus-denied'});
          return;
        }
        tombstonePendingAcquire();
        ++audioGeneration.value;
        if (!ownerToken || ownerToken === audioLeaseRef.current) {
          audioLeaseRef.current = undefined;
        }
        disableAudioTracks();
        reportAudioActivation(false);
        activationFailed = true;
        reportAudioStatus({state: 'failed', reason: 'focus-denied'});
      });
    } catch (error) {
      SecureLogger.logError(
        error instanceof Error
          ? error
          : new Error('Protected audio listener is unavailable'),
        'protected-live-audio',
      );
    }
    setRemoteStream(undefined);
    setFrameReady(false);
    playingReportedRef.current = false;

    const fail = (error: unknown, reason?: ProtectedLiveFailureReason) => {
      if (!active || failed) {
        return;
      }
      failed = true;
      reportAudioStatus({state: 'inactive'});
      active = false;
      ++componentGenerationState.value;
      cancelConnectionTimeout();
      clearDiagnosticsTimers();
      socket?.close();
      peer.close();
      ++audioGeneration.value;
      tombstonePendingAcquire();
      disableAudioTracks();
      releaseAudioLease();
      focusLostSubscription?.remove();
      reportAudioActivation(false);
      reportAudioAvailability(false);
      remoteStreamRef.current?.getTracks().forEach(track => track.stop());
      remoteStreamRef.current = undefined;
      setRenderedConnectionGeneration(0);
      setRemoteStream(undefined);
      setFrameReady(false);
      SecureLogger.logError(
        error instanceof Error
          ? error
          : new Error('Protected WebRTC playback failed'),
        'protected-live-playback',
      );
      onError(reason);
    };

    const removeReceivedTrack = (
      track: MediaStreamTrack,
      source?: 'receiver' | 'stream',
    ) => {
      if (track.kind === 'audio') {
        if (!source || source === 'receiver') {
          receiverAudioTracks.delete(track);
        }
        if (!source || source === 'stream') {
          streamAudioTracks.delete(track);
        }
        if (![...receiverAudioTracks].some(isUsableAudioTrack)) {
          inboundAudioPacketsRef.value = undefined;
          inboundAudioBytesRef.value = undefined;
        }
        if (
          receiverAudioTracks.has(track) ||
          streamAudioTracks.has(track)
        ) {
          return;
        }
      }
      for (const [key, receivedTrack] of receivedTracks.entries()) {
        if (receivedTrack === track) {
          receivedTracks.delete(key);
          break;
        }
      }
      tombstonedTracks.add(track);
      const subscription = trackSubscriptions.get(track);
      if (subscription) {
        try {
          if (track.onended === subscription.endedHandler) {
            track.onended = subscription.onended;
          }
          if (track.onmute === subscription.muteHandler) {
            track.onmute = subscription.onmute;
          }
          if (track.onunmute === subscription.unmuteHandler) {
            track.onunmute = subscription.onunmute;
          }
        } catch {
          // Native track shims may not support property cleanup.
        }
        trackSubscriptions.delete(track);
      }
    };
    const addReceivedTrack = (
      track: MediaStreamTrack,
      source: 'receiver' | 'stream' = 'receiver',
    ) => {
      if (tombstonedTracks.has(track)) {
        return;
      }
      if (track.readyState === 'ended') {
        removeReceivedTrack(track, source);
        return;
      }
      if (track.kind === 'audio') {
        if (source === 'receiver') {
          receiverAudioTracks.add(track);
        } else {
          streamAudioTracks.add(track);
        }
      }
      if (
        ![...receivedTracks.values()].some(receivedTrack => receivedTrack === track)
      ) {
        const key = track.id || `${track.kind}:${receivedTracks.size}`;
        receivedTracks.set(key, track);
        attachTrackLifecycle(track);
      }
    };
    const attachTrackLifecycle = (track: MediaStreamTrack) => {
      if (trackSubscriptions.has(track)) {
        return;
      }
      const onended = track.onended;
      const onmute = track.onmute;
      const onunmute = track.onunmute;
      const refreshAudio = () => {
        if (track.kind !== 'audio' || !isCurrentConnection()) {
          return;
        }
        if (track.readyState === 'ended') {
          track.enabled = false;
        }
        refreshAudioAvailability();
        syncAudio();
      };
      const endedHandler: NonNullable<MediaStreamTrack['onended']> = (
        event: Parameters<NonNullable<MediaStreamTrack['onended']>>[0],
      ) => {
        removeReceivedTrack(track);
        updateRemoteStream();
        refreshAudio();
        onended?.(event);
      };
      const muteHandler: NonNullable<MediaStreamTrack['onmute']> = (
        event: Parameters<NonNullable<MediaStreamTrack['onmute']>>[0],
      ) => {
        refreshAudio();
        onmute?.(event);
      };
      const unmuteHandler: NonNullable<MediaStreamTrack['onunmute']> = (
        event: Parameters<NonNullable<MediaStreamTrack['onunmute']>>[0],
      ) => {
        refreshAudio();
        onunmute?.(event);
      };
      try {
        track.onended = endedHandler;
        track.onmute = muteHandler;
        track.onunmute = unmuteHandler;
      } catch {
        // Some native track shims expose these as read-only properties.
      }
      trackSubscriptions.set(track, {
        onended,
        onmute,
        onunmute,
        endedHandler,
        muteHandler,
        unmuteHandler,
      });
    };
    const updateRemoteStream = (streamFromEvent?: MediaStream) => {
      if (!isCurrentConnection()) {
        return;
      }
      let stream = remoteStreamRef.current || streamFromEvent;
      if (!stream && [...receivedTracks.values()].some(
        track => track.kind === 'video',
      )) {
        stream = new MediaStream();
      }
      if (!stream) {
        refreshAudioAvailability();
        syncAudio();
        return;
      }
      stream.getTracks().forEach(track => {
        if (!tombstonedTracks.has(track)) {
          return;
        }
        try {
          stream.removeTrack(track);
        } catch {
          // Native stream shims may not support removal.
        }
      });
      [...receivedTracks.values()].forEach(track => {
        attachTrackLifecycle(track);
        if (!stream?.getTracks().includes(track)) {
          stream?.addTrack(track);
        }
      });
      if (!audioActiveRef.current) {
        stream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }
      refreshAudioAvailability();
      syncAudio();
      if (stream.getVideoTracks().length === 0) {
        return;
      }
      remoteStreamRef.current = stream;
      setRenderedConnectionGeneration(componentGeneration);
      setRemoteStream(stream);
    };
    const attachStreamLifecycle = (stream: MediaStream) => {
      if (streamSubscriptions.has(stream)) {
        return;
      }
      const onaddtrack = stream.onaddtrack;
      const onremovetrack = stream.onremovetrack;
      const addHandler: NonNullable<MediaStream['onaddtrack']> = (
        event: Parameters<NonNullable<MediaStream['onaddtrack']>>[0],
      ) => {
        const track = (event as unknown as {track: MediaStreamTrack}).track;
        addReceivedTrack(track, 'stream');
        updateRemoteStream(stream);
        onaddtrack?.(event);
      };
      const removeHandler: NonNullable<MediaStream['onremovetrack']> = (
        event: Parameters<NonNullable<MediaStream['onremovetrack']>>[0],
      ) => {
        const track = (event as unknown as {track: MediaStreamTrack}).track;
        removeReceivedTrack(track, 'stream');
        updateRemoteStream(stream);
        onremovetrack?.(event);
      };
      try {
        stream.onaddtrack = addHandler;
        stream.onremovetrack = removeHandler;
      } catch {
        // Track events are supplemented by bounded receiver rechecks.
      }
      streamSubscriptions.set(stream, {
        onaddtrack,
        onremovetrack,
        addHandler,
        removeHandler,
      });
    };
    const reconcileStreamAudioTracks = () => {
      streamSubscriptions.forEach((_subscription, stream) => {
        let currentAudioTracks: MediaStreamTrack[] = [];
        try {
          currentAudioTracks = stream.getAudioTracks();
        } catch {
          return;
        }
        const current = new Set(
          currentAudioTracks.filter(track => track.readyState !== 'ended'),
        );
        [...streamAudioTracks].forEach(track => {
          if (!current.has(track)) {
            removeReceivedTrack(track, 'stream');
          }
        });
        current.forEach(track => addReceivedTrack(track, 'stream'));
      });
    };

    const collectReceiverTracks = () => {
      if (!isCurrentConnection()) {
        return;
      }
      let receiverTracks: MediaStreamTrack[] = [];
      try {
        receiverTracks =
          typeof peer.getReceivers === 'function'
            ? peer
                .getReceivers()
                .map(receiver => receiver.track)
                .filter((track): track is MediaStreamTrack => track != null)
            : [];
      } catch {
        return;
      }
      const currentReceiverAudioTracks = new Set(
        receiverTracks.filter(
          track => track.kind === 'audio' && isUsableAudioTrack(track),
        ),
      );
      [...receiverAudioTracks].forEach(track => {
        if (!currentReceiverAudioTracks.has(track)) {
          removeReceivedTrack(track, 'receiver');
        }
      });
      if (currentReceiverAudioTracks.size === 0) {
        inboundAudioPacketsRef.value = undefined;
        inboundAudioBytesRef.value = undefined;
      }
      receiverTracks.forEach(track => addReceivedTrack(track, 'receiver'));
      reconcileStreamAudioTracks();
      refreshAudioAvailability();
      updateRemoteStream();
    };

    peer.ontrack = (event: {
      streams?: MediaStream[];
      track?: MediaStreamTrack | null;
    }) => {
      if (!isCurrentConnection()) {
        return;
      }
      const streamFromEvent = event.streams?.[0];
      if (streamFromEvent) {
        attachStreamLifecycle(streamFromEvent);
        streamFromEvent.getTracks().forEach(track => {
          addReceivedTrack(track, 'stream');
        });
      }
      if (event.track) {
        addReceivedTrack(event.track, 'receiver');
      }
      updateRemoteStream(streamFromEvent);
    };
    peer.onicecandidate = (event: {candidate: RTCIceCandidate | null}) => {
      if (!event.candidate || !socket || !isCurrentConnection()) {
        return;
      }
      socket
        .send(
          JSON.stringify({
            type: 'webrtc/candidate',
            value: event.candidate.candidate,
          }),
        )
        .catch(error => {
          if (isCurrentConnection()) {
            fail(error);
          }
        });
    };
    peer.onconnectionstatechange = () => {
      if (isCurrentConnection() && peer.connectionState === 'failed') {
        fail(new Error('Protected WebRTC connection failed'));
      }
    };

    const collectDiagnostics = async (): Promise<
      ProtectedLiveDiagnostics | undefined
    > => {
      if (!isCurrentConnection()) {
        return undefined;
      }
      collectReceiverTracks();
      const videoTracks = [...receivedTracks.values()].filter(
        track => track.kind === 'video',
      );
      const audioTracks = [...receivedTracks.values()].filter(
        track => track.kind === 'audio',
      );
      const diagnostics: ProtectedLiveDiagnostics = {
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        videoTrackCount: videoTracks.length,
        mutedVideoTrackCount: videoTracks.filter(track => track.muted).length,
        endedVideoTrackCount: videoTracks.filter(
          track => track.readyState === 'ended',
        ).length,
        acceptedAudio: audioAccepted,
        receiverAudioTrackCount: receiverAudioTracks.size,
        streamAudioTrackCount: streamAudioTracks.size,
        audioTrackCount: audioTracks.length,
        readyAudioTrackCount: audioTracks.filter(
          track => track.readyState !== 'ended',
        ).length,
        mutedAudioTrackCount: audioTracks.filter(track => track.muted).length,
        enabledAudioTrackCount: audioTracks.filter(track => track.enabled).length,
        endedAudioTrackCount: audioTracks.filter(
          track => track.readyState === 'ended',
        ).length,
      };
      try {
        const report = await peer.getStats();
        const stats: Array<Record<string, unknown>> = [];
        if (report && typeof report.forEach === 'function') {
          report.forEach((value: unknown) => {
            if (value && typeof value === 'object') {
              stats.push(value as Record<string, unknown>);
            }
          });
        }
        if (!isCurrentConnection()) {
          return undefined;
        }
        const inboundVideo = stats.filter(
          stat =>
            stat.type === 'inbound-rtp' &&
            (stat.kind === 'video' || stat.mediaType === 'video'),
        );
        if (inboundVideo.length > 0) {
          diagnostics.inboundVideoPackets = inboundVideo.reduce(
            (total, stat) =>
              total +
              (Number.isFinite(Number(stat.packetsReceived)) &&
              Number(stat.packetsReceived) >= 0
                ? Number(stat.packetsReceived)
                : 0),
            0,
          );
          diagnostics.inboundVideoFrames = inboundVideo.reduce(
            (total, stat) =>
              total +
              (Number.isFinite(
                Number(stat.framesDecoded ?? stat.framesReceived),
              ) &&
              Number(stat.framesDecoded ?? stat.framesReceived) >= 0
                ? Number(stat.framesDecoded ?? stat.framesReceived)
                : 0),
            0,
          );
        }
        const inboundAudio = stats.filter(
          stat =>
            stat.type === 'inbound-rtp' &&
            (stat.kind === 'audio' || stat.mediaType === 'audio'),
        );
        const hasLiveReceiverAudio = [...receiverAudioTracks].some(
          isUsableAudioTrack,
        );
        if (inboundAudio.length > 0 && hasLiveReceiverAudio) {
          diagnostics.inboundAudioPackets = inboundAudio.reduce(
            (total, stat) =>
              total +
              (Number.isFinite(Number(stat.packetsReceived)) &&
              Number(stat.packetsReceived) >= 0
                ? Number(stat.packetsReceived)
                : 0),
            0,
          );
          diagnostics.inboundAudioBytes = inboundAudio.reduce(
            (total, stat) =>
              total +
              (Number.isFinite(Number(stat.bytesReceived)) &&
              Number(stat.bytesReceived) >= 0
                ? Number(stat.bytesReceived)
                : 0),
            0,
          );
        }
      } catch {
        // A stats failure must not change the playback decision.
        if (!isCurrentConnection()) {
          return undefined;
        }
      }
      if (!isCurrentConnection()) {
        return undefined;
      }
      inboundAudioPacketsRef.value = diagnostics.inboundAudioPackets;
      inboundAudioBytesRef.value = diagnostics.inboundAudioBytes;
      refreshAudioAvailability();
      return diagnostics;
    };

    const logDiagnostics = (
      stage:
        | 'answer'
        | 'frame-ready'
        | 'post-answer'
        | 'post-frame'
        | 'timeout',
      diagnostics: ProtectedLiveDiagnostics,
    ) => {
      const stageCounts = diagnosticsLogCounts.get(stage) ?? 0;
      const stageLimit = stage === 'post-answer' || stage === 'post-frame' ? 3 : 1;
      if (stageCounts >= stageLimit) {
        return;
      }
      diagnosticsLogCounts.set(stage, stageCounts + 1);
      SecureLogger.logInfo(
        formatProtectedLiveDiagnostics(diagnostics, stage),
        'protected-live-audio-diagnostics',
      );
    };

    const scheduleDiagnosticsChecks = (
      stage: 'post-answer' | 'post-frame',
      timers: Set<ReturnType<typeof setTimeout>>,
    ) => {
      PROTECTED_LIVE_RECHECK_DELAYS_MS.forEach(delay => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!isCurrentConnection() || failed) {
            return;
          }
          collectDiagnostics()
            .then(diagnostics => {
              if (!diagnostics || !isCurrentConnection() || failed) {
                return;
              }
              logDiagnostics(stage, diagnostics);
              syncAudio();
            })
            .catch(() => undefined);
        }, delay);
        timers.add(timer);
      });
    };

    postFrameDiagnosticsRef.current = () => {
      if (!isCurrentConnection() || failed) {
        return;
      }
      collectDiagnostics()
        .then(diagnostics => {
          if (!diagnostics || !isCurrentConnection() || failed) {
            return;
          }
          logDiagnostics('frame-ready', diagnostics);
          syncAudio();
          scheduleDiagnosticsChecks('post-frame', postFrameTimers);
        })
        .catch(() => undefined);
    };

    const connect = async () => {
      socket = await openProtectedLiveSocket(server, streamName, {
        onState: event => {
          if (
            isCurrentConnection() &&
            (event.state === 'error' || event.state === 'closed')
          ) {
            fail(new Error('Protected live signaling failed'));
          }
        },
        onMessage: message => {
          if (!isCurrentConnection() || message.length > 1024 * 1024) {
            if (isCurrentConnection()) {
              fail(new Error('Protected live signaling message is too large'));
            }
            return;
          }
          signalingChain = signalingChain
            .then(async () => {
              if (!isCurrentConnection()) {
                return;
              }
              const parsed = JSON.parse(message) as Go2RtcMessage;
              if (parsed.type === 'webrtc/candidate' && parsed.value) {
                const candidate = new RTCIceCandidate({
                  candidate: parsed.value,
                  sdpMid: '0',
                });
                if (!remoteDescriptionSet) {
                  pendingCandidates.push(candidate);
                } else {
                  await peer.addIceCandidate(candidate);
                  if (!isCurrentConnection()) {
                    return;
                  }
                }
              } else if (parsed.type === 'webrtc/answer' && parsed.value) {
                const answerVideo = summarizeVideoMedia(parsed.value);
                SecureLogger.logInfo(
                  `stage=answer, present=${answerVideo.present}, portAccepted=${answerVideo.portAccepted}, direction=${answerVideo.direction}, h264=${answerVideo.h264}, h265=${answerVideo.h265}, vp8=${answerVideo.vp8}, vp9=${answerVideo.vp9}, av1=${answerVideo.av1}`,
                  'protected-live-sdp-video',
                );
                const answerAudio = summarizeAudioMedia(parsed.value);
                SecureLogger.logInfo(
                  `stage=answer, present=${answerAudio.present}, portAccepted=${answerAudio.portAccepted}, direction=${answerAudio.direction}, opus=${answerAudio.opus}, pcma=${answerAudio.pcma}, pcmu=${answerAudio.pcmu}`,
                  'protected-live-sdp-audio',
                );
                if (!hasAcceptedVideoMedia(parsed.value)) {
                  fail(
                    new Error('Protected live stream has no compatible video'),
                    'codec',
                  );
                  return;
                }
                audioAccepted =
                  typeof hasAcceptedAudioMedia === 'function'
                    ? hasAcceptedAudioMedia(parsed.value)
                    : undefined;
                if (!audioAccepted) {
                  ++audioGeneration.value;
                  disableAudioTracks();
                  releaseAudioLease();
                  reportAudioAvailability(false);
                  reportAudioActivation(false);
                }
                await peer.setRemoteDescription(
                  new RTCSessionDescription({
                    type: 'answer',
                    sdp: parsed.value,
                  }),
                );
                if (!isCurrentConnection()) {
                  return;
                }
                remoteDescriptionSet = true;
                collectReceiverTracks();
                const answerDiagnostics = await collectDiagnostics();
                if (!answerDiagnostics || !isCurrentConnection()) {
                  return;
                }
                logDiagnostics('answer', answerDiagnostics);
                scheduleDiagnosticsChecks('post-answer', postAnswerTimers);
                while (pendingCandidates.length > 0) {
                  const candidate = pendingCandidates.shift();
                  if (candidate) {
                    await peer.addIceCandidate(candidate);
                    if (!isCurrentConnection()) {
                      return;
                    }
                  }
                }
              }
            })
            .catch(() => {
              if (isCurrentConnection()) {
                fail(new Error('Protected live signaling returned invalid data'));
              }
            });
        },
      });
      if (!isCurrentConnection()) {
        socket.close();
        return;
      }
      await socket.ready;
      if (!isCurrentConnection()) {
        socket.close();
        return;
      }
      const offer = await peer.createOffer();
      if (!isCurrentConnection()) {
        return;
      }
      await peer.setLocalDescription(offer);
      if (!isCurrentConnection()) {
        return;
      }
      const localSdp = peer.localDescription?.sdp;
      if (!isCurrentConnection() || !localSdp) {
        if (!localSdp) {
          fail(new Error('Protected WebRTC offer is unavailable'));
        }
        return;
      }
      const offerVideo = summarizeVideoMedia(localSdp);
      SecureLogger.logInfo(
        `stage=offer, present=${offerVideo.present}, portAccepted=${offerVideo.portAccepted}, direction=${offerVideo.direction}, h264=${offerVideo.h264}, h265=${offerVideo.h265}, vp8=${offerVideo.vp8}, vp9=${offerVideo.vp9}, av1=${offerVideo.av1}`,
        'protected-live-sdp-video',
      );
      const offerAudio = summarizeAudioMedia(localSdp);
      SecureLogger.logInfo(
        `stage=offer, present=${offerAudio.present}, portAccepted=${offerAudio.portAccepted}, direction=${offerAudio.direction}, opus=${offerAudio.opus}, pcma=${offerAudio.pcma}, pcmu=${offerAudio.pcmu}`,
        'protected-live-sdp-audio',
      );
      await socket.send(
        JSON.stringify({
          type: 'webrtc/offer',
          value: localSdp,
        }),
      );
      if (!isCurrentConnection()) {
        return;
      }
    };

    connect().catch(fail);
    timeoutToken = {
      generation: componentGeneration,
      status: 'armed',
    };
    const activeTimeoutToken = timeoutToken;
    connectionTimeoutRef.current = setTimeout(() => {
      if (
        !isCurrentConnection() ||
        timeoutToken !== activeTimeoutToken ||
        activeTimeoutToken.status !== 'armed' ||
        frameReadyRef.current
      ) {
        return;
      }
      activeTimeoutToken.status = 'running';
      connectionTimeoutRef.current = undefined;
      const diagnosticsFallback: ProtectedLiveDiagnostics = {
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        videoTrackCount: (() => {
          collectReceiverTracks();
          return [...receivedTracks.values()].filter(
            track => track.kind === 'video',
          ).length;
        })(),
        mutedVideoTrackCount: [...receivedTracks.values()].filter(
          track => track.kind === 'video' && track.muted,
        ).length,
        endedVideoTrackCount: [...receivedTracks.values()].filter(
          track => track.kind === 'video' && track.readyState === 'ended',
        ).length,
        acceptedAudio: audioAccepted,
        receiverAudioTrackCount: receiverAudioTracks.size,
        streamAudioTrackCount: streamAudioTracks.size,
        audioTrackCount: [...receivedTracks.values()].filter(
          track => track.kind === 'audio',
        ).length,
        readyAudioTrackCount: [...receivedTracks.values()].filter(
          track => track.kind === 'audio' && track.readyState !== 'ended',
        ).length,
        mutedAudioTrackCount: [...receivedTracks.values()].filter(
          track => track.kind === 'audio' && track.muted,
        ).length,
        enabledAudioTrackCount: [...receivedTracks.values()].filter(
          track => track.kind === 'audio' && track.enabled,
        ).length,
        endedAudioTrackCount: [...receivedTracks.values()].filter(
          track => track.kind === 'audio' && track.readyState === 'ended',
        ).length,
        inboundAudioPackets: inboundAudioPacketsRef.value,
        inboundAudioBytes: inboundAudioBytesRef.value,
      };
      let diagnosticsTimer: ReturnType<typeof setTimeout> | undefined;
      const diagnosticsTimeout = new Promise<ProtectedLiveDiagnostics>(
        resolve => {
          const timer = setTimeout(
            () => {
              diagnosticsTimeoutTimers.delete(timer);
              resolve(diagnosticsFallback);
            },
            DIAGNOSTICS_TIMEOUT_MS,
          );
          diagnosticsTimer = timer;
          if (
            typeof timer === 'object' &&
            timer !== null &&
            'unref' in timer &&
            typeof timer.unref === 'function'
          ) {
            timer.unref();
          }
          diagnosticsTimeoutTimers.add(timer);
        },
      );
      Promise.race([collectDiagnostics(), diagnosticsTimeout])
        .then(diagnostics => {
          if (diagnosticsTimer) {
            clearTimeout(diagnosticsTimer);
            diagnosticsTimeoutTimers.delete(diagnosticsTimer);
          }
          if (
            !diagnostics ||
            !isCurrentConnection() ||
            failed ||
            timeoutToken !== activeTimeoutToken ||
            activeTimeoutToken.status !== 'running' ||
            frameReadyRef.current
          ) {
            return;
          }
          activeTimeoutToken.status = 'cancelled';
          timeoutToken = undefined;
          logDiagnostics('timeout', diagnostics);
          const reason = classifyProtectedLiveTimeout(diagnostics);
          fail(
            new Error(
              `Protected WebRTC connection timed out: ${formatProtectedLiveDiagnostics(
                diagnostics,
              )}`,
            ),
            reason,
          );
        })
        .catch(error => {
          if (
            isCurrentConnection() &&
            timeoutToken === activeTimeoutToken &&
            activeTimeoutToken.status === 'running' &&
            !frameReadyRef.current
          ) {
            activeTimeoutToken.status = 'cancelled';
            timeoutToken = undefined;
            fail(error);
          }
        });
    }, WEBRTC_FIRST_FRAME_TIMEOUT_MS);

    return () => {
      active = false;
      mountedRef.current = false;
      ++componentGenerationState.value;
      frameReadyRef.current = false;
      ++audioGeneration.value;
      tombstonePendingAcquire();
      disableAudioTracks();
      releaseAudioLease();
      focusLostSubscription?.remove();
      reportAudioActivation(false);
      reportAudioAvailability(false);
      clearDiagnosticsTimers();
      postFrameDiagnosticsRef.current = () => undefined;
      if (cancelConnectionTimeoutRef.current === cancelConnectionTimeout) {
        cancelConnectionTimeoutRef.current = () => undefined;
      }
      cancelConnectionTimeout();
      socket?.close();
      peer.close();
      streamSubscriptions.forEach((subscription, stream) => {
        try {
          if (stream.onaddtrack === subscription.addHandler) {
            stream.onaddtrack = subscription.onaddtrack;
          }
          if (stream.onremovetrack === subscription.removeHandler) {
            stream.onremovetrack = subscription.onremovetrack;
          }
        } catch {
          // Native stream shims may not support property cleanup.
        }
      });
      trackSubscriptions.forEach((subscription, track) => {
        try {
          if (track.onended === subscription.endedHandler) {
            track.onended = subscription.onended;
          }
          if (track.onmute === subscription.muteHandler) {
            track.onmute = subscription.onmute;
          }
          if (track.onunmute === subscription.unmuteHandler) {
            track.onunmute = subscription.onunmute;
          }
        } catch {
          // Native track shims may not support property cleanup.
        }
      });
      streamSubscriptions.clear();
      trackSubscriptions.clear();
      remoteStreamRef.current?.getTracks().forEach(track => track.stop());
      remoteStreamRef.current = undefined;
      setRenderedConnectionGeneration(0);
    };
  }, [onError, onPlaying, server, streamName]);

  const handleFirstFrame = (event: {
    nativeEvent: {width: number; height: number};
  }, generation: number) => {
    const width = Number(event.nativeEvent.width);
    const height = Number(event.nativeEvent.height);
    if (
      playingReportedRef.current ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }
    if (
      !mountedRef.current ||
      generation === 0 ||
      componentGenerationRef.current.value !== generation
    ) {
      return;
    }
    playingReportedRef.current = true;
    cancelConnectionTimeoutRef.current();
    setFrameReady(true);
    frameReadyRef.current = true;
    syncAudioRef.current();
    postFrameDiagnosticsRef.current();
    onPlaying();
  };

  return remoteStream ? (
    <RTCView
      mirror={false}
      objectFit="contain"
      streamURL={remoteStream.toURL()}
      pointerEvents="none"
      style={[style, !frameReady && playerStyles.hidden]}
      onDimensionsChange={event =>
        handleFirstFrame(event, renderedConnectionGeneration)
      }
    />
  ) : null;
};
