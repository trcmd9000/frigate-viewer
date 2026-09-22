import type {
  LocalEndpoint,
  Server,
  ServerCertificatePin,
} from '../store/settings';

type ServerIdentityInput = Pick<Server, 'protocol' | 'host' | 'port' | 'path'>;

export const serverUsesClientCertificate = (
  server: Pick<Server, 'mtlsEnabled' | 'clientCertConfig'>,
): boolean =>
  server.mtlsEnabled === undefined
    ? Boolean(server.clientCertConfig?.alias?.trim())
    : server.mtlsEnabled;

const effectivePort = (server: ServerIdentityInput): number =>
  server.port || (server.protocol === 'https' ? 443 : 80);

const normalizedHost = (host: string): string => {
  const trimmed = String(host || '')
    .trim()
    .toLowerCase();
  if (trimmed.includes(':') && !trimmed.startsWith('[')) {
    return `[${trimmed}]`;
  }
  return trimmed;
};

const normalizedBasePath = (path: string): string => {
  const segments = String(path || '')
    .split('/')
    .filter(Boolean);
  return segments.length > 0 ? `/${segments.join('/')}` : '';
};

export interface CanonicalServerEndpoint {
  requestBaseUrl: string;
  scopeEndpoint: string;
}

export type ServerRoute = 'remote' | 'local';

export const normalizeServerCertificatePin = (
  endpointInput: ServerIdentityInput,
  route: ServerRoute,
  pin: ServerCertificatePin | undefined,
  clientCertAlias: string,
): ServerCertificatePin | undefined => {
  const endpoint = canonicalServerEndpoint(endpointInput)?.scopeEndpoint;
  const fingerprint = pin?.sha256Fingerprint?.toLowerCase();
  const alias = String(clientCertAlias || '').trim();
  if (
    endpointInput.protocol !== 'https' ||
    !endpoint ||
    !pin ||
    pin.route !== route ||
    pin.endpoint !== endpoint ||
    pin.clientCertAlias !== alias ||
    !/^[0-9a-f]{64}$/.test(fingerprint || '')
  ) {
    return undefined;
  }
  return {
    sha256Fingerprint: fingerprint as string,
    route,
    endpoint,
    clientCertAlias: alias,
  };
};

export const routeServerCertificatePin = (
  server: Server,
  route: ServerRoute,
): ServerCertificatePin | undefined => {
  const local = route === 'local';
  const alias = local
    ? server.localTls?.mtlsEnabled === true
      ? server.localTls.clientCertConfig?.alias || ''
      : ''
    : serverUsesClientCertificate(server)
    ? server.clientCertConfig?.alias || ''
    : '';
  const input: ServerIdentityInput =
    local && server.localEndpoint
      ? {
          protocol: server.localEndpoint.protocol,
          host: server.localEndpoint.host,
          port: server.localEndpoint.port,
          path: server.localEndpoint.basePath,
        }
      : server;
  return normalizeServerCertificatePin(
    input,
    route,
    local ? server.localTls?.serverCertificatePin : server.serverCertificatePin,
    alias,
  );
};

/** Value passed only to the native TLS layer; "required" is a fail-closed marker. */
export const nativeRouteCertificatePin = (
  server: Server,
  route: ServerRoute,
): string => {
  const pin = routeServerCertificatePin(server, route);
  if (pin) {
    return pin.sha256Fingerprint;
  }
  const required =
    route === 'local'
      ? server.localTls?.serverCertificatePinRequired === true ||
        server.localTls?.serverCertificatePin !== undefined
      : server.serverCertificatePinRequired === true ||
        server.serverCertificatePin !== undefined;
  return required ? 'required' : '';
};

export const canonicalLocalEndpoint = (
  endpoint: LocalEndpoint | undefined,
): CanonicalServerEndpoint | undefined => {
  if (!endpoint) {
    return undefined;
  }
  return canonicalServerEndpoint({
    protocol: endpoint.protocol,
    host: endpoint.host,
    port: endpoint.port,
    path: endpoint.basePath,
  });
};

export const canonicalServerEndpoint = (
  server: ServerIdentityInput,
): CanonicalServerEndpoint | undefined => {
  const protocol = String(server.protocol || '').toLowerCase();
  const host = String(server.host || '').trim();
  if (!protocol || !host) {
    return undefined;
  }
  const urlHost =
    host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const port = server.port ? `:${server.port}` : '';
  const basePath = normalizedBasePath(server.path);
  return {
    requestBaseUrl: `${protocol}://${urlHost}${port}${basePath}/`,
    scopeEndpoint: `${protocol}://${normalizedHost(host)}:${effectivePort(
      server,
    )}${basePath}`,
  };
};

/**
 * Stable structured scope for native session cookies and legacy credential
 * migration. New secure credential storage uses the server profile ID.
 * The endpoint is encoded without trimming path segments, so literal encoded
 * paths remain distinct. The alias is part of the scope because two identities
 * can legitimately be configured for one endpoint.
 */
export const serverIdentity = (
  server: ServerIdentityInput,
  clientCertAlias = '',
): string =>
  JSON.stringify({
    endpoint: encodeURIComponent(
      canonicalServerEndpoint(server)?.scopeEndpoint || '',
    ),
    clientCertAlias: encodeURIComponent(String(clientCertAlias || '')),
  });

/**
 * Identity for a route-specific native session. Unlike a profile ID, this
 * value changes whenever an endpoint, TLS trust decision, or certificate
 * identity changes, allowing native sessions/cookies to be retired rather
 * than reused across security settings.
 */
export const serverRouteIdentity = (
  server: Server,
  route: ServerRoute,
): string => {
  const endpoint =
    route === 'local'
      ? canonicalLocalEndpoint(server.localEndpoint)
      : canonicalServerEndpoint(server);
  const tls =
    route === 'local'
      ? server.localTls || {mtlsEnabled: false}
      : {
          mtlsEnabled: serverUsesClientCertificate(server),
          clientCertConfig: server.clientCertConfig,
        };
  const alias =
    tls.mtlsEnabled === true
      ? tls.clientCertConfig?.alias ||
        (route === 'remote' ? server.clientCertConfig?.alias : '')
      : '';
  return JSON.stringify({
    route,
    // Keep native sessions isolated by the logical profile even when two
    // profiles point at the same endpoint and use the same trust settings.
    profileId: encodeURIComponent(server.profileId?.trim() || ''),
    enabled: route === 'local' ? server.localRoutingEnabled === true : true,
    endpoint: encodeURIComponent(endpoint?.scopeEndpoint || ''),
    auth: server.auth,
    mtlsEnabled: tls.mtlsEnabled === true,
    serverCertificatePin: nativeRouteCertificatePin(server, route),
    clientCertAlias: encodeURIComponent(String(alias || '')),
    ...(route === 'local'
      ? {
          rtsp: {
            enabled: server.rtsp?.enabled === true,
            port: server.rtsp?.port || 0,
            allowInsecureCredentials:
              server.rtsp?.allowInsecureCredentials === true,
          },
        }
      : {}),
  });
};

/** Combined identity used when a profile owns both remote and local routes. */
export const serverProfileIdentity = (server: Server): string =>
  JSON.stringify({
    profileId: server.profileId?.trim() || '',
    remote: serverRouteIdentity(server, 'remote'),
    local: serverRouteIdentity(server, 'local'),
  });

// Naming used by native session callers; keep it an alias so all security
// decisions use the same rotation key.
export const serverSessionIdentity = serverRouteIdentity;

export const legacyServerIdentity = (server: ServerIdentityInput): string =>
  `${String(server.protocol || '')}://${String(server.host || '')}:${
    server.port
  }`;