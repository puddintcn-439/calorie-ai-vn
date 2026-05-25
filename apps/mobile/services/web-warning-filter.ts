import { Platform } from 'react-native';

const POINTER_EVENTS_DEPRECATED_WARNING = 'props.pointerEvents is deprecated. Use style.pointerEvents';

declare global {
  // eslint-disable-next-line no-var
  var __calorieAiWebWarningFilterInstalled: boolean | undefined;
}

if (Platform.OS === 'web' && !globalThis.__calorieAiWebWarningFilterInstalled) {
  globalThis.__calorieAiWebWarningFilterInstalled = true;
  const originalWarn = console.warn.bind(console);

  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes(POINTER_EVENTS_DEPRECATED_WARNING)) {
      return;
    }

    originalWarn(...args);
  };
}
