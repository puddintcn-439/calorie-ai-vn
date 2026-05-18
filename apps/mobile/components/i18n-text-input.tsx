import React from 'react';
import { TextInput as NativeTextInput, TextInputProps } from 'react-native';
import { useI18n } from './i18n';

export function TextInput({ placeholder, ...props }: TextInputProps) {
  const { tx } = useI18n();
  return <NativeTextInput {...props} placeholder={typeof placeholder === 'string' ? tx(placeholder) : placeholder} />;
}
