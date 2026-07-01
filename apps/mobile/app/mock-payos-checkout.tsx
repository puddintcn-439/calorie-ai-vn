import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  BodyText,
  Eyebrow,
  HeroTitle,
  ScreenShell,
  SurfaceCard,
} from '../components/ui-shell';
import { UiButton } from '../components/ui-button';
import { Text } from '../components/i18n-text';
import { useI18n } from '../components/i18n';
import { createThemedStyles, useAppTheme } from '../components/theme';

export default function MockPayosCheckoutScreen() {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const params = useLocalSearchParams<{
    provider?: string;
    tier?: string;
    interval?: string;
    orderCode?: string;
  }>();

  const tier = params.tier === 'pro' ? 'Pro' : 'Premium';
  const interval = params.interval === 'annual'
    ? t('mockPayos.interval.annual')
    : t('mockPayos.interval.monthly');
  const orderCode = typeof params.orderCode === 'string' ? params.orderCode : '—';

  const returnToPaywall = (cancelled = false) => {
    router.replace({
      pathname: '/paywall',
      params: {
        returnTo: '/profile',
        orderCode,
        ...(cancelled ? { cancel: 'true' } : {}),
      },
    } as never);
  };

  return (
    <ScreenShell reserveBottomNav={false}>
      <TouchableOpacity
        style={styles.backLink}
        onPress={() => returnToPaywall(true)}
        accessibilityRole="button"
        accessibilityLabel={t('common.goBack')}
      >
        <MaterialIcons name="arrow-back" size={19} color={colors.textSoft} />
        <Text style={styles.backText} i18nKey="common.goBack" />
      </TouchableOpacity>

      <Eyebrow>mockPayos.eyebrow</Eyebrow>
      <HeroTitle>mockPayos.title</HeroTitle>
      <BodyText style={styles.heroBody}>mockPayos.body</BodyText>

      <SurfaceCard style={styles.noticeCard}>
        <View style={styles.noticeIcon}>
          <MaterialIcons name="science" size={24} color={colors.warning} />
        </View>
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle} i18nKey="mockPayos.notice.title" />
          <Text style={styles.noticeBody} i18nKey="mockPayos.notice.body" />
        </View>
      </SurfaceCard>

      <SurfaceCard style={styles.orderCard}>
        <Text style={styles.sectionLabel} i18nKey="mockPayos.order.label" />
        <View style={styles.planRow}>
          <View>
            <Text style={styles.planName}>{tier}</Text>
            <Text style={styles.planInterval}>{interval}</Text>
          </View>
          <View style={styles.providerBadge}>
            <Text style={styles.providerText}>PayOS · Mock</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.orderRow}>
          <Text style={styles.orderLabel} i18nKey="mockPayos.order.code" />
          <Text style={styles.orderValue}>{orderCode}</Text>
        </View>
        <View style={styles.orderRow}>
          <Text style={styles.orderLabel} i18nKey="mockPayos.order.status" />
          <Text style={styles.pendingText} i18nKey="mockPayos.order.pending" />
        </View>
      </SurfaceCard>

      <UiButton
        label="mockPayos.action.return"
        onPress={() => returnToPaywall(false)}
        style={styles.primaryAction}
      />
      <TouchableOpacity
        style={styles.cancelAction}
        onPress={() => returnToPaywall(true)}
        accessibilityRole="button"
      >
        <Text style={styles.cancelText} i18nKey="mockPayos.action.cancel" />
      </TouchableOpacity>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  backLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  backText: { color: colors.textSoft, fontSize: 13, fontWeight: '800' },
  heroBody: { maxWidth: 680, marginBottom: 20 },
  noticeCard: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  noticeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  noticeBody: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  orderCard: { marginBottom: 14, borderColor: colors.borderInfo },
  sectionLabel: {
    color: colors.accentCyan,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  planName: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  planInterval: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  providerBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.surfaceInfo,
  },
  providerText: { color: colors.info, fontSize: 11, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.borderSubtle, marginVertical: 16 },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 9,
  },
  orderLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  orderValue: { color: colors.text, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pendingText: { color: colors.warning, fontSize: 12, fontWeight: '900' },
  primaryAction: { marginTop: 2 },
  cancelAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  cancelText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
}));
