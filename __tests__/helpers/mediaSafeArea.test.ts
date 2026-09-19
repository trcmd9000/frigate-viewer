import {portraitMediaTopInset} from '../../helpers/mediaSafeArea';

describe('media safe area', () => {
  it('uses the Android status-bar height only in portrait', () => {
    expect(portraitMediaTopInset(1080, 2408, 72, 'android')).toBe(72);
    expect(portraitMediaTopInset(2408, 1080, 72, 'android')).toBe(0);
  });

  it('does not add an Android-specific inset on other platforms', () => {
    expect(portraitMediaTopInset(1080, 2408, 72, 'ios')).toBe(0);
  });

  it('rejects negative native inset values', () => {
    expect(portraitMediaTopInset(1080, 2408, -1, 'android')).toBe(0);
  });
});
