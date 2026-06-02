import { Alert as NativeAlert } from 'react-native';
import type { AlertButton, AlertOptions } from 'react-native';
import { translateAlertButtons, translateText } from './i18n';
import { useLocaleStore } from '../store/locale.store';

export const Alert: any = {
  ...NativeAlert,
  alert: (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
    const locale = useLocaleStore.getState().locale;
    return NativeAlert.alert(
      title ? translateText(title, locale) : title,
      message ? translateText(message, locale) : message,
      translateAlertButtons(buttons, locale),
      options,
    );
  },
  // Provide a cross-platform `prompt` that falls back to window.prompt on web
  prompt: (title: any, message?: any, callbackOrButtons?: any, typeOrOptions?: any) => {
    const locale = useLocaleStore.getState().locale;
    const tTitle = title ? translateText(title, locale) : title;
    const tMessage = message ? translateText(message, locale) : message;

    // Prefer native prompt when available (iOS)
    const nativePrompt = (NativeAlert as any).prompt;
    if (typeof nativePrompt === 'function') {
      return nativePrompt(
        tTitle,
        tMessage,
        typeof callbackOrButtons === 'function' ? callbackOrButtons : translateAlertButtons(callbackOrButtons, locale),
        typeOrOptions,
      );
    }

    // Web fallback: use window.prompt and invoke callbacks similarly
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      const promptText = tMessage ? `${tTitle}\n\n${tMessage}` : (tTitle || tMessage || '');
      const defaultValue = '';

      // If caller provided a single callback function
      if (typeof callbackOrButtons === 'function') {
        const value = window.prompt(promptText, defaultValue);
        callbackOrButtons(value);
        return;
      }

      // If caller provided button array, try to call OK button's onPress
      if (Array.isArray(callbackOrButtons)) {
        const value = window.prompt(promptText, defaultValue);
        const okBtn = callbackOrButtons.find((b: any) => b && typeof b.onPress === 'function');
        if (okBtn && typeof okBtn.onPress === 'function') okBtn.onPress(value);
        return;
      }

      // Last resort: show a simple prompt and ignore result
      window.prompt(promptText, defaultValue);
      return;
    }

    // Fallback to alert translation if no prompt available
    return NativeAlert.alert(tTitle, tMessage, translateAlertButtons(callbackOrButtons, locale));
  },
};
