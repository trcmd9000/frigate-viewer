const mockNativeRequest = jest.fn();
const mockNativeDownload = jest.fn();
const mockNativeRequestWithoutCert = jest.fn();
const mockNativeDownloadWithoutCert = jest.fn();
const mockNativeIsolatedRequest = jest.fn();
const mockNativeProfileDownload = jest.fn();
const mockNativeScopeIdentity = jest.fn();
const mockNativeInvalidateSession = jest.fn();
const mockNativeInvalidateMediaProfile = jest.fn();
const mockCertificateAvailability = jest.fn();
const mockPlatform = {OS: 'android'};
const scopedIdentity = (identity: string): string =>
  `${identity}\u0000auth\u0000${'a'.repeat(64)}`;

jest.mock('react-native', () => ({
  NativeModules: {
    ClientCertModule: {
      performHttpRequestWithClientCert: (...args: unknown[]) =>
        mockNativeRequest(...args),
      downloadFileWithClientCert: (...args: unknown[]) =>
        mockNativeDownload(...args),
      performHttpRequest: (...args: unknown[]) =>
        mockNativeRequestWithoutCert(...args),
      downloadFileWithoutClientCert: (...args: unknown[]) =>
        mockNativeDownloadWithoutCert(...args),
      performIsolatedHttpRequest: (...args: unknown[]) =>
        mockNativeIsolatedRequest(...args),
      downloadFileWithProfile: (...args: unknown[]) =>
        mockNativeProfileDownload(...args),
      scopeServerIdentity: (...args: unknown[]) =>
        mockNativeScopeIdentity(...args),
      invalidateServerSession: (...args: unknown[]) =>
        mockNativeInvalidateSession(...args),
      invalidateMediaProfile: (...args: unknown[]) =>
        mockNativeInvalidateMediaProfile(...args),
    },
  },
  Platform: {
    get OS() {
      return mockPlatform.OS;
    },
  },
}));

jest.mock('../../helpers/clientCertificates', () => ({
  clientCertManager: {
    checkCertificateAvailability: (...args: unknown[]) =>
      mockCertificateAvailability(...args),
  },
}));

import HttpClientWithClientCert, {
  httpClientWithCert,
} from '../../helpers/httpWithClientCert';

