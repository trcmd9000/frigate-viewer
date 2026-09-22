import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import type {RootState} from './store';
import {NativeModules} from 'react-native';
import {
  normalizeServerCertificatePin,
  serverIdentity,
  serverRouteIdentity,
  serverUsesClientCertificate,
} from '../helpers/serverIdentity';

/**
 * STORE MODEL
 **/

export type Region =
  | 'de_AT'
  | 'de_DE'
  | 'de_LU'
  | 'de_CH'
  | 'en_AU'
  | 'en_CA'
  | 'en_GB'
  | 'en_IE'
  | 'en_NZ'
  | 'en_US'
  | 'es_AR'
  | 'es_BO'
  | 'es_CL'
  | 'es_CO'
  | 'es_CR'
  | 'es_DO'
  | 'es_EC'
  | 'es_ES'
  | 'es_GT'
  | 'es_HN'
  | 'es_MX'
  | 'es_NI'
  | 'es_PA'
  | 'es_PE'
  | 'es_PY'
  | 'es_SV'
  | 'es_UY'
  | 'es_VE'
  | 'fr_FR'
  | 'fr_CA'
  | 'fr_CH'
  | 'pl_PL'
  | 'pt_BR'
  | 'pt_PT'
  | 'uk_UA'
  | 'it_CH'
  | 'it_IT'
  | 'sv_SE';

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Client certificate configuration for mTLS authentication.
 * The certificate must be installed in the device's keystore/keychain.
 */
export interface ClientCertConfig {
  /** Alias/name of the certificate in the device's keystore/keychain */
  alias: string;
  /** Read only during migration; it never enables certificate trust. */
  serverCertificatePinRequired?: boolean;
}

export interface ServerCertificatePin {
  /** Lower-case SHA-256 fingerprint of the exact leaf certificate. */
  sha256Fingerprint: string;
  /** Canonical route and endpoint at the time the user approved the pin. */
  route: 'remote' | 'local';
  endpoint: string;
  /** The KeyChain alias used by the TLS probe, or an empty string. */
  clientCertAlias: string;
}

/** A Frigate endpoint reachable on the device's local network. */
export interface LocalEndpoint {
  protocol: 'http' | 'https';
  /** A hostname or IP address, never a URL or credential-bearing authority. */
  host: string;
  port: number;
  basePath: string;
}

/**
 * TLS settings for a route. The certificate alias is an Android KeyChain
 * identity only; certificate and private-key material never belongs in this
 * model.
 */
export interface RouteTlsSettings {
  mtlsEnabled?: boolean;
  clientCertConfig?: ClientCertConfig;
  serverCertificatePin?: ServerCertificatePin;
  /** Migration marker: legacy trust-all profiles stay blocked until enrollment. */
  serverCertificatePinRequired?: boolean;
}

export interface RtspSettings {
  enabled: boolean;
  port: number;
  /**
   * RTSP may transmit the shared Frigate credentials without TLS. This must
   * be explicitly approved and is intentionally not a credential field.
   */
  allowInsecureCredentials: boolean;
}

export type LiveStreamPreference =
  | {mode: 'auto'}
  | {mode: 'manual'; streamName: string};

export type LiveStreamPreferences = Record<
  string,
  Record<string, LiveStreamPreference>
>;

export interface Server {
  /**
   * Opaque, non-secret identifier for this configured profile. It is used to
   * isolate credentials for profiles that point at the same endpoint.
   *
   * Optional for source compatibility with pre-profile settings. Settings
   * migrations always populate it before a server is stored.
   */
  profileId?: string;
  protocol: 'http' | 'https';
  host: string;
  port: number;
  path: string;
  auth: 'basic' | 'frigate' | 'none';
  credentials: Credentials;
  /**
   * Whether this profile uses mutual TLS. Optional only for compatibility
   * with profiles created before the explicit toggle was introduced.
   */
  mtlsEnabled?: boolean;
  /** Client certificate configuration for mTLS authentication (optional) */
  clientCertConfig?: ClientCertConfig;
  serverCertificatePin?: ServerCertificatePin;
  /** Migration marker: legacy trust-all profiles stay blocked until enrollment. */
  serverCertificatePinRequired?: boolean;
  /**
   * Optional local route. Local routing is disabled unless
   * localRoutingEnabled is true and this endpoint is valid.
   */
  localEndpoint?: LocalEndpoint;
  localRoutingEnabled?: boolean;
  localTls?: RouteTlsSettings;
  /** RTSP uses the shared Frigate credentials; it has no credential fields. */
  rtsp?: RtspSettings;
}

