import React, { useState } from 'react';
import {
  View,
  StyleSheet
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiInput } from '../../components/ui-input';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';

export default function RegisterScreen() {
  useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();

  const handleRegister = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      await register(email, password, fullName);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell scroll={false} contentStyle={styles.centeredContent}>
      <View style={styles.heroBlock}>
        <Eyebrow>Build Your Nutrition Loop</Eyebrow>
        <HeroTitle>Tạo tài khoản để bắt đầu hành trình đẹp dáng bền vững.</HeroTitle>
        <BodyText>
          Bạn không cần siết cực đoan. App giúp bạn theo dõi nhẹ nhàng, điều chỉnh thực tế và giữ động lực đều đặn.
        </BodyText>
      </View>

      <SurfaceCard style={styles.formCard}>
        <Text style={styles.sectionTitle}>Tạo tài khoản</Text>
        <Text style={styles.subtitle}>Chỉ vài giây để bắt đầu cảm thấy kiểm soát tốt hơn mỗi ngày.</Text>

        <UiInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Họ và tên (tuỳ chọn)"
        />
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
          placeholder="Mật khẩu (tối thiểu 6 ký tự)"
          secureTextEntry
        />

        <UiButton label="Tạo tài khoản" onPress={handleRegister} loading={loading} style={styles.submitBtn} />

        <UiButton label="Đã có tài khoản? Quay về đăng nhập" onPress={() => router.back()} variant="ghost" />
      </SurfaceCard>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  centeredContent: { flex: 1, justifyContent: 'center', maxWidth: 560, alignSelf: 'center', width: '100%' },
  heroBlock: { marginBottom: 18, paddingHorizontal: 4 },
  formCard: { width: '100%', padding: 20 },
  sectionTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: colors.textMuted, marginBottom: 20, fontSize: 14, lineHeight: 21 },
  submitBtn: { marginBottom: 8, marginTop: 4 },
}));

