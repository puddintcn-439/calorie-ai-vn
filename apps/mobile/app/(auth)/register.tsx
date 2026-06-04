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

const registerHeroImage = require('../../assets/images/profile-hero.jpg') as number;

export default function RegisterScreen() {
  useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 480;
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
      Alert.alert('common.error', e?.response?.data?.message ?? 'auth.register.failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell contentStyle={styles.centeredContent} scrollContentStyle={styles.authScrollContent}>
      <Image source={registerHeroImage} resizeMode="cover" style={[styles.heroImage, isCompact && styles.heroImageCompact]} />
      <View style={styles.heroBlock}>
        <Eyebrow>auth.register.eyebrow</Eyebrow>
        <HeroTitle>auth.register.title</HeroTitle>
        <BodyText>auth.register.body</BodyText>
      </View>

      <SurfaceCard style={styles.formCard}>
        <Text style={styles.sectionTitle} i18nKey="auth.register.formTitle" />
        <Text style={styles.subtitle} i18nKey="auth.register.subtitle" />

        <UiInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="auth.register.fullName.placeholder"
        />
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
          placeholder="auth.register.password.placeholder"
          secureTextEntry
        />

        <UiButton label="auth.register.submit" onPress={handleRegister} loading={loading} style={styles.submitBtn} />

        <UiButton label="auth.register.backToLogin" onPress={() => router.back()} variant="ghost" />
      </SurfaceCard>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  authScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 18 },
  centeredContent: { flex: 1, justifyContent: 'center', maxWidth: 560, alignSelf: 'center', width: '100%' },
  heroImage: {
    width: '100%',
    height: 150,
    borderRadius: radii.xl,
    marginBottom: 18,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  heroImageCompact: {
    height: 118,
    marginBottom: 14,
  },
  heroBlock: { marginBottom: 16, paddingHorizontal: 2 },
  formCard: { width: '100%', padding: 22 },
  sectionTitle: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: '900', marginBottom: 6 },
  subtitle: { color: colors.textMuted, marginBottom: 22, fontSize: 14, lineHeight: 21 },
  submitBtn: { marginBottom: 10, marginTop: 6 },
}));
