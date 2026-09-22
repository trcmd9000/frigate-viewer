import {
  EmitterSubscription,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';
import type {Server} from '../store/settings';
import {protectedMediaProfileId} from './protectedMedia';
import {localRtspMediaUri} from './protectedMedia';
import {assertRemoteHttps} from './remoteHttpPolicy';
import type {PlayableMedia} from '../components/media/PlayableMedia';

interface NativeProtectedLiveModule {
  openProtectedLiveSocket?: (
    profileId: string,
    streamName: string,
  ) => Promise<string>;
  sendProtectedLiveSocketMessage?: (
    socketId: string,
    message: string,
  ) => Promise<void>;
  closeProtectedLiveSocket?: (socketId: string) => void;
}

interface LiveSocketStateEvent {
  socketId: string;
  state: 'open' | 'closed' | 'error';
  statusCode?: number;
}

interface LiveSocketMessageEvent {
  socketId: string;
  message: string;
}

export interface ProtectedLiveSocket {
  ready: Promise<void>;
  send: (message: string) => Promise<void>;
  close: () => void;
}

export interface ProtectedLiveSocketCallbacks {
  onState: (event: Omit<LiveSocketStateEvent, 'socketId'>) => void;
  onMessage: (message: string) => void;
}

const validStreamName = (streamName: string): boolean =>
  typeof streamName === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(streamName);

export interface FrigateLiveConfig {
  cameras?: Record<
    string,
    {
      live?: {
        streams?: Record<string, string>;
      };
    }
  >;
  go2rtc?: {
    streams?: Record<string, unknown>;
  };
}

export interface ProtectedLiveStream {
  readonly name: string;
  readonly label: string;
}

const displayLabel = (label: string, fallback: string): string => {
  const trimmed = label.trim();
  const hasControlCharacter = Array.from(trimmed).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  return trimmed && trimmed.length <= 128 && !hasControlCharacter
    ? trimmed
    : fallback;
};

export const selectProtectedLiveStreamOptions = (
  config: FrigateLiveConfig,
  cameraName: string,
): ProtectedLiveStream[] => {
  const availableStreams = config.go2rtc?.streams || {};
  const configuredStreams = Object.entries(
    config.cameras?.[cameraName]?.live?.streams || {},
  );
  const streamOptions: ProtectedLiveStream[] = [];
  configuredStreams.forEach(([label, candidate]) => {
    if (
      validStreamName(candidate) &&
      Object.prototype.hasOwnProperty.call(availableStreams, candidate) &&
      !streamOptions.some(stream => stream.name === candidate)
    ) {
      streamOptions.push({
        name: candidate,
        label: displayLabel(label, candidate),
      });
    }
  });
  if (
    validStreamName(cameraName) &&
    Object.prototype.hasOwnProperty.call(availableStreams, cameraName) &&
    !streamOptions.some(stream => stream.name === cameraName)
  ) {
    streamOptions.push({name: cameraName, label: cameraName});
  }
  return streamOptions;
};

export const selectProtectedLiveStreams = (
  config: FrigateLiveConfig,
  cameraName: string,
): string[] =>
  selectProtectedLiveStreamOptions(config, cameraName).map(stream => stream.name);

export const selectProtectedLiveStream = (
  config: FrigateLiveConfig,
  cameraName: string,
): string | undefined => selectProtectedLiveStreams(config, cameraName)[0];

export const prepareLocalRtspMedia = async (
  server: Server,
  config: FrigateLiveConfig,
  cameraName: string,
  preferredStreamName?: string,
): Promise<PlayableMedia> => {
  const streamName =
    preferredStreamName &&
    selectProtectedLiveStreams(config, cameraName).includes(preferredStreamName)
      ? preferredStreamName
      : selectProtectedLiveStream(config, cameraName);
  if (!streamName) {
    throw new Error('No configured local RTSP stream is available');
  }
  return {
    uri: await localRtspMediaUri(server, streamName),
    mimeType: 'application/x-rtsp',
    mode: 'direct',
  };
};

const hasAcceptedMedia = (sdp: string, mediaKind: 'audio' | 'video'): boolean => {
  if (typeof sdp !== 'string') {
    return false;
  }
  let mediaPortAccepted = false;
  let mediaDirection: string | undefined;
  let sessionDirection: string | undefined;
  let mediaSectionStarted = false;
  const isAccepted = () =>
    mediaPortAccepted &&
    (mediaDirection || sessionDirection || 'sendrecv') !== 'inactive' &&
    (mediaDirection || sessionDirection || 'sendrecv') !== 'recvonly';
  for (const line of sdp.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('m=')) {
      mediaSectionStarted = true;
      if (isAccepted()) {
        return true;
      }
      const media = trimmed.split(/\s+/);
      const port = media[1] || '';
      mediaPortAccepted =
        media[0] === `m=${mediaKind}` &&
        /^\d+(?:\/\d+)?$/.test(port) &&
        Number(port.split('/')[0]) > 0;
      mediaDirection = undefined;
      continue;
    }
    if (trimmed.startsWith('a=')) {
      const attribute = trimmed.slice(2);
      if (
        attribute === 'inactive' ||
        attribute === 'recvonly' ||
        attribute === 'sendonly' ||
        attribute === 'sendrecv'
      ) {
        if (mediaPortAccepted) {
          mediaDirection = attribute;
        } else if (!mediaSectionStarted) {
          sessionDirection = attribute;
        }
      }
    }
  }
  return isAccepted();
};

