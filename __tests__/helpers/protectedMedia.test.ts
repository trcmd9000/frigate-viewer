const mockRegisterMediaProfile = jest.fn();
const mockCreateMediaUri = jest.fn();
const mockCreateMseMediaUri = jest.fn();
const mockCreateRtspMediaUri = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {
    ClientCertModule: {
      registerMediaProfile: (...args: unknown[]) =>
        mockRegisterMediaProfile(...args),
      createMediaUri: (...args: unknown[]) => mockCreateMediaUri(...args),
      createMseMediaUri: (...args: unknown[]) =>
        mockCreateMseMediaUri(...args),
      createRtspMediaUri: (...args: unknown[]) =>
        mockCreateRtspMediaUri(...args),
    },
  },
  Platform: {OS: 'android'},
}));

import type {Server} from '../../store/settings';
import {
  eventVodPath,
  invalidateProtectedMediaProfile,
  isProtectedMediaUri,
  normalizeProtectedMediaPath,
  protectedMediaProfileId,
  protectedMseMediaUri,
  protectedMediaUri,
  localRtspMediaUri,
  resetProtectedMediaProfiles,
} from '../../helpers/protectedMedia';

const server = (): Server => ({
  protocol: 'https',
  host: 'frigate.example.test',
  port: 443,
  path: '/frigate',
  auth: 'frigate',
  credentials: {
    username: 'viewer',
    password: 'not-a-real-secret',
  },
  clientCertConfig: {
    alias: 'selected-alias',
  },
});