describe('HttpClientWithClientCert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = 'android';
    mockNativeScopeIdentity.mockImplementation(
      scopedIdentity,
    );
    mockCertificateAvailability.mockResolvedValue({exists: true});
  });

  it('fails closed without profile identity instead of using global fetch', async () => {
    const globalFetch = jest.spyOn(globalThis, 'fetch');
    await expect(
      new HttpClientWithClientCert().request(
        'https://example.test:443/frigate/api/config',
      ),
    ).rejects.toThrow('A server identity is required for profile transport');
    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });

  it('rejects cleartext requests before reaching native transport', async () => {
    await expect(
      new HttpClientWithClientCert().request(
        'http://example.test:80/frigate/api/config',
        {
          clientCertServerIdentity: scopedIdentity('profile'),
        },
      ),
    ).rejects.toThrow('Secure transport requires HTTPS');
    expect(mockNativeRequestWithoutCert).not.toHaveBeenCalled();
  });

  it('passes the normalized server scope to the native request bridge', async () => {
    mockNativeRequest.mockResolvedValue({
      statusCode: 200,
      headers: {'content-type': 'application/json'},
      body: '{"ok":true}',
    });

    const identity = JSON.stringify({
      endpoint: encodeURIComponent('https://example.test:443/frigate'),
      clientCertAlias: encodeURIComponent('selected'),
    });
    const scoped = scopedIdentity(identity);
    const result = await httpClientWithCert.request(
      'https://example.test:443/frigate/api/config',
      {
        clientCertAlias: 'selected',
        clientCertServerIdentity: scoped,
      },
    );

    expect(result.status).toBe(200);
    expect(mockNativeRequest).toHaveBeenCalledWith(
      'https://example.test:443/frigate/api/config',
      'selected',
      scoped,
      'GET',
      [],
      undefined,
      '',
    );
  });

  it('passes credentials only to native scope derivation', () => {
    const identity = 'profile-identity';
    const scoped = scopedIdentity(identity);

    expect(
      httpClientWithCert.scopeServerIdentity(
        identity,
        'basic',
        'viewer',
        'secret',
      ),
    ).toBe(scoped);
    expect(mockNativeScopeIdentity).toHaveBeenCalledWith(
      identity,
      'basic',
      'viewer',
      'secret',
    );
  });

  it('retires only the requested credential-scoped native session', () => {
    httpClientWithCert.invalidateServerSession(
      'profile-identity',
      'basic',
      'viewer',
      'secret',
    );

    expect(mockNativeInvalidateSession).toHaveBeenCalledWith(
      'profile-identity',
      'basic',
      'viewer',
      'secret',
    );
  });

  it('fails closed on iOS when session invalidation is unavailable', () => {
    mockPlatform.OS = 'ios';
    const nativeModule = (require('react-native') as {
      NativeModules: {ClientCertModule: Record<string, unknown>};
    }).NativeModules.ClientCertModule;
    const invalidateSession = nativeModule.invalidateServerSession;
    delete nativeModule.invalidateServerSession;

    expect(() =>
      httpClientWithCert.invalidateServerSession(
        'profile-identity',
        'basic',
        'viewer',
        'secret',
      ),
    ).toThrow('Profile-isolated iOS session invalidation is unavailable');

    nativeModule.invalidateServerSession = invalidateSession;
  });

  it('fails closed on Android when session invalidation is unavailable', () => {
    const nativeModule = (require('react-native') as {
      NativeModules: {ClientCertModule: Record<string, unknown>};
    }).NativeModules.ClientCertModule;
    const invalidateSession = nativeModule.invalidateServerSession;
    delete nativeModule.invalidateServerSession;

    expect(() =>
      httpClientWithCert.invalidateServerSession('opaque-profile-scope'),
    ).toThrow('Profile-scoped Android session invalidation is unavailable');

    nativeModule.invalidateServerSession = invalidateSession;
  });

  it('fails closed on Android when media profile retirement is unavailable', () => {
    const nativeModule = (require('react-native') as {
      NativeModules: {ClientCertModule: Record<string, unknown>};
    }).NativeModules.ClientCertModule;
    const invalidateProfile = nativeModule.invalidateMediaProfile;
    delete nativeModule.invalidateMediaProfile;

    expect(() =>
      httpClientWithCert.invalidateMediaProfile('opaque-profile-key'),
    ).toThrow('Android protected media profile invalidation is unavailable');

    nativeModule.invalidateMediaProfile = invalidateProfile;
  });

  it('fails closed on Android when a profile-scoped bridge is unavailable', async () => {
    const nativeModule = (require('react-native') as {
      NativeModules: {ClientCertModule: Record<string, unknown>};
    }).NativeModules.ClientCertModule;
    const performRequest = nativeModule.performHttpRequest;
    delete nativeModule.performHttpRequest;

    await expect(
      httpClientWithCert.request('https://example.test/api/config', {
        clientCertServerIdentity: scopedIdentity('opaque-profile-scope'),
      }),
    ).rejects.toThrow('Profile-scoped Android HTTP networking is unavailable');

    nativeModule.performHttpRequest = performRequest;
  });

  it('rejects an unscoped Android request before native transport', async () => {
    await expect(
      httpClientWithCert.request('https://example.test/api/config', {
        clientCertServerIdentity: 'unscoped-profile-scope',
      }),
    ).rejects.toThrow('requires a native scoped identity');
    expect(mockNativeRequestWithoutCert).not.toHaveBeenCalled();
  });

  it('rejects an unscoped Android download before native transport', async () => {
    await expect(
      httpClientWithCert.downloadWithoutClientCert(
        'https://example.test/media.jpg',
        {
          clientCertServerIdentity: 'unscoped-profile-scope',
          maxBytes: 1024,
          mediaReservationId: 11,
        },
      ),
    ).rejects.toThrow('requires a native scoped identity');
    expect(mockNativeDownloadWithoutCert).not.toHaveBeenCalled();
  });

  it('converts a structured native media 401 into a retryable status error', async () => {
    mockNativeDownload.mockResolvedValue({
      statusCode: 401,
      path: '',
      contentType: 'text/html',
    });

    await expect(
      httpClientWithCert.download(
        'https://example.test:443/frigate/events/1/clip.mp4',
        {
          clientCertAlias: 'selected',
          clientCertServerIdentity: scopedIdentity(JSON.stringify({
            endpoint: encodeURIComponent('https://example.test:443/frigate'),
            clientCertAlias: encodeURIComponent('selected'),
          })),
          maxBytes: 1024,
          mediaReservationId: 7,
        },
      ),
    ).rejects.toMatchObject({name: 'HttpStatusError', status: 401});
    expect(mockNativeDownload).toHaveBeenCalledWith(
      'https://example.test:443/frigate/events/1/clip.mp4',
      'selected',
      scopedIdentity(JSON.stringify({
        endpoint: encodeURIComponent('https://example.test:443/frigate'),
        clientCertAlias: encodeURIComponent('selected'),
      })),
      [],
      '',
      1024,
      7,
    );
  });

  it('uses the native bounded writer for non-mTLS binary media', async () => {
    mockNativeDownloadWithoutCert.mockResolvedValue({
      statusCode: 200,
      path: '/private/cache/frigate-media/media-no-cert.jpg',
      contentType: 'image/jpeg',
    });

    const scope = scopedIdentity(JSON.stringify({
      endpoint: encodeURIComponent('https://example.test:443/frigate'),
      clientCertAlias: '',
    }));
    const response = await httpClientWithCert.downloadWithoutClientCert(
      'https://example.test:443/frigate/events/1/thumbnail.jpg',
      {
        clientCertServerIdentity: scope,
        maxBytes: 1024,
        mediaReservationId: 8,
      },
    );

    expect(response.path).toContain('media-no-cert.jpg');
    expect(mockNativeDownloadWithoutCert).toHaveBeenCalledWith(
      'https://example.test:443/frigate/events/1/thumbnail.jpg',
      scope,
      [],
      '',
      1024,
      8,
    );
  });

  it('reports a missing native identity with the recognized error code', async () => {
    mockCertificateAvailability.mockResolvedValue({exists: false});

    await expect(
      new HttpClientWithClientCert().request(
        'https://example.test:443/frigate/api/config',
        {
          clientCertAlias: 'missing',
          clientCertServerIdentity: scopedIdentity(JSON.stringify({
            endpoint: encodeURIComponent('https://example.test:443/frigate'),
            clientCertAlias: encodeURIComponent('selected'),
          })),
          maxBytes: 1024,
        },
      ),
    ).rejects.toMatchObject({code: 'CERT_IDENTITY_UNAVAILABLE'});
    expect(mockNativeRequest).not.toHaveBeenCalled();
  });

  it('uses an ephemeral profile transport on iOS instead of global fetch', async () => {
    mockPlatform.OS = 'ios';
    mockNativeIsolatedRequest.mockResolvedValue({
      statusCode: 200,
      headers: {'set-cookie': 'session=profile-a'},
      body: '{"ok":true}',
    });

    const response = await new HttpClientWithClientCert().request(
      'https://example.test:443/frigate/api/config',
      {
        clientCertServerIdentity: 'profile-a',
        profileAuth: 'none',
        method: 'GET',
      },
    );

    expect(response.status).toBe(200);
    expect(mockNativeIsolatedRequest).toHaveBeenCalledWith(
      'https://example.test:443/frigate/api/config',
      'profile-a',
      'none',
      '',
      '',
      'GET',
      [],
      undefined,
    );
  });

  it('fails closed on iOS when profile-isolated transport is unavailable', async () => {
    mockPlatform.OS = 'ios';
    const nativeModule = (require('react-native') as {
      NativeModules: {ClientCertModule: Record<string, unknown>};
    }).NativeModules.ClientCertModule;
    const isolatedRequest = nativeModule.performIsolatedHttpRequest;
    delete nativeModule.performIsolatedHttpRequest;

    await expect(
      new HttpClientWithClientCert().request('https://example.test/api', {
        clientCertServerIdentity: 'profile-a',
        profileAuth: 'none',
      }),
    ).rejects.toThrow('Profile-isolated iOS networking is unavailable');

    nativeModule.performIsolatedHttpRequest = isolatedRequest;
  });

  it('fails closed on iOS when profile credentials are not supplied', async () => {
    mockPlatform.OS = 'ios';

    await expect(
      new HttpClientWithClientCert().request('https://example.test/api', {
        clientCertServerIdentity: 'profile-a',
      }),
    ).rejects.toThrow('Profile-isolated iOS networking is unavailable');
    expect(mockNativeIsolatedRequest).not.toHaveBeenCalled();
  });

  it('uses the profile transport for iOS media downloads', async () => {
    mockPlatform.OS = 'ios';
    mockNativeProfileDownload.mockResolvedValue({
      statusCode: 200,
      path: '/private/cache/profile-a.part',
      contentType: 'image/jpeg',
    });

    await expect(
      httpClientWithCert.downloadWithoutClientCert(
        'https://example.test:443/frigate/events/1/snapshot.jpg',
        {
          clientCertServerIdentity: 'profile-a',
          profileAuth: 'none',
          maxBytes: 1024,
          mediaReservationId: 9,
        },
      ),
    ).resolves.toMatchObject({path: '/private/cache/profile-a.part'});
    expect(mockNativeProfileDownload).toHaveBeenCalledWith(
      'https://example.test:443/frigate/events/1/snapshot.jpg',
      'profile-a',
      'none',
      '',
      '',
      [],
      1024,
      9,
    );
  });
});