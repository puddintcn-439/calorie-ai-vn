import React, { ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextStyle,
  useWindowDimensions,
  View,
  ViewStyle
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from './theme';
import { Text } from './i18n-text';

export function useBottomNavContentPadding(extraGap = 24) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 480;
  const isDesktop = width >= 900;
  const bottomInset = insets?.bottom ?? 0;
  const tabHeight = isDesktop ? 52 : isCompact ? 62 : 64;
  const bottomOffset = isDesktop ? 12 : isCompact ? 8 : 10;
  const desktopGap = Math.min(extraGap, 20);

  return tabHeight + bottomInset + bottomOffset + (isDesktop ? desktopGap : extraGap);
}

export function ScreenShell({
  children,
  scroll = true,
  contentStyle,
  scrollContentStyle,
  reserveBottomNav = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  scrollContentStyle?: StyleProp<ViewStyle>;
  reserveBottomNav?: boolean;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const fade = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(18)).current;
  const useNativeDriver = Platform.OS !== 'web';
  const { colors } = useAppTheme();
  const bottomNavPadding = useBottomNavContentPadding();
  const bottomNavStyle = reserveBottomNav ? { paddingBottom: bottomNavPadding } : null;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }),
    ]).start();
  }, [fade, translate]);

  const content = (
    <Animated.View style={[styles.inner, isDesktop && styles.innerDesktop, contentStyle, { opacity: fade, transform: [{ translateY: translate }] }]}>
      {children}
    </Animated.View>
  );

  return (
    <LinearGradient
      colors={[colors.bgTop, colors.bgMid, colors.surfaceAlt, colors.bgBottom]}
      locations={[0, 0.38, 0.72, 1]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        {scroll ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              isDesktop && styles.scrollContentDesktop,
              bottomNavStyle,
              scrollContentStyle,
            ]}
          >
            {content}
          </ScrollView>
        ) : (
          <View style={[styles.noScrollContent, isDesktop && styles.noScrollContentDesktop, bottomNavStyle]}>{content}</View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

export function SurfaceCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 480;
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;
  const useNativeDriver = Platform.OS !== 'web';
  const { colors, radii } = useAppTheme();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver,
      }),
    ]).start();
  }, [fade, scale]);

  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: isCompact ? radii.lg : radii.xl,
          borderWidth: 1,
          borderColor: colors.border,
          padding: isCompact ? 14 : 16,
          ...(Platform.OS === 'web'
            ? { boxShadow: `0px 14px 30px ${colors.shadow}24` }
            : {
                shadowColor: colors.shadow,
                shadowOpacity: 0.16,
                shadowRadius: isCompact ? 12 : 18,
                shadowOffset: { width: 0, height: 10 },
              }),
          elevation: isCompact ? 3 : 5,
        },
        style,
        { opacity: fade, transform: [{ scale }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return <Text style={[styles.eyebrow, { color: colors.accentCyan }]}>{children}</Text>;
}

export function HeroTitle({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  return <Text style={[styles.heroTitle, { color: colors.text }, width < 480 && styles.heroTitleMobile]}>{children}</Text>;
}

export function BodyText({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useAppTheme();
  return <Text style={[styles.bodyText, { color: colors.textSoft }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { padding: 14 },
  scrollContentDesktop: { padding: 16 },
  noScrollContent: { flex: 1, paddingHorizontal: 18 },
  noScrollContentDesktop: {},
  inner: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  innerDesktop: {
    paddingHorizontal: 12,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0,
    fontWeight: '700',
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroTitleMobile: {
    fontSize: 23,
    lineHeight: 29,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
  },
});
