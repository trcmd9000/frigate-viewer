import type {Server} from '../store/settings';
import type {FrigateLiveConfig} from './protectedLive';
import {
  selectProtectedLiveStreams,
} from './protectedLive';
import {fetchStreamMetadata} from './hevcTransport';
import {serverProfileIdentity} from './serverIdentity';

const LIVE_CONFIG_TTL_MS = 5 * 60_000;
const PREWARM_CONCURRENCY = 2;

interface LiveConfigCacheEntry {
  readonly config?: FrigateLiveConfig;
  readonly expiresAt: number;
  readonly request?: Promise<FrigateLiveConfig>;
}

const liveConfigCache = new Map<string, LiveConfigCacheEntry>();

export const rememberLiveConfig = (
  server: Server,
  config: FrigateLiveConfig,
): void => {
  liveConfigCache.set(serverProfileIdentity(server), {
    config,
    expiresAt: Date.now() + LIVE_CONFIG_TTL_MS,
  });
};

export const loadLiveConfig = (
  server: Server,
  loader: () => Promise<FrigateLiveConfig>,
): Promise<FrigateLiveConfig> => {
  const key = serverProfileIdentity(server);
  const cached = liveConfigCache.get(key);
  if (cached?.config && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.config);
  }
  if (cached?.request) {
    return cached.request;
  }
  let request: Promise<FrigateLiveConfig>;
  request = loader()
    .then(config => {
      rememberLiveConfig(server, config);
      return config;
    })
    .catch(error => {
      if (liveConfigCache.get(key)?.request === request) {
        liveConfigCache.delete(key);
      }
      throw error;
    });
  liveConfigCache.set(key, {
    config: cached?.config,
    expiresAt: cached?.expiresAt || 0,
    request,
  });
  return request;
};

export const prewarmLiveDiscovery = async (
  server: Server,
  config: FrigateLiveConfig,
  cameraNames: readonly string[],
  shouldContinue: () => boolean = () => true,
): Promise<void> => {
  rememberLiveConfig(server, config);
  const streams = Array.from(new Set(
    cameraNames.flatMap(cameraName =>
      selectProtectedLiveStreams(config, cameraName),
    ),
  ));
  let nextIndex = 0;
  const worker = async () => {
    while (shouldContinue()) {
      const index = nextIndex++;
      const streamName = streams[index];
      if (!streamName) {
        return;
      }
      try {
        await fetchStreamMetadata(server, streamName);
      } catch {
        // Preview discovery reports actionable failures when the user opens it.
      }
    }
  };
  await Promise.all(
    Array.from(
      {length: Math.min(PREWARM_CONCURRENCY, streams.length)},
      () => worker(),
    ),
  );
};

export const invalidateLiveConfigCache = (server?: Server): void => {
  if (!server) {
    liveConfigCache.clear();
    return;
  }
  liveConfigCache.delete(serverProfileIdentity(server));
};
