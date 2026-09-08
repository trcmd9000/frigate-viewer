import {NativeModules, Platform} from 'react-native';
import {clientCertManager} from './clientCertificates';
import type {Server} from '../store/settings';
import {canonicalServerEndpoint, serverRouteIdentity} from './serverIdentity';

export interface HttpRequestOptions extends RequestInit {
  clientCertAlias?: string;
  clientCertServerIdentity?: string;
  profileAuth?: string;
  profileUsername?: string;
  profilePassword?: string;
  maxBytes?: number;
  mediaReservationId?: number;
  allowSelfSignedServer?: boolean;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

interface NativeClientCertResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

interface NativeClientCertDownloadResponse {
  statusCode: number;
  /**
   * Native media downloads return a download-*.part path. The JS layer owns
   * the final rename after it has validated the response and retained the
   * reservation.
   */
  path: string;
  contentType: string;
}

interface NativeClientCertModule {
  scopeServerIdentity?: (
    serverIdentity: string,
    auth: string,
    username: string,
    password: string,
  ) => string;
  invalidateServerSession?: (
    serverIdentity: string,
    auth: string,
    username: string,
    password: string,
  ) => void;
  invalidateMediaProfile?: (profileKey: string) => void;
  performIsolatedHttpRequest?: (
    url: string,
    serverIdentity: string,
    auth: string,
    username: string,
    password: string,
    method: string,
    headers: Array<{key: string; value: string}>,
    body: string | undefined,
  ) => Promise<NativeClientCertResponse>;
  downloadFileWithProfile?: (
    url: string,
    serverIdentity: string,
    auth: string,
    username: string,
    password: string,
    headers: Array<{key: string; value: string}>,
    maxBytes: number,
    mediaReservationId: number,
  ) => Promise<NativeClientCertDownloadResponse>;
  performHttpRequest?: (
    url: string,
    serverIdentity: string,
    method: string,
    headers: Array<{key: string; value: string}>,
    body: string | undefined,
  ) => Promise<NativeClientCertResponse>;
  performHttpRequestWithClientCert?: (
    url: string,
    certIdentifier: string,
    serverIdentity: string,
    method: string,
    headers: Array<{key: string; value: string}>,
    body: string | undefined,
    allowSelfSignedServer: boolean,
  ) => Promise<NativeClientCertResponse>;
  downloadFileWithClientCert?: (
    url: string,
    certIdentifier: string,
    serverIdentity: string,
    headers: Array<{key: string; value: string}>,
    allowSelfSignedServer: boolean,
    maxBytes: number,
    mediaReservationId: number,
  ) => Promise<NativeClientCertDownloadResponse>;
  downloadFileWithoutClientCert?: (
    url: string,
    serverIdentity: string,
    headers: Array<{key: string; value: string}>,
    maxBytes: number,
    mediaReservationId: number,
  ) => Promise<NativeClientCertDownloadResponse>;
  resolveServerRoute?: (
    config: NativeRouteConfig,
    method: string,
  ) => Promise<NativeRouteResponse>;
}

export const ANDROID_SCOPED_IDENTITY_MARKER = '\u0000auth\u0000';

/**
 * Android native sessions are only safe when the native bridge has appended
 * its opaque credential fingerprint. The base identity is intentionally kept
 * credential-free; only the native side receives credentials for hashing.
 */
export const isScopedServerIdentity = (
  identity: unknown,
  baseIdentity?: string,
): identity is string => {
  if (typeof identity !== 'string' || !identity) {
    return false;
  }
  const markerIndex = identity.lastIndexOf(ANDROID_SCOPED_IDENTITY_MARKER);
  if (
    markerIndex <= 0 ||
    identity.indexOf(ANDROID_SCOPED_IDENTITY_MARKER) !== markerIndex
  ) {
    return false;
  }
  if (
    baseIdentity !== undefined &&
    identity.slice(0, markerIndex) !== baseIdentity
  ) {
    return false;
  }
  return /^[0-9a-f]{64}$/i.test(
    identity.slice(markerIndex + ANDROID_SCOPED_IDENTITY_MARKER.length),
  );
};

interface NativeRouteConfig {
  profileKey: string;
  remoteBaseUrl: string;
  localRoutingEnabled: boolean;
  localProtocol: string;
  localHost: string;
  localPort: number;
  localBasePath: string;
  auth: string;
  username: string;
  password: string;
  localMtlsEnabled: boolean;
  localClientCertAlias: string;
  localAllowSelfSignedServer: boolean;
}

export interface NativeRouteResponse {
  route: 'local' | 'remote';
  baseUrl: string;
  generation: number;
  reason?: string;
}

export class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

export const missingClientCertificateError = (): Error & {code: string} =>
  Object.assign(new Error('The selected client certificate is unavailable'), {
    code: 'CERT_IDENTITY_UNAVAILABLE',
  });

const positiveByteBudget = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('A positive media byte budget is required');
  }
  return value;
};

