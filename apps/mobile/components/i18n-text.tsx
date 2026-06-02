import React, { ReactNode } from 'react';
import { Platform, StyleSheet, Text as NativeText, TextProps } from 'react-native';
import { I18nKey, useI18n } from './i18n';

function translateNode(node: ReactNode, tx: (source: string) => string): ReactNode {
  if (typeof node === 'string') return tx(node);
  if (typeof node === 'number') return tx(String(node));
  if (Array.isArray(node)) return node.map((child, index) => <React.Fragment key={index}>{translateNode(child, tx)}</React.Fragment>);
  if (React.isValidElement(node)) {
    const props: any = (node as any).props || {};
    const translatedChildren = translateNode(props.children, tx);
    return React.cloneElement(node as any, { ...props }, translatedChildren);
  }
  return node;
}

type I18nTextProps = TextProps & {
  i18nKey?: I18nKey;
  values?: Record<string, string | number | null | undefined>;
};

export function Text({ children, i18nKey, values, ...props }: I18nTextProps) {
  const { t, tx } = useI18n();
  const content = i18nKey ? t(i18nKey, values) : translateNode(children, tx);
  return <NativeText {...props} style={[styles.base, props.style]}>{content}</NativeText>;
}

const styles = StyleSheet.create({
  base: {
    fontFamily: Platform.select({
      ios: 'Avenir Next',
      android: 'sans-serif',
      web: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      default: undefined,
    }),
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
});
