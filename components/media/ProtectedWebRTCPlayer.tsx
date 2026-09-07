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
} from '../../helpers/protectedLive';
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
}

interface Go2RtcMessage {
  type?: string;
  value?: string;
}

const playerStyles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
});
export const WEBRTC_FIRST_FRAME_TIMEOUT_MS = 15_000;
const DIAGNOSTICS_TIMEOUT_MS = 1_000;

export const ProtectedWebRTCPlayer = ({
  server,
  streamName,
  muted,
  style,
  onPlaying,
  onError,
}: ProtectedWebRTCPlayerProps) => {
  const [remoteStream, setRemoteStream] = useState<MediaStream>();
  const [frameReady, setFrameReady] = useState(false);
  const remoteStreamRef = useRef<MediaStream>();
  const playingReportedRef = useRef(false);
  const mutedRef = useRef(muted);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    mutedRef.current = muted;
    remoteStreamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }, [muted]);

  useEffect(() => {
    let active = true;
    let failed = false;
    let socket: ProtectedLiveSocket | undefined;
    let signalingChain = Promise.resolve();
    let remoteDescriptionSet = false;
    const pendingCandidates: RTCIceCandidate[] = [];
    const receivedTracks = new Map<string, MediaStreamTrack>();
    const peer = new RTCPeerConnection({
      bundlePolicy: 'max-bundle',
      iceServers: [],
    });
    peer.addTransceiver('video', {direction: 'recvonly'});
    peer.addTransceiver('audio', {direction: 'recvonly'});
    setRemoteStream(undefined);
    setFrameReady(false);
    playingReportedRef.current = false;

    const fail = (error: unknown, reason?: ProtectedLiveFailureReason) => {
      if (!active || failed) {
        return;
      }
      failed = true;
      active = false;
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = undefined;
      }
      socket?.close();
      peer.close();
      remoteStreamRef.current?.getTracks().forEach(track => track.stop());
      remoteStreamRef.current = undefined;
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

    const updateRemoteStream = (streamFromEvent?: MediaStream) => {
      let stream = remoteStreamRef.current || streamFromEvent;
      if (!stream && [...receivedTracks.values()].some(
        track => track.kind === 'video',
      )) {
        stream = new MediaStream();
      }
      if (!stream) {
        return;
      }
      [...receivedTracks.values()].forEach(track => {
        if (!stream?.getTracks().includes(track)) {
          stream?.addTrack(track);
        }
      });
      stream.getAudioTracks().forEach(track => {
        track.enabled = !mutedRef.current;
      });
      if (stream.getVideoTracks().length === 0) {
        return;
      }
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    };

    const collectReceiverTracks = () => {
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
      receiverTracks.forEach(track => {
        const key = track.id || `${track.kind}:${receivedTracks.size}`;
        receivedTracks.set(key, track);
      });
      updateRemoteStream();
    };

    peer.ontrack = (event: {
      streams?: MediaStream[];
      track?: MediaStreamTrack | null;
    }) => {
      if (!active) {
        return;
      }
      const streamFromEvent = event.streams?.[0];
      const eventTracks = [
        ...(streamFromEvent?.getTracks() || []),
        ...(event.track ? [event.track] : []),
      ];
      eventTracks.forEach(track => {
        const key = track.id || `${track.kind}:${receivedTracks.size}`;
        receivedTracks.set(key, track);
      });
      updateRemoteStream(streamFromEvent);
    };
    peer.onicecandidate = (event: {candidate: RTCIceCandidate | null}) => {
      if (!event.candidate || !socket) {
        return;
      }
      socket
        .send(
          JSON.stringify({
            type: 'webrtc/candidate',
            value: event.candidate.candidate,
          }),
        )
        .catch(fail);
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') {
        fail(new Error('Protected WebRTC connection failed'));
      }
    };

    const collectDiagnostics = async (): Promise<ProtectedLiveDiagnostics> => {
      collectReceiverTracks();
      const videoTracks = [...receivedTracks.values()].filter(
        track => track.kind === 'video',
      );
      const diagnostics: ProtectedLiveDiagnostics = {
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        videoTrackCount: videoTracks.length,
        mutedVideoTrackCount: videoTracks.filter(track => track.muted).length,
        endedVideoTrackCount: videoTracks.filter(
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
        const inboundVideo = stats.filter(
          stat =>
            stat.type === 'inbound-rtp' &&
            (stat.kind === 'video' || stat.mediaType === 'video'),
        );
        if (inboundVideo.length > 0) {
          diagnostics.inboundVideoPackets = inboundVideo.reduce(
            (total, stat) => total + (Number(stat.packetsReceived) || 0),
            0,
          );
          diagnostics.inboundVideoFrames = inboundVideo.reduce(
            (total, stat) =>
              total + (Number(stat.framesDecoded ?? stat.framesReceived) || 0),
            0,
          );
          const codecId = inboundVideo.find(stat => stat.codecId)?.codecId;
          const codec = stats.find(
            stat => stat.type === 'codec' && stat.id === codecId,
          );
          const mimeType = codec?.mimeType;
          if (typeof mimeType === 'string') {
            const codecName = mimeType.split('/').pop();
            if (codecName && /^[A-Za-z0-9._-]{1,32}$/.test(codecName)) {
              diagnostics.codec = codecName;
            }
          }
        }
        const candidatePair = stats.find(
          stat =>
            stat.type === 'candidate-pair' &&
            (stat.state === 'succeeded' || stat.nominated === true),
        );
        const localCandidate = stats.find(
          stat =>
            stat.type === 'local-candidate' &&
            stat.id === candidatePair?.localCandidateId,
        );
        const remoteCandidate = stats.find(
          stat =>
            stat.type === 'remote-candidate' &&
            stat.id === candidatePair?.remoteCandidateId,
        );
        const candidateType =
          localCandidate?.candidateType || remoteCandidate?.candidateType;
        const candidateProtocol =
          localCandidate?.protocol || remoteCandidate?.protocol;
        if (
          typeof candidateType === 'string' &&
          /^[A-Za-z0-9._-]{1,32}$/.test(candidateType)
        ) {
          diagnostics.candidateType = candidateType;
        }
        if (
          typeof candidateProtocol === 'string' &&
          /^[A-Za-z0-9._-]{1,32}$/.test(candidateProtocol)
        ) {
          diagnostics.candidateProtocol = candidateProtocol;
        }
      } catch {
        // A stats failure must not change the playback decision.
      }
      return diagnostics;
    };

    const connect = async () => {
      socket = await openProtectedLiveSocket(server, streamName, {
        onState: event => {
          if (event.state === 'error' || event.state === 'closed') {
            fail(new Error('Protected live signaling failed'));
          }
        },
        onMessage: message => {
          if (!active || message.length > 1024 * 1024) {
            if (active) {
              fail(new Error('Protected live signaling message is too large'));
            }
            return;
          }
          signalingChain = signalingChain
            .then(async () => {
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
                }
              } else if (parsed.type === 'webrtc/answer' && parsed.value) {
                if (!hasAcceptedVideoMedia(parsed.value)) {
                  fail(
                    new Error('Protected live stream has no compatible video'),
                    'codec',
                  );
                  return;
                }
                await peer.setRemoteDescription(
                  new RTCSessionDescription({
                    type: 'answer',
                    sdp: parsed.value,
                  }),
                );
                remoteDescriptionSet = true;
                collectReceiverTracks();
                while (pendingCandidates.length > 0) {
                  const candidate = pendingCandidates.shift();
                  if (candidate) {
                    await peer.addIceCandidate(candidate);
                  }
                }
              }
            })
            .catch(() => {
              fail(new Error('Protected live signaling returned invalid data'));
            });
        },
      });
      await socket.ready;
      if (!active) {
        socket.close();
        return;
      }
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const localSdp = peer.localDescription?.sdp;
      if (!active || !localSdp) {
        if (!localSdp) {
          fail(new Error('Protected WebRTC offer is unavailable'));
        }
        return;
      }
      await socket.send(
        JSON.stringify({
          type: 'webrtc/offer',
          value: localSdp,
        }),
      );
    };

    connect().catch(fail);
    connectionTimeoutRef.current = setTimeout(() => {
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
      };
      const diagnosticsTimeout = new Promise<ProtectedLiveDiagnostics>(
        resolve => {
          const timer = setTimeout(
            () => resolve(diagnosticsFallback),
            DIAGNOSTICS_TIMEOUT_MS,
          );
          if (
            typeof timer === 'object' &&
            timer !== null &&
            'unref' in timer &&
            typeof timer.unref === 'function'
          ) {
            timer.unref();
          }
        },
      );
      Promise.race([collectDiagnostics(), diagnosticsTimeout])
        .then(diagnostics => {
          if (!active || failed) {
            return;
          }
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
        .catch(error => fail(error));
    }, WEBRTC_FIRST_FRAME_TIMEOUT_MS);

    return () => {
      active = false;
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = undefined;
      }
      socket?.close();
      peer.close();
      remoteStreamRef.current?.getTracks().forEach(track => track.stop());
      remoteStreamRef.current = undefined;
    };
  }, [onError, onPlaying, server, streamName]);

  const handleFirstFrame = (event: {
    nativeEvent: {width: number; height: number};
  }) => {
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
    playingReportedRef.current = true;
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = undefined;
    }
    setFrameReady(true);
    onPlaying();
  };

  return remoteStream ? (
    <RTCView
      mirror={false}
      objectFit="contain"
      streamURL={remoteStream.toURL()}
      pointerEvents="none"
      style={[style, !frameReady && playerStyles.hidden]}
      onDimensionsChange={handleFirstFrame}
    />
  ) : null;
};
