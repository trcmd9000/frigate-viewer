import {
  canonicalServerEndpoint,
  legacyServerIdentity,
  serverProfileIdentity,
  serverRouteIdentity,
  serverIdentity,
} from '../../helpers/serverIdentity';
import {emptyServer} from '../../store/settings';

describe('server identity', () => {
  it('distinguishes base paths and effective ports', () => {
    const base = emptyServer();
    const first = {...base, host: 'Example.TEST', port: 0, path: '/frigate/'};
    const second = {...base, host: 'example.test', port: 443, path: '/other'};

    expect(canonicalServerEndpoint(first)?.requestBaseUrl).toBe(
      'https://Example.TEST/frigate/',
    );
    expect(JSON.parse(serverIdentity(first))).toEqual({
      endpoint: encodeURIComponent('https://example.test:443/frigate'),
      clientCertAlias: '',
    });
    expect(JSON.parse(serverIdentity(second))).toEqual({
      endpoint: encodeURIComponent('https://example.test:443/other'),
      clientCertAlias: '',
    });
    expect(serverIdentity({...first, port: 8443})).not.toBe(
      serverIdentity(first),
    );
  });

  it('keeps legacy credential scope separate from the new normalized scope', () => {
    const server = {
      ...emptyServer(),
      host: 'Example.TEST',
      port: 5000,
      path: '/frigate',
    };

    expect(legacyServerIdentity(server)).toBe(
      'https://Example.TEST:5000',
    );
    expect(JSON.parse(serverIdentity(server))).toEqual({
      endpoint: encodeURIComponent('https://example.test:5000/frigate'),
      clientCertAlias: '',
    });
  });

  it('keeps aliases and encoded path spellings distinct', () => {
    const encoded = {
      ...emptyServer(),
      host: 'example.test',
      port: 443,
      path: '/tenant%20/api',
    };
    const literal = {...encoded, path: '/tenant/api'};

    expect(serverIdentity(encoded, 'first alias')).not.toBe(
      serverIdentity(encoded, 'second alias'),
    );
    expect(serverIdentity(encoded, 'first alias')).not.toBe(
      serverIdentity(literal, 'first alias'),
    );
  });

  it('rotates local session identity for route security changes', () => {
    const base = {
      ...emptyServer(),
      credentials: {username: 'viewer', password: 'secret'},
      localRoutingEnabled: true,
      localEndpoint: {
        protocol: 'https' as const,
        host: '192.168.1.20',
        port: 8971,
        basePath: '',
      },
      localTls: {
        mtlsEnabled: false,
        allowSelfSignedServer: false,
      },
      rtsp: {
        enabled: true,
        port: 8554,
        allowInsecureCredentials: false,
      },
    };
    const selfSigned = {
      ...base,
      localTls: {...base.localTls, allowSelfSignedServer: true},
    };
    const consented = {
      ...base,
      rtsp: {...base.rtsp, allowInsecureCredentials: true},
    };

    expect(serverRouteIdentity(base, 'local')).not.toBe(
      serverRouteIdentity(selfSigned, 'local'),
    );
    expect(serverRouteIdentity(base, 'local')).not.toBe(
      serverRouteIdentity(consented, 'local'),
    );
    expect(serverProfileIdentity(base)).not.toBe(
      serverProfileIdentity(selfSigned),
    );
    expect(serverRouteIdentity(base, 'local')).not.toContain(
      base.credentials.password,
    );
  });

  it('isolates local identities for profiles sharing an origin without exposing credentials', () => {
    const base = {
      ...emptyServer(),
      profileId: 'profile-a',
      credentials: {username: 'viewer', password: 'first-secret'},
      localRoutingEnabled: true,
      localEndpoint: {
        protocol: 'https' as const,
        host: '192.168.1.20',
        port: 8971,
        basePath: '',
      },
    };
    const otherProfile = {...base, profileId: 'profile-b'};
    const rotatedCredentials = {
      ...base,
      credentials: {username: 'viewer', password: 'second-secret'},
    };

    expect(serverRouteIdentity(base, 'local')).not.toBe(
      serverRouteIdentity(otherProfile, 'local'),
    );
    expect(serverRouteIdentity(base, 'local')).not.toContain(
      base.credentials.password,
    );
    expect(serverRouteIdentity(base, 'local')).not.toContain(
      rotatedCredentials.credentials.password,
    );
  });
});
