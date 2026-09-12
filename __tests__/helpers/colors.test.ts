import {
  darkTheme,
  lightTheme,
  navigationThemeOptions,
  resolveColorScheme,
} from '../../helpers/colors';
import {Platform} from 'react-native';

const channel = (value: string) => parseInt(value, 16) / 255;
const luminance = (color: string) => {
  const hex = color.replace('#', '');
  const alpha = hex.length === 8 ? channel(hex.slice(6)) : 1;
  const rgb = [0, 2, 4].map(offset => {
    const normalized = channel(hex.slice(offset, offset + 2)) * alpha;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
};
const contrastRatio = (foreground: string, background: string) => {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

describe('adaptive color scheme', () => {
  it.each([
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
    ['auto', 'dark', 'dark'],
    ['auto', 'light', 'light'],
    ['auto', null, 'light'],
    ['invalid', 'dark', 'dark'],
  ] as const)('resolves %s with system %s to %s', (preference, system, expected) => {
    expect(resolveColorScheme(preference, system)).toBe(expected);
  });

  it('keeps semantic surfaces and text readable in both themes', () => {
    expect(lightTheme.background).not.toBe(lightTheme.text);
    expect(darkTheme.background).not.toBe(darkTheme.text);
    expect(lightTheme.mediaBackground).toBe('#000000');
    expect(darkTheme.mediaBackground).toBe('#000000');
    expect(lightTheme.textInverse).not.toBe(lightTheme.text);
    expect(darkTheme.textInverse).not.toBe(darkTheme.text);
  });

  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)('keeps badge text readable on %s media overlays', (_name, theme) => {
    expect(theme.mediaText).toBe('#ffffff');
    expect(contrastRatio(theme.mediaText, theme.mediaOverlay)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('maps theme colors to navigation chrome', () => {
    const options = navigationThemeOptions(darkTheme, 'dark');
    expect(options.layout.backgroundColor).toBe(darkTheme.background);
    expect(options.statusBar.style).toBe('light');
    expect(options.topBar.background.color).toBe(darkTheme.surface);
    expect(options.topBar.title.color).toBe(darkTheme.text);
    expect(options.navigationBar.backgroundColor).toBe(darkTheme.background);
    expect(options.navigationBar.visible).toBe(true);
  });

  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)('makes selected tabs prominent on %s', (scheme, theme) => {
    const options = navigationThemeOptions(theme, scheme);

    expect(options.bottomTab.textColor).toBe(theme.textSecondary);
    expect(options.bottomTab.iconColor).toBe(theme.textSecondary);
    expect(options.bottomTab.selectedTextColor).toBe(theme.link);
    expect(options.bottomTab.selectedIconColor).toBe(theme.link);
    expect(options.bottomTab.selectedFontSize).toBeGreaterThan(
      options.bottomTab.fontSize,
    );
    expect(options.bottomTab.fontWeight).toBe('600');
    expect(options.bottomTabs.titleDisplayMode).toBe('alwaysShow');
  });

  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)('uses the media surface for fullscreen navigation chrome on %s', (
    scheme,
    theme,
  ) => {
    expect(
      navigationThemeOptions(theme, scheme, 'media').navigationBar.backgroundColor,
    ).toBe(theme.mediaBackground);
    expect(
      navigationThemeOptions(theme, scheme, 'media').navigationBar.visible,
    ).toBe(false);
  });

  it('hides status and navigation bars for playback surfaces on Android', () => {
    const originalPlatform = Platform.OS;
    (Platform as {OS: string}).OS = 'android';

    expect(
      navigationThemeOptions(lightTheme, 'light', 'event').statusBar.visible,
    ).toBe(false);
    expect(
      navigationThemeOptions(lightTheme, 'light', 'event').navigationBar.visible,
    ).toBe(false);
    expect(
      navigationThemeOptions(lightTheme, 'light', 'media').statusBar.visible,
    ).toBe(false);

    (Platform as {OS: string}).OS = originalPlatform;
  });
});
