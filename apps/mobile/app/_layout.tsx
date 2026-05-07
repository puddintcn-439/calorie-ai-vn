import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useAuthStore } from '../store/auth.store';

export default function RootLayout() {
  const { token, isLoading, loadToken } = useAuthStore();

  useEffect(() => {
    loadToken();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (token) {
        router.replace('/(tabs)/');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [token, isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
