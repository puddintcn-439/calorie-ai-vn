import React, { useState } from 'react';
import { Image, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiInput } from '../../components/ui-input';
import { createThemedStyles, useAppTheme } from '../../components/theme';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';

const loginHeroImage = require('../../assets/images/scan-hero.jpg') as number;

export default function LoginScreen() {
  useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 480;
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
      Alert.alert('common.error', e?.response?.data?.message ?? 'auth.login.failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell scroll={false} contentStyle={styles.centeredContent}>
      <Image source={loginHeroImage} resizeMode="cover" style={[styles.heroImage, isCompact && styles.heroImageCompact]} />
      <View style={styles.heroBlock}>
        <Eyebrow>auth.login.eyebrow</Eyebrow>
        <HeroTitle>auth.login.title</HeroTitle>
        <BodyText>auth.login.body</BodyText>
        <View style={styles.badgeRow}>
          <View style={styles.badge}><Text style={styles.badgeText} i18nKey="auth.login.photoScan" /></View>
          <View style={styles.badge}><Text style={styles.badgeText} i18nKey="auth.login.vietnameseFood" /></View>
          <View style={styles.badge}><Text style={styles.badgeText} i18nKey="auth.login.aiCoach" /></View>
        </View>
      </View>

      <SurfaceCard style={styles.formCard}>
        <Text style={styles.sectionTitle} i18nKey="auth.login.formTitle" />
        <Text style={styles.subtitle} i18nKey="auth.login.subtitle" />

        <UiInput
          value={email}
          onChangeText={setEmail}
          placeholder="auth.email.placeholder"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <UiInput
          value={password}
          onChangeText={setPassword}
          placeholder="auth.password.placeholder"
          secureTextEntry
        />

        <UiButton label="auth.login.submit" onPress={handleLogin} loading={loading} style={styles.submitBtn} />

        <UiButton label="auth.login.createAccount" onPress={() => router.push('/(auth)/register')} variant="ghost" />
      </SurfaceCard>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  centeredContent: { flex: 1, justifyContent: 'center', maxWidth: 560, alignSelf: 'center', width: '100%' },
  heroImage: {
    width: '100%',
    height: 132,
    borderRadius: radii.xl,
    marginBottom: 14,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  heroImageCompact: {
    height: 112,
    borderRadius: radii.lg,
    marginBottom: 12,
  },
  heroBlock: { marginBottom: 14, paddingHorizontal: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  badge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  badgeText: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  formCard: { width: '100%', padding: 20 },
  sectionTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: colors.textMuted, marginBottom: 20, fontSize: 14, lineHeight: 21 },
  submitBtn: { marginBottom: 8, marginTop: 4 },
}));