class HttpClientWithClientCert {
  private clientCertModule: NativeClientCertModule | undefined;

  constructor() {
    this.clientCertModule = NativeModules.ClientCertModule as
      | NativeClientCertModule
      | undefined;
  }

  scopeServerIdentity(
    serverIdentity: string,
    auth: string,
    username: string,
    password: string,
  ): string {
    if (Platform.OS !== 'android') {
      if (!this.clientCertModule?.scopeServerIdentity) {
        return serverIdentity;
      }
      return this.clientCertModule.scopeServerIdentity(
        serverIdentity,
        auth,
        username,
        password,
      );
    }
    if (!this.clientCertModule?.scopeServerIdentity) {
      throw new Error(
        'Profile-scoped Android identity derivation is unavailable',
      );
    }
    const scopedIdentity = this.clientCertModule.scopeServerIdentity(
      serverIdentity,
      auth,
      username,
      password,
    );
    if (!isScopedServerIdentity(scopedIdentity, serverIdentity)) {
      throw new Error(
        'Profile-scoped Android identity derivation returned an invalid scope',
      );
    }
    return scopedIdentity;
  }

  private requireAndroidScopedIdentity(
    identity: string,
    operation: string,
  ): void {
    if (Platform.OS === 'android' && !isScopedServerIdentity(identity)) {
      throw new Error(
        `Profile-scoped Android ${operation} requires a native scoped identity`,
      );
    }
  }

  invalidateServerSession(
    serverIdentity: string,
    auth = '',
    username = '',
    password = '',
  ): void {
    if (
      Platform.OS === 'android' &&
      serverIdentity &&
      !this.clientCertModule?.invalidateServerSession
    ) {
      throw new Error(
        'Profile-scoped Android session invalidation is unavailable',
      );
    }
    if (
      Platform.OS === 'ios' &&
      !this.clientCertModule?.invalidateServerSession
    ) {
      throw new Error(
        'Profile-isolated iOS session invalidation is unavailable',
      );
    }
    if (!serverIdentity || !this.clientCertModule?.invalidateServerSession) {
      return;
    }
    this.clientCertModule.invalidateServerSession(
      serverIdentity,
      auth,
      username,
      password,
    );
  }

  invalidateMediaProfile(profileKey: string): void {
    if (
      Platform.OS === 'android' &&
      profileKey &&
      !this.clientCertModule?.invalidateMediaProfile
    ) {
      throw new Error(
        'Android protected media profile invalidation is unavailable',
      );
    }
    if (!profileKey || !this.clientCertModule?.invalidateMediaProfile) {
      return;
    }
    this.clientCertModule.invalidateMediaProfile(profileKey);
  }

