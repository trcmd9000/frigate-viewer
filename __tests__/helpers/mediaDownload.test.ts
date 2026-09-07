const mockFetch = jest.fn();
const mockExists = jest.fn();
const mockStat = jest.fn();
const mockLs = jest.fn();
const mockUnlink = jest.fn();
const mockMv = jest.fn();
const mockMkdir = jest.fn();
const mockBlobFetch = jest.fn();
const mockConfig = jest.fn(() => ({fetch: mockBlobFetch}));
const mockNativeDownload = jest.fn();
const mockNativeDownloadWithoutCert = jest.fn();
const mockLoginServer = jest.fn();

class MockHttpStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

jest.doMock('react-native-blob-util', () => ({
  config: mockConfig,
  fs: {
    dirs: {CacheDir: '/private/cache'},
    exists: mockExists,
    stat: mockStat,
    ls: mockLs,
    unlink: mockUnlink,
    mv: mockMv,
    mkdir: mockMkdir,
  },
}));

jest.doMock('react-native', () => ({
  Platform: {OS: 'android'},
}));

jest.doMock('../../helpers/httpWithClientCert', () => ({
  HttpStatusError: MockHttpStatusError,
  httpClientWithCert: {
    download: mockNativeDownload,
    downloadWithoutClientCert: mockNativeDownloadWithoutCert,
  },
  missingClientCertificateError: () => {
    const error = new Error(
      'The selected client certificate is unavailable',
    ) as Error & {code: string};
    error.code = 'CERT_IDENTITY_UNAVAILABLE';
    return error;
  },
}));

jest.doMock('../../helpers/rest', () => ({
  authorizationHeader: jest.fn(() => ({})),
  loginServer: mockLoginServer,
}));

const {
  cleanupMediaCache,
  downloadMedia,
  fileUri,
  getMediaLeaseCount,
  getMediaReservationCount,
  getReservedMediaBytes,
  isManagedMediaPath,
  MEDIA_DISPLAY_HANDOFF_GRACE_MS,
  MEDIA_SHARE_GRACE_MS,
  MAX_MEDIA_BYTES,
  releaseDownloadedMedia,
  removeDownloadedMedia,
  retainDownloadedMedia,
} =
  require('../../helpers/mediaDownload') as typeof import('../../helpers/mediaDownload');
type Server = import('../../store/settings').Server;

const server = (
  clientCertConfig?: Server['clientCertConfig'],
  auth: Server['auth'] = 'none',
): Server => ({
  protocol: 'https',
  host: 'example.invalid',
  port: 443,
  path: '/frigate',
  auth,
  credentials: {username: 'user', password: 'password'},
  clientCertConfig,
});

