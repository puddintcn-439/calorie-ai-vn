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
  const wide = width >= 760;
  const { colors, mode } = useAppTheme();

  return (
    <SurfaceCard style={[styles.card, wide && styles.cardWide, compact && styles.cardCompact, { backgroundColor: colors.surfaceLifted, borderColor: colors.borderSubtle }, style]}>
      <Image source={imageSource} style={[styles.image, wide && styles.imageWide, { backgroundColor: colors.surfaceAlt, opacity: mode === 'dark' ? 0.88 : 1 }, compact && styles.imageCompact]} resizeMode="cover" />
      <View style={[styles.copy, wide && styles.copyWide, compact && styles.copyCompact]}>
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
    marginBottom: 18,
  },
  cardWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 218,
  },
  cardCompact: {
    marginBottom: 14,
  },
  image: {
    width: '100%',
    height: 176,
  },
  imageWide: {
    width: '42%',
    height: '100%',
  },
  imageCompact: {
    height: 126,
  },
  copy: {
    padding: 18,
  },
  copyWide: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  copyCompact: {
    padding: 16,
  },
  body: {
    maxWidth: 700,
  },
});
