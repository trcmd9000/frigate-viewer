import {NativeModules, Platform} from 'react-native';
import type {Server} from '../store/settings';
import {
  canonicalServerEndpoint,
  serverProfileIdentity,
  serverUsesClientCertificate,
} from './serverIdentity';
import {assertRemoteHttpConsent} from './remoteHttpPolicy';

export const MEDIA_URI_SCHEME = 'frigate-media';

interface NativeProtectedMediaModule {
  registerMediaProfile?: (config: NativeMediaProfileConfig) => Promise<string>;
  createMediaUri?: (profileId: string, resourcePath: string) => Promise<string>;
  createRtspMediaUri?: (
    profileId: string,
    streamName: string,
  ) => Promise<string>;
  releaseRtspMediaUri?: (profileId: string, handle: string) => void;
}

interface NativeMediaProfileConfig {
  profileId: string;
  profileKey: string;
  protocol: Server['protocol'];
  host: string;
  port: number;
  path: string;
  auth: Server['auth'];
  username: string;
  password: string;
  clientCertAlias: string;
  allowSelfSignedServer: boolean;
  allowInsecureRemoteHttp: boolean;
  localRoutingEnabled: boolean;
  localProtocol: Server['protocol'];
  localHost: string;
  localPort: number;
  localBasePath: string;
  localMtlsEnabled: boolean;
  localClientCertAlias: string;
  localAllowSelfSignedServer: boolean;
  rtspEnabled: boolean;
  rtspPort: number;
  allowInsecureCredentials: boolean;
}

const nativeModule = (): NativeProtectedMediaModule | undefined =>
  NativeModules.ClientCertModule as NativeProtectedMediaModule | undefined;

let profileIds = new WeakMap<object, Promise<string>>();

const invalidMediaPath = (path: string): boolean => {
  const encodedPath = path.split(/[?#]/, 1)[0];
  return (
    encodedPath.includes('\\') ||
    encodedPath.includes('\u0000') ||
    /(?:^|\/)(?:\.|\.\.)(?:\/|$)/.test(encodedPath) ||
    /%2e|%2f|%5c/i.test(encodedPath)
  );
};

/**
 * Accepts a profile-relative path only. The native resolver adds the
 * configured server base path and rejects absolute hosts and traversal.
 */
export const normalizeProtectedMediaPath = (path: string): string => {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.includes('?') ||
    path.includes('#') ||
    invalidMediaPath(path)
  ) {
    throw new Error('The protected media path is invalid');
  }
  return path;
};

export const isProtectedMediaUri = (uri: string): boolean => {
  return (
    typeof uri === 'string' &&
    new RegExp(
      `^${MEDIA_URI_SCHEME}://[A-Za-z0-9_-]{16,64}/[^?#\\s]*(?:\\?[^#\\s]*)?$`,
    ).test(uri)
  );
};

export const eventVodPath = (
  camera: string,
  startTime: number,
  endTime: number,
): string => {
  if (typeof camera !== 'string' || camera.trim().length === 0) {
    throw new Error('The event camera is invalid');
  }
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    startTime < 0 ||
    endTime < startTime
  ) {
    throw new Error('The event time range is invalid');
  }
  return `/vod/${encodeURIComponent(
    camera,
  )}/start/${startTime}/end/${endTime}/master.m3u8`;
};

