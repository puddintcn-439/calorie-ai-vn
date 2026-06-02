import React from 'react';
import { Platform, StyleSheet, TextInput as NativeTextInput, TextInputProps } from 'react-native';
import { useI18n } from './i18n';

export function TextInput({ placeholder, ...props }: TextInputProps) {
  const { tx } = useI18n();
  return (
    <NativeTextInput
      {...props}
      placeholder={typeof placeholder === 'string' ? tx(placeholder) : placeholder}
      style={[styles.base, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: Platform.select({
      ios: 'Avenir Next',
      android: 'sans-serif',
      web: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      default: undefined,
    }),
    fontVariant: ['tabular-nums'],
  },
});
