import type { ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../components/theme';
import { AnimatedIonicon } from '../../components/animated-icon';
import { useI18n } from '../../components/i18n';
import { useAuthStore } from '../../store/auth.store';

type TabIconName = ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  name,
  color,
  size,
  focused,
  compact,
  desktop,
}: {
  name: TabIconName;
  color: ColorValue;
  size: number;
  focused: boolean;
  compact: boolean;
  desktop: boolean;
}) {
  const { colors } = useAppTheme();
  const iconColor = typeof color === 'string' ? color : colors.textMuted;
  return (
    <View style={[
      styles.tabIconWrap,
      compact && styles.tabIconWrapCompact,
      desktop && styles.tabIconWrapDesktop,
      focused && {
        backgroundColor: colors.accentMint,
        ...(Platform.OS === 'web' ? { boxShadow: `0 8px 18px ${colors.accentMint}42` } : null),
      },
    ]}>
      <AnimatedIonicon
        name={name}
        size={Math.max(18, size - 2)}
        color={focused ? colors.textOnAccent : iconColor}
        motion="float"
        active={focused}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isCompact = width < 480;
  const isDesktop = width >= 900;
  const desktopTabWidth = Math.min(600, width - 80);
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const { token, isLoading } = useAuthStore();
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;

  if (isLoading || !token) {
    return <View style={[styles.authGate, { backgroundColor: colors.bgTop }]} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: isDesktop ? Math.max(40, (width - desktopTabWidth) / 2) : isCompact ? 18 : 10,
          right: isDesktop ? 'auto' : isCompact ? 18 : 10,
          bottom: isDesktop ? 12 : isCompact ? 8 : 10,
          width: isDesktop ? desktopTabWidth : undefined,
          height: (isDesktop ? 52 : isCompact ? 70 : 66) + bottomInset,
          paddingTop: isDesktop ? 2 : isCompact ? 3 : 5,
          paddingBottom: (isDesktop ? 2 : isCompact ? 4 : 6) + bottomInset,
          paddingHorizontal: isDesktop ? 8 : 8,
          backgroundColor: colors.tabBar,
          borderColor: colors.borderSubtle,
          borderWidth: 1,
          borderRadius: isDesktop ? 22 : 26,
          ...(Platform.OS === 'web'
            ? {
                boxShadow: `0px 18px 42px ${colors.shadow}2b, inset 0 1px 0 rgba(255,255,255,.55)`,
                backdropFilter: 'blur(22px) saturate(1.25)',
              }
            : {
                shadowColor: colors.shadow,
                shadowOpacity: 0.22,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 14 },
              }),
          elevation: 10,
        },
        tabBarItemStyle: {
          paddingVertical: isDesktop ? 4 : isCompact ? 2 : 5,
        },
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: isCompact ? 10 : isDesktop ? 9 : 11,
          lineHeight: isCompact ? 12 : isDesktop ? 13 : 15,
          fontWeight: '800',
          letterSpacing: -0.15,
          paddingBottom: isCompact ? 0 : isDesktop ? 0 : 3,
        },
        tabBarActiveTintColor: colors.accentMint,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.today'),
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="home" size={size} color={color} focused={focused} compact={isCompact} desktop={isDesktop} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: t('tabs.log'),
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="list" size={size} color={color} focused={focused} compact={isCompact} desktop={isDesktop} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: t('tabs.scan'),
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="camera" size={size} color={color} focused={focused} compact={isCompact} desktop={isDesktop} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: t('tabs.coach'),
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="chatbubbles" size={size} color={color} focused={focused} compact={isCompact} desktop={isDesktop} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          href: null,
          title: t('tabs.body'),
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="body" size={size} color={color} focused={focused} compact={isCompact} desktop={isDesktop} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          href: null,
          title: t('tabs.insights'),
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="stats-chart" size={size} color={color} focused={focused} compact={isCompact} desktop={isDesktop} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="person" size={size} color={color} focused={focused} compact={isCompact} desktop={isDesktop} />,
        }}
      />
      <Tabs.Screen
        name="strength"
        options={{
          href: null,
          title: t('tabs.strength'),
        }}
      />
      <Tabs.Screen
        name="beta-analytics"
        options={{
          href: null,
          title: 'Beta Analytics',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  authGate: {
    flex: 1,
  },
  tabIconWrap: {
    width: 34,
    height: 29,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapCompact: {
    width: 32,
    height: 26,
  },
  tabIconWrapDesktop: {
    width: 30,
    height: 26,
  },
});
