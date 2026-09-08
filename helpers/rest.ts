import {Buffer} from 'buffer';
import {Platform, ToastAndroid} from 'react-native';
import type {Server} from '../store/settings';
import {useIntl} from 'react-intl';
import {messages} from './rest.messages';
import {
  HttpRequestOptions,
  HttpResponse,
  httpClientWithCert,
  isScopedServerIdentity,
} from './httpWithClientCert';
import {SecureLogger} from './secureLogger';
import {
  handleError,
  ErrorCode,
  getUserFriendlyMessage,
} from './errorHandler';
import {
  canonicalServerEndpoint,
  serverIdentity,
  serverProfileIdentity,
  serverRouteIdentity,
  serverUsesClientCertificate,
} from './serverIdentity';
import {assertRemoteHttpConsent} from './remoteHttpPolicy';
import {invalidateProtectedMediaProfile} from './protectedMedia';

export const buildServerUrl = (server: Server) => {
  return canonicalServerEndpoint(server)?.requestBaseUrl;
};

export const buildServerApiUrl = (server: Server) => {
  const serverUrl = buildServerUrl(server);
  return serverUrl ? `${serverUrl}api` : undefined;
};

export const authorizationHeader: (server: Server) => {
  Authorization?: string;
} = server =>
  server.auth === 'basic'
    ? {
        Authorization: `Basic ${Buffer.from(
          `${server.credentials.username}:${server.credentials.password}`,
        ).toString('base64')}`,
      }
    : {};

export const requestServerIdentity = (server: Server): string => {
  return requestRouteIdentity(server, 'remote');
};

/**
 * Retire only the native session for this profile and credential scope.
 * Platforms without profile-scoped native networking safely no-op.
 */
export const invalidateServerSession = (server: Server): void => {
  const username = server.auth === 'none' ? '' : server.credentials.username || '';
  const password = server.auth === 'none' ? '' : server.credentials.password || '';
  [requestRouteIdentity(server, 'remote'), requestRouteIdentity(server, 'local')].forEach(
    identity =>
      httpClientWithCert.invalidateServerSession(
        identity,
        server.auth,
        username,
        password,
      ),
  );
  httpClientWithCert.invalidateMediaProfile?.(serverProfileIdentity(server));
  invalidateProtectedMediaProfile(server);
};

export const profileTransportOptions = (
  server: Server,
): Pick<
  HttpRequestOptions,
  'profileAuth' | 'profileUsername' | 'profilePassword'
> => ({
  profileAuth: server.auth,
  profileUsername: server.auth === 'none' ? '' : server.credentials.username || '',
  profilePassword: server.auth === 'none' ? '' : server.credentials.password || '',
});

const requestRouteIdentity = (
  server: Server,
  route: 'remote' | 'local',
): string => {
  const identity =
    route === 'local'
      ? serverRouteIdentity(server, 'local')
      : server.profileId?.trim()
        ? serverRouteIdentity(server, 'remote')
        : serverIdentity(
            server,
            serverUsesClientCertificate(server)
              ? server.clientCertConfig?.alias
              : undefined,
          );
  if (Platform.OS !== 'android') {
    return identity;
  }
  if (typeof httpClientWithCert.scopeServerIdentity !== 'function') {
    throw new Error(
      'Profile-scoped Android identity derivation is unavailable',
    );
  }
  const scopedIdentity = httpClientWithCert.scopeServerIdentity(
    identity,
    server.auth,
    server.credentials.username,
    server.credentials.password,
  );
  if (!isScopedServerIdentity(scopedIdentity, identity)) {
    throw new Error(
      'Profile-scoped Android identity derivation returned an invalid scope',
    );
  }
  return scopedIdentity;
};

const loginRequests = new Map<string, Promise<void>>();

const routeRequestUrl = (
  url: string,
  remoteBaseUrl: string,
  localBaseUrl: string,
): string => {
  if (!remoteBaseUrl || !localBaseUrl || !url.startsWith(remoteBaseUrl)) {
    return url;
  }
  return `${localBaseUrl}${url.slice(remoteBaseUrl.length)}`;
};

