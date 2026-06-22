import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack, usePathname } from 'expo-router';
import { Text } from '../../components/i18n-text';
import { useAppTheme } from '../../components/theme';
import { useAuthStore } from '../../store/auth.store';

export default function AdminLayout() {
  const { colors } = useAppTheme();
  const pathname = usePathname();
  const token = useAuthStore((state) => state.token);
  const isLoading = useAuthStore((state) => state.isLoading);
  const loadToken = useAuthStore((state) => state.loadToken);
  const isLoginRoute = pathname === '/admin/login';

  useEffect(() => {
    loadToken().catch(() => {});
  }, [loadToken]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.bgTop }}>
        <ActivityIndicator color={colors.accentMint} />
        <Text style={{ color: colors.textMuted }}>Đang kiểm tra phiên admin...</Text>
      </View>
    );
  }

  if (!token && !isLoginRoute) {
    return <Redirect href="/admin/login" />;
  }

  if (token && isLoginRoute) {
    return <Redirect href="/admin" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