  async request(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse> {
    const {
      clientCertAlias,
      clientCertServerIdentity,
      allowSelfSignedServer = false,
      profileAuth,
      profileUsername,
      profilePassword,
      ...fetchOptions
    } = options;
    const profileIdentityProvided = Object.prototype.hasOwnProperty.call(
      options,
      'clientCertServerIdentity',
    );

    if (clientCertAlias === undefined) {
      if (Platform.OS === 'ios' && profileIdentityProvided) {
        if (!clientCertServerIdentity) {
          throw new Error('A server identity is required for profile transport');
        }
        if (
          !this.clientCertModule?.performIsolatedHttpRequest ||
          profileAuth === undefined
        ) {
          throw new Error(
            'Profile-isolated iOS networking is unavailable',
          );
        }
        return this.requestWithIOSProfile(
          url,
          clientCertServerIdentity,
          profileAuth || '',
          profileUsername || '',
          profilePassword || '',
          fetchOptions as RequestInit,
        );
      }
      if (Platform.OS === 'android' && profileIdentityProvided) {
        if (!clientCertServerIdentity) {
          throw new Error('A server identity is required for profile transport');
        }
        this.requireAndroidScopedIdentity(
          clientCertServerIdentity,
          'HTTP transport',
        );
        if (!this.clientCertModule?.performHttpRequest) {
          throw new Error(
            'Profile-scoped Android HTTP networking is unavailable',
          );
        }
        return this.requestWithoutClientCert(
          url,
          clientCertServerIdentity,
          fetchOptions as RequestInit,
        );
      }
      return this.performFetch(url, fetchOptions as RequestInit);
    }

    if (typeof clientCertAlias !== 'string' || !clientCertAlias.trim()) {
      throw missingClientCertificateError();
    }

    if (!/^https:\/\//i.test(url)) {
      throw new Error('Client certificates require HTTPS');
    }
    if (!clientCertServerIdentity) {
      throw new Error('A server identity is required for native requests');
    }
    this.requireAndroidScopedIdentity(
      clientCertServerIdentity,
      'HTTP transport',
    );

    if (!this.clientCertModule) {
      throw new Error('Native client-certificate support is unavailable');
    }

    const availability = await clientCertManager.checkCertificateAvailability(
      clientCertAlias,
    );
    if (!availability.exists) {
      throw missingClientCertificateError();
    }

    if (Platform.OS !== 'android') {
      throw new Error(
        `Client certificates are not supported on ${Platform.OS}`,
      );
    }

    return this.requestWithAndroidClientCert(
      url,
      clientCertAlias,
      clientCertServerIdentity,
      allowSelfSignedServer,
      fetchOptions as RequestInit,
    );
  }

  async resolveServerRoute(
    server: Server,
    method: string,
  ): Promise<NativeRouteResponse | undefined> {
    if (
      Platform.OS !== 'android' ||
      !this.clientCertModule?.resolveServerRoute
    ) {
      return undefined;
    }
    const localTls = server.localTls || {};
    const localEndpoint = server.localEndpoint;
    const response = await this.clientCertModule.resolveServerRoute(
      {
        profileKey: this.scopeServerIdentity(
          serverRouteIdentity(server, 'local'),
          server.auth,
          server.credentials.username,
          server.credentials.password,
        ),
        remoteBaseUrl: this.serverBaseUrl(server),
        localRoutingEnabled:
          server.localRoutingEnabled === true && localEndpoint !== undefined,
        localProtocol: localEndpoint?.protocol || '',
        localHost: localEndpoint?.host || '',
        localPort: localEndpoint?.port || 0,
        localBasePath: localEndpoint?.basePath || '',
        auth: server.auth,
        username: server.auth === 'none' ? '' : server.credentials.username || '',
        password: server.auth === 'none' ? '' : server.credentials.password || '',
        localMtlsEnabled: localTls.mtlsEnabled === true,
        localClientCertAlias:
          localTls.mtlsEnabled === true
            ? localTls.clientCertConfig?.alias || ''
            : '',
        localAllowSelfSignedServer: localTls.allowSelfSignedServer === true,
      },
      method || 'GET',
    );
    if (
      !response ||
      (response.route !== 'local' && response.route !== 'remote') ||
      typeof response.baseUrl !== 'string' ||
      typeof response.generation !== 'number'
    ) {
      throw new Error('Native route resolution returned an invalid result');
    }
    return response;
  }

  async download(
    url: string,
    options: HttpRequestOptions,
  ): Promise<NativeClientCertDownloadResponse> {
    const {
      clientCertAlias,
      clientCertServerIdentity,
      maxBytes,
      mediaReservationId,
      allowSelfSignedServer = false,
      headers = {},
    } = options;
    if (clientCertAlias === undefined) {
      throw missingClientCertificateError();
    }

    if (typeof clientCertAlias !== 'string' || !clientCertAlias.trim()) {
      throw missingClientCertificateError();
    }
    if (!/^https:\/\//i.test(url)) {
      throw new Error('Client certificates require HTTPS');
    }
    if (
      Platform.OS !== 'android' ||
      !this.clientCertModule?.downloadFileWithClientCert
    ) {
      throw new Error(
        'Native media download with client certificate is unavailable',
      );
    }
    if (!clientCertServerIdentity) {
      throw new Error('A server identity is required for native downloads');
    }
    this.requireAndroidScopedIdentity(
      clientCertServerIdentity,
      'media download',
    );
    const byteBudget = positiveByteBudget(maxBytes);
    if (
      typeof mediaReservationId !== 'number' ||
      !Number.isSafeInteger(mediaReservationId) ||
      mediaReservationId <= 0
    ) {
      throw new Error('A media reservation is required');
    }

    const availability = await clientCertManager.checkCertificateAvailability(
      clientCertAlias,
    );
    if (!availability.exists) {
      throw missingClientCertificateError();
    }

    const response = await this.clientCertModule.downloadFileWithClientCert(
      url,
      clientCertAlias,
      clientCertServerIdentity,
      this.objectToHeaders(headers),
      allowSelfSignedServer,
      byteBudget,
      mediaReservationId,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new HttpStatusError(
        response.statusCode,
        `Media download returned HTTP ${response.statusCode}`,
      );
    }
    if (!response.path) {
      throw new Error('Media download did not return a local file');
    }
    return response;
  }

  async downloadWithoutClientCert(
    url: string,
    options: HttpRequestOptions,
  ): Promise<NativeClientCertDownloadResponse> {
    const {
      clientCertServerIdentity,
      profileAuth,
      profileUsername,
      profilePassword,
      maxBytes,
      mediaReservationId,
      headers = {},
    } = options;
    const profileDownload = this.clientCertModule?.downloadFileWithProfile;
    const fallbackDownload =
      this.clientCertModule?.downloadFileWithoutClientCert;
    if (
      Platform.OS !== 'android' &&
      !(Platform.OS === 'ios' && profileDownload)
    ) {
      throw new Error(
        'Profile-isolated native media download is unavailable',
      );
    }
    if (
      !clientCertServerIdentity ||
      (Platform.OS === 'android' &&
        !fallbackDownload) ||
      (Platform.OS === 'ios' &&
        (!profileDownload || profileAuth === undefined))
    ) {
      throw new Error(
        'Native media download without client certificate is unavailable',
      );
    }
    this.requireAndroidScopedIdentity(
      clientCertServerIdentity,
      'media download',
    );
    const byteBudget = positiveByteBudget(maxBytes);
    if (
      typeof mediaReservationId !== 'number' ||
      !Number.isSafeInteger(mediaReservationId) ||
      mediaReservationId <= 0
    ) {
      throw new Error('A media reservation is required');
    }
    const response =
      Platform.OS === 'ios' && profileDownload
        ? await profileDownload(
            url,
            clientCertServerIdentity,
            profileAuth || '',
            profileUsername || '',
            profilePassword || '',
            this.objectToHeaders(headers),
            byteBudget,
            mediaReservationId,
          )
        : fallbackDownload
          ? await fallbackDownload(
              url,
              clientCertServerIdentity,
              this.objectToHeaders(headers),
              byteBudget,
              mediaReservationId,
            )
          : (() => {
              throw new Error(
                'Native media download without client certificate is unavailable',
              );
            })();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new HttpStatusError(
        response.statusCode,
        `Media download returned HTTP ${response.statusCode}`,
      );
    }
    if (!response.path) {
      throw new Error('Media download did not return a local file');
    }
    return response;
  }

