import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { theme } from '../../components/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 10,
          height: 70,
          paddingTop: 8,
          backgroundColor: '#101b29f4',
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          borderRadius: 8,
          ...(Platform.OS === 'web'
            ? { boxShadow: '0px 8px 14px rgba(2, 6, 23, 0.22)' }
            : {
                shadowColor: '#020617',
                shadowOpacity: 0.18,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 8 },
              }),
          elevation: 6,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          paddingBottom: 4,
        },
        tabBarActiveTintColor: theme.colors.accentMint,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hôm nay',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, size }) => <Ionicons name="camera" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          href: null,
          title: 'Cơ thể',
          tabBarIcon: ({ color, size }) => <Ionicons name="body" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          href: null,
          title: 'Insight',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Hồ sơ',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="strength"
        options={{
          href: null,
          title: 'Tập tạ',
        }}
      />
    </Tabs>
  );
}
