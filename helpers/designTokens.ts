import {useMemo} from 'react';
import {useTheme, Theme} from './colors';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const geometry = {
  mediaRadius: 4,
  cardRadius: 8,
  controlRadius: 8,
  pillRadius: 999,
  minimumTouchTarget: 48,
  phoneInset: 16,
  wideInset: 24,
  mediaAspectRatio: 16 / 9,
} as const;

export const typography = {
  screenTitle: {fontSize: 24, fontWeight: '700' as const},
  sectionTitle: {fontSize: 18, fontWeight: '700' as const},
  body: {fontSize: 16, lineHeight: 24},
  supporting: {fontSize: 14, lineHeight: 20},
  label: {fontSize: 13, fontWeight: '600' as const},
  timestamp: {fontSize: 12, lineHeight: 18},
  mediaOverlay: {fontSize: 14, fontWeight: '600' as const},
} as const;

export type SemanticColors = {
  canvas: string;
  surface: string;
  surfaceElevated: string;
  mediaBackground: string;
  textPrimary: string;
  textSecondary: string;
  textOnMedia: string;
  outline: string;
  divider: string;
  accent: string;
  accentContainer: string;
  textOnAccent: string;
  success: string;
  successContainer: string;
  textOnSuccess: string;
  warning: string;
  warningContainer: string;
  textOnWarning: string;
  error: string;
  errorContainer: string;
  textOnError: string;
  scrim: string;
};

export type DesignTokens = {
  colors: SemanticColors;
  spacing: typeof spacing;
  geometry: typeof geometry;
  typography: typeof typography;
};

export const createDesignTokens = (theme: Theme): DesignTokens => ({
  colors: {
    canvas: theme.background,
    surface: theme.surface,
    surfaceElevated: theme.surfaceElevated,
    mediaBackground: theme.mediaBackground,
    textPrimary: theme.text,
    textSecondary: theme.textSecondary,
    textOnMedia: theme.mediaText,
    outline: theme.border,
    divider: theme.divider,
    accent: theme.link,
    accentContainer: theme.highlighted,
    textOnAccent: theme.textInverse,
    success: theme.success,
    successContainer: theme.successSurface,
    textOnSuccess: theme.text,
    warning: theme.warning,
    warningContainer: theme.highlighted,
    textOnWarning: theme.text,
    error: theme.error,
    errorContainer: theme.dangerSurface,
    textOnError: theme.textInverse,
    scrim: theme.overlay,
  },
  spacing,
  geometry,
  typography,
});

export const useDesignTokens = () => {
  const theme = useTheme();
  return useMemo(() => createDesignTokens(theme), [theme]);
};