  private async performFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<HttpResponse> {
    const response = await fetch(url, options);
    const body = await response.text();

    return {
      status: response.status,
      headers: this.headersToObject(response.headers),
      body,
      json: async () => JSON.parse(body) as unknown,
      text: async () => body,
    };
  }

  private serverBaseUrl(server: Server): string {
    return canonicalServerEndpoint(server)?.requestBaseUrl || '';
  }

  private async requestWithAndroidClientCert(
    url: string,
    certAlias: string,
    serverIdentity: string | undefined,
    allowSelfSignedServer: boolean,
    options: RequestInit,
  ): Promise<HttpResponse> {
    if (!this.clientCertModule?.performHttpRequestWithClientCert) {
      throw new Error(
        'Native HTTP request with client certificate is unavailable on Android',
      );
    }

    if (!serverIdentity) {
      throw new Error('A server identity is required for native requests');
    }

    const result = await this.clientCertModule.performHttpRequestWithClientCert(
      url,
      certAlias,
      serverIdentity,
      options.method || 'GET',
      this.objectToHeaders(options.headers),
      options.body as string | undefined,
      allowSelfSignedServer,
    );

    return {
      status: result.statusCode,
      headers: result.headers || {},
      body: result.body || '',
      json: async () => JSON.parse(result.body || '{}') as unknown,
      text: async () => result.body || '',
    };
  }

