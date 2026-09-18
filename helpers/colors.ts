import {Platform, StyleSheet, useColorScheme} from 'react-native';
import {selectAppColorScheme} from '../store/settings';
import {useAppSelector} from '../store/store';
import {useMemo} from 'react';
import {getScreenOrientation, ScreenOrientation} from './screen';
import {mediaNavigationOptions} from './navigationPolicy';

export type ColorScheme = 'light' | 'dark';
export type NavigationSurface = 'app' | 'media' | 'event';

export type ColorName =
  | 'background'
  | 'surface'
  | 'surfaceElevated'
  | 'text'
  | 'textSecondary'
  | 'textInverse'
  | 'link'
  | 'border'
  | 'divider'
  | 'highlighted'
  | 'disabled'
  | 'overlay'
  | 'mediaBackground'
  | 'mediaOverlay'
  | 'mediaOverlayPanel'
  | 'mediaText'
  | 'error'
  | 'warning'
  | 'success'
  | 'info'
  | 'successSurface'
  | 'dangerSurface'
  | 'tableColumnHeaderBg'
  | 'tableRowHeaderBg'
  | 'tableCellBg'
  | 'tableText';

export type Theme = Record<ColorName, string>;

export const palette = {
  white: 'white',
  black: 'black',
  darkgray: '#222',
  blue: 'blue',
  lightblue: 'lightblue',
};

export const lightTheme: Theme = {
  background: palette.white,
  surface: '#ffffff',
  surfaceElevated: '#f7f9fb',
  text: '#1f2933',
  textSecondary: '#52606d',
  textInverse: '#ffffff',
  link: '#145dcc',
  border: '#cbd2d9',
  divider: '#e4e7eb',
  highlighted: '#f0f4f8',
  disabled: '#888',
  overlay: '#00000066',
  mediaBackground: '#000000',
  mediaOverlay: '#000000b8',
  mediaOverlayPanel: '#00000099',
  mediaText: '#ffffff',
  error: '#ba1a1a',
  warning: '#8a5800',
  success: '#1b7f3a',
  info: '#0b63ce',
  successSurface: '#e7f6ec',
  dangerSurface: '#fde8e7',
  tableColumnHeaderBg: '#ddd',
  tableRowHeaderBg: '#eee',
  tableCellBg: palette.white,
  tableText: palette.black,
};

export const darkTheme: Theme = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceElevated: '#2a2a2a',
  text: '#f5f7fa',
  textSecondary: '#b8c0cc',
  textInverse: '#111111',
  link: '#8ab4ff',
  border: '#4b5563',
  divider: '#374151',
  highlighted: '#30363d',
  disabled: '#888',
  overlay: '#00000088',
  mediaBackground: '#000000',
  mediaOverlay: '#000000cc',
  mediaOverlayPanel: '#000000aa',
  mediaText: '#ffffff',
  error: '#ff8a80',
  warning: '#ffd166',
  success: '#7ee787',
  info: '#79c0ff',
  successSurface: '#173b27',
  dangerSurface: '#4b2020',
  tableColumnHeaderBg: '#111',
  tableRowHeaderBg: '#333',
  tableCellBg: '#222',
  tableText: palette.white,
};

export const resolveColorScheme = (
  preference: 'auto' | ColorScheme | string | undefined,
  systemColorScheme: ColorScheme | null | undefined,
): ColorScheme =>
  preference === 'dark'
    ? 'dark'
    : preference === 'light'
    ? 'light'
    : systemColorScheme === 'dark'
    ? 'dark'
    : 'light';

export const useAppColorScheme = () => {
  const colorScheme = useAppSelector(selectAppColorScheme);
  const systemColorScheme = useColorScheme();

  const appColorScheme = useMemo(
    () => resolveColorScheme(colorScheme, systemColorScheme),
    [colorScheme, systemColorScheme],
  );

  return appColorScheme;
};

export const useTheme = () => {
  const colorScheme = useAppColorScheme();
  const selectedTheme = useMemo(
    () => (colorScheme === 'light' ? lightTheme : darkTheme),
    [colorScheme],
  );
  return selectedTheme;
};

export const navigationThemeOptions = (
  theme: Theme,
  scheme: ColorScheme,
  surface: NavigationSurface = 'app',
  orientation: ScreenOrientation = getScreenOrientation(),
) => {
  const mediaOptions =
    surface === 'app' ? undefined : mediaNavigationOptions(orientation);

  return {
    layout: {
      backgroundColor: theme.background,
      componentBackgroundColor: theme.background,
      fitSystemWindows: mediaOptions?.layout.fitSystemWindows ?? true,
      ...(mediaOptions ? {insets: mediaOptions.layout.insets} : {}),
    },
    statusBar: {
      backgroundColor:
        surface === 'app' ? theme.surface : theme.mediaBackground,
      style: scheme === 'dark' ? ('light' as const) : ('dark' as const),
      visible: mediaOptions?.statusBar.visible ?? true,
      drawBehind:
        mediaOptions?.statusBar.drawBehind ?? Platform.OS === 'android',
      ...(mediaOptions
        ? {translucent: mediaOptions.statusBar.translucent}
        : {}),
      animate: true,
    },
    navigationBar: {
      backgroundColor:
        surface === 'app' ? theme.background : theme.mediaBackground,
      visible: surface === 'app',
    },
    bottomTabs: {
      backgroundColor: theme.surface,
      borderColor: theme.divider,
      titleDisplayMode: 'alwaysShow' as const,
    },
    bottomTab: {
      textColor: theme.textSecondary,
      selectedTextColor: theme.link,
      iconColor: theme.textSecondary,
      selectedIconColor: theme.link,
      fontSize: 12,
      selectedFontSize: 12,
      fontWeight: '600' as const,
    },
    topBar: {
      background: {
        color: theme.surface,
      },
      title: {
        color: theme.text,
      },
      backButton: {
        color: theme.text,
      },
    },
  };
};

export const useStyles = <T>(
  styles: (helpers: {theme: Theme}) => StyleSheet.NamedStyles<T>,
) => {
  const theme = useTheme();
  const computedStyles = useMemo(
    () => StyleSheet.create(styles({theme})),
    // Style factories are intentionally evaluated only when the theme changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );
  return computedStyles;
};
