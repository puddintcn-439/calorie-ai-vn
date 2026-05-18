import React, { ReactNode } from 'react';
import { Text as NativeText, TextProps } from 'react-native';
import { useI18n } from './i18n';

function translateNode(node: ReactNode, tx: (source: string) => string): ReactNode {
  if (typeof node === 'string') return tx(node);
  if (Array.isArray(node)) return node.map((child, index) => <React.Fragment key={index}>{translateNode(child, tx)}</React.Fragment>);
  return node;
}

export function Text({ children, ...props }: TextProps) {
  const { tx } = useI18n();
  return <NativeText {...props}>{translateNode(children, tx)}</NativeText>;
}