export const executeServerRequest = async (
  server: Server,
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponse> => {
  const route = await httpClientWithCert.resolveServerRoute?.(
    server,
    options.method || 'GET',
  );
  const remoteBaseUrl = buildServerUrl(server) || '';
  const useLocalRoute =
    route?.route === 'local' &&
    Boolean(remoteBaseUrl) &&
    url.startsWith(remoteBaseUrl);
  if (!useLocalRoute) {
    assertRemoteHttpConsent(server);
  }
  const requestUrl = useLocalRoute
    ? routeRequestUrl(url, remoteBaseUrl, route.baseUrl)
    : url;
  const routeServer =
    useLocalRoute && server.localEndpoint
      ? {
          ...server,
          protocol: server.localEndpoint.protocol,
          host: server.localEndpoint.host,
          port: server.localEndpoint.port,
          path: server.localEndpoint.basePath,
          mtlsEnabled: server.localTls?.mtlsEnabled === true,
          clientCertConfig:
            server.localTls?.mtlsEnabled === true
              ? server.localTls.clientCertConfig
              : undefined,
        }
      : server;

  if (serverUsesClientCertificate(routeServer)) {
    return httpClientWithCert.request(requestUrl, {
      ...options,
      ...profileTransportOptions(server),
      clientCertAlias: routeServer.clientCertConfig?.alias || '',
      clientCertServerIdentity:
        useLocalRoute
          ? requestRouteIdentity(server, 'local')
          : requestServerIdentity(server),
      allowSelfSignedServer:
        routeServer.clientCertConfig?.allowSelfSignedServer || false,
    });
  }

  return httpClientWithCert.request(requestUrl, {
    ...options,
    ...profileTransportOptions(server),
    clientCertServerIdentity: useLocalRoute
      ? requestRouteIdentity(server, 'local')
      : requestServerIdentity(server),
  });
};

export const loginServer = async (
  server: Server,
  errorMessages?: {
    wrongCredentials?: string;
    unauthorized?: string;
  },
): Promise<void> => {
  const loginKey = requestServerIdentity(server);
  const existingRequest = loginRequests.get(loginKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const url = `${buildServerApiUrl(server)}/login`;
    SecureLogger.logAuth('login');
    const response = await executeServerRequest(server, url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: server.credentials.username,
        password: server.credentials.password,
      }),
    });
    if (response.status === 400) {
      const error = new Error(
        errorMessages?.wrongCredentials ||
          'Authorization error, check your credentials.',
      );
      error.name = ErrorCode.AUTH_FAILED;
      throw error;
    }
    if (response.status === 401) {
      const error = new Error(
        errorMessages?.unauthorized ||
          'Wrong credentials when trying to reach the configured server.',
      );
      error.name = ErrorCode.UNAUTHORIZED;
      throw error;
    }
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(`Server returned HTTP ${response.status}.`);
      error.name = ErrorCode.SERVER_ERROR;
      throw error;
    }
  })();
  loginRequests.set(loginKey, request);
  try {
    await request;
  } finally {
    if (loginRequests.get(loginKey) === request) {
      loginRequests.delete(loginKey);
    }
  }
};

export const useRest = () => {
  const intl = useIntl();

  interface QueryOptions {
    queryParams?: Record<string, string>;
    json?: boolean;
  }

  const query = async <T>(
    server: Server,
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    options: QueryOptions = {},
  ): Promise<T> => {
    try {
      const {queryParams, json} = options;
      const url = `${buildServerApiUrl(server)}/${endpoint}`;
      const headers = {
        ...authorizationHeader(server),
      };

      const executeFetch = () =>
        executeServerRequest(
          server,
          `${url}${
            queryParams ? `?${new URLSearchParams(queryParams)}` : ''
          }`,
          {
            method,
            headers,
          },
        );

      SecureLogger.logRequest(method, endpoint);
      let response = await executeFetch();

      if (!response) {
        SecureLogger.logRequest(method, endpoint);
        throw new Error(
          intl.formatMessage(messages['error.unauthorized'], {
            url: 'the configured server',
          }),
        );
      }

      if (response.status === 401) {
        if (server.auth === 'frigate') {
          await loginServer(server, {
            wrongCredentials: intl.formatMessage(
              messages['frigateAuth.wrongCredentials'],
            ),
            unauthorized: intl.formatMessage(messages['error.unauthorized'], {
              url: 'the configured server',
            }),
          });
          if (
            method === 'GET'
          ) {
            response = await executeFetch();
          }
        }

        if (response.status === 401 || method === 'POST' || method === 'DELETE') {
          SecureLogger.logAuth('unauthorized-access');
          const error = new Error(
            intl.formatMessage(messages['error.unauthorized'], {
              url: 'the configured server',
            }),
          );
          error.name = ErrorCode.UNAUTHORIZED;
          throw error;
        }
      }

      if (response.status < 200 || response.status >= 300) {
        const error = new Error(`Server returned HTTP ${response.status}.`);
        error.name = ErrorCode.SERVER_ERROR;
        throw error;
      }

      if (json === false) {
        return (await response.text()) as T;
      }

      try {
        return (await response.json()) as T;
      } catch {
        const contentTypeEntry = Object.entries(response.headers).find(
          ([name]) => name.toLowerCase() === 'content-type',
        );
        const contentType = contentTypeEntry?.[1] || 'unknown content type';
        const error = new Error(
          `Server returned HTTP ${response.status} with ${contentType} instead of JSON.`,
        );
        error.name = ErrorCode.RESPONSE_FORMAT;
        throw error;
      }
    } catch (error) {
      const appError = await handleError(error, endpoint, {showToUser: true});
      ToastAndroid.show(getUserFriendlyMessage(appError), ToastAndroid.LONG);
      return Promise.reject(appError);
    }
  };

  const get = async <T>(
    server: Server,
    endpoint: string,
    options?: QueryOptions,
  ): Promise<T> => {
    return query(server, 'GET', endpoint, options);
  };

  const post = async <T>(
    server: Server,
    endpoint: string,
    options?: QueryOptions,
  ): Promise<T> => {
    return query(server, 'POST', endpoint, options);
  };

  const del = async <T>(
    server: Server,
    endpoint: string,
    options?: QueryOptions,
  ): Promise<T> => {
    return query(server, 'DELETE', endpoint, options);
  };

  return {
    get,
    post,
    del,
  };
};
