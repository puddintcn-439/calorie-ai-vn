import React, { ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
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
  scrollRef,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  scrollContentStyle?: StyleProp<ViewStyle>;
  reserveBottomNav?: boolean;
  // optional ref to the internal ScrollView so parent screens can call scrollTo
  scrollRef?: any;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const fade = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(18)).current;
  const useNativeDriver = Platform.OS !== 'web';
  const { colors } = useAppTheme();
  const bottomNavPadding = useBottomNavContentPadding();
  const bottomNavStyle = reserveBottomNav ? { paddingBottom: bottomNavPadding } : null;
  const screenPaddingStyle = width < 480 ? styles.scrollContentCompact : null;

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
        <KeyboardAvoidingView
          style={styles.keyboardAvoider}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          {scroll ? (
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              contentContainerStyle={[
                styles.scrollContent,
                screenPaddingStyle,
                isDesktop && styles.scrollContentDesktop,
                bottomNavStyle,
                scrollContentStyle,
              ]}
            >
              {content}
            </ScrollView>
          ) : (
            <View style={[styles.noScrollContent, width < 480 && styles.noScrollContentCompact, isDesktop && styles.noScrollContentDesktop, bottomNavStyle]}>{content}</View>
          )}
        </KeyboardAvoidingView>
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
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: colors.borderSubtle,
          padding: isCompact ? 16 : 20,
          ...(Platform.OS === 'web'
            ? { boxShadow: `0px 16px 34px ${colors.shadow}18` }
            : {
                shadowColor: colors.shadow,
                shadowOpacity: 0.1,
                shadowRadius: isCompact ? 12 : 18,
                shadowOffset: { width: 0, height: 10 },
              }),
          elevation: isCompact ? 2 : 3,
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

export function SkeletonBlock({
  width = '100%',
  height = 16,
  radius,
  style,
}: {
  width?: ViewStyle['width'];
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const shimmer = useRef(new Animated.Value(0.46)).current;
  const useNativeDriver = Platform.OS !== 'web';
  const { colors, radii } = useAppTheme();

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver,
        }),
        Animated.timing(shimmer, {
          toValue: 0.46,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer, useNativeDriver]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius ?? radii.lg,
          backgroundColor: colors.surfacePressed,
          opacity: shimmer,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardAvoider: { flex: 1 },
  scrollContent: { padding: 20, rowGap: 16 },
  scrollContentCompact: { paddingHorizontal: 16, paddingTop: 16 },
  scrollContentDesktop: { paddingHorizontal: 28, paddingTop: 24 },
  noScrollContent: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  noScrollContentCompact: { paddingHorizontal: 16 },
  noScrollContentDesktop: {},
  inner: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
  },
  innerDesktop: {
    paddingHorizontal: 8,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 0.7,
    fontWeight: '700',
    marginBottom: 9,
  },
  heroTitle: {
    fontSize: 33,
    lineHeight: 38,
    fontWeight: '900',
    marginBottom: 12,
  },
  heroTitleMobile: {
    fontSize: 27,
    lineHeight: 32,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 23,
  },
});
