import { authStorage } from '../services/auth-storage';
import type { Locale } from '../components/i18n';

const create = require('zustand').create as typeof import('zustand').create;

const LOCALE_KEY = 'app_locale';

function isLocale(value: string | null): value is Locale {
  return value === 'vi' || value === 'en';
}

interface LocaleState {
  locale: Locale;
  hydrated: boolean;
  loadLocale: () => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: 'vi',
  hydrated: false,

  loadLocale: async () => {
    const storedLocale = await authStorage.getItemAsync(LOCALE_KEY);
    set({
      locale: isLocale(storedLocale) ? storedLocale : 'vi',
      hydrated: true,
    });
  },

  setLocale: async (locale) => {
    set({ locale, hydrated: true });
    await authStorage.setItemAsync(LOCALE_KEY, locale);
  },
}));
