import React from 'react';
import { Image, ImageSourcePropType, StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { BodyText, Eyebrow, HeroTitle, SurfaceCard } from './ui-shell';
import { useAppTheme } from './theme';

export function VisualHeroCard({
  imageSource,
  eyebrow,
  title,
  body,
  style,
}: {
  imageSource: ImageSourcePropType;
  eyebrow: string;
  title: string;
  body: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 480;
  const { colors, mode } = useAppTheme();

  return (
    <SurfaceCard style={[styles.card, { backgroundColor: colors.surfaceLifted, borderColor: colors.borderStrong }, style]}>
      <Image source={imageSource} style={[styles.image, { backgroundColor: colors.surfaceAlt, opacity: mode === 'dark' ? 0.92 : 1 }, compact && styles.imageCompact]} resizeMode="cover" />
      <View style={[styles.copy, compact && styles.copyCompact]}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <HeroTitle>{title}</HeroTitle>
        <BodyText style={styles.body}>{body}</BodyText>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: 168,
  },
  imageCompact: {
    height: 150,
  },
  copy: {
    padding: 14,
  },
  copyCompact: {
    padding: 14,
  },
  body: {
    maxWidth: 700,
  },
});
