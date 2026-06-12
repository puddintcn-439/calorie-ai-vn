import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createThemedStyles, theme, useAppTheme } from '../components/theme';
import { Text } from '../components/i18n-text';
import { useI18n } from '../components/i18n';
import {
  BillingCheckoutInterval,
  BillingCheckoutTier,
  BillingEntitlement,
  billingService,
} from '../services/billing.service';

type PaywallPlan = {
  tier: BillingCheckoutTier;
  interval: BillingCheckoutInterval;
  titleKey: string;
  cadenceKey: string;
  price: string;
  badgeKey?: string;
  featureKeys: string[];
};

type StatusMessage = {
  tone: 'info' | 'success' | 'error';
  text: string;
};

const PAYOS_PLANS: PaywallPlan[] = [
  {
    tier: 'premium',
    interval: 'monthly',
    titleKey: 'screen.paywall.plan.premiumMonthly.title',
    cadenceKey: 'screen.paywall.plan.monthly',
    price: '59.000đ',
    badgeKey: 'screen.paywall.plan.quickStart',
    featureKeys: [
      'screen.paywall.feature.aiCoach',
      'screen.paywall.feature.dailyInsights',
      'screen.paywall.feature.manualSearch',
    ],
  },
  {
    tier: 'premium',
    interval: 'annual',
    titleKey: 'screen.paywall.plan.premiumAnnual.title',
    cadenceKey: 'screen.paywall.plan.annual',
    price: '499.000đ',
    badgeKey: 'screen.paywall.plan.bestValue',
    featureKeys: [
      'screen.paywall.feature.aiCoach',
      'screen.paywall.feature.dailyInsights',
      'screen.paywall.feature.annualAccess',
    ],
  },
  {
    tier: 'pro',
    interval: 'monthly',
    titleKey: 'screen.paywall.plan.proMonthly.title',
    cadenceKey: 'screen.paywall.plan.monthly',
    price: '129.000đ',
    badgeKey: 'screen.paywall.plan.power',
    featureKeys: [
      'screen.paywall.feature.proCoaching',
      'screen.paywall.feature.healthSync',
      'screen.paywall.feature.prioritySupport',
    ],
  },
  {
    tier: 'pro',
    interval: 'annual',
    titleKey: 'screen.paywall.plan.proAnnual.title',
    cadenceKey: 'screen.paywall.plan.annual',
    price: '999.000đ',
    badgeKey: 'screen.paywall.plan.fullYear',
    featureKeys: [
      'screen.paywall.feature.proCoaching',
      'screen.paywall.feature.healthSync',
      'screen.paywall.feature.annualAccess',
    ],
  },
];

function getErrorMessage(error: unknown, fallback: string) {
  const maybeError = error as {
    response?: { data?: { message?: string | string[] } };
    message?: string;
  };
  const apiMessage = maybeError.response?.data?.message;
  if (Array.isArray(apiMessage)) return apiMessage.join(' ');
  return apiMessage ?? maybeError.message ?? fallback;
}

