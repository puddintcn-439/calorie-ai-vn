import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
import { adminService } from '../../services/admin.service';
import { useAuthStore } from '../../store/auth.store';

function getLoginError(error: any) {
  const status = Number(error?.response?.status ?? 0);
  if (status === 401) return 'Email hoặc mật khẩu không đúng.';
  if (status === 403) return 'Tài khoản này không có quyền admin.';
  return 'Không thể đăng nhập admin lúc này. Vui lòng thử lại.';
}

export default function AdminLoginScreen() {
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      await adminService.fetchOverview();
      router.replace('/admin' as any);
    } catch (err: any) {
      await logout().catch(() => {});
      setError(getLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell scroll scrollContentStyle={styles.scrollContent} reserveBottomNav={false}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
        <Text style={styles.title}>Đăng nhập Admin</Text>
        <Text style={styles.subtitle}>Chỉ dành cho quản trị viên. Backend sẽ kiểm tra quyền admin trước khi mở console.</Text>
      </View>

      <SurfaceCard style={styles.card}>
        <Text style={styles.label}>Email admin</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="admin@example.com"
          placeholderTextColor={theme.colors.textDisabled}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
        />

        <Text style={styles.label}>Mật khẩu</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={theme.colors.textDisabled}
          secureTextEntry
          style={styles.input}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={[styles.button, !canSubmit && styles.buttonDisabled]} disabled={!canSubmit} onPress={submit}>
          {loading ? <ActivityIndicator color={theme.colors.textOnAccent} /> : <Text style={styles.buttonText}>Đăng nhập Admin</Text>}
        </TouchableOpacity>

        <Text style={styles.note}>Nếu tài khoản không nằm trong danh sách admin, phiên đăng nhập sẽ bị hủy và không thể truy cập khu vực quản trị.</Text>
      </SurfaceCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, justifyContent: 'center', gap: 18, maxWidth: 520, alignSelf: 'center', width: '100%' },
  header: { gap: 10 },
  eyebrow: { color: theme.colors.accentCyan, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  title: { color: theme.colors.text, fontSize: 32, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 },
  card: { gap: 12 },
  label: { color: theme.colors.textSoft, fontSize: 13, fontWeight: '800' },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceLifted,
    color: theme.colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  button: { marginTop: 8, borderRadius: 14, backgroundColor: theme.colors.accentMint, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  error: { color: theme.colors.danger, fontWeight: '800' },
  note: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
