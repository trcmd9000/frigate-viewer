const MAX_LIVE_RECONNECT_ATTEMPTS = 3;
const LIVE_RECONNECT_BASE_MS = 500;

export interface LiveReconnect {
  attempt: number;
  delayMs: number;
}

export const nextLiveReconnect = (
  completedAttempts: number,
  random: () => number = Math.random,
): LiveReconnect | undefined => {
  const attempt = completedAttempts + 1;
  if (attempt > MAX_LIVE_RECONNECT_ATTEMPTS) {
    return undefined;
  }
  const exponentialDelay = LIVE_RECONNECT_BASE_MS * 2 ** (attempt - 1);
  return {
    attempt,
    delayMs: exponentialDelay * (0.75 + random() * 0.5),
  };
};
