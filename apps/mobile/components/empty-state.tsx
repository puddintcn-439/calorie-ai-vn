import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SurfaceCard } from './ui-shell';
import { theme } from './theme';

export function EmptyState({
  icon,
  title,
  description,
  style,
}: {
  icon: string;
  title: string;
  description: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SurfaceCard style={[styles.card, style]}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 22,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    marginBottom: 12,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  description: {
    color: theme.colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 280,
  },
});