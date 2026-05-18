import { Alert as NativeAlert } from 'react-native';
import { translateAlertButtons, translateText } from './i18n';
import { useLocaleStore } from '../store/locale.store';

export const Alert: typeof NativeAlert = {
  ...NativeAlert,
  alert: (title, message, buttons, options) => {
    const locale = useLocaleStore.getState().locale;
    return NativeAlert.alert(
      title ? translateText(title, locale) : title,
      message ? translateText(message, locale) : message,
      translateAlertButtons(buttons, locale),
      options,
    );
  },
};
