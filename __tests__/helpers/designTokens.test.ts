import {createDesignTokens, geometry, spacing, typography} from '../../helpers/designTokens';
import {darkTheme, lightTheme} from '../../helpers/colors';

describe('semantic media-first design tokens', () => {
  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)('maps existing %s theme roles to semantic colors', (_name, theme) => {
    const tokens = createDesignTokens(theme);

    expect(tokens.colors.canvas).toBe(theme.background);
    expect(tokens.colors.surface).toBe(theme.surface);
    expect(tokens.colors.mediaBackground).toBe(theme.mediaBackground);
    expect(tokens.colors.textPrimary).toBe(theme.text);
    expect(tokens.colors.textOnMedia).toBe(theme.mediaText);
  });

  it('uses the shared spacing and accessible geometry scale', () => {
    expect(spacing).toEqual({xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32});
    expect(geometry.minimumTouchTarget).toBeGreaterThanOrEqual(48);
    expect(geometry.cardRadius).toBe(16);
    expect(geometry.mediaAspectRatio).toBeCloseTo(16 / 9);
  });

  it('keeps text roles scalable instead of using fixed-height text containers', () => {
    expect(typography.body.lineHeight).toBeGreaterThan(typography.body.fontSize);
    expect(typography.supporting.lineHeight).toBeGreaterThan(
      typography.supporting.fontSize,
    );
  });
});
