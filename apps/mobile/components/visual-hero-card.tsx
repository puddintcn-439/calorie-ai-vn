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
      <View
        style={[
          styles.copy,
          { backgroundColor: colors.surfaceLifted, borderColor: colors.borderSubtle },
          wide && styles.copyWide,
          compact && styles.copyCompact,
        ]}
      >
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
    height: 158,
  },
  copy: {
    padding: 18,
    marginHorizontal: 14,
    marginTop: -34,
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  copyWide: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    marginHorizontal: 0,
    marginVertical: 0,
    borderWidth: 0,
    borderRadius: 0,
  },
  copyCompact: {
    padding: 18,
    marginHorizontal: 10,
    marginTop: -30,
    marginBottom: 10,
  },
  body: {
    maxWidth: 700,
  },
});
