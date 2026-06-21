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
import { useI18n } from '../../components/i18n';

const registerHeroImage = require('../../assets/images/profile-hero.jpg') as number;

export default function RegisterScreen() {
  useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 480;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();
  const { t } = useI18n();

  const handleRegister = async () => {
    const nextErrors: typeof errors = {};
    if (!fullName.trim()) nextErrors.fullName = t('auth.validation.fullNameRequired');
    if (!email.trim()) nextErrors.email = t('auth.validation.emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = t('auth.validation.emailInvalid');
    if (!password) nextErrors.password = t('auth.validation.passwordRequired');
    else if (password.length < 6) nextErrors.password = t('auth.validation.passwordShort');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
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
          label="auth.register.fullName.label"
          value={fullName}
          onChangeText={(value) => {
            setFullName(value);
            if (errors.fullName) setErrors((current) => ({ ...current, fullName: undefined }));
          }}
          placeholder="auth.register.fullName.placeholder"
          error={errors.fullName}
        />
        <UiInput
          label="auth.email.label"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
          }}
          placeholder="auth.email.placeholder"
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <UiInput
          label="auth.password.label"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
          }}
          placeholder="auth.register.password.placeholder"
          error={errors.password}
          secureTextEntry
        />

        <UiButton label="auth.register.submit" onPress={handleRegister} loading={loading} style={styles.submitBtn} />

        <UiButton label="auth.register.backToLogin" onPress={() => router.back()} variant="ghost" />
      </SurfaceCard>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii, spacing) => ({
  authScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.lg },
  centeredContent: { flex: 1, justifyContent: 'center', maxWidth: 560, alignSelf: 'center', width: '100%' },
  heroImage: {
    width: '100%',
    height: 150,
    borderRadius: radii.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  heroImageCompact: {
    height: 118,
    marginBottom: spacing.md,
  },
  heroBlock: { marginBottom: spacing.md },
  formCard: { width: '100%', padding: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: '900', marginBottom: spacing.xs },
  subtitle: { color: colors.textMuted, marginBottom: spacing.lg, fontSize: 14, lineHeight: 21 },
  submitBtn: { marginBottom: spacing.xs, marginTop: spacing.xs },
}));