export interface ISettings {
  servers: Server[];
  /**
   * The selected profile is persisted by its opaque profile ID rather than
   * by array position. It is optional only while reading pre-selection data.
   */
  activeServerProfileId?: string;
  locale: {
    region: Region;
    datesDisplay: 'descriptive' | 'numeric';
  };
  app: {
    colorScheme: 'auto' | 'light' | 'dark';
    sendCrashReports: boolean;
  };
  cameras: {
    refreshFrequency: number;
    numColumns: number;
    previewHeight: number;
    /** @deprecated Ignored when settings are migrated. */
    liveView?: boolean;
    /** @deprecated Ignored when settings are migrated. */
    actionWhenPressed?: 'events' | 'preview';
  };
  liveStreamPreferences: LiveStreamPreferences;
  events: {
    numColumns: number;
    snapshotHeight: number;
    photoPreference: 'snapshot' | 'thumbnail';
    lockLandscapePlaybackOrientation: boolean;
  };
}

export const emptyServer = (): Server => ({
  profileId: generateServerProfileId(),
  protocol: 'https',
  host: '',
  port: 5000,
  path: '',
  auth: 'none',
  credentials: {
    username: '',
    password: '',
  },
  mtlsEnabled: false,
  clientCertConfig: undefined,
  localRoutingEnabled: false,
  localEndpoint: undefined,
  localTls: {
    mtlsEnabled: false,
  },
  rtsp: {
    enabled: false,
    port: 8554,
    allowInsecureCredentials: false,
  },
});

const generatedProfileIds = new Set<string>();

/**
 * Generate an opaque identifier for a newly-created server profile.
 *
 * This deliberately does not contain endpoint, certificate, or credential
 * data. React Native runtimes do not all expose the Web Crypto API, so keep a
 * small non-secret fallback for older runtimes.
 */
export const generateServerProfileId = (): string => {
  const cryptoObject = (
    globalThis as {
      crypto?: {
        randomUUID?: () => string;
        getRandomValues?: (array: Uint32Array) => Uint32Array;
      };
    }
  ).crypto;

  let baseId: string;
  if (cryptoObject?.randomUUID) {
    baseId = `profile-${cryptoObject.randomUUID()}`;
  } else if (cryptoObject?.getRandomValues) {
    const values = cryptoObject.getRandomValues(new Uint32Array(4));
    baseId = `profile-${Array.from(values)
      .map(value => value.toString(16).padStart(8, '0'))
      .join('')}`;
  } else {
    baseId = `profile-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}`;
  }

  let profileId = baseId;
  let suffix = 1;
  while (generatedProfileIds.has(profileId)) {
    profileId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  generatedProfileIds.add(profileId);
  return profileId;
};

export const initialSettings: ISettings = {
  servers: [],
  activeServerProfileId: undefined,
  app: {
    colorScheme: 'auto',
    sendCrashReports: true,
  },
  locale: {
    region: NativeModules.I18nManager.localeIdentifier,
    datesDisplay: 'descriptive',
  },
  cameras: {
    refreshFrequency: 10,
    numColumns: 1,
    previewHeight: 222,
  },
  liveStreamPreferences: {},
  events: {
    numColumns: 1,
    snapshotHeight: 222,
    photoPreference: 'snapshot',
    lockLandscapePlaybackOrientation: false,
  },
};

/**
 * MIGRATIONS
 **/

export interface State {
  v1: ISettings;
}

const fillGaps: <T extends object>(initial: T, current?: Partial<T>) => T = <
  T extends object,
>(
  initial: T,
  current?: Partial<T>,
) =>
  Object.keys(initial).reduce<T>((settings: T, k: string) => {
    const key: keyof T = k as keyof T;
    return {
      ...settings,
      [key]:
        typeof initial[key] === 'object' && !Array.isArray(initial[key])
          ? fillGaps(
              initial[key] as object,
              current ? (current[key] as object) : {},
            )
          : current !== undefined && current[key] !== undefined
          ? current[key]
          : initial[key],
    } as T;
  }, {} as T);

const validProfileId = (profileId: unknown): profileId is string =>
  typeof profileId === 'string' && profileId.trim().length > 0;

const legacyTrustAllEnabled = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const legacyKey = ['allow', 'SelfSigned', 'Server'].join('');
  return (value as Record<string, unknown>)[legacyKey] === true;
};