const registerProfile = (server: Server): Promise<string> => {
  const native = nativeModule();
  const endpoint = canonicalServerEndpoint(server);
  if (
    Platform.OS !== 'android' ||
    !native?.registerMediaProfile ||
    !native.createMediaUri
  ) {
    return Promise.reject(
      new Error('Protected Media3 playback is unavailable on this platform'),
    );
  }
  if (!endpoint) {
    return Promise.reject(
      new Error('The configured server endpoint is invalid'),
    );
  }

  const mtlsEnabled = serverUsesClientCertificate(server);
  const alias = mtlsEnabled ? server.clientCertConfig?.alias || '' : '';
  if (mtlsEnabled && !alias.trim()) {
    return Promise.reject(
      new Error('The selected client certificate is unavailable'),
    );
  }
  const config: NativeMediaProfileConfig = {
    profileId: server.profileId?.trim() || serverProfileIdentity(server),
    profileKey: serverProfileIdentity(server),
    protocol: server.protocol,
    allowInsecureRemoteHttp: server.allowInsecureRemoteHttp === true,
    host: server.host,
    port: server.port || 0,
    path: server.path || '',
    auth: server.auth,
    username: server.auth === 'none' ? '' : server.credentials.username || '',
    password: server.auth === 'none' ? '' : server.credentials.password || '',
    clientCertAlias: alias,
    allowSelfSignedServer: mtlsEnabled
      ? server.clientCertConfig?.allowSelfSignedServer || false
      : false,
    localRoutingEnabled: server.localRoutingEnabled === true,
    localProtocol: server.localEndpoint?.protocol || 'http',
    localHost: server.localEndpoint?.host || '',
    localPort: server.localEndpoint?.port || 0,
    localBasePath: server.localEndpoint?.basePath || '',
    localMtlsEnabled: server.localTls?.mtlsEnabled === true,
    localClientCertAlias:
      server.localTls?.mtlsEnabled === true
        ? server.localTls.clientCertConfig?.alias || ''
        : '',
    localAllowSelfSignedServer: server.localTls?.allowSelfSignedServer === true,
    rtspEnabled: server.rtsp?.enabled === true,
    rtspPort: server.rtsp?.port || 8554,
    allowInsecureCredentials: server.rtsp?.allowInsecureCredentials === true,
  };

  return native.registerMediaProfile(config).then(profileId => {
    if (
      typeof profileId !== 'string' ||
      !/^[A-Za-z0-9_-]{16,64}$/.test(profileId)
    ) {
      throw new Error(
        'Native protected media registration returned an invalid profile',
      );
    }
    return profileId;
  });
};

export const protectedMediaProfileId = (server: Server): Promise<string> => {
  let profilePromise = profileIds.get(server);
  if (!profilePromise) {
    profilePromise = registerProfile(server);
    profileIds.set(server, profilePromise);
    profilePromise.catch(() => {
      if (profileIds.get(server) === profilePromise) {
        profileIds.delete(server);
      }
    });
  }
  return profilePromise;
};

export const invalidateProtectedMediaProfile = (server: Server): void => {
  profileIds.delete(server);
};

export const protectedMediaUri = async (
  server: Server,
  resourcePath: string,
): Promise<string> => {
  const native = nativeModule();
  if (Platform.OS !== 'android' || !native?.createMediaUri) {
    throw new Error(
      'Protected Media3 playback is unavailable on this platform',
    );
  }
  const path = normalizeProtectedMediaPath(resourcePath);
  assertRemoteHttpConsent(server);
  const profileId = await protectedMediaProfileId(server);
  const uri = await native.createMediaUri(profileId, path);
  if (typeof uri !== 'string' || !isProtectedMediaUri(uri)) {
    throw new Error('Native protected media URI is invalid');
  }
  return uri;
};

const validRtspStreamName = (streamName: string): boolean =>
  typeof streamName === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(streamName);

/** Prepare an opaque native handle for an explicitly configured local RTSP stream. */
export const localRtspMediaUri = async (
  server: Server,
  streamName: string,
): Promise<string> => {
  const native = nativeModule();
  if (
    Platform.OS !== 'android' ||
    !native?.createRtspMediaUri ||
    server.localRoutingEnabled !== true ||
    server.rtsp?.enabled !== true
  ) {
    throw new Error('Local RTSP playback is unavailable');
  }
  if (!validRtspStreamName(streamName)) {
    throw new Error('The local RTSP stream name is invalid');
  }
  const profileId = await protectedMediaProfileId(server);
  const uri = await native.createRtspMediaUri(profileId, streamName);
  if (typeof uri !== 'string' || !isProtectedMediaUri(uri)) {
    throw new Error('Native local RTSP media handle is invalid');
  }
  return uri;
};

/** Release a route handle that resolved after its preview session ended. */
export const releaseProtectedMediaUri = (uri: string): void => {
  const native = nativeModule();
  const match =
    typeof uri === 'string' &&
    uri.match(
      new RegExp(
        `^${MEDIA_URI_SCHEME}://([A-Za-z0-9_-]{16,64})/rtsp/([A-Za-z0-9_-]{16,64})$`,
      ),
    );
  if (Platform.OS === 'android' && native?.releaseRtspMediaUri && match) {
    native.releaseRtspMediaUri(match[1], match[2]);
  }
};

export const releaseLocalRtspMediaUri = releaseProtectedMediaUri;

export const resetProtectedMediaProfiles = (): void => {
  // WeakMap entries are intentionally discarded without exposing profile
  // configuration or native identifiers to JavaScript.
  profileIds = new WeakMap<object, Promise<string>>();
};
