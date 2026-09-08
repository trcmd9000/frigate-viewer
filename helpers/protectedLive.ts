import {
  EmitterSubscription,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';
import type {Server} from '../store/settings';
import {protectedMediaProfileId} from './protectedMedia';
import {localRtspMediaUri} from './protectedMedia';
import {assertRemoteHttpConsent} from './remoteHttpPolicy';
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

export const selectProtectedLiveStreams = (
  config: FrigateLiveConfig,
  cameraName: string,
): string[] => {
  const availableStreams = config.go2rtc?.streams || {};
  const configuredStreams = Object.values(
    config.cameras?.[cameraName]?.live?.streams || {},
  );
  const streamNames = configuredStreams.filter(
    (candidate, index) =>
      validStreamName(candidate) &&
      Object.prototype.hasOwnProperty.call(availableStreams, candidate) &&
      configuredStreams.indexOf(candidate) === index,
  );
  if (
    validStreamName(cameraName) &&
    Object.prototype.hasOwnProperty.call(availableStreams, cameraName) &&
    !streamNames.includes(cameraName)
  ) {
    streamNames.push(cameraName);
  }
  return streamNames;
};

export const selectProtectedLiveStream = (
  config: FrigateLiveConfig,
  cameraName: string,
): string | undefined => selectProtectedLiveStreams(config, cameraName)[0];

export const prepareLocalRtspMedia = async (
  server: Server,
  config: FrigateLiveConfig,
  cameraName: string,
): Promise<PlayableMedia> => {
  const streamName = selectProtectedLiveStream(config, cameraName);
  if (!streamName) {
    throw new Error('No configured local RTSP stream is available');
  }
  return {
    uri: await localRtspMediaUri(server, streamName),
    mimeType: 'application/x-rtsp',
    mode: 'direct',
  };
};

export const hasAcceptedVideoMedia = (sdp: string): boolean => {
  if (typeof sdp !== 'string') {
    return false;
  }
  let videoPortAccepted = false;
  let videoDirection: string | undefined;
  const isAccepted = () =>
    videoPortAccepted &&
    videoDirection !== 'inactive' &&
    videoDirection !== 'recvonly';
  for (const line of sdp.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('m=')) {
      if (isAccepted()) {
        return true;
      }
      const media = trimmed.split(/\s+/);
      const port = media[1] || '';
      videoPortAccepted =
        media[0] === 'm=video' && /^\d+$/.test(port) && Number(port) > 0;
      videoDirection = undefined;
      continue;
    }
    if (videoPortAccepted && trimmed.startsWith('a=')) {
      const attribute = trimmed.slice(2);
      if (
        attribute === 'inactive' ||
        attribute === 'recvonly' ||
        attribute === 'sendonly' ||
        attribute === 'sendrecv'
      ) {
        videoDirection = attribute;
      }
    }
  }
  return isAccepted();
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

  assertRemoteHttpConsent(server);
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