const validPreferenceName = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 128 &&
  ![...value].some(
    character =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );

const validStreamName = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);

const normalizeLiveStreamPreference = (
  value: unknown,
): LiveStreamPreference | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Partial<LiveStreamPreference>;
  if (candidate.mode === 'auto') {
    return {mode: 'auto'};
  }
  return candidate.mode === 'manual' && validStreamName(candidate.streamName)
    ? {mode: 'manual', streamName: candidate.streamName}
    : undefined;
};

export const normalizeLiveStreamPreferences = (
  value: unknown,
  servers: readonly Server[],
): LiveStreamPreferences => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const validProfileIds = new Set(
    servers
      .map(server => server.profileId)
      .filter(validProfileId)
      .map(profileId => profileId.trim()),
  );
  return Object.entries(
    value as Record<string, unknown>,
  ).reduce<LiveStreamPreferences>(
    (preferences, [profileId, cameraPreferences]) => {
      if (
        !validProfileIds.has(profileId) ||
        !cameraPreferences ||
        typeof cameraPreferences !== 'object' ||
        Array.isArray(cameraPreferences)
      ) {
        return preferences;
      }
      const normalizedCameras = Object.entries(
        cameraPreferences as Record<string, unknown>,
      ).reduce<Record<string, LiveStreamPreference>>(
        (cameras, [cameraName, preference]) => {
          const normalized = normalizeLiveStreamPreference(preference);
          if (validPreferenceName(cameraName) && normalized) {
            cameras[cameraName] = normalized;
          }
          return cameras;
        },
        {},
      );
      if (Object.keys(normalizedCameras).length > 0) {
        preferences[profileId] = normalizedCameras;
      }
      return preferences;
    },
    {},
  );
};

const profileMigrationSeed = (server: Server): string =>
  JSON.stringify({
    identity: serverIdentity(
      server,
      serverUsesClientCertificate(server)
        ? server.clientCertConfig?.alias
        : undefined,
    ),
    auth: server.auth,
    local: serverRouteIdentity(server, 'local'),
    rtsp: server.rtsp,
  });

const hashProfileMigrationSeed = (seed: string): string => {
  // A small deterministic hash is sufficient for an opaque local identifier.
  // No secret material is included in the seed.
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 4294967291;
  }
  return Math.floor(hash).toString(16).padStart(8, '0');
};

const migrateProfileIds = (servers: Server[] = []): Server[] => {
  const usedIds = new Set<string>();
  const seedOccurrences = new Map<string, number>();

  return servers.map(server => {
    const existingProfileId =
      typeof server.profileId === 'string'
        ? server.profileId.trim()
        : undefined;
    if (validProfileId(existingProfileId) && !usedIds.has(existingProfileId)) {
      usedIds.add(existingProfileId);
      return existingProfileId === server.profileId
        ? server
        : {...server, profileId: existingProfileId};
    }

    const seed = profileMigrationSeed(server);
    const occurrence = seedOccurrences.get(seed) || 0;
    seedOccurrences.set(seed, occurrence + 1);
    const baseId = `profile-${hashProfileMigrationSeed(seed)}-${occurrence}`;
    let profileId = baseId;
    let collision = 1;
    while (usedIds.has(profileId)) {
      profileId = `${baseId}-${collision}`;
      collision += 1;
    }
    usedIds.add(profileId);
    return {...server, profileId};
  });
};

