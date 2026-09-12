import {formatVideoTime} from '../../helpers/locale';

describe('formatVideoTime', () => {
  it('formats normal playback durations', () => {
    expect(formatVideoTime(65)).toBe('1:05');
    expect(formatVideoTime(-65)).toBe('-1:05');
  });

  it('does not render unavailable native playback timestamps', () => {
    expect(formatVideoTime(-9223372036854.775)).toBe('0:00');
    expect(formatVideoTime(Number.NaN)).toBe('0:00');
  });
});
