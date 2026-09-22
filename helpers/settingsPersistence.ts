import {createTransform} from 'redux-persist';
import type {
  Credentials,
  ISettings,
  LocalEndpoint,
  RtspSettings,
  RouteTlsSettings,
  Server,
} from '../store/settings';
import {
  getFallbackActiveServerProfileId,
  normalizeLiveStreamPreferences,
} from '../store/settings';
import {
  normalizeServerCertificatePin,
  serverIdentity,
  serverUsesClientCertificate,
} from './serverIdentity';

/**
 * Remove credentials from the copy written to redux-persist. Credentials are
 * loaded from the platform secure-storage provider after settings rehydrate.
 */
export const stripCredentialsFromPersistence = (
  inboundState: ISettings,
): ISettings => {
  if (!inboundState) {
    return inboundState;
  }

  const validPort = (value: unknown): value is number =>
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 65535;

  const containsControlCharacter = (value: string): boolean =>
    Array.from(value).some(character => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });

  const persistedLocalEndpoint = (
    endpoint: LocalEndpoint | undefined,
  ): LocalEndpoint | undefined => {
    if (
      !endpoint ||
      (endpoint.protocol !== 'http' && endpoint.protocol !== 'https') ||
      typeof endpoint.host !== 'string' ||
      !endpoint.host.trim() ||
      /[/?#@\s]/.test(endpoint.host) ||
      containsControlCharacter(endpoint.host) ||
      !validPort(endpoint.port) ||
      typeof endpoint.basePath !== 'string' ||
      /[?#]/.test(endpoint.basePath) ||
      containsControlCharacter(endpoint.basePath)
    ) {
      return undefined;
    }
    return {
      protocol: endpoint.protocol,
      host: endpoint.host.trim(),
      port: endpoint.port,
      basePath: endpoint.basePath,
    };
  };

  const persistedLocalTls = (
    tls: RouteTlsSettings | undefined,
    endpoint: LocalEndpoint | undefined,
  ): RouteTlsSettings => {
    const https = endpoint?.protocol === 'https';
    const alias = tls?.clientCertConfig?.alias;
    const hasAlias = typeof alias === 'string' && alias.trim().length > 0;
    const mtlsEnabled =
      https &&
      (tls?.mtlsEnabled === undefined ? hasAlias : tls.mtlsEnabled === true) &&
      hasAlias;
    return {
      mtlsEnabled,
      serverCertificatePin: https
        ? normalizeServerCertificatePin(
            {
              protocol: endpoint.protocol,
              host: endpoint.host,
              port: endpoint.port,
              path: endpoint.basePath,
            },
            'local',
            tls?.serverCertificatePin,
            mtlsEnabled ? (alias as string) : '',
          )
        : undefined,
      serverCertificatePinRequired:
        https &&
        (tls?.serverCertificatePinRequired === true ||
          (tls?.serverCertificatePin !== undefined &&
            normalizeServerCertificatePin(
              {
                protocol: endpoint.protocol,
                host: endpoint.host,
                port: endpoint.port,
                path: endpoint.basePath,
              },
              'local',
              tls.serverCertificatePin,
              mtlsEnabled ? (alias as string) : '',
            ) === undefined)),
      ...(mtlsEnabled
        ? {
            clientCertConfig: {
              alias: alias as string,
            },
          }
        : {}),
    };
  };

  const persistedRtsp = (
    rtsp: RtspSettings | undefined,
    localRoutingEnabled: boolean,
  ): RtspSettings => ({
    enabled:
      localRoutingEnabled && rtsp?.enabled === true && validPort(rtsp.port),
    port: validPort(rtsp?.port) ? rtsp.port : 8554,
    allowInsecureCredentials:
      localRoutingEnabled &&
      rtsp?.enabled === true &&
      validPort(rtsp?.port) &&
      rtsp.allowInsecureCredentials === true,
  });

  const stateWithoutLegacyCache = {
    ...inboundState,
  } as ISettings & {clientCertPasswordCache?: unknown};
  // This cache was previously part of the persisted settings shape. Remove
  // it explicitly so old snapshots cannot carry certificate passwords forward.
  delete stateWithoutLegacyCache.clientCertPasswordCache;

  const cameras = {...stateWithoutLegacyCache.cameras};
  delete cameras.liveView;
  delete cameras.actionWhenPressed;
  stateWithoutLegacyCache.cameras = cameras;
  stateWithoutLegacyCache.liveStreamPreferences =
    normalizeLiveStreamPreferences(
      stateWithoutLegacyCache.liveStreamPreferences,
      Array.isArray(inboundState.servers) ? inboundState.servers : [],
    );

  if (!Array.isArray(inboundState.servers)) {
    return stateWithoutLegacyCache;
  }

  return {
    ...stateWithoutLegacyCache,
    activeServerProfileId: getFallbackActiveServerProfileId(
      inboundState.servers,
      inboundState.activeServerProfileId,
    ),
    servers: inboundState.servers.map(server => {
      const mtlsEnabled = serverUsesClientCertificate(server);
      const clientCertConfig =
        mtlsEnabled && server.clientCertConfig
          ? {
              alias: server.clientCertConfig.alias,
            }
          : undefined;
      const persistedServer = {
        ...server,
        credentials: {username: '', password: ''},
        mtlsEnabled,
        serverCertificatePin: normalizeServerCertificatePin(
          server,
          'remote',
          server.serverCertificatePin,
          mtlsEnabled ? server.clientCertConfig?.alias || '' : '',
        ),
        serverCertificatePinRequired:
          server.serverCertificatePinRequired === true ||
          (server.serverCertificatePin !== undefined &&
            normalizeServerCertificatePin(
              server,
              'remote',
              server.serverCertificatePin,
              mtlsEnabled ? server.clientCertConfig?.alias || '' : '',
            ) === undefined),
      };
      const localEndpoint = persistedLocalEndpoint(server.localEndpoint);
      const localRoutingEnabled =
        server.localRoutingEnabled === true && localEndpoint !== undefined;
      persistedServer.localRoutingEnabled = localRoutingEnabled;
      persistedServer.localEndpoint = localRoutingEnabled
        ? localEndpoint
        : undefined;
      persistedServer.localTls = localRoutingEnabled
        ? persistedLocalTls(server.localTls, localEndpoint)
        : {mtlsEnabled: false};
      persistedServer.rtsp = persistedRtsp(server.rtsp, localRoutingEnabled);
      if (clientCertConfig) {
        persistedServer.clientCertConfig = clientCertConfig;
      } else {
        delete persistedServer.clientCertConfig;
      }
      return persistedServer;
    }),
  };
};

interface LegacyPersistedCredential {
  identity: string;
  credentials: Credentials;
  profileId?: string;
}

const legacyPersistedCredentials = new Map<string, LegacyPersistedCredential>();

const scrubLegacyPersistedCredentials = (state: ISettings): ISettings => {
  if (Array.isArray(state?.servers)) {
    state.servers.forEach((server: Server, index) => {
      if (server.credentials?.username || server.credentials?.password) {
        const identity = serverIdentity(
          server,
          serverUsesClientCertificate(server)
            ? server.clientCertConfig?.alias
            : undefined,
        );
        const profileId = server.profileId?.trim() || undefined;
        const key = profileId
          ? `profile:${profileId}`
          : `identity:${identity}:${index}`;
        legacyPersistedCredentials.set(key, {
          identity,
          profileId,
          credentials: {...server.credentials},
        });
      }
    });
  }
  return stripCredentialsFromPersistence(state);
};

export const getLegacyPersistedCredentials = (): Array<{
  identity: string;
  credentials: Credentials;
}> =>
  [...legacyPersistedCredentials.values()].map(({identity, credentials}) => ({
    identity,
    credentials: {...credentials},
  }));

/**
 * Return credentials captured from a persisted server with this profile ID.
 * The profile ID is metadata only; credentials remain in memory until they
 * are moved to platform secure storage.
 */
export const getLegacyPersistedCredentialsForProfile = (
  profileId: string,
): Credentials | undefined => {
  const entry = legacyPersistedCredentials.get(`profile:${profileId}`);
  return entry ? {...entry.credentials} : undefined;
};

export const getLegacyPersistedCredentialsForIdentity = (
  identity: string,
): Array<{profileId?: string; credentials: Credentials}> =>
  [...legacyPersistedCredentials.values()]
    .filter(entry => entry.identity === identity)
    .map(({profileId, credentials}) => ({
      profileId,
      credentials: {...credentials},
    }));

export const clearLegacyPersistedCredential = (
  identity: string,
  profileId?: string,
): void => {
  if (profileId) {
    legacyPersistedCredentials.delete(`profile:${profileId}`);
    return;
  }

  const legacyEntry = [...legacyPersistedCredentials.entries()].find(
    ([, entry]) => !entry.profileId && entry.identity === identity,
  );
  if (legacyEntry) {
    legacyPersistedCredentials.delete(legacyEntry[0]);
  }
};

export const credentialsPersistenceTransform = createTransform<
  ISettings,
  ISettings
>(stripCredentialsFromPersistence, scrubLegacyPersistedCredentials, {
  whitelist: ['v1'],
});