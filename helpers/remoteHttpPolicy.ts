import type {Server} from '../store/settings';

export const REMOTE_HTTP_UNSUPPORTED = 'REMOTE_HTTP_UNSUPPORTED';

export class RemoteHttpUnsupportedError extends Error {
  readonly code = REMOTE_HTTP_UNSUPPORTED;

  constructor() {
    super('Remote server profiles require HTTPS.');
    this.name = 'RemoteHttpUnsupportedError';
  }
}

export const isRemoteHttpEndpoint = (
  server: Pick<Server, 'protocol'>,
): boolean => String(server.protocol || '').toLowerCase() === 'http';

export const assertRemoteHttps = (
  server: Pick<Server, 'protocol'>,
): void => {
  if (isRemoteHttpEndpoint(server)) {
    throw new RemoteHttpUnsupportedError();
  }
};

export const remoteAuthorityIdentity = (
  server: Pick<Server, 'protocol' | 'host' | 'port'>,
): string => {
  const protocol = String(server.protocol || '').toLowerCase();
  const host = String(server.host || '')
    .trim()
    .toLowerCase();
  const port =
    server.port || (protocol === 'https' ? 443 : protocol === 'http' ? 80 : 0);
  return `${protocol}://${host}:${port}`;
};