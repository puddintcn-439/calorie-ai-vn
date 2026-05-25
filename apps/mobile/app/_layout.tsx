import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { useAuthStore } from '../store/auth.store';
import '../services/web-warning-filter';

export default function RootLayout() {
  const { token, isLoading, loadToken } = useAuthStore();
  const segments = useSegments();
  const inAuthGroup = segments[0] === '(auth)';

  useEffect(() => {
    loadToken();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (token && inAuthGroup) {
      router.replace('/');
      return;
    }
    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    }
  }, [token, isLoading, inAuthGroup]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="achievements" />
      <Stack.Screen name="health-sync" />
    </Stack>
  );
}