describe('mediaDownload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require('react-native').Platform.OS = 'android';
    mockExists.mockResolvedValue(true);
    mockStat.mockResolvedValue({
      size: 10,
      lastModified: Date.now(),
    });
    mockLs.mockResolvedValue([]);
    mockUnlink.mockResolvedValue(undefined);
    mockMv.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockLoginServer.mockResolvedValue(undefined);
    mockNativeDownloadWithoutCert.mockResolvedValue({
      statusCode: 200,
      path: '/private/cache/frigate-media/download-no-cert.part',
      contentType: 'image/jpeg',
    });
  });

  it('uses native certificate transport without falling back when unavailable', async () => {
    mockNativeDownload.mockRejectedValue(
      new Error('Native media download with client certificate is unavailable'),
    );

    await expect(
      downloadMedia(
        server({alias: 'selected'}),
        'https://example.invalid/media',
      ),
    ).rejects.toThrow('Native media download');

    expect(mockNativeDownload).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fall back when a certificate configuration has an empty alias', async () => {
    await expect(
      downloadMedia(
        {...server({alias: ''}), mtlsEnabled: true},
        'https://example.invalid/media',
      ),
    ).rejects.toMatchObject({code: 'CERT_IDENTITY_UNAVAILABLE'});

    expect(mockNativeDownload).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('preserves opaque whitespace in a valid Android alias', async () => {
    const alias = '  selected identity  ';
    mockNativeDownload.mockResolvedValue({
      statusCode: 200,
      path: '/private/cache/frigate-media/download-whitespace.part',
      contentType: 'image/jpeg',
    });

    await expect(
      downloadMedia(server({alias}), 'https://example.invalid/media'),
    ).resolves.toBe('/private/cache/frigate-media/media-whitespace.jpg');

    expect(mockNativeDownload).toHaveBeenCalledWith(
      'https://example.invalid/media',
      expect.objectContaining({
        clientCertAlias: alias,
        clientCertServerIdentity: JSON.stringify({
          endpoint: encodeURIComponent('https://example.invalid:443/frigate'),
          clientCertAlias: encodeURIComponent(alias),
        }),
      }),
    );
  });

  it('returns a native local path scoped to the configured server', async () => {
    mockNativeDownload.mockResolvedValue({
      statusCode: 200,
      path: '/private/cache/frigate-media/download-1.part',
      contentType: 'image/jpeg',
    });

    await expect(
      downloadMedia(
        server({alias: 'selected'}),
        'https://example.invalid/media',
      ),
    ).resolves.toBe('/private/cache/frigate-media/media-1.jpg');
    expect(mockNativeDownload).toHaveBeenCalledWith(
      'https://example.invalid/media',
      expect.objectContaining({
        headers: {},
        clientCertAlias: 'selected',
        clientCertServerIdentity: JSON.stringify({
          endpoint: encodeURIComponent('https://example.invalid:443/frigate'),
          clientCertAlias: encodeURIComponent('selected'),
        }),
        allowSelfSignedServer: false,
        maxBytes: expect.any(Number),
      }),
    );
  });

  it('rejects a native path outside the private media cache', async () => {
    mockNativeDownload.mockResolvedValue({
      statusCode: 200,
      path: '/private/cache/other/media.jpg',
      contentType: 'image/jpeg',
    });

    await expect(
      downloadMedia(
        server({alias: 'selected'}),
        'https://example.invalid/media',
      ),
    ).rejects.toThrow('invalid local path');
  });

  it('re-authenticates once when an mTLS media response expires', async () => {
    mockNativeDownload
      .mockResolvedValueOnce({
        statusCode: 401,
        path: '',
        contentType: 'text/html',
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        path: '/private/cache/frigate-media/download-2.part',
        contentType: 'image/jpeg',
      });
    await expect(
      downloadMedia(
        server({alias: 'selected'}, 'frigate'),
        'https://example.invalid/media',
      ),
    ).resolves.toBe('/private/cache/frigate-media/media-2.jpg');
    expect(mockLoginServer).toHaveBeenCalledTimes(1);
    expect(mockNativeDownload).toHaveBeenCalledTimes(2);
  });

  it('uses the native bounded writer for non-mTLS Android media', async () => {
    await expect(
      downloadMedia(server(), 'https://example.invalid/media'),
    ).resolves.toBe('/private/cache/frigate-media/media-no-cert.jpg');

    expect(mockNativeDownloadWithoutCert).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('restores authenticated file downloads on iOS without Android native transport', async () => {
    require('react-native').Platform.OS = 'ios';
    const request = Promise.resolve({
      info: () => ({
        status: 200,
        headers: {'Content-Type': 'video/mp4'},
      }),
    });
    Object.assign(request, {
      progress: jest.fn(() => request),
      cancel: jest.fn(() => request),
    });
    mockBlobFetch.mockReturnValue(request);

    await expect(
      downloadMedia(server(), 'https://example.invalid/events/1/clip.mp4'),
    ).resolves.toMatch(
      /^\/private\/cache\/frigate-media\/media-[a-z0-9-]+\.mp4$/,
    );

    expect(mockConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        fileCache: true,
        path: expect.stringMatching(
          /^\/private\/cache\/frigate-media\/download-\d+-ios-\d+-[a-z0-9]+\.part$/,
        ),
      }),
    );
    expect(mockBlobFetch).toHaveBeenCalledWith(
      'GET',
      'https://example.invalid/events/1/clip.mp4',
      {},
    );
    expect(mockNativeDownload).not.toHaveBeenCalled();
    expect(mockNativeDownloadWithoutCert).not.toHaveBeenCalled();
  });

  it('cancels an iOS download before it exceeds its reservation', async () => {
    require('react-native').Platform.OS = 'ios';
    const request = Promise.reject(new Error('cancelled'));
    const cancel = jest.fn(() => request);
    Object.assign(request, {
      progress: jest.fn(
        (
          _config: {interval: number},
          callback: (received: number, total: number) => void,
        ) => {
          callback(MAX_MEDIA_BYTES + 1, -1);
          return request;
        },
      ),
      cancel,
    });
    mockBlobFetch.mockReturnValue(request);

    await expect(
      downloadMedia(server(), 'https://example.invalid/events/1/clip.mp4'),
    ).rejects.toThrow('reserved byte budget');

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(mockUnlink).toHaveBeenCalledWith(
      expect.stringMatching(/\/download-\d+-ios-\d+-[a-z0-9]+\.part$/),
    );
  });

  it('protects a visible native temporary output until JS finalization', async () => {
    let temporaryPath = '';
    const finalPath = '/private/cache/frigate-media/media-native-race.jpg';
    const existingNames = Array.from(
      {length: 40},
      (_, index) => `media-native-existing-${index}.jpg`,
    );
    const removedPaths = new Set<string>();
    let nativeStarted = false;
    let resolveNative!: (response: {
      statusCode: number;
      path: string;
      contentType: string;
    }) => void;
    mockExists.mockImplementation(async (path: string) => {
      return !removedPaths.has(path);
    });
    mockStat.mockImplementation(async (path: string) => ({
      size: 10,
      lastModified: path === temporaryPath ? Date.now() : Date.now() - 1000,
    }));
    mockUnlink.mockImplementation(async (path: string) => {
      removedPaths.add(path);
    });
    mockMv.mockImplementation(async (source: string, destination: string) => {
      removedPaths.add(source);
      removedPaths.delete(destination);
      return undefined;
    });
    mockNativeDownloadWithoutCert.mockImplementationOnce(
      (_url: string, options: {mediaReservationId: number}) => {
        nativeStarted = true;
        temporaryPath = `/private/cache/frigate-media/download-${options.mediaReservationId}-native-race.part`;
        mockLs.mockResolvedValue([
          ...existingNames,
          temporaryPath.slice(temporaryPath.lastIndexOf('/') + 1),
        ]);
        return new Promise(resolve => {
          resolveNative = resolve;
        });
      },
    );

    const download = downloadMedia(
      server(),
      'https://example.invalid/native-race',
    );
    while (!nativeStarted) {
      await Promise.resolve();
    }

    await cleanupMediaCache();
    expect(mockUnlink).not.toHaveBeenCalledWith(temporaryPath);
    expect(removedPaths.has(temporaryPath)).toBe(false);

    resolveNative({
      statusCode: 200,
      path: temporaryPath,
      contentType: 'image/jpeg',
    });
    await expect(download).resolves.toBe(finalPath);
    expect(mockMv).toHaveBeenCalledWith(temporaryPath, finalPath);
    expect(getMediaReservationCount()).toBe(0);
    expect(getReservedMediaBytes()).toBe(0);

    mockLs.mockResolvedValue(['media-native-race.jpg']);
    await cleanupMediaCache();
    expect(mockUnlink).not.toHaveBeenCalledWith(finalPath);

    await removeDownloadedMedia(finalPath);
    expect(mockUnlink).toHaveBeenCalledWith(finalPath);
  });

  it('releases capacity and removes files when native finalization fails', async () => {
    const temporaryPath =
      '/private/cache/frigate-media/download-move-failure.part';
    const finalPath = '/private/cache/frigate-media/media-move-failure.jpg';
    mockMv.mockRejectedValueOnce(new Error('rename failed'));
    mockNativeDownloadWithoutCert.mockResolvedValueOnce({
      statusCode: 200,
      path: temporaryPath,
      contentType: 'image/jpeg',
    });

    await expect(
      downloadMedia(server(), 'https://example.invalid/move-failure'),
    ).rejects.toThrow('rename failed');
    expect(mockUnlink).toHaveBeenCalledWith(temporaryPath);
    expect(mockUnlink).toHaveBeenCalledWith(finalPath);
    expect(getMediaReservationCount()).toBe(0);
    expect(getReservedMediaBytes()).toBe(0);
  });

  it('rejects non-success non-mTLS responses and removes the managed file', async () => {
    mockNativeDownloadWithoutCert.mockResolvedValue({
      statusCode: 401,
      path: '',
      contentType: 'text/html',
    });

    await expect(
      downloadMedia(server(), 'https://example.invalid/media'),
    ).rejects.toThrow('HTTP 401');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not prune a mounted media file until its lease is released', async () => {
    const path = '/private/cache/frigate-media/media-mounted.jpg';
    mockLs.mockResolvedValue(['media-mounted.jpg']);
    mockStat.mockResolvedValue({
      size: 10,
      lastModified: Date.now() - 2 * 24 * 60 * 60 * 1000,
    });
    retainDownloadedMedia(path);

    await cleanupMediaCache();
    expect(getMediaLeaseCount(path)).toBe(1);
    expect(mockUnlink).not.toHaveBeenCalled();

    await releaseDownloadedMedia(path);
    await cleanupMediaCache();
    expect(mockUnlink).not.toHaveBeenCalled();

    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + MEDIA_DISPLAY_HANDOFF_GRACE_MS + 1);
    await cleanupMediaCache();
    expect(mockUnlink).toHaveBeenCalledWith(path);
    jest.restoreAllMocks();
  });

  it('rechecks a lease acquired while file metadata is being read', async () => {
    const path = '/private/cache/frigate-media/media-race.jpg';
    let statStarted = false;
    let finishStat!: () => void;
    const statGate = new Promise<void>(resolve => {
      finishStat = resolve;
    });
    mockLs.mockResolvedValue(['media-race.jpg']);
    mockStat.mockImplementation(async () => {
      statStarted = true;
      await statGate;
      return {
        size: 10,
        lastModified: Date.now() - 2 * 24 * 60 * 60 * 1000,
      };
    });

    const cleanup = cleanupMediaCache();
    while (!statStarted) {
      await Promise.resolve();
    }
    retainDownloadedMedia(path);
    finishStat();
    await cleanup;

    expect(mockUnlink).not.toHaveBeenCalled();
    await releaseDownloadedMedia(path);
  });

  it('preserves the longer share grace regardless of release order', async () => {
    const baseTime = Date.now();
    const path = '/private/cache/frigate-media/media-share-order.jpg';
    mockLs.mockResolvedValue(['media-share-order.jpg']);
    mockStat.mockResolvedValue({
      size: 10,
      lastModified: baseTime - 2 * 24 * 60 * 60 * 1000,
    });

    retainDownloadedMedia(path);
    retainDownloadedMedia(path, 'share');
    await releaseDownloadedMedia(path, 'share');
    await releaseDownloadedMedia(path);
    await cleanupMediaCache();
    expect(mockUnlink).not.toHaveBeenCalled();

    jest
      .spyOn(Date, 'now')
      .mockReturnValue(baseTime + MEDIA_SHARE_GRACE_MS + 1);
    await cleanupMediaCache();
    expect(mockUnlink).toHaveBeenCalledWith(path);
    jest.restoreAllMocks();
  });

  it('keeps grace-protected files in count accounting while pruning ordinary files', async () => {
    const protectedPaths = Array.from(
      {length: 40},
      (_, index) => `/private/cache/frigate-media/media-protected-${index}.jpg`,
    );
    const ordinaryNames = Array.from(
      {length: 10},
      (_, index) => `media-ordinary-${index}.jpg`,
    );
    mockLs.mockResolvedValue([
      ...protectedPaths.map(path => path.split('/').pop()),
      ...ordinaryNames,
    ]);
    mockStat.mockImplementation(async (path: string) => ({
      size: 10,
      lastModified: path.includes('ordinary') ? Date.now() - 1000 : Date.now(),
    }));
    for (const path of protectedPaths) {
      retainDownloadedMedia(path);
      await releaseDownloadedMedia(path);
    }

    await cleanupMediaCache();

    expect(mockUnlink).toHaveBeenCalledTimes(10);
    expect(mockUnlink).toHaveBeenCalledWith(
      '/private/cache/frigate-media/media-ordinary-0.jpg',
    );
    for (const path of protectedPaths) {
      await removeDownloadedMedia(path);
    }
  });

  it('rejects cache growth when protected files alone exceed the byte limit', async () => {
    const protectedPaths = Array.from(
      {length: 5},
      (_, index) => `/private/cache/frigate-media/media-byte-${index}.jpg`,
    );
    mockLs.mockResolvedValue([
      ...protectedPaths.map(path => path.split('/').pop()),
      'media-byte-ordinary.jpg',
    ]);
    mockStat.mockImplementation(async (path: string) => ({
      size: path.includes('ordinary') ? 1 : 60 * 1024 * 1024,
      lastModified: Date.now(),
    }));
    for (const path of protectedPaths) {
      retainDownloadedMedia(path);
      retainDownloadedMedia(path, 'share');
      await releaseDownloadedMedia(path, 'share');
      await releaseDownloadedMedia(path);
    }

    await expect(cleanupMediaCache()).rejects.toThrow('Media cache is full');
    for (const path of protectedPaths) {
      await removeDownloadedMedia(path);
    }
  });

  it('does not remove paths outside its private managed cache', async () => {
    await removeDownloadedMedia('/private/cache/other/file.jpg');
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(isManagedMediaPath('/private/cache/other/file.jpg')).toBe(false);
  });

  it('formats local paths as idempotent file URIs', () => {
    expect(fileUri('/private/cache/file.jpg')).toBe(
      'file:///private/cache/file.jpg',
    );
    expect(fileUri('file:///private/cache/file.jpg')).toBe(
      'file:///private/cache/file.jpg',
    );
  });

  it('cleans stale managed entries but leaves unrelated and active entries', async () => {
    mockLs.mockResolvedValue([
      'media-old.jpg',
      'unrelated.bin',
      'download-active.part',
    ]);
    mockStat.mockImplementation(async (path: string) => ({
      size: 10,
      lastModified: path.includes('old')
        ? Date.now() - 2 * 24 * 60 * 60 * 1000
        : Date.now(),
    }));

    await cleanupMediaCache();

    expect(mockUnlink).toHaveBeenCalledWith(
      '/private/cache/frigate-media/media-old.jpg',
    );
    expect(mockUnlink).not.toHaveBeenCalledWith(
      '/private/cache/frigate-media/unrelated.bin',
    );
  });

  it('prunes an orphaned native temporary file to admit an image at the file limit', async () => {
    const orphanedNames = Array.from(
      {length: 40},
      (_, index) => `download-orphan-${index}.part`,
    );
    const remainingNames = new Set(orphanedNames);
    mockLs.mockImplementation(async () => [...remainingNames]);
    mockStat.mockResolvedValue({
      size: 10,
      lastModified: Date.now(),
    });
    mockUnlink.mockImplementation(async (path: string) => {
      remainingNames.delete(path.slice(path.lastIndexOf('/') + 1));
    });

    mockNativeDownloadWithoutCert.mockResolvedValueOnce({
      statusCode: 200,
      path: '/private/cache/frigate-media/download-admitted.part',
      contentType: 'image/jpeg',
    });

    await expect(
      downloadMedia(server(), 'https://example.invalid/admitted.jpg'),
    ).resolves.toContain('media-admitted.jpg');
    expect(mockUnlink).toHaveBeenCalledWith(
      '/private/cache/frigate-media/download-orphan-0.part',
    );
    expect(mockNativeDownloadWithoutCert).toHaveBeenCalledTimes(1);
  });

  it('rejects a new download when a stale file cannot be unlinked', async () => {
    const activePaths = Array.from(
      {length: 39},
      (_, index) => `/private/cache/frigate-media/media-active-${index}.jpg`,
    );
    const existingNames = [
      ...activePaths.map(path => path.split('/').pop()),
      'media-stale.jpg',
    ];
    mockLs.mockResolvedValue(existingNames);
    mockStat.mockImplementation(async (path: string) => ({
      size: 10,
      lastModified: path.includes('stale')
        ? Date.now() - 2 * 24 * 60 * 60 * 1000
        : Date.now(),
    }));
    mockUnlink.mockImplementation(async (path: string) => {
      if (path.includes('stale')) {
        throw new Error('unlink failed');
      }
    });
    activePaths.forEach(path => retainDownloadedMedia(path));
    await expect(
      downloadMedia(server(), 'https://example.invalid/media'),
    ).rejects.toThrow('Media cache is full');
    expect(mockNativeDownloadWithoutCert).not.toHaveBeenCalled();
    expect(getMediaLeaseCount(activePaths[0])).toBe(1);

    mockUnlink.mockResolvedValue(undefined);
    activePaths.forEach(path => {
      void releaseDownloadedMedia(path);
    });
  });

  it('rejects download admission when a managed entry cannot be statted', async () => {
    const names = Array.from(
      {length: 40},
      (_, index) => `media-existing-${index}.jpg`,
    );
    mockLs.mockResolvedValue(names);
    mockStat.mockRejectedValue(new Error('stat failed'));

    await expect(
      downloadMedia(server(), 'https://example.invalid/media'),
    ).rejects.toThrow('metadata is unavailable');
    expect(mockNativeDownloadWithoutCert).not.toHaveBeenCalled();
  });

  it('ignores a managed entry removed between listing and metadata read', async () => {
    mockLs.mockResolvedValue(['media-released-by-handoff.jpg']);
    mockStat.mockImplementation(async (path: string) => {
      if (path.includes('media-released-by-handoff')) {
        throw new Error('file disappeared');
      }
      return {size: 10, lastModified: Date.now()};
    });
    mockExists.mockImplementation(async (path: string) =>
      !path.includes('media-released-by-handoff'),
    );

    await expect(
      downloadMedia(server(), 'https://example.invalid/media.jpg'),
    ).resolves.toContain('media-no-cert.jpg');
    expect(mockNativeDownloadWithoutCert).toHaveBeenCalledTimes(1);
  });

  it('rejects admission at the exact file-count limit before transport', async () => {
    const names = Array.from(
      {length: 40},
      (_, index) => `media-exact-count-${index}.jpg`,
    );
    mockLs.mockResolvedValue(names);
    const paths = names.map(name => `/private/cache/frigate-media/${name}`);
    paths.forEach(path => retainDownloadedMedia(path));

    await expect(
      downloadMedia(server(), 'https://example.invalid/media.jpg'),
    ).rejects.toThrow('Media cache is full');
    expect(mockNativeDownloadWithoutCert).not.toHaveBeenCalled();
    paths.forEach(path => {
      void releaseDownloadedMedia(path);
    });
  });

  it('rejects admission at the exact byte limit before transport', async () => {
    mockLs.mockResolvedValue(['media-exact-bytes.jpg']);
    mockStat.mockResolvedValue({
      size: 256 * 1024 * 1024,
      lastModified: Date.now(),
    });
    const path = '/private/cache/frigate-media/media-exact-bytes.jpg';
    retainDownloadedMedia(path);

    await expect(
      downloadMedia(server(), 'https://example.invalid/media.jpg'),
    ).rejects.toThrow('Media cache is full');
    expect(mockNativeDownloadWithoutCert).not.toHaveBeenCalled();
    await releaseDownloadedMedia(path);
  });

  it('evicts a recently released display file when a new download needs capacity', async () => {
    const existingPath = '/private/cache/frigate-media/media-released.jpg';
    const remainingNames = new Set(['media-released.jpg']);
    mockLs.mockImplementation(async () => [...remainingNames]);
    mockStat.mockImplementation(async (path: string) => ({
      size: path === existingPath ? MAX_MEDIA_BYTES : 10,
      lastModified: Date.now(),
    }));
    mockUnlink.mockImplementation(async (path: string) => {
      remainingNames.delete(path.slice(path.lastIndexOf('/') + 1));
    });
    retainDownloadedMedia(existingPath);
    await releaseDownloadedMedia(existingPath);

    await expect(
      downloadMedia(server(), 'https://example.invalid/new.jpg'),
    ).resolves.toContain('media-no-cert.jpg');

    expect(mockUnlink).toHaveBeenCalledWith(existingPath);
    expect(mockNativeDownloadWithoutCert).toHaveBeenCalledTimes(1);
  });

  it('allows bounded image downloads to reserve capacity concurrently', async () => {
    let finishFirst!: () => void;
    const firstTransport = new Promise<void>(resolve => {
      finishFirst = resolve;
    }).then(() => ({
      statusCode: 200,
      path: '/private/cache/frigate-media/download-concurrent.part',
      contentType: 'image/jpeg',
    }));
    mockNativeDownloadWithoutCert.mockReturnValueOnce(firstTransport);

    const first = downloadMedia(server(), 'https://example.invalid/first.jpg');
    while (getMediaReservationCount() !== 1) {
      await Promise.resolve();
    }
    expect(getReservedMediaBytes()).toBeGreaterThan(0);

    mockNativeDownloadWithoutCert.mockResolvedValueOnce({
      statusCode: 200,
      path: '/private/cache/frigate-media/download-second.part',
      contentType: 'image/jpeg',
    });
    await expect(
      downloadMedia(server(), 'https://example.invalid/second.jpg'),
    ).resolves.toContain('media-second.jpg');
    expect(mockNativeDownloadWithoutCert).toHaveBeenCalledTimes(2);

    finishFirst();
    await expect(first).resolves.toContain('media-concurrent.jpg');
    expect(getMediaReservationCount()).toBe(0);
  });

  it('does not lose a reservation when commit interleaves with a second snapshot', async () => {
    let finishFirst!: () => void;
    let finishSecondSnapshot!: () => void;
    let snapshotCalls = 0;
    let secondSnapshotStarted = false;
    const secondSnapshotGate = new Promise<void>(resolve => {
      finishSecondSnapshot = resolve;
    });
    mockLs.mockImplementation(async () => {
      snapshotCalls += 1;
      if (snapshotCalls === 3) {
        secondSnapshotStarted = true;
        await secondSnapshotGate;
      }
      return [];
    });
    const firstTransport = new Promise<void>(resolve => {
      finishFirst = resolve;
    }).then(() => ({
      statusCode: 200,
      path: '/private/cache/frigate-media/download-interleaved.part',
      contentType: 'image/jpeg',
    }));
    mockNativeDownloadWithoutCert.mockReturnValueOnce(firstTransport);

    const first = downloadMedia(server(), 'https://example.invalid/first');
    while (getMediaReservationCount() !== 1) {
      await Promise.resolve();
    }
    const second = downloadMedia(server(), 'https://example.invalid/second');
    while (!secondSnapshotStarted) {
      await Promise.resolve();
    }

    finishFirst();
    expect(getMediaReservationCount()).toBe(1);
    finishSecondSnapshot();

    await expect(second).rejects.toThrow('Media cache is full');
    await expect(first).resolves.toContain('media-interleaved.jpg');
    expect(mockNativeDownloadWithoutCert).toHaveBeenCalledTimes(1);
    expect(getMediaReservationCount()).toBe(0);
  });

  it('serializes a commit across a file-slot snapshot and calculation', async () => {
    const existingNames = Array.from(
      {length: 39},
      (_, index) => `media-slot-existing-${index}.jpg`,
    );
    let finishSecondSnapshot!: () => void;
    let secondSnapshotStarted = false;
    let statCalls = 0;
    const secondSnapshotGate = new Promise<void>(resolve => {
      finishSecondSnapshot = resolve;
    });
    mockLs.mockResolvedValue(existingNames);
    const existingPaths = existingNames.map(
      name => `/private/cache/frigate-media/${name}`,
    );
    existingPaths.forEach(path => retainDownloadedMedia(path));
    mockStat.mockImplementation(async () => {
      statCalls += 1;
      // The second admission begins with its cleanup snapshot after the first
      // admission's cleanup and usage snapshots (39 stats each).
      if (statCalls === 79) {
        secondSnapshotStarted = true;
        await secondSnapshotGate;
      }
      return {size: 1, lastModified: Date.now()};
    });
    let finishFirst!: () => void;
    mockNativeDownloadWithoutCert.mockReturnValueOnce(
      new Promise<void>(resolve => {
        finishFirst = resolve;
      }).then(() => ({
        statusCode: 200,
        path: '/private/cache/frigate-media/download-slot-race.part',
        contentType: 'image/jpeg',
      })),
    );

    const first = downloadMedia(
      server(),
      'https://example.invalid/first-slot.jpg',
    );
    while (getMediaReservationCount() !== 1) {
      await Promise.resolve();
    }
    const second = downloadMedia(
      server(),
      'https://example.invalid/second-slot.jpg',
    );
    while (!secondSnapshotStarted) {
      await Promise.resolve();
    }

    finishFirst();
    expect(getMediaReservationCount()).toBe(1);
    finishSecondSnapshot();

    await expect(second).rejects.toThrow('Media cache is full');
    await expect(first).resolves.toContain('media-slot-race.jpg');
    expect(mockNativeDownloadWithoutCert).toHaveBeenCalledTimes(1);
    expect(getMediaReservationCount()).toBe(0);
    existingPaths.forEach(path => {
      void releaseDownloadedMedia(path);
    });
  });

  it('releases a reservation after transport failure', async () => {
    mockNativeDownloadWithoutCert
      .mockRejectedValueOnce(new Error('transport failed'))
      .mockResolvedValueOnce({
        statusCode: 200,
        path: '/private/cache/frigate-media/download-after-failure.part',
        contentType: 'image/jpeg',
      });

    await expect(
      downloadMedia(server(), 'https://example.invalid/failed'),
    ).rejects.toThrow('transport failed');
    expect(getMediaReservationCount()).toBe(0);

    await expect(
      downloadMedia(server(), 'https://example.invalid/retry'),
    ).resolves.toContain('media-after-failure.jpg');
    expect(mockNativeDownloadWithoutCert).toHaveBeenCalledTimes(2);
  });

  it('passes only the remaining byte budget to the native writer', async () => {
    mockLs.mockResolvedValue(['media-existing.jpg']);
    mockStat.mockImplementation(async (path: string) => ({
      size: path.includes('existing') ? 256 * 1024 * 1024 - 10 : 10,
      lastModified: Date.now(),
    }));
    mockNativeDownloadWithoutCert.mockResolvedValue({
      statusCode: 200,
      path: '/private/cache/frigate-media/download-budget.part',
      contentType: 'image/jpeg',
    });

    await expect(
      downloadMedia(server(), 'https://example.invalid/budget'),
    ).resolves.toContain('media-budget.jpg');
    expect(mockNativeDownloadWithoutCert).toHaveBeenCalledWith(
      'https://example.invalid/budget',
      expect.objectContaining({maxBytes: 10}),
    );
  });

  it('admits a clip with the capacity that remains after active images', async () => {
    const activePaths = Array.from(
      {length: 2},
      (_, index) => `/private/cache/frigate-media/media-active-${index}.jpg`,
    );
    mockLs.mockResolvedValue(activePaths.map(path => path.split('/').pop()));
    mockStat.mockResolvedValue({
      size: 16 * 1024 * 1024,
      lastModified: Date.now(),
    });
    activePaths.forEach(path => retainDownloadedMedia(path));
    mockNativeDownloadWithoutCert.mockResolvedValueOnce({
      statusCode: 200,
      path: '/private/cache/frigate-media/download-clip.part',
      contentType: 'video/mp4',
    });

    await expect(
      downloadMedia(server(), 'https://example.invalid/clip.mp4'),
    ).resolves.toContain('media-clip.mp4');

    expect(mockNativeDownloadWithoutCert).toHaveBeenCalledWith(
      'https://example.invalid/clip.mp4',
      expect.objectContaining({
        maxBytes: 224 * 1024 * 1024,
      }),
    );
    for (const path of activePaths) {
      await releaseDownloadedMedia(path);
    }
  });
});