function formatActiveUntil(value: string | null | undefined, locale: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getPlanTestId(plan: PaywallPlan) {
  if (plan.interval === 'monthly') return `paywall-tier-${plan.tier}-button`;
  return `paywall-tier-${plan.tier}-${plan.interval}-button`;
}

export default function PaywallScreen() {
  useAppTheme();
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string; feature?: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 1000;
  const isTablet = width >= 760;

  const [checkoutLoadingKey, setCheckoutLoadingKey] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [lastOrderCode, setLastOrderCode] = useState<number | null>(null);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const activeUntilText = useMemo(
    () => formatActiveUntil(entitlement?.active_until, locale),
    [entitlement?.active_until, locale],
  );
  const hasActivePayosPlan = entitlement?.source === 'paid' && entitlement.provider === 'payos';

  const handleCreateCheckout = async (plan: PaywallPlan) => {
    const loadingKey = `${plan.tier}-${plan.interval}`;
    setCheckoutLoadingKey(loadingKey);
    setMessage(null);

    try {
      const checkout = await billingService.createPayosCheckout(plan.tier, plan.interval);
      if (!checkout.checkout_url) {
        setMessage({ tone: 'error', text: t('screen.paywall.error.missingCheckoutUrl') });
        return;
      }

      setLastOrderCode(checkout.order_code);
      setMessage({
        tone: 'info',
        text: t('screen.paywall.status.checkoutOpened', { orderCode: checkout.order_code }),
      });
      await Linking.openURL(checkout.checkout_url);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: getErrorMessage(error, t('screen.paywall.error.network')),
      });
    } finally {
      setCheckoutLoadingKey(null);
    }
  };

  const handleRefreshEntitlement = async () => {
    setStatusLoading(true);
    setMessage(null);

    try {
      const latest = await billingService.getEntitlement();
      setEntitlement(latest);

      if (latest.source === 'paid' && latest.provider === 'payos') {
        setMessage({
          tone: 'success',
          text: t('screen.paywall.status.active', {
            tier: latest.tier.toUpperCase(),
            activeUntil: formatActiveUntil(latest.active_until, locale),
          }),
        });
        return;
      }

      setMessage({
        tone: 'info',
        text: lastOrderCode
          ? t('screen.paywall.status.pendingWithOrder', { orderCode: lastOrderCode })
          : t('screen.paywall.status.pending'),
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: getErrorMessage(error, t('screen.paywall.error.network')),
      });
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.contentInner}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('screen.paywall.text.012')}
            testID="paywall-back-button"
          >
            <MaterialIcons name="arrow-back" size={20} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.eyebrow} i18nKey="screen.paywall.eyebrow" />
          <Text style={styles.title} i18nKey="screen.paywall.text.001" />
          <Text style={styles.subtitle} i18nKey="screen.paywall.text.002" />
          {params.feature ? (
            <Text style={styles.returnHint}>
              {params.feature === 'healthkit_sync'
                ? t('screen.paywall.return.health')
                : params.feature === 'ai_coach'
                  ? t('screen.paywall.return.coach')
                  : t('screen.paywall.return.generic')}
            </Text>
          ) : null}
        </View>

        <View style={styles.paymentNote}>
          {[
            'screen.paywall.copy.oneTime',
            'screen.paywall.copy.noRenewal',
            'screen.paywall.copy.webhookActivation',
          ].map((key) => (
            <View key={key} style={styles.noteRow}>
              <MaterialIcons name="check-circle" size={18} color={theme.colors.success} />
              <Text style={styles.noteText}>{t(key as any)}</Text>
            </View>
          ))}
        </View>

        <View
          style={[
            styles.plansGrid,
            isWide && styles.plansGridWide,
            !isWide && isTablet && styles.plansGridTablet,
          ]}
        >
          {PAYOS_PLANS.map((plan) => {
            const loadingKey = `${plan.tier}-${plan.interval}`;
            const isLoading = checkoutLoadingKey === loadingKey;

            return (
              <View
                key={loadingKey}
                style={[
                  styles.planCard,
                  isWide && styles.planCardWide,
                  !isWide && isTablet && styles.planCardTablet,
                  plan.tier === 'pro' && styles.proPlanCard,
                ]}
              >
                {plan.badgeKey ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t(plan.badgeKey as any)}</Text>
                  </View>
                ) : null}

                <View style={styles.planHeader}>
                  <Text style={styles.planTitle}>{t(plan.titleKey as any)}</Text>
                  <Text style={styles.planCadence}>{t(plan.cadenceKey as any)}</Text>
                </View>
                <Text style={styles.price}>{plan.price}</Text>

                <View style={styles.featuresList}>
                  {plan.featureKeys.map((featureKey) => (
                    <View key={featureKey} style={styles.featureRow}>
                      <MaterialIcons name="done" size={18} color={theme.colors.accentMint} />
                      <Text style={styles.featureText}>{t(featureKey as any)}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.buyButton, isLoading && styles.buttonDisabled]}
                  onPress={() => void handleCreateCheckout(plan)}
                  disabled={isLoading || checkoutLoadingKey !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t('screen.paywall.action.buyPlan', {
                    plan: t(plan.titleKey as any),
                    price: plan.price,
                  })}
                  accessibilityState={{ disabled: isLoading || checkoutLoadingKey !== null }}
                  testID={getPlanTestId(plan)}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={theme.colors.textOnAccent} />
                  ) : (
                    <>
                      <MaterialIcons name="open-in-new" size={18} color={theme.colors.textOnAccent} />
                      <Text style={styles.buyButtonText} i18nKey="screen.paywall.action.buyWithPayos" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View>
              <Text style={styles.statusTitle} i18nKey="screen.paywall.status.title" />
              <Text style={styles.statusBody} i18nKey="screen.paywall.status.body" />
            </View>
            <TouchableOpacity
              style={[styles.statusButton, statusLoading && styles.buttonDisabled]}
              onPress={() => void handleRefreshEntitlement()}
              disabled={statusLoading}
              accessibilityRole="button"
              accessibilityState={{ disabled: statusLoading }}
              testID="paywall-check-status-button"
            >
              {statusLoading ? (
                <ActivityIndicator size="small" color={theme.colors.textOnAccent} />
              ) : (
                <>
                  <MaterialIcons name="refresh" size={18} color={theme.colors.textOnAccent} />
                  <Text style={styles.statusButtonText} i18nKey="screen.paywall.action.checkStatus" />
                </>
              )}
            </TouchableOpacity>
          </View>

          {hasActivePayosPlan ? (
            <View style={styles.activePlan}>
              <MaterialIcons name="verified" size={22} color={theme.colors.success} />
              <View style={styles.activePlanTextGroup}>
                <Text style={styles.activePlanTitle}>
                  {t('screen.paywall.status.activeTier', { tier: entitlement.tier.toUpperCase() })}
                </Text>
                <Text style={styles.activePlanBody}>
                  {activeUntilText
                    ? t('screen.paywall.status.activeUntil', { activeUntil: activeUntilText })
                    : t('screen.paywall.status.activeNoDate')}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.pendingPlan}>
              <MaterialIcons name="hourglass-empty" size={22} color={theme.colors.warning} />
              <Text style={styles.pendingText} i18nKey="screen.paywall.status.waitingWebhook" />
            </View>
          )}
        </View>

        {message ? (
          <View
            style={[
              styles.messageBanner,
              message.tone === 'success' && styles.messageSuccess,
              message.tone === 'error' && styles.messageError,
            ]}
          >
            <MaterialIcons
              name={message.tone === 'success' ? 'check-circle' : message.tone === 'error' ? 'error' : 'info'}
              size={20}
              color={message.tone === 'success' ? theme.colors.success : message.tone === 'error' ? theme.colors.danger : theme.colors.info}
            />
            <Text
              style={[
                styles.messageText,
                message.tone === 'success' && styles.messageSuccessText,
                message.tone === 'error' && styles.messageErrorText,
              ]}
            >
              {message.text}
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  container: {
    flex: 1,
    backgroundColor: colors.bgBottom,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: 'center',
  },
  contentInner: {
    width: '100%',
    maxWidth: 1080,
  },
  header: {
    marginBottom: 18,
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accentCyan,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSoft,
    textAlign: 'center',
    maxWidth: 620,
  },
  returnHint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.accentMint,
    textAlign: 'center',
    fontWeight: '800',
    marginTop: 10,
    maxWidth: 620,
  },
  paymentNote: {
    backgroundColor: colors.surfaceInfo,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    padding: 14,
    gap: 10,
    marginBottom: 18,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noteText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  plansGrid: {
    gap: 14,
    marginBottom: 18,
  },
  plansGridWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  plansGridTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  planCardWide: {
    flex: 1,
    minWidth: 0,
  },
  planCardTablet: {
    width: '48.8%',
  },
  proPlanCard: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceLifted,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceWarning,
    borderColor: colors.borderWarning,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '800',
  },
  planHeader: {
    gap: 4,
  },
  planTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  planCadence: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  price: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  featuresList: {
    gap: 9,
    flexGrow: 1,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  featureText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  buyButton: {
    minHeight: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  buyButtonText: {
    color: colors.textOnAccent,
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
    gap: 14,
  },
  statusHeader: {
    gap: 14,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 5,
  },
  statusBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  statusButton: {
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.accentCyan,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  statusButtonText: {
    color: colors.textOnDanger,
    fontSize: 14,
    fontWeight: '800',
  },
  activePlan: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 12,
  },
  activePlanTextGroup: {
    flex: 1,
    gap: 3,
  },
  activePlanTitle: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '800',
  },
  activePlanBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  pendingPlan: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: colors.surfaceWarning,
    borderColor: colors.borderWarning,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 12,
  },
  pendingText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  messageBanner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceInfo,
    borderColor: colors.borderInfo,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 12,
  },
  messageSuccess: {
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
  },
  messageError: {
    backgroundColor: colors.surfaceDanger,
    borderColor: colors.borderDanger,
  },
  messageText: {
    flex: 1,
    color: colors.info,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  messageSuccessText: {
    color: colors.success,
  },
  messageErrorText: {
    color: colors.danger,
  },
}));