  private async requestWithIOSProfile(
    url: string,
    serverIdentity: string,
    auth: string,
    username: string,
    password: string,
    options: RequestInit,
  ): Promise<HttpResponse> {
    const result = await this.clientCertModule!.performIsolatedHttpRequest!(
      url,
      serverIdentity,
      auth,
      username,
      password,
      options.method || 'GET',
      this.objectToHeaders(options.headers),
      options.body as string | undefined,
    );

    return {
      status: result.statusCode,
      headers: result.headers || {},
      body: result.body || '',
      json: async () => JSON.parse(result.body || '{}') as unknown,
      text: async () => result.body || '',
    };
  }

  private async requestWithoutClientCert(
    url: string,
    serverIdentity: string,
    options: RequestInit,
  ): Promise<HttpResponse> {
    const result = await this.clientCertModule!.performHttpRequest!(
      url,
      serverIdentity,
      options.method || 'GET',
      this.objectToHeaders(options.headers),
      options.body as string | undefined,
    );

    return {
      status: result.statusCode,
      headers: result.headers || {},
      body: result.body || '',
      json: async () => JSON.parse(result.body || '{}') as unknown,
      text: async () => result.body || '',
    };
  }

  private headersToObject(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value: string, key: string) => {
      result[key] = value;
    });
    return result;
  }

  private objectToHeaders(
    headers: HeadersInit_ | undefined,
  ): Array<{key: string; value: string}> {
    if (!headers) {
      return [];
    }
    if (Array.isArray(headers)) {
      return headers.map(([key, value]) => ({key, value: String(value)}));
    }
    if (
      typeof headers === 'object' &&
      'forEach' in headers &&
      typeof headers.forEach === 'function'
    ) {
      const result: Array<{key: string; value: string}> = [];
      (headers as Headers).forEach((value: string, key: string) =>
        result.push({key, value}),
      );
      return result;
    }
    return Object.entries(headers).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }
}

export const httpClientWithCert = new HttpClientWithClientCert();
export default HttpClientWithClientCert;
