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

export const colorPalettes: Record<ResolvedThemeMode, AppColors> = {
  light: {
    bgTop: '#f7faf6',
    bgMid: '#edf4ef',
    bgBottom: '#e7eef0',
    surface: '#ffffff',
    surfaceAlt: '#edf5f1',
    surfaceWarm: '#fff6e2',
    surfaceLifted: '#fbfdfb',
    surfacePressed: '#dfeae5',
    surfaceMuted: '#f2f6f3',
    surfaceSuccess: '#e0f4e9',
    surfaceInfo: '#e4f2f5',
    surfaceWarning: '#fff1cf',
    surfaceDanger: '#fde8e5',
    border: '#d0ded7',
    borderStrong: '#a7bdb4',
    borderSubtle: '#e4ece8',
    borderSuccess: '#8acdaa',
    borderInfo: '#94c8d3',
    borderWarning: '#ddb95f',
    borderDanger: '#ec9e96',
    text: '#11231d',
    textSoft: '#344d45',
    textMuted: '#667b73',
    textDisabled: '#98a7a1',
    textOnAccent: '#062018',
    textOnDanger: '#ffffff',
    accentMint: '#5fc28b',
    accentCyan: '#2c8797',
    accentAmber: '#c98924',
    accentCoral: '#d66f5f',
    accentLeaf: '#639f46',
    accentPlum: '#7d759f',
    success: '#178855',
    info: '#217d91',
    warning: '#a66d11',
    danger: '#c93b32',
    progressBg: '#d7e5df',
    overlay: 'rgba(15, 23, 42, 0.42)',
    shadow: '#0f172a',
    tabBar: '#ffffff',
  },
  dark: {
    bgTop: '#0b1413',
    bgMid: '#101c1a',
    bgBottom: '#152420',
    surface: '#14241f',
    surfaceAlt: '#192c26',
    surfaceWarm: '#29281c',
    surfaceLifted: '#1a3029',
    surfacePressed: '#10211c',
    surfaceMuted: '#172822',
    surfaceSuccess: '#132c22',
    surfaceInfo: '#13292d',
    surfaceWarning: '#2c2515',
    surfaceDanger: '#2b1715',
    border: '#2a4038',
    borderStrong: '#405d51',
    borderSubtle: '#20342d',
    borderSuccess: '#35684b',
    borderInfo: '#365d63',
    borderWarning: '#735725',
    borderDanger: '#7c2f29',
    text: '#f5f7fb',
    textSoft: '#b9c7d8',
    textMuted: '#8796aa',
    textDisabled: '#6b7280',
    textOnAccent: '#07111f',
    textOnDanger: '#ffffff',
    accentMint: '#79d59d',
    accentCyan: '#7fc9d3',
    accentAmber: '#e9b75a',
    accentCoral: '#eb8f78',
    accentLeaf: '#a5cf74',
    accentPlum: '#b7adc9',
    success: '#4ade80',
    info: '#7dd3fc',
    warning: '#fbbf24',
    danger: '#f87171',
    progressBg: '#263346',
    overlay: 'rgba(0, 0, 0, 0.65)',
    shadow: '#020617',
    tabBar: '#101f1c',
  },
};

const radii = {
  sm: 6,
  lg: 8,
  xl: 8,
};

let currentResolvedMode: ResolvedThemeMode = 'light';

export const theme = {
  get colors() {
    return colorPalettes[currentResolvedMode];
  },
  darkColors: colorPalettes.dark,
  radii,
};

export function createThemedStyles(
  factory: (colors: AppColors, radiusTokens: typeof radii) => Record<string, any>,
) {
  const cache: Partial<Record<ResolvedThemeMode, Record<string, any>>> = {};

  return new Proxy({} as Record<string, any>, {
    get(_target, property: string | symbol) {
      if (typeof property === 'symbol') return undefined;

      const mode = currentResolvedMode;
      if (!cache[mode]) {
        cache[mode] = StyleSheet.create(factory(colorPalettes[mode], radii) as any);
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
    colors: colorPalettes[resolvedMode],
    radii,
  };
}