export const hasAcceptedVideoMedia = (sdp: string): boolean =>
  hasAcceptedMedia(sdp, 'video');

export const hasAcceptedAudioMedia = (sdp: string): boolean =>
  hasAcceptedMedia(sdp, 'audio');

export interface AudioMediaSummary {
  readonly present: boolean;
  readonly portAccepted: boolean;
  readonly direction: 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive';
  readonly opus: boolean;
  readonly pcma: boolean;
  readonly pcmu: boolean;
}

export interface VideoMediaSummary {
  readonly present: boolean;
  readonly portAccepted: boolean;
  readonly direction: 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive';
  readonly h264: boolean;
  readonly h265: boolean;
  readonly vp8: boolean;
  readonly vp9: boolean;
  readonly av1: boolean;
}

export const summarizeVideoMedia = (sdp: string): VideoMediaSummary => {
  let inVideoSection = false;
  let present = false;
  let portAccepted = false;
  let sessionDirection: VideoMediaSummary['direction'] = 'sendrecv';
  let mediaDirection: VideoMediaSummary['direction'] | undefined;
  const codecs = new Set<string>();
  for (const rawLine of typeof sdp === 'string' ? sdp.split(/\r?\n/) : []) {
    const line = rawLine.trim();
    if (line.startsWith('m=')) {
      const media = line.split(/\s+/);
      inVideoSection = media[0] === 'm=video';
      if (inVideoSection && !present) {
        present = true;
        const port = media[1] || '';
        portAccepted =
          /^\d+(?:\/\d+)?$/.test(port) && Number(port.split('/')[0]) > 0;
      }
      continue;
    }
    if (!line.startsWith('a=')) {
      continue;
    }
    const attribute = line.slice(2).toLowerCase();
    if (
      attribute === 'sendrecv' ||
      attribute === 'sendonly' ||
      attribute === 'recvonly' ||
      attribute === 'inactive'
    ) {
      if (inVideoSection) {
        mediaDirection = attribute;
      } else if (!present) {
        sessionDirection = attribute;
      }
    } else if (inVideoSection && attribute.startsWith('rtpmap:')) {
      const codec = attribute.split(/\s+/, 2)[1]?.split('/', 1)[0];
      if (codec) {
        codecs.add(codec);
      }
    }
  }
  return {
    present,
    portAccepted,
    direction: mediaDirection || sessionDirection,
    h264: codecs.has('h264'),
    h265: codecs.has('h265') || codecs.has('hevc'),
    vp8: codecs.has('vp8'),
    vp9: codecs.has('vp9'),
    av1: codecs.has('av1') || codecs.has('av01'),
  };
};

