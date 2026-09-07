import {
  stripCredentialsFromPersistence,
} from '../../helpers/settingsPersistence';
import {emptyServer, initialSettings} from '../../store/settings';

describe('settings persistence security boundary', () => {
  it('removes shared credentials and keeps local RTSP consent non-secret', () => {
    const state = {
      ...initialSettings,
      servers: [
        {
          ...emptyServer(),
          auth: 'frigate' as const,
          credentials: {username: 'viewer', password: 'secret'},
          localRoutingEnabled: true,
          localEndpoint: {
            protocol: 'http' as const,
            host: '192.168.1.20',
            port: 8971,
            basePath: '/frigate',
          },
          rtsp: {
            enabled: true,
            port: 8554,
            allowInsecureCredentials: true,
          },
        },
      ],
    };

    const persisted = stripCredentialsFromPersistence(state);
    expect(persisted.servers[0].credentials).toEqual({
      username: '',
      password: '',
    });
    expect(JSON.stringify(persisted)).not.toContain('secret');
    expect(persisted.servers[0].rtsp).toEqual({
      enabled: true,
      port: 8554,
      allowInsecureCredentials: true,
    });
    expect(persisted.servers[0].localEndpoint).toEqual(
      state.servers[0].localEndpoint,
    );
  });

  it('fails closed for malformed local route and RTSP settings', () => {
    const persisted = stripCredentialsFromPersistence({
      ...initialSettings,
      servers: [
        {
          ...emptyServer(),
          localRoutingEnabled: true,
          localEndpoint: {
            protocol: 'https',
            host: 'https://bad-host',
            port: 8971,
            basePath: '',
          },
          localTls: {
            mtlsEnabled: true,
            allowSelfSignedServer: true,
            clientCertConfig: {alias: 'untrusted'},
          },
          rtsp: {
            enabled: true,
            port: 8554,
            allowInsecureCredentials: true,
          },
        },
      ],
    });

    expect(persisted.servers[0].localRoutingEnabled).toBe(false);
    expect(persisted.servers[0].localEndpoint).toBeUndefined();
    expect(persisted.servers[0].localTls).toEqual({
      mtlsEnabled: false,
      allowSelfSignedServer: false,
    });
    expect(persisted.servers[0].rtsp).toEqual({
      enabled: false,
      port: 8554,
      allowInsecureCredentials: false,
    });
  });

  it('clears stale RTSP consent when a valid endpoint is disabled', () => {
    const persisted = stripCredentialsFromPersistence({
      ...initialSettings,
      servers: [
        {
          ...emptyServer(),
          localRoutingEnabled: false,
          localEndpoint: {
            protocol: 'https',
            host: '192.168.1.20',
            port: 8971,
            basePath: '',
          },
          rtsp: {
            enabled: true,
            port: 8554,
            allowInsecureCredentials: true,
          },
        },
      ],
    });

    expect(persisted.servers[0].rtsp).toEqual({
      enabled: false,
      port: 8554,
      allowInsecureCredentials: false,
    });
  });
});