describe('protected media URI registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetProtectedMediaProfiles();
    mockRegisterMediaProfile.mockResolvedValue(
      '0123456789abcdef0123456789abcdef',
    );
    mockCreateMediaUri.mockImplementation((_profileId: string, path: string) =>
      Promise.resolve(
        `frigate-media://0123456789abcdef0123456789abcdef${path}`,
      ),
    );
    mockCreateRtspMediaUri.mockResolvedValue(
      'frigate-media://0123456789abcdef0123456789abcdef/rtsp/opaquehandle',
    );
    mockCreateMseMediaUri.mockResolvedValue(
      'frigate-media://0123456789abcdef0123456789abcdef/mse/front%3Amain',
    );
  });

  it('maps event VOD to the Frigate API base without exposing an endpoint', async () => {
    const configured = server();
    const uri = await protectedMediaUri(
      configured,
      eventVodPath('event-with-space'),
    );

    expect(uri).toBe(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/event/event-with-space/master.m3u8',
    );
    expect(mockRegisterMediaProfile).toHaveBeenCalledTimes(1);
    expect(mockCreateMediaUri).toHaveBeenCalledWith(
      '0123456789abcdef0123456789abcdef',
      '/vod/event/event-with-space/master.m3u8',
    );
    expect(uri).not.toContain(configured.host);
    expect(uri).not.toContain(configured.credentials.password);
  });

  it('shares one native profile registration for concurrent resources', async () => {
    const configured = server();
    await Promise.all([
      protectedMediaUri(configured, '/vod/event/a/master.m3u8'),
      protectedMediaUri(configured, '/vod/event/b/master.m3u8'),
    ]);

    expect(mockRegisterMediaProfile).toHaveBeenCalledTimes(1);
    expect(mockCreateMediaUri).toHaveBeenCalledTimes(2);
  });

  it('drops the cached profile handle when a profile is retired', async () => {
    const configured = server();
    await protectedMediaProfileId(configured);
    invalidateProtectedMediaProfile(configured);
    await protectedMediaProfileId(configured);

    expect(mockRegisterMediaProfile).toHaveBeenCalledTimes(2);
  });

  it('rotates the native profile key when local security settings change', async () => {
    const configured = {
      ...server(),
      profileId: 'profile-local',
      localRoutingEnabled: true,
      localEndpoint: {
        protocol: 'https' as const,
        host: '192.168.1.20',
        port: 8971,
        basePath: '',
      },
      localTls: {
        mtlsEnabled: false,
        serverCertificatePinRequired: false,
      },
    };

    await protectedMediaUri(configured, '/vod/event/a/master.m3u8');
    resetProtectedMediaProfiles();
    await protectedMediaUri(
      {
        ...configured,
        localTls: {...configured.localTls, serverCertificatePinRequired: true},
      },
      '/vod/event/b/master.m3u8',
    );

    expect(mockRegisterMediaProfile).toHaveBeenCalledTimes(2);
    expect(mockRegisterMediaProfile.mock.calls[0][0].profileKey).not.toBe(
      mockRegisterMediaProfile.mock.calls[1][0].profileKey,
    );
    expect(mockRegisterMediaProfile.mock.calls[0][0].profileId).toBe(
      'profile-local',
    );
    expect(mockRegisterMediaProfile.mock.calls[1][0].profileId).toBe(
      'profile-local',
    );
  });

  it('rejects absolute hosts and traversal before crossing the native boundary', async () => {
    await expect(
      protectedMediaUri(server(), 'https://other.example/media.m3u8'),
    ).rejects.toThrow('protected media path is invalid');
    await expect(
      protectedMediaUri(server(), '/api/../private/master.m3u8'),
    ).rejects.toThrow('protected media path is invalid');
    await expect(
      protectedMediaUri(server(), '/api/%2e%2e/private/master.m3u8'),
    ).rejects.toThrow('protected media path is invalid');

    expect(mockRegisterMediaProfile).not.toHaveBeenCalled();
    expect(mockCreateMediaUri).not.toHaveBeenCalled();
  });

  it('recognizes only opaque profile URIs', () => {
    expect(
      isProtectedMediaUri(
        'frigate-media://0123456789abcdef0123456789abcdef/api/index.m3u8',
      ),
    ).toBe(true);
    expect(isProtectedMediaUri('https://frigate.example/api/index.m3u8')).toBe(
      false,
    );
    expect(isProtectedMediaUri('frigate-media://short/api/index.m3u8')).toBe(
      false,
    );
    expect(
      isProtectedMediaUri(
        'frigate-media://0123456789abcdef0123456789abcdef@attacker/api/index.m3u8',
      ),
    ).toBe(false);
    expect(
      isProtectedMediaUri(
        'frigate-media://0123456789abcdef0123456789abcdef:443/api/index.m3u8',
      ),
    ).toBe(false);
  });

  it('normalizes only profile-relative paths', () => {
    expect(() =>
      normalizeProtectedMediaPath('/api/vod/index.m3u8?x=1'),
    ).toThrow();
    expect(() => normalizeProtectedMediaPath('api/index.m3u8')).toThrow();
    expect(() => normalizeProtectedMediaPath('/api/#fragment')).toThrow();
  });

  it('returns an opaque local RTSP handle without constructing a URL in JS', async () => {
    const configured: Server = {
      ...server(),
      localRoutingEnabled: true,
      localEndpoint: {
        protocol: 'http',
        host: '192.168.1.20',
        port: 5000,
        basePath: '',
      },
      rtsp: {
        enabled: true,
        port: 8554,
        allowInsecureCredentials: false,
      },
    };
    const uri = await localRtspMediaUri(configured, 'front_main');
    expect(uri).toContain('/rtsp/opaquehandle');
    expect(uri).not.toContain(configured.host);
    expect(uri).not.toContain(configured.credentials.password);
    expect(mockCreateRtspMediaUri).toHaveBeenCalledWith(
      '0123456789abcdef0123456789abcdef',
      'front_main',
    );
  });

  it('returns an opaque MSE handle without exposing the server', async () => {
    const configured = server();
    const uri = await protectedMseMediaUri(configured, 'front:main');

    expect(uri).toContain('/mse/front%3Amain');
    expect(uri).not.toContain(configured.host);
    expect(uri).not.toContain(configured.credentials.password);
    expect(mockCreateMseMediaUri).toHaveBeenCalledWith(
      '0123456789abcdef0123456789abcdef',
      'front:main',
    );
    await expect(protectedMseMediaUri(configured, '../front')).rejects.toThrow(
      'stream name',
    );
  });

  it('keeps RTSP opt-in and rejects invalid or disabled profiles', async () => {
    await expect(localRtspMediaUri(server(), 'front')).rejects.toThrow(
      'unavailable',
    );
    await expect(
      localRtspMediaUri(
        {
          ...server(),
          localRoutingEnabled: true,
          localEndpoint: {
            protocol: 'http',
            host: '192.168.1.20',
            port: 5000,
            basePath: '',
          },
          rtsp: {
            enabled: true,
            port: 8554,
            allowInsecureCredentials: false,
          },
        },
        '../front',
      ),
    ).rejects.toThrow('stream name');
    expect(mockCreateRtspMediaUri).not.toHaveBeenCalled();
  });

  it('constructs a relative encoded HLS path from an event identifier', () => {
    expect(eventVodPath('event/with-space')).toBe(
      '/vod/event/event%2Fwith-space/master.m3u8',
    );
    expect(() => eventVodPath('')).toThrow('event identifier');
    expect(() => eventVodPath(' '.repeat(257))).toThrow('event identifier');
  });
});