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
    bgTop: '#f8fbf8',
    bgMid: '#f1f7f4',
    bgBottom: '#e9f2f6',
    surface: '#ffffff',
    surfaceAlt: '#eef6f2',
    surfaceWarm: '#fff7e8',
    surfaceLifted: '#ffffff',
    surfacePressed: '#e4eee9',
    surfaceMuted: '#f3f6f5',
    surfaceSuccess: '#e7f8ef',
    surfaceInfo: '#e9f6fb',
    surfaceWarning: '#fff5d9',
    surfaceDanger: '#feeceb',
    border: '#d5e3dd',
    borderStrong: '#b7cec5',
    borderSubtle: '#e5eeea',
    borderSuccess: '#96d9b7',
    borderInfo: '#9bcfe4',
    borderWarning: '#e7c36c',
    borderDanger: '#f4aaa3',
    text: '#10201b',
    textSoft: '#405650',
    textMuted: '#6d8079',
    textDisabled: '#9ba9a4',
    textOnAccent: '#062018',
    textOnDanger: '#ffffff',
    accentMint: '#54d493',
    accentCyan: '#1485a8',
    accentAmber: '#d89016',
    accentCoral: '#df6f5b',
    accentLeaf: '#53a23c',
    accentPlum: '#7357d7',
    success: '#15935a',
    info: '#157fa6',
    warning: '#b77909',
    danger: '#dc2626',
    progressBg: '#dce9e5',
    overlay: 'rgba(15, 23, 42, 0.42)',
    shadow: '#0f172a',
    tabBar: '#ffffff',
  },
  dark: {
    bgTop: '#09131d',
    bgMid: '#0f1b25',
    bgBottom: '#14212b',
    surface: '#132230',
    surfaceAlt: '#182a38',
    surfaceWarm: '#22271f',
    surfaceLifted: '#172836',
    surfacePressed: '#10202d',
    surfaceMuted: '#172431',
    surfaceSuccess: '#10251f',
    surfaceInfo: '#102233',
    surfaceWarning: '#2a2315',
    surfaceDanger: '#2d1010',
    border: '#26364a',
    borderStrong: '#3b5370',
    borderSubtle: '#1d2d3f',
    borderSuccess: '#2f5d42',
    borderInfo: '#31506a',
    borderWarning: '#6b5223',
    borderDanger: '#7f1d1d',
    text: '#f5f7fb',
    textSoft: '#b9c7d8',
    textMuted: '#8796aa',
    textDisabled: '#6b7280',
    textOnAccent: '#07111f',
    textOnDanger: '#ffffff',
    accentMint: '#66d39e',
    accentCyan: '#75c7e8',
    accentAmber: '#f3b84b',
    accentCoral: '#f28b6c',
    accentLeaf: '#9bd36a',
    accentPlum: '#c4b5fd',
    success: '#4ade80',
    info: '#7dd3fc',
    warning: '#fbbf24',
    danger: '#f87171',
    progressBg: '#263346',
    overlay: 'rgba(0, 0, 0, 0.65)',
    shadow: '#020617',
    tabBar: '#0d1726',
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
