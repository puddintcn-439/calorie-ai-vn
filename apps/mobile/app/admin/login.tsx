import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { Text } from '../../components/i18n-text';
import { useAppTheme } from '../../components/theme';
import { adminService } from '../../services/admin.service';
import { useAuthStore } from '../../store/auth.store';

function getLoginError(error: any) {
  const status = Number(error?.response?.status ?? 0);
  if (status === 401) return 'Email or password is incorrect.';
  if (status === 403) return 'This account does not have admin access.';
  return 'Could not sign in to Admin Console right now. Please try again.';
}

export default function AdminLoginScreen() {
  const { colors } = useAppTheme();
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
      <SurfaceCard style={styles.card}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>C</Text>
            </View>
            <View>
              <Text style={styles.eyebrow}>Calorie AI</Text>
              <Text style={styles.brandMeta}>Internal admin tools</Text>
            </View>
          </View>
          <Text style={styles.title}>Sign in to Admin Console</Text>
          <Text style={styles.subtitle}>Use an admin account. Access is verified again by the backend before opening operational screens.</Text>
        </View>

        <Text style={styles.label}>Admin email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="admin@example.com"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="********"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          style={styles.input}
        />

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <TouchableOpacity style={[styles.button, !canSubmit && styles.buttonDisabled]} disabled={!canSubmit} onPress={submit}>
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </TouchableOpacity>

        <Text style={styles.note}>Non-admin sessions are rejected and cleared automatically.</Text>
      </SurfaceCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, justifyContent: 'center', gap: 18, maxWidth: 460, alignSelf: 'center', width: '100%' },
  card: { gap: 12, borderRadius: 10, borderColor: '#e5e7eb', backgroundColor: '#ffffff' },
  header: { gap: 11, paddingBottom: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  eyebrow: { color: '#0f172a', fontSize: 14, fontWeight: '800' },
  brandMeta: { color: '#64748b', fontSize: 12, fontWeight: '600', marginTop: 1 },
  title: { color: '#0f172a', fontSize: 26, lineHeight: 32, fontWeight: '800' },
  subtitle: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  label: { color: '#334155', fontSize: 13, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#d7dce3',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  button: { marginTop: 8, borderRadius: 7, backgroundColor: '#0f172a', paddingVertical: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#ffffff', fontWeight: '800' },
  error: { fontWeight: '800' },
  note: { color: '#64748b', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
