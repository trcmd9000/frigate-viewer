import {renderHook, act} from '@testing-library/react-native';
import {
  DEFAULT_EVENT_PLAYBACK_SPEED,
  EVENT_PLAYBACK_SPEEDS,
  getEventPlaybackSpeed,
  isEventPlaybackSpeed,
  resetEventPlaybackSpeed,
  setEventPlaybackSpeed,
  useEventPlaybackSpeed,
  validateEventPlaybackSpeed,
} from '../../helpers/playbackSpeed';

describe('event playback speed session state', () => {
  beforeEach(() => {
    resetEventPlaybackSpeed();
  });

  it('accepts only the supported playback rates', () => {
    expect(EVENT_PLAYBACK_SPEEDS).toEqual([
      0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2,
    ]);
    EVENT_PLAYBACK_SPEEDS.forEach(speed =>
      expect(isEventPlaybackSpeed(speed)).toBe(true),
    );
    expect(validateEventPlaybackSpeed(1.1)).toBeUndefined();
    expect(validateEventPlaybackSpeed('2')).toBeUndefined();
    expect(setEventPlaybackSpeed(1.1)).toBe(false);
    expect(getEventPlaybackSpeed()).toBe(DEFAULT_EVENT_PLAYBACK_SPEED);
  });

  it('shares updates between hooks without persistence', () => {
    const first = renderHook(() => useEventPlaybackSpeed());
    const second = renderHook(() => useEventPlaybackSpeed());

    act(() => {
      setEventPlaybackSpeed(1.5);
    });

    expect(first.result.current).toBe(1.5);
    expect(second.result.current).toBe(1.5);

    act(() => {
      resetEventPlaybackSpeed();
    });
    expect(first.result.current).toBe(DEFAULT_EVENT_PLAYBACK_SPEED);
    expect(second.result.current).toBe(DEFAULT_EVENT_PLAYBACK_SPEED);
  });
});
