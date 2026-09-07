const mockNativeRequest = jest.fn();
const mockNativeDownload = jest.fn();
const mockNativeRequestWithoutCert = jest.fn();
const mockNativeDownloadWithoutCert = jest.fn();
const mockCertificateAvailability = jest.fn();

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
    },
  },
  Platform: {OS: 'android'},
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
    mockCertificateAvailability.mockResolvedValue({exists: true});
  });

  it('passes the normalized server scope to the native request bridge', async () => {
    mockNativeRequest.mockResolvedValue({
      statusCode: 200,
      headers: {'content-type': 'application/json'},
      body: '{"ok":true}',
    });

    const result = await httpClientWithCert.request(
      'https://example.test:443/frigate/api/config',
      {
        clientCertAlias: 'selected',
        clientCertServerIdentity: JSON.stringify({
          endpoint: encodeURIComponent('https://example.test:443/frigate'),
          clientCertAlias: encodeURIComponent('selected'),
        }),
      },
    );

    expect(result.status).toBe(200);
    expect(mockNativeRequest).toHaveBeenCalledWith(
      'https://example.test:443/frigate/api/config',
      'selected',
      JSON.stringify({
        endpoint: encodeURIComponent('https://example.test:443/frigate'),
        clientCertAlias: encodeURIComponent('selected'),
      }),
      'GET',
      [],
      undefined,
      false,
    );
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
          clientCertServerIdentity: JSON.stringify({
            endpoint: encodeURIComponent('https://example.test:443/frigate'),
            clientCertAlias: encodeURIComponent('selected'),
          }),
          maxBytes: 1024,
          mediaReservationId: 7,
        },
      ),
    ).rejects.toMatchObject({name: 'HttpStatusError', status: 401});
    expect(mockNativeDownload).toHaveBeenCalledWith(
      'https://example.test:443/frigate/events/1/clip.mp4',
      'selected',
      JSON.stringify({
        endpoint: encodeURIComponent('https://example.test:443/frigate'),
        clientCertAlias: encodeURIComponent('selected'),
      }),
      [],
      false,
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

    const scope = JSON.stringify({
      endpoint: encodeURIComponent('https://example.test:443/frigate'),
      clientCertAlias: '',
    });
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
          clientCertServerIdentity: JSON.stringify({
            endpoint: encodeURIComponent('https://example.test:443/frigate'),
            clientCertAlias: encodeURIComponent('selected'),
          }),
          maxBytes: 1024,
        },
      ),
    ).rejects.toMatchObject({code: 'CERT_IDENTITY_UNAVAILABLE'});
    expect(mockNativeRequest).not.toHaveBeenCalled();
  });
});
