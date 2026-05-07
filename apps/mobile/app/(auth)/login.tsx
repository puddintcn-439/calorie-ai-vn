import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiInput } from '../../components/ui-input';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell scroll={false} contentStyle={styles.centeredContent}>
      <View style={styles.heroBlock}>
        <Eyebrow>Vietnamese AI Nutrition</Eyebrow>
        <HeroTitle>Calorie tracking mượt, đủ đẹp để dùng mỗi ngày.</HeroTitle>
        <BodyText>
          Scan món ăn, tính calo, theo dõi macro và lưu nhật ký trong một flow nhanh, thân thiện, ít thao tác.
        </BodyText>
        <View style={styles.badgeRow}>
          <View style={styles.badge}><Text style={styles.badgeText}>Scan ảnh</Text></View>
          <View style={styles.badge}><Text style={styles.badgeText}>Món Việt</Text></View>
          <View style={styles.badge}><Text style={styles.badgeText}>AI Coach</Text></View>
        </View>
      </View>

      <SurfaceCard style={styles.formCard}>
        <Text style={styles.sectionTitle}>Đăng nhập</Text>
        <Text style={styles.subtitle}>Tiếp tục hành trình ăn uống thông minh của bạn.</Text>

        <UiInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <UiInput
          value={password}
          onChangeText={setPassword}
          placeholder="Mật khẩu"
          secureTextEntry
        />

        <UiButton label="Đăng nhập" onPress={handleLogin} loading={loading} style={styles.submitBtn} />

        <UiButton label="Chưa có tài khoản? Tạo tài khoản" onPress={() => router.push('/(auth)/register')} variant="ghost" />
      </SurfaceCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  centeredContent: { flex: 1, justifyContent: 'center', maxWidth: 560, alignSelf: 'center', width: '100%' },
  heroBlock: { marginBottom: 18, paddingHorizontal: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  badge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#122041', borderWidth: 1, borderColor: '#233a71' },
  badgeText: { color: '#d7e5ff', fontSize: 12, fontWeight: '700' },
  formCard: { width: '100%', padding: 20 },
  sectionTitle: { color: '#eff6ff', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#94a3b8', marginBottom: 20, fontSize: 14, lineHeight: 21 },
  submitBtn: { marginBottom: 8, marginTop: 4 },
});
