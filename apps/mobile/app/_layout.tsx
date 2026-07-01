import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { useAuthStore } from '../store/auth.store';
import { pushNotificationService } from '../services/push-notification.service';
import { reminderFeedbackService } from '../services/reminder-feedback.service';
import '../services/web-warning-filter';

export default function RootLayout() {
  const { token, isLoading, loadToken } = useAuthStore();
  const segments = useSegments();
  const inAuthGroup = segments[0] === '(auth)';
  const inAdminGroup = segments[0] === 'admin';

  useEffect(() => {
    loadToken();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (token && inAuthGroup) {
      router.replace('/');
      return;
    }
    if (!token && !inAuthGroup && !inAdminGroup) {
      router.replace('/(auth)/login');
    }
  }, [token, isLoading, inAuthGroup, inAdminGroup]);

  useEffect(() => {
    if (!token) return undefined;

    const subscription = pushNotificationService.onNotificationResponse(async (response) => {
      const data = response.notification.request.content.data ?? {};
      const context = await reminderFeedbackService.recordOpenedFromNotificationData(data as Record<string, unknown>);
      const route = context?.route ?? (typeof data.route === 'string' ? data.route : null);
      if (route) {
        router.push(route as any);
      }
    });

    return () => subscription.remove();
  }, [token]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="paywall" />
      <Stack.Screen name="achievements" />
      <Stack.Screen name="health-sync" />
      <Stack.Screen name="body-composition" />
      <Stack.Screen name="mock-payos-checkout" />
      <Stack.Screen name="privacy-data" />
      <Stack.Screen name="help" />
    </Stack>
  );
}
