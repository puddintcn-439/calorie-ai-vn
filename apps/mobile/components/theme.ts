import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { useThemeStore } from '../store/theme.store';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedThemeMode = 'light' | 'dark';

export type AppColors = {
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  surface: string;
  surfaceAlt: string;
  surfaceWarm: string;
  surfaceLifted: string;
  surfacePressed: string;
  surfaceMuted: string;
  surfaceSuccess: string;
  surfaceInfo: string;
  surfaceWarning: string;
  surfaceDanger: string;
  border: string;
  borderStrong: string;
  borderSubtle: string;
  borderSuccess: string;
  borderInfo: string;
  borderWarning: string;
  borderDanger: string;
  text: string;
  textSoft: string;
  textMuted: string;
  textDisabled: string;
  textOnAccent: string;
  textOnDanger: string;
  accentMint: string;
  accentCyan: string;
  accentAmber: string;
  accentCoral: string;
  accentLeaf: string;
  accentPlum: string;
  success: string;
  info: string;
  warning: string;
  danger: string;
  progressBg: string;
  overlay: string;
  shadow: string;
  tabBar: string;
};

// Semantic design tokens. Legacy accent names remain available while screens
// migrate incrementally, but new components should prefer these aliases.
export type SemanticColors = AppColors & {
  primary: string;
  neutralBackground: string;
  accent: string;
  accentPrimary: string;
  accentSecondary: string;
  accentTertiary: string;
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
  huge: 56,
  giant: 64,
} as const;

export const layout = {
  safeAreaMarginPhone: spacing.md,
  safeAreaMarginTablet: 20,
  minTouchTarget: 48,
  cardPadding: spacing.md,
  cardGap: spacing.md,
} as const;

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  if (!/^[\da-f]{6}$/i.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function contrastRatio(foreground: string, background: string) {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) return 1;
  const luminance = ({ r, g, b }: typeof fg) => {
    const channels = [r, g, b].map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const first = luminance(fg);
  const second = luminance(bg);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export const colorPalettes: Record<ResolvedThemeMode, AppColors> = {
  light: {
    bgTop: '#f7f8f2',
    bgMid: '#eef2e8',
    bgBottom: '#e8eee8',
    surface: '#fcfdf9',
    surfaceAlt: '#edf2e8',
    surfaceWarm: '#fbf1d8',
    surfaceLifted: '#ffffff',
    surfacePressed: '#e2e9de',
    surfaceMuted: '#f1f4ee',
    surfaceSuccess: '#e8f3df',
    surfaceInfo: '#e7f0ed',
    surfaceWarning: '#f8edd2',
    surfaceDanger: '#f8e7e2',
    border: '#cbd7ca',
    borderStrong: '#9eb09f',
    borderSubtle: '#dde5da',
    borderSuccess: '#aacb8e',
    borderInfo: '#a8c7bf',
    borderWarning: '#d3b96d',
    borderDanger: '#dc9c8e',
    text: '#142018',
    textSoft: '#3d5143',
    textMuted: '#657568',
    textDisabled: '#9aa69c',
    textOnAccent: '#15200f',
    textOnDanger: '#ffffff',
    accentMint: '#b7df72',
    accentCyan: '#376f64',
    accentAmber: '#b47b24',
    accentCoral: '#c76958',
    accentLeaf: '#6f9444',
    accentPlum: '#766e8b',
    success: '#397a43',
    info: '#3c756c',
    warning: '#94651d',
    danger: '#b6483d',
    progressBg: '#d8e2d5',
    overlay: 'rgba(16, 27, 20, 0.48)',
    shadow: '#26382b',
    tabBar: 'rgba(252, 253, 249, 0.92)',
  },
  dark: {
    bgTop: '#0d120e',
    bgMid: '#111a13',
    bgBottom: '#172019',
    surface: '#182119',
    surfaceAlt: '#1d291f',
    surfaceWarm: '#2a281b',
    surfaceLifted: '#202c21',
    surfacePressed: '#121a14',
    surfaceMuted: '#1b251c',
    surfaceSuccess: '#1c2d1c',
    surfaceInfo: '#192a26',
    surfaceWarning: '#2c2818',
    surfaceDanger: '#301d19',
    border: '#344238',
    borderStrong: '#506254',
    borderSubtle: '#29352c',
    borderSuccess: '#4f7048',
    borderInfo: '#486a62',
    borderWarning: '#755d2b',
    borderDanger: '#81443a',
    text: '#f3f5ee',
    textSoft: '#c5cec3',
    textMuted: '#8f9e91',
    textDisabled: '#69766b',
    textOnAccent: '#16200f',
    textOnDanger: '#ffffff',
    accentMint: '#b9df78',
    accentCyan: '#75b4a5',
    accentAmber: '#d6a34f',
    accentCoral: '#df806c',
    accentLeaf: '#9fbd70',
    accentPlum: '#aaa0bd',
    success: '#7fbc78',
    info: '#76b1a6',
    warning: '#d5a44c',
    danger: '#e17d70',
    progressBg: '#303d32',
    overlay: 'rgba(0, 0, 0, 0.65)',
    shadow: '#050805',
    tabBar: 'rgba(24, 33, 25, 0.94)',
  },
};

const radii = {
  sm: 10,
  lg: 16,
  xl: 26,
};

function withSemanticColors(colors: AppColors): SemanticColors {
  return {
    ...colors,
    primary: colors.accentMint,
    neutralBackground: colors.surfaceMuted,
    accent: colors.accentAmber,
    accentPrimary: colors.accentMint,
    accentSecondary: colors.accentCyan,
    accentTertiary: colors.accentAmber,
  };
}

let currentResolvedMode: ResolvedThemeMode = 'light';

export const theme = {
  get colors() {
    return withSemanticColors(colorPalettes[currentResolvedMode]);
  },
  darkColors: withSemanticColors(colorPalettes.dark),
  radii,
  spacing,
  layout,
};

export function createThemedStyles(
  factory: (
    colors: SemanticColors,
    radiusTokens: typeof radii,
    spacingTokens: typeof spacing,
    layoutTokens: typeof layout,
  ) => Record<string, any>,
) {
  const cache: Partial<Record<ResolvedThemeMode, Record<string, any>>> = {};

  return new Proxy({} as Record<string, any>, {
    get(_target, property: string | symbol) {
      if (typeof property === 'symbol') return undefined;

      const mode = currentResolvedMode;
      if (!cache[mode]) {
        cache[mode] = StyleSheet.create(
          factory(withSemanticColors(colorPalettes[mode]), radii, spacing, layout) as any,
        );
      }

      return cache[mode]?.[property];
    },
  });
}

export function useAppTheme() {
  const systemScheme = useColorScheme();
  const { themeMode, hydrated, loadThemeMode } = useThemeStore();

  useEffect(() => {
    if (!hydrated) {
      loadThemeMode();
    }
  }, [hydrated, loadThemeMode]);

  const resolvedMode: ResolvedThemeMode =
    themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;
  currentResolvedMode = resolvedMode;

  return {
    mode: resolvedMode,
    requestedMode: themeMode,
    colors: withSemanticColors(colorPalettes[resolvedMode]),
    radii,
    spacing,
    layout,
  };
}
