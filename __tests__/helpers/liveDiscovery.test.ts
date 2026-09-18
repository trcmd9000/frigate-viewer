const mockFetchStreamMetadata = jest.fn();
const mockSelectProtectedLiveStreams = jest.fn();

jest.mock('../../helpers/hevcTransport', () => ({
  fetchStreamMetadata: (...args: unknown[]) =>
    mockFetchStreamMetadata(...args),
}));

jest.mock('../../helpers/protectedLive', () => ({
  selectProtectedLiveStreams: (...args: unknown[]) =>
    mockSelectProtectedLiveStreams(...args),
}));

import {
  invalidateLiveConfigCache,
  loadLiveConfig,
  prewarmLiveDiscovery,
  rememberLiveConfig,
} from '../../helpers/liveDiscovery';

const server = {
  profileId: 'live-discovery-test',
  protocol: 'https' as const,
  host: 'server.invalid',
  port: 443,
  path: '',
  auth: 'none' as const,
  credentials: {username: '', password: ''},
};

describe('live discovery cache', () => {
  beforeEach(() => {
    invalidateLiveConfigCache();
    mockFetchStreamMetadata.mockReset();
    mockSelectProtectedLiveStreams.mockReset();
  });

  it('deduplicates and reuses the loaded Frigate config', async () => {
    let resolveConfig!: (config: {cameras: Record<string, never>}) => void;
    const loader = jest.fn(
      () => new Promise<{cameras: Record<string, never>}>(resolve => {
        resolveConfig = resolve;
      }),
    );

    const first = loadLiveConfig(server, loader);
    const second = loadLiveConfig({...server}, loader);
    expect(loader).toHaveBeenCalledTimes(1);

    const config = {cameras: {}};
    resolveConfig(config);
    await expect(first).resolves.toBe(config);
    await expect(second).resolves.toBe(config);
    await expect(loadLiveConfig(server, loader)).resolves.toBe(config);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not evict a newer config when an older request fails', async () => {
    let rejectConfig!: (error: Error) => void;
    const failedLoad = loadLiveConfig(
      server,
      () => new Promise((_resolve, reject) => {
        rejectConfig = reject;
      }),
    );
    const current = {cameras: {current: {}}};
    rememberLiveConfig(server, current);
    rejectConfig(new Error('old request failed'));
    await expect(failedLoad).rejects.toThrow('old request failed');
    await expect(
      loadLiveConfig(server, () => Promise.reject(new Error('must not load'))),
    ).resolves.toBe(current);
  });

  it('prewarms unique metadata with at most two concurrent requests', async () => {
    mockSelectProtectedLiveStreams.mockImplementation(
      (_config: unknown, cameraName: string) => [cameraName],
    );
    const pending: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    mockFetchStreamMetadata.mockImplementation(
      () => new Promise(resolve => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        pending.push(() => {
          active -= 1;
          resolve({video: [], audio: [], unknown: [], malformed: false});
        });
      }),
    );

    const prewarm = prewarmLiveDiscovery(
      server,
      {cameras: {}},
      ['first', 'shared', 'third', 'shared'],
    );
    await Promise.resolve();
    expect(mockFetchStreamMetadata).toHaveBeenCalledTimes(2);
    pending.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockFetchStreamMetadata).toHaveBeenCalledTimes(3);
    pending.splice(0).forEach(resolve => resolve());
    await prewarm;
    expect(maxActive).toBe(2);
  });
});
