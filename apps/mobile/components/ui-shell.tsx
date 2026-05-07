import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleProp, StyleSheet, Text, TextStyle, useWindowDimensions, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from './theme';

export function ScreenShell({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const fade = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, translate]);

  const content = (
    <Animated.View style={[styles.inner, isDesktop && styles.innerDesktop, contentStyle, { opacity: fade, transform: [{ translateY: translate }] }]}>
      {children}
    </Animated.View>
  );

  return (
    <LinearGradient colors={[theme.colors.bgTop, theme.colors.bgMid, theme.colors.bgBottom]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.blobTop} />
        <View style={styles.blobBottom} />
        {scroll ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {content}
          </ScrollView>
        ) : (
          <View style={styles.noScrollContent}>{content}</View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

export function SurfaceCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, scale]);

  return <Animated.View style={[styles.card, style, { opacity: fade, transform: [{ scale }] }]}>{children}</Animated.View>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function HeroTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.heroTitle}>{children}</Text>;
}

export function BodyText({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.bodyText, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  noScrollContent: { flex: 1, paddingHorizontal: 20 },
  inner: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  innerDesktop: {
    paddingHorizontal: 12,
  },
  blobTop: {
    position: 'absolute',
    top: -140,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#34d39922',
  },
  blobBottom: {
    position: 'absolute',
    bottom: -120,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#f9731620',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    shadowColor: '#020617',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  eyebrow: {
    color: theme.colors.accentCyan,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '700',
    marginBottom: 10,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    marginBottom: 8,
  },
  bodyText: {
    color: theme.colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
  },
});