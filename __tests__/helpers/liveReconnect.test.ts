import {nextLiveReconnect} from '../../helpers/liveReconnect';

describe('live reconnect policy', () => {
  it('uses bounded exponential delays with jitter', () => {
    expect(nextLiveReconnect(0, () => 0)).toEqual({
      attempt: 1,
      delayMs: 375,
    });
    expect(nextLiveReconnect(1, () => 0.5)).toEqual({
      attempt: 2,
      delayMs: 1000,
    });
    expect(nextLiveReconnect(2, () => 1)).toEqual({
      attempt: 3,
      delayMs: 2500,
    });
  });

  it('stops after three automatic reconnect attempts', () => {
    expect(nextLiveReconnect(3, () => 0.5)).toBeUndefined();
    expect(nextLiveReconnect(20, () => 0.5)).toBeUndefined();
  });
});