/**
 * Return the only valid occurrence of an active profile ID, or the first
 * valid profile when the requested value cannot be used. Keeping this
 * normalization deterministic prevents an invalid persisted selection from
 * selecting a different same-origin profile by accident.
 */
export const getFallbackActiveServerProfileId = (
  serversOrSettings:
    | readonly Server[]
    | Pick<ISettings, 'servers' | 'activeServerProfileId'>,
  requestedProfileId?: unknown,
): string | undefined => {
  const servers =
    'servers' in serversOrSettings
      ? serversOrSettings.servers
      : serversOrSettings;
  const requestedValue =
    requestedProfileId === undefined &&
    'activeServerProfileId' in serversOrSettings
      ? serversOrSettings.activeServerProfileId
      : requestedProfileId;
  const validIds = servers
    .map(server =>
      typeof server.profileId === 'string' ? server.profileId.trim() : '',
    )
    .filter(validProfileId);
  const requested =
    typeof requestedValue === 'string' ? requestedValue.trim() : undefined;
  if (
    requested &&
    validIds.filter(profileId => profileId === requested).length === 1
  ) {
    return requested;
  }
  return validIds[0];
};

export const normalizeActiveServerProfileId = getFallbackActiveServerProfileId;

const isLocalProtocol = (value: unknown): value is LocalEndpoint['protocol'] =>
  value === 'http' || value === 'https';

const containsControlCharacter = (value: string): boolean =>
  Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

const validLocalHost = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }
  const host = value.trim();
  return (
    host.length > 0 &&
    host.length <= 253 &&
    !/[/?#@\s]/.test(host) &&
    !containsControlCharacter(host)
  );
};

const validPort = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= 65535;

