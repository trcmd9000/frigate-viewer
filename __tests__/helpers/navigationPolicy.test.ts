import {Platform} from 'react-native';
import {mediaNavigationOptions} from '../../helpers/navigationPolicy';

describe('media navigation policy', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    (Platform as {OS: string}).OS = 'android';
  });

  afterEach(() => {
    (Platform as {OS: string}).OS = originalPlatform;
  });

  it('keeps portrait playback below one dark, system-owned status bar', () => {
    const options = mediaNavigationOptions('portrait');

    expect(options.layout).toEqual(
      expect.objectContaining({
        backgroundColor: '#000000',
        componentBackgroundColor: '#000000',
        fitSystemWindows: true,
      }),
    );
    expect(options.layout).not.toHaveProperty('insets');
    expect(options.statusBar).toEqual({
      visible: true,
      drawBehind: false,
      backgroundColor: '#000000',
      style: 'light',
      translucent: false,
    });
    expect(options.navigationBar.visible).toBe(false);
  });

  it('keeps landscape playback immersive', () => {
    const options = mediaNavigationOptions('landscape');

    expect(options.layout.fitSystemWindows).toBe(false);
    expect(options.layout).not.toHaveProperty('insets');
    expect(options.statusBar).toEqual({
      visible: false,
      drawBehind: true,
      backgroundColor: '#000000',
      style: 'light',
      translucent: false,
    });
    expect(options.navigationBar.visible).toBe(false);
  });
});