export const summarizeAudioMedia = (sdp: string): AudioMediaSummary => {
  let inAudioSection = false;
  let present = false;
  let portAccepted = false;
  let sessionDirection: AudioMediaSummary['direction'] = 'sendrecv';
  let mediaDirection: AudioMediaSummary['direction'] | undefined;
  const codecs = new Set<string>();
  for (const rawLine of typeof sdp === 'string' ? sdp.split(/\r?\n/) : []) {
    const line = rawLine.trim();
    if (line.startsWith('m=')) {
      const media = line.split(/\s+/);
      inAudioSection = media[0] === 'm=audio';
      if (inAudioSection && !present) {
        present = true;
        const port = media[1] || '';
        portAccepted =
          /^\d+(?:\/\d+)?$/.test(port) && Number(port.split('/')[0]) > 0;
      }
      continue;
    }
    if (!line.startsWith('a=')) {
      continue;
    }
    const attribute = line.slice(2).toLowerCase();
    if (
      attribute === 'sendrecv' ||
      attribute === 'sendonly' ||
      attribute === 'recvonly' ||
      attribute === 'inactive'
    ) {
      if (inAudioSection) {
        mediaDirection = attribute;
      } else if (!present) {
        sessionDirection = attribute;
      }
    } else if (inAudioSection && attribute.startsWith('rtpmap:')) {
      const codec = attribute.split(/\s+/, 2)[1]?.split('/', 1)[0];
      if (codec) {
        codecs.add(codec);
      }
    }
  }
  return {
    present,
    portAccepted,
    direction: mediaDirection || sessionDirection,
    opus: codecs.has('opus'),
    pcma: codecs.has('pcma'),
    pcmu: codecs.has('pcmu'),
  };
};

export const openProtectedLiveSocket = async (
  server: Server,
  streamName: string,
  callbacks: ProtectedLiveSocketCallbacks,
): Promise<ProtectedLiveSocket> => {
  const native = NativeModules.ClientCertModule as
    | NativeProtectedLiveModule
    | undefined;
  const openSocket = native?.openProtectedLiveSocket;
  const sendMessage = native?.sendProtectedLiveSocketMessage;
  const closeSocket = native?.closeProtectedLiveSocket;
  if (
    Platform.OS !== 'android' ||
    !openSocket ||
    !sendMessage ||
    !closeSocket
  ) {
    throw new Error('Protected live signaling is unavailable on this platform');
  }
  if (!validStreamName(streamName)) {
    throw new Error('The protected live stream name is invalid');
  }

  assertRemoteHttps(server);
  const profileId = await protectedMediaProfileId(server);
  const emitter = new NativeEventEmitter(NativeModules.ClientCertModule);
  let socketId: string | undefined;
  let closed = false;
  let readySettled = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const pendingStates = new Map<string, LiveSocketStateEvent>();
  const handleState = (event: LiveSocketStateEvent) => {
    if (event.state === 'open' && !readySettled) {
      readySettled = true;
      resolveReady();
    } else if (event.state === 'error' && !readySettled) {
      readySettled = true;
      rejectReady(
        new Error(
          event.statusCode
            ? `Protected live signaling returned HTTP ${event.statusCode}`
            : 'Protected live signaling failed',
        ),
      );
    } else if (event.state === 'closed' && !readySettled) {
      readySettled = true;
      rejectReady(new Error('Protected live signaling closed before opening'));
    }
    callbacks.onState({
      state: event.state,
      statusCode: event.statusCode,
    });
  };
  const subscriptions: EmitterSubscription[] = [
    emitter.addListener(
      'protectedLiveSocketState',
      (event: LiveSocketStateEvent) => {
        if (!socketId) {
          pendingStates.set(event.socketId, event);
          return;
        }
        if (event.socketId === socketId && !closed) {
          handleState(event);
        }
      },
    ),
    emitter.addListener(
      'protectedLiveSocketMessage',
      (event: LiveSocketMessageEvent) => {
        if (event.socketId === socketId && !closed) {
          callbacks.onMessage(event.message);
        }
      },
    ),
  ];

  try {
    socketId = await openSocket(profileId, streamName);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(socketId)) {
      throw new Error(
        'Protected live signaling returned an invalid identifier',
      );
    }
    const pendingState = pendingStates.get(socketId);
    if (pendingState) {
      handleState(pendingState);
    }
  } catch (error) {
    subscriptions.forEach(subscription => subscription.remove());
    if (socketId) {
      closeSocket(socketId);
    }
    throw error;
  }

  const activeSocketId = socketId;
  return {
    ready,
    send: message => {
      if (
        closed ||
        typeof message !== 'string' ||
        message.length > 1024 * 1024
      ) {
        return Promise.reject(
          new Error('Protected live signaling is unavailable'),
        );
      }
      return sendMessage(activeSocketId, message);
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      if (!readySettled) {
        readySettled = true;
        rejectReady(new Error('Protected live signaling was closed'));
      }
      subscriptions.forEach(subscription => subscription.remove());
      closeSocket(activeSocketId);
    },
  };
};
