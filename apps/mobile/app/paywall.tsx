import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSubscriptionStore } from '../store/subscription.store';
import { SUBSCRIPTION_TIERS, SubscriptionTier } from '@calorie-ai/types';
import { createThemedStyles, theme, useAppTheme } from '../components/theme';
import { Text } from '../components/i18n-text';
import { Alert } from '../components/i18n-alert';
import { useI18n } from '../components/i18n';
import { toFiniteNumber } from '../services/number-format';

function formatPrice(value: unknown, freeLabel: string): string {
  const price = toFiniteNumber(value);
  if (price === null || price <= 0) return freeLabel;
  return `$${price.toFixed(2)}`;
}

const FEATURE_KEYS = [
  'manual_food_search',
  'barcode_scanning',
  'daily_insights',
  'meal_reminders',
  'ai_coach',
  'weekly_reports',
  'correction_tracking',
  'healthkit_sync',
  'priority_support',
] as const;

export default function PaywallScreen() {
  useAppTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { subscription, isLoading, error, changeTier } = useSubscriptionStore();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const { width } = useWindowDimensions();
  const isWide = width >= 1120;
  const isTablet = width >= 820;

  useEffect(() => {
    useSubscriptionStore.getState().fetchSubscription();
  }, []);

  const handleChangeTier = async (tier: SubscriptionTier) => {
    try {
      await changeTier(tier);
      Alert.alert('screen.paywall.alert.001', t('screen.paywall.alert.updatedBody', { tier: SUBSCRIPTION_TIERS[tier].name }));
      router.back();
    } catch (err: any) {
      Alert.alert('screen.paywall.alert.002', err?.response?.data?.message ?? err?.message ?? 'screen.paywall.alert.003');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.accentMint} />
      </View>
    );
  }

  const currentTier = subscription?.tier ?? 'free';
  const tiers = ['free', 'premium', 'pro'] as const;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.contentInner}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} i18nKey="screen.paywall.text.001" />
        <Text style={styles.subtitle} i18nKey="screen.paywall.text.002" />
      </View>

      {/* Billing Toggle */}
      <View style={styles.billingToggle}>
        <TouchableOpacity
          style={[styles.billingOption, billingCycle === 'monthly' && styles.activeOption]}
          onPress={() => setBillingCycle('monthly')}
        >
          <Text style={[styles.billingText, billingCycle === 'monthly' && styles.activeText]}>
            {t('screen.paywall.billing.monthly')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.billingOption, billingCycle === 'yearly' && styles.activeOption]}
          onPress={() => setBillingCycle('yearly')}
        >
          <Text style={[styles.billingText, billingCycle === 'yearly' && styles.activeText]}>
            {t('screen.paywall.billing.yearly')}
          </Text>
          <Text style={styles.savingsBadge} i18nKey="screen.paywall.text.003" />
        </TouchableOpacity>
      </View>

      {/* Tier Cards */}
      <View
        style={[
          styles.tiersContainer,
          isWide && styles.tiersWide,
          !isWide && isTablet && styles.tiersTablet,
        ]}
      >
        {tiers.map((tier) => {
          const tierInfo = SUBSCRIPTION_TIERS[tier];
          const price = toFiniteNumber(billingCycle === 'monthly' ? tierInfo.price_usd_monthly : tierInfo.price_usd_yearly) ?? 0;
          const isCurrentTier = currentTier === tier;
          const isPopular = tierInfo.tag === 'Most Popular';

          return (
            <View
              key={tier}
              style={[
                styles.tierCard,
                isWide && styles.tierCardWide,
                !isWide && isTablet && styles.tierCardTablet,
                !isWide && isTablet && tier === 'pro' && styles.tierCardTabletFull,
                isCurrentTier && styles.currentTierCard,
                isPopular && styles.popularTierCard,
              ]}
            >
              {isPopular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText} i18nKey="screen.paywall.text.004" />
                </View>
              )}

              <Text style={styles.tierName}>{tierInfo.name}</Text>
              <Text style={styles.tierDescription}>{tierInfo.description}</Text>

              <View style={styles.priceContainer}>
                <Text style={styles.price}>
                  {formatPrice(price, t('screen.paywall.price.free'))}
                </Text>
                {price > 0 && (
                  <Text style={styles.billingPeriod}>
                    {billingCycle === 'monthly' ? t('screen.paywall.billing.period.month') : t('screen.paywall.billing.period.year')}
                  </Text>
                )}
              </View>

              {/* Features List */}
              <View style={styles.featuresList}>
                {FEATURE_KEYS.map((key) => {
                  const hasFeature = tierInfo.features[key as keyof typeof tierInfo.features];
                  return (
                    <View key={key} style={styles.featureRow}>
                      <MaterialIcons
                        name={hasFeature ? 'check-circle' : 'cancel'}
                        size={18}
                        color={hasFeature ? theme.colors.accentMint : theme.colors.textMuted}
                      />
                      <Text style={[styles.featureText, !hasFeature && styles.featureDisabled]}>
                        {t(`screen.paywall.feature.${key}` as any)}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Action Button */}
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  isCurrentTier && styles.currentButton,
                ]}
                onPress={() => void handleChangeTier(tier)}
                disabled={isCurrentTier}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    isCurrentTier && styles.currentButtonText,
                  ]}
                >
                  {isCurrentTier
                    ? t('screen.paywall.action.current')
                    : tier === 'free'
                      ? t('screen.paywall.action.free')
                      : t('screen.paywall.action.apply')}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* FAQ Section */}
      <View style={styles.faqSection}>
        <Text style={styles.faqTitle} i18nKey="screen.paywall.text.005" />
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion} i18nKey="screen.paywall.text.006" />
          <Text style={styles.faqAnswer} i18nKey="screen.paywall.text.007" />
        </View>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion} i18nKey="screen.paywall.text.008" />
          <Text style={styles.faqAnswer} i18nKey="screen.paywall.text.009" />
        </View>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion} i18nKey="screen.paywall.text.010" />
          <Text style={styles.faqAnswer} i18nKey="screen.paywall.text.011" />
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error" size={20} color={theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.footerLink} i18nKey="screen.paywall.text.012" />
        </TouchableOpacity>
      </View>
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
    marginBottom: 24,
    alignItems: 'center',
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
    maxWidth: 560,
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  billingOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeOption: {
    backgroundColor: colors.surfaceWarm,
  },
  billingText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  activeText: {
    color: colors.text,
  },
  savingsBadge: {
    fontSize: 12,
    color: colors.accentMint,
    fontWeight: '600',
    marginTop: 4,
  },
  tiersContainer: {
    marginBottom: 32,
    gap: 14,
  },
  tiersWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tiersTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tierCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tierCardWide: {
    flex: 1,
    minWidth: 0,
  },
  tierCardTablet: {
    width: '48.8%',
  },
  tierCardTabletFull: {
    width: '100%',
  },
  currentTierCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.accentCyan,
  },
  popularTierCard: {
    borderColor: colors.accentCoral,
    backgroundColor: colors.surfaceWarning,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    left: 20,
    backgroundColor: colors.accentCoral,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.lg,
  },
  popularBadgeText: {
    color: colors.textOnAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  tierName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  tierDescription: {
    fontSize: 14,
    color: colors.textSoft,
    marginBottom: 16,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  price: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
  },
  billingPeriod: {
    fontSize: 14,
    color: colors.textMuted,
    marginLeft: 4,
  },
  featuresList: {
    marginBottom: 20,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: colors.textSoft,
    fontWeight: '500',
  },
  featureDisabled: {
    color: colors.textMuted,
  },
  actionButton: {
    backgroundColor: colors.accentMint,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentButton: {
    backgroundColor: colors.surfaceAlt,
  },
  actionButtonText: {
    color: colors.textOnAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  currentButtonText: {
    color: colors.textMuted,
  },
  faqSection: {
    marginBottom: 24,
  },
  faqTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  faqItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  faqQuestion: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  faqAnswer: {
    fontSize: 13,
    color: colors.textSoft,
    lineHeight: 20,
  },
  errorBanner: {
    backgroundColor: colors.surfaceDanger,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: colors.danger,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLink: {
    fontSize: 14,
    color: colors.accentMint,
    fontWeight: '600',
  },
}));