const normalizeLocalEndpoint = (
  endpoint: unknown,
): LocalEndpoint | undefined => {
  if (!endpoint || typeof endpoint !== 'object') {
    return undefined;
  }
  const candidate = endpoint as Partial<LocalEndpoint>;
  if (
    !isLocalProtocol(candidate.protocol) ||
    !validLocalHost(candidate.host) ||
    !validPort(candidate.port) ||
    typeof candidate.basePath !== 'string' ||
    /[?#]/.test(candidate.basePath) ||
    containsControlCharacter(candidate.basePath)
  ) {
    return undefined;
  }
  return {
    protocol: candidate.protocol,
    host: candidate.host.trim(),
    port: candidate.port,
    basePath: candidate.basePath,
  };
};

const normalizeLocalTls = (
  tls: unknown,
  endpoint: LocalEndpoint | undefined,
): RouteTlsSettings => {
  const candidate =
    tls && typeof tls === 'object' ? (tls as Partial<RouteTlsSettings>) : {};
  const alias = candidate.clientCertConfig?.alias;
  const hasAlias = typeof alias === 'string' && alias.trim().length > 0;
  const mtlsEnabled =
    endpoint?.protocol === 'https' &&
    (candidate.mtlsEnabled === undefined
      ? hasAlias
      : candidate.mtlsEnabled === true) &&
    hasAlias;
  return {
    mtlsEnabled: mtlsEnabled && hasAlias,
    serverCertificatePin: normalizeServerCertificatePin(
      {
        protocol: endpoint?.protocol || 'https',
        host: endpoint?.host || '',
        port: endpoint?.port || 0,
        path: endpoint?.basePath || '',
      },
      'local',
      candidate.serverCertificatePin,
      mtlsEnabled && hasAlias ? (alias as string) : '',
    ),
    serverCertificatePinRequired:
      candidate.serverCertificatePinRequired === true ||
      (candidate.serverCertificatePin !== undefined &&
        normalizeServerCertificatePin(
          {
            protocol: endpoint?.protocol || 'https',
            host: endpoint?.host || '',
            port: endpoint?.port || 0,
            path: endpoint?.basePath || '',
          },
          'local',
          candidate.serverCertificatePin,
          mtlsEnabled && hasAlias ? (alias as string) : '',
        ) === undefined) ||
      legacyTrustAllEnabled(candidate) ||
      legacyTrustAllEnabled(candidate.clientCertConfig) ||
      candidate.clientCertConfig?.serverCertificatePinRequired === true,
    ...(mtlsEnabled && hasAlias
      ? {
          clientCertConfig: {
            alias: alias as string,
          },
        }
      : {}),
  };
};

const normalizeRtsp = (
  rtsp: unknown,
  localRoutingEnabled: boolean,
): RtspSettings => {
  const candidate =
    rtsp && typeof rtsp === 'object' ? (rtsp as Partial<RtspSettings>) : {};
  return {
    enabled:
      localRoutingEnabled &&
      candidate.enabled === true &&
      validPort(candidate.port),
    port: validPort(candidate.port) ? candidate.port : 8554,
    allowInsecureCredentials:
      localRoutingEnabled &&
      candidate.enabled === true &&
      validPort(candidate.port) &&
      candidate.allowInsecureCredentials === true,
  };
};

const migrateLocalRouting = (server: Server): Server => {
  const localEndpoint = normalizeLocalEndpoint(server.localEndpoint);
  const localRoutingEnabled =
    server.localRoutingEnabled === true && localEndpoint !== undefined;
  const localTls = normalizeLocalTls(server.localTls, localEndpoint);
  const rtsp = normalizeRtsp(server.rtsp, localRoutingEnabled);
  return {
    ...server,
    serverCertificatePin: normalizeServerCertificatePin(
      server,
      'remote',
      server.serverCertificatePin,
      serverUsesClientCertificate(server)
        ? server.clientCertConfig?.alias || ''
        : '',
    ),
    serverCertificatePinRequired:
      server.serverCertificatePinRequired === true ||
      (server.serverCertificatePin !== undefined &&
        normalizeServerCertificatePin(
          server,
          'remote',
          server.serverCertificatePin,
          serverUsesClientCertificate(server)
            ? server.clientCertConfig?.alias || ''
            : '',
        ) === undefined) ||
      legacyTrustAllEnabled(server) ||
      legacyTrustAllEnabled(server.clientCertConfig) ||
      server.clientCertConfig?.serverCertificatePinRequired === true,
    localRoutingEnabled,
    localEndpoint: localRoutingEnabled ? localEndpoint : undefined,
    localTls: localRoutingEnabled ? localTls : {mtlsEnabled: false},
    rtsp,
  };
};

const v1Migrations = (settings?: ISettings): ISettings | undefined => {
  if (!settings) {
    return settings;
  }
  interface DeprecatedV1Settings {
    server?: Server;
  }
  const {
    server,
    servers,
    activeServerProfileId,
    liveStreamPreferences,
    ...restSettings
  } = settings as ISettings & DeprecatedV1Settings;
  delete (restSettings as ISettings & {clientCertPasswordCache?: unknown})
    .clientCertPasswordCache;
  const migrateServer = (currentServer: Server): Server => {
    const mtlsEnabled = serverUsesClientCertificate(currentServer);
    return migrateLocalRouting({
      ...currentServer,
      mtlsEnabled,
      clientCertConfig: mtlsEnabled
        ? currentServer.clientCertConfig
        : undefined,
    });
  };
  const sourceServers = Array.isArray(servers) ? servers : [];
  const sourceProfileIdCounts = new Map<string, number>();
  sourceServers.forEach(currentServer => {
    const profileId =
      typeof currentServer.profileId === 'string'
        ? currentServer.profileId.trim()
        : undefined;
    if (validProfileId(profileId)) {
      sourceProfileIdCounts.set(
        profileId,
        (sourceProfileIdCounts.get(profileId) || 0) + 1,
      );
    }
  });
  const requestedProfileId =
    typeof activeServerProfileId === 'string'
      ? activeServerProfileId.trim()
      : undefined;
  const uniquelySelectedProfileId =
    requestedProfileId && sourceProfileIdCounts.get(requestedProfileId) === 1
      ? requestedProfileId
      : undefined;
  const migratedServers = migrateProfileIds(sourceServers.map(migrateServer));
  const serversWithLegacyServer = server
    ? migrateProfileIds([migrateServer(server)])
    : migratedServers;
  return {
    ...restSettings,
    servers: serversWithLegacyServer,
    liveStreamPreferences: normalizeLiveStreamPreferences(
      liveStreamPreferences,
      serversWithLegacyServer,
    ),
    activeServerProfileId: getFallbackActiveServerProfileId(
      serversWithLegacyServer,
      uniquelySelectedProfileId,
    ),
  };
};

export const settingsMigrations = (settings: ISettings): ISettings => {
  return fillGaps(initialSettings, v1Migrations(settings));
};

/**
 * REDUCERS
 **/

export const settingsStore = createSlice({
  name: 'settings',
  initialState: {
    v1: initialSettings,
  },
  reducers: {
    saveSettings: (state, action: PayloadAction<ISettings>) => {
      const migrated = settingsMigrations(action.payload);
      state.v1 = migrated;
    },
    setCameraPreviewHeight: (state, action: PayloadAction<number>) => {
      state.v1.cameras.previewHeight = action.payload;
    },
    setEventSnapshotHeight: (state, action: PayloadAction<number>) => {
      state.v1.events.snapshotHeight = action.payload;
    },
    setLiveStreamPreference: (
      state,
      action: PayloadAction<{
        profileId: string;
        cameraName: string;
        preference: LiveStreamPreference;
      }>,
    ) => {
      const {profileId, cameraName, preference} = action.payload;
      const normalized = normalizeLiveStreamPreference(preference);
      if (
        !validProfileId(profileId) ||
        !validPreferenceName(cameraName) ||
        !normalized ||
        !state.v1.servers.some(server => server.profileId === profileId)
      ) {
        return;
      }
      state.v1.liveStreamPreferences[profileId] = {
        ...state.v1.liveStreamPreferences[profileId],
        [cameraName]: normalized,
      };
    },
    clearLiveStreamPreference: (
      state,
      action: PayloadAction<{profileId: string; cameraName: string}>,
    ) => {
      const {profileId, cameraName} = action.payload;
      const preferences = state.v1.liveStreamPreferences[profileId];
      if (!preferences || !validPreferenceName(cameraName)) {
        return;
      }
      delete preferences[cameraName];
      if (Object.keys(preferences).length === 0) {
        delete state.v1.liveStreamPreferences[profileId];
      }
    },
    setServerClientCertConfig: (
      state,
      action: PayloadAction<{
        serverIndex: number;
        clientCertConfig?: ClientCertConfig;
      }>,
    ) => {
      const {serverIndex, clientCertConfig} = action.payload;
      if (state.v1.servers[serverIndex]) {
        state.v1.servers[serverIndex].mtlsEnabled = Boolean(
          clientCertConfig?.alias?.trim(),
        );
        state.v1.servers[serverIndex].clientCertConfig = clientCertConfig;
      }
    },
    setActiveServerProfileId: (
      state,
      action: PayloadAction<string | undefined>,
    ) => {
      state.v1.activeServerProfileId = getFallbackActiveServerProfileId(
        state.v1.servers,
        action.payload,
      );
    },
    setActiveServerProfile: (
      state,
      action: PayloadAction<string | undefined>,
    ) => {
      state.v1.activeServerProfileId = getFallbackActiveServerProfileId(
        state.v1.servers,
        action.payload,
      );
    },
    removeServerProfile: (state, action: PayloadAction<string>) => {
      const profileId =
        typeof action.payload === 'string' ? action.payload.trim() : '';
      const remainingServers = state.v1.servers.filter(
        server =>
          typeof server.profileId !== 'string' ||
          server.profileId.trim() !== profileId,
      );
      if (remainingServers.length === state.v1.servers.length) {
        return;
      }
      state.v1.servers = remainingServers;
      delete state.v1.liveStreamPreferences[profileId];
      state.v1.activeServerProfileId = getFallbackActiveServerProfileId(
        remainingServers,
        state.v1.activeServerProfileId,
      );
    },
  },
});

/**
 * ACTIONS
 **/

export const {
  saveSettings,
  setCameraPreviewHeight,
  setEventSnapshotHeight,
  setLiveStreamPreference,
  clearLiveStreamPreference,
  setServerClientCertConfig,
  setActiveServerProfileId,
  setActiveServerProfile,
  removeServerProfile,
} = settingsStore.actions;

/**
 * SELECTORS
 **/

const settingsState = (state: RootState) => state.settings;

export const selectSettings = (state: RootState) => settingsState(state).v1;

export const selectLiveStreamPreference = (
  state: RootState,
  profileId: string | undefined,
  cameraName: string,
): LiveStreamPreference | undefined =>
  profileId && validPreferenceName(cameraName)
    ? selectSettings(state).liveStreamPreferences[profileId]?.[cameraName]
    : undefined;

/* server */

export const selectServers = (state: RootState) =>
  selectSettings(state).servers;

export const selectActiveServerProfileId = (state: RootState) =>
  getFallbackActiveServerProfileId(
    selectServers(state),
    selectSettings(state).activeServerProfileId,
  );

const temporaryEmptyServer = emptyServer();

export const selectServer = (state: RootState) => {
  const servers = selectServers(state);
  const activeProfileId = selectActiveServerProfileId(state);
  return (
    servers.find(
      server =>
        typeof server.profileId === 'string' &&
        server.profileId.trim() === activeProfileId,
    ) || temporaryEmptyServer
  );
};

/** Alias for settings surfaces that refer to the selected profile as a server. */
export const selectActiveServer = selectServer;

/* locale */

export const selectLocale = (state: RootState) => selectSettings(state).locale;

export const selectLocaleRegion = (state: RootState) =>
  selectLocale(state).region;

export const selectLocaleDatesDisplay = (state: RootState) =>
  selectLocale(state).datesDisplay;

/* app */

export const selectApp = (state: RootState) => selectSettings(state).app;

export const selectAppColorScheme = (state: RootState) =>
  selectApp(state)?.colorScheme || 'auto';

export const selectAppSendCrashReports = (state: RootState) =>
  selectApp(state).sendCrashReports;

/* cameras */

export const selectCameras = (state: RootState) =>
  selectSettings(state).cameras;

export const selectCamerasRefreshFrequency = (state: RootState) =>
  selectCameras(state).refreshFrequency;

export const selectCamerasNumColumns = (state: RootState) =>
  selectCameras(state).numColumns;

export const selectCamerasPreviewHeight = (state: RootState) =>
  selectCameras(state).previewHeight;

/* events */

export const selectEvents = (state: RootState) => selectSettings(state).events;

export const selectEventsNumColumns = (state: RootState) =>
  selectEvents(state).numColumns;

export const selectEventsSnapshotHeight = (state: RootState) =>
  selectEvents(state).snapshotHeight;

export const selectEventsPhotoPreference = (state: RootState) =>
  selectEvents(state).photoPreference;

export const selectEventsLockLandscapePlaybackOrientation = (
  state: RootState,
) => selectEvents(state).lockLandscapePlaybackOrientation;