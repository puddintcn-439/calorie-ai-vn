import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
  const tabHeight = isDesktop ? 52 : isCompact ? 70 : 66;
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
    <Animated.View style={[styles.inner, !scroll && styles.innerFlex, isDesktop && styles.innerDesktop, contentStyle, { opacity: fade, transform: [{ translateY: translate }] }]}>
      {children}
    </Animated.View>
  );

  return (
    <LinearGradient
      colors={[colors.bgTop, colors.bgMid, colors.surfaceAlt, colors.bgBottom]}
      locations={[0, 0.34, 0.7, 1]}
      style={styles.gradient}
    >
      <AmbientBackdrop />
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

function AmbientBackdrop() {
  const drift = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const { colors, mode } = useAppTheme();
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [drift, reduceMotion, useNativeDriver]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.ambientOrb,
          styles.ambientOrbTop,
          {
            backgroundColor: mode === 'dark' ? colors.accentMint : '#d9efa9',
            opacity: mode === 'dark' ? 0.09 : 0.26,
            transform: [
              { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-18, 28] }) },
              { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-8, 34] }) },
              { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ambientOrb,
          styles.ambientOrbBottom,
          {
            backgroundColor: colors.accentCyan,
            opacity: mode === 'dark' ? 0.08 : 0.12,
            transform: [
              { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [28, -24] }) },
              { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [20, -18] }) },
              { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.08, 0.96] }) },
            ],
          },
        ]}
      />
      <View
        style={[
          styles.ambientGrid,
          Platform.OS === 'web'
            ? ({
                backgroundImage: `linear-gradient(${colors.borderSubtle}45 1px, transparent 1px), linear-gradient(90deg, ${colors.borderSubtle}45 1px, transparent 1px)`,
                backgroundSize: '32px 32px',
                maskImage: 'linear-gradient(to bottom, rgba(0,0,0,.35), transparent 58%)',
              } as any)
            : null,
        ]}
      />
    </View>
  );
}

export function SurfaceCard({
  children,
  style,
  revealDelay = 0,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  revealDelay?: number;
}) {
  const { width } = useWindowDimensions();
  const isCompact = width < 480;
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const [spotlight, setSpotlight] = useState({ x: 50, y: 0, visible: false });
  const useNativeDriver = Platform.OS !== 'web';
  const { colors, radii } = useAppTheme();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 280,
        delay: revealDelay,
        easing: Easing.out(Easing.quad),
        useNativeDriver,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 320,
        delay: revealDelay,
        easing: Easing.out(Easing.quad),
        useNativeDriver,
      }),
    ]).start();
  }, [fade, revealDelay, scale, useNativeDriver]);

  const setHovered = (hovered: boolean) => {
    setSpotlight((current) => ({ ...current, visible: hovered }));
    Animated.spring(lift, {
      toValue: hovered ? -3 : 0,
      speed: 22,
      bounciness: 4,
      useNativeDriver,
    }).start();
  };

  const pointerProps = Platform.OS === 'web'
    ? ({
        onPointerEnter: () => setHovered(true),
        onPointerLeave: () => setHovered(false),
        onPointerMove: (event: any) => {
          const rect = event.currentTarget?.getBoundingClientRect?.();
          if (!rect) return;
          setSpotlight({
            x: ((event.clientX - rect.left) / rect.width) * 100,
            y: ((event.clientY - rect.top) / rect.height) * 100,
            visible: true,
          });
        },
      } as any)
    : {};

  return (
    <Animated.View
      {...pointerProps}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: colors.borderSubtle,
          padding: 16,
          ...(Platform.OS === 'web'
            ? {
                boxShadow: `0px 22px 50px ${colors.shadow}16, inset 0 1px 0 rgba(255,255,255,.48)`,
                transitionProperty: 'border-color, box-shadow',
                transitionDuration: '240ms',
              }
            : {
                shadowColor: colors.shadow,
                shadowOpacity: 0.12,
                shadowRadius: isCompact ? 16 : 22,
                shadowOffset: { width: 0, height: 14 },
              }),
          elevation: isCompact ? 3 : 5,
        },
        style,
        { opacity: fade, transform: [{ translateY: lift }, { scale }] },
      ]}
    >
      {Platform.OS === 'web' ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radii.xl,
              opacity: spotlight.visible ? 1 : 0,
              backgroundImage: `radial-gradient(360px circle at ${spotlight.x}% ${spotlight.y}%, ${colors.accentMint}24, transparent 64%)`,
              transitionProperty: 'opacity',
              transitionDuration: '220ms',
            } as any,
          ]}
        />
      ) : null}
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
  gradient: { flex: 1, overflow: 'hidden' },
  ambientOrb: {
    position: 'absolute',
    width: 330,
    height: 330,
    borderRadius: 165,
    ...(Platform.OS === 'web' ? ({ filter: 'blur(44px)' } as any) : null),
  },
  ambientOrbTop: {
    top: -180,
    right: -140,
  },
  ambientOrbBottom: {
    bottom: -190,
    left: -160,
  },
  ambientGrid: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.35,
  },
  safeArea: { flex: 1, zIndex: 1 },
  keyboardAvoider: { flex: 1 },
  scrollContent: { padding: 20, rowGap: 16 },
  scrollContentCompact: { paddingHorizontal: 16, paddingTop: 16 },
  scrollContentDesktop: { paddingHorizontal: 20, paddingTop: 24 },
  noScrollContent: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  noScrollContentCompact: { paddingHorizontal: 16 },
  noScrollContentDesktop: {},
  inner: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
  },
  innerFlex: {
    flex: 1,
  },
  innerDesktop: {
    paddingHorizontal: 8,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.15,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 38,
    lineHeight: 41,
    fontWeight: '900',
    letterSpacing: -1.25,
    marginBottom: 13,
  },
  heroTitleMobile: {
    fontSize: 31,
    lineHeight: 34,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
  },
});
