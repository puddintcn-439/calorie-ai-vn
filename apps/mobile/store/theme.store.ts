import { authStorage } from '../services/auth-storage';
import type { ThemeMode } from '../components/theme';

const create = require('zustand').create as typeof import('zustand').create;

const THEME_MODE_KEY = 'theme_mode';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

interface ThemeState {
  themeMode: ThemeMode;
  hydrated: boolean;
  loadThemeMode: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeMode: 'light',
  hydrated: false,

  loadThemeMode: async () => {
    const storedMode = await authStorage.getItemAsync(THEME_MODE_KEY);
    set({
      themeMode: isThemeMode(storedMode) ? storedMode : 'light',
      hydrated: true,
    });
  },

  setThemeMode: async (mode) => {
    set({ themeMode: mode, hydrated: true });
    await authStorage.setItemAsync(THEME_MODE_KEY, mode);
  },
}));
