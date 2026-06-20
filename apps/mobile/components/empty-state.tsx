import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  Platform,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle
} from 'react-native';
import { SurfaceCard } from './ui-shell';
import { useAppTheme } from './theme';
import { Text } from './i18n-text';

export function EmptyState({
  imageSource,
  icon,
  title,
  description,
  style,
  variant = 'default',
}: {
  imageSource?: ImageSourcePropType;
  icon: string;
  title: string;
  description: string;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'compact';
}) {
  const { width } = useWindowDimensions();
  const isCompact = variant === 'compact' || width < 420;
  const pulse = useRef(new Animated.Value(0)).current;
  const useNativeDriver = Platform.OS !== 'web';
  const { colors, radii } = useAppTheme();

  useEffect(() => {
    if (imageSource) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [imageSource, pulse, useNativeDriver]);

  return (
    <SurfaceCard style={[styles.card, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }, isCompact && styles.compactCard, style]}>
      {imageSource ? (
        <Image
          source={imageSource}
          style={[styles.image, { borderRadius: radii.lg, backgroundColor: colors.surfaceAlt }, isCompact && styles.compactImage]}
          resizeMode="cover"
        />
      ) : (
        <Animated.View style={[styles.iconWrap, isCompact && styles.compactIconWrap, {
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          transform: [{
            scale: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.08],
            }),
          }],
        }]}>
          <Text style={styles.icon}>{icon}</Text>
        </Animated.View>
      )}
      <View style={[styles.copy, isCompact && styles.compactCopy]}>
        <Text style={[styles.title, { color: colors.text }, isCompact && styles.compactTitle]}>{title}</Text>
        <Text style={[styles.description, { color: colors.textSoft }, isCompact && styles.compactDescription]}>{description}</Text>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 16,
  },
  image: {
    width: '100%',
    maxWidth: 560,
    aspectRatio: 16 / 7,
    alignSelf: 'center',
    marginBottom: 16,
  },
  compactImage: {
    width: 86,
    height: 70,
    maxWidth: 86,
    aspectRatio: undefined,
    marginBottom: 0,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 12,
  },
  compactIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 0,
  },
  icon: {
    fontSize: 28,
  },
  copy: {
    alignItems: 'center',
  },
  compactCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 7,
  },
  compactTitle: {
    fontSize: 14,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  compactDescription: {
    textAlign: 'left',
    maxWidth: undefined,
  },
});
