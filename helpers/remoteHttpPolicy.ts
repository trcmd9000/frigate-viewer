import type {Server} from '../store/settings';

export const REMOTE_HTTP_CONSENT_REQUIRED = 'REMOTE_HTTP_CONSENT_REQUIRED';

export class RemoteHttpConsentError extends Error {
  readonly code = REMOTE_HTTP_CONSENT_REQUIRED;

  constructor() {
    super('Explicit consent is required before using a remote HTTP endpoint.');
    this.name = 'RemoteHttpConsentError';
  }
}

export const isRemoteHttpEndpoint = (
  server: Pick<Server, 'protocol'>,
): boolean => server.protocol === 'http';

export const hasRemoteHttpConsent = (
  server: Pick<Server, 'protocol' | 'allowInsecureRemoteHttp'>,
): boolean =>
  !isRemoteHttpEndpoint(server) || server.allowInsecureRemoteHttp === true;

/**
 * Keep an HTTP consent tied to the authority it was granted for. A migration
 * has no previous authority to compare, so it preserves only an explicit
 * stored true value and otherwise fails closed.
 */
export const normalizeRemoteHttpConsent = (
  server: Server,
  previousServer?: Server,
): Server => ({
  ...server,
  allowInsecureRemoteHttp:
    isRemoteHttpEndpoint(server) &&
    server.allowInsecureRemoteHttp === true &&
    (!previousServer ||
      remoteAuthorityIdentity(previousServer) ===
        remoteAuthorityIdentity(server)),
});

export const assertRemoteHttpConsent = (
  server: Pick<Server, 'protocol' | 'allowInsecureRemoteHttp'>,
): void => {
  if (!hasRemoteHttpConsent(server)) {
    throw new RemoteHttpConsentError();
  }
};

export const remoteAuthorityIdentity = (
  server: Pick<Server, 'protocol' | 'host' | 'port'>,
): string => {
  const protocol = String(server.protocol || '').toLowerCase();
  const host = String(server.host || '').trim().toLowerCase();
  const port =
    server.port || (protocol === 'https' ? 443 : protocol === 'http' ? 80 : 0);
  return `${protocol}://${host}:${port}`;
};
