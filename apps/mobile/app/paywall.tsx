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

export default function PaywallScreen() {
  useAppTheme();
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
      Alert.alert('Đã cập nhật', `Bạn đang dùng gói ${SUBSCRIPTION_TIERS[tier].name}.`);
      router.back();
    } catch (err: any) {
      Alert.alert('Không cập nhật được', err?.response?.data?.message ?? err?.message ?? 'Vui lòng thử lại sau');
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
        <Text style={styles.title}>Nâng cấp trải nghiệm theo dõi</Text>
        <Text style={styles.subtitle}>Log nhanh hơn, nhận insight rõ hơn và đồng bộ sức khỏe khi bạn cần.</Text>
      </View>

      {/* Billing Toggle */}
      <View style={styles.billingToggle}>
        <TouchableOpacity
          style={[styles.billingOption, billingCycle === 'monthly' && styles.activeOption]}
          onPress={() => setBillingCycle('monthly')}
        >
          <Text style={[styles.billingText, billingCycle === 'monthly' && styles.activeText]}>
            Hàng tháng
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.billingOption, billingCycle === 'yearly' && styles.activeOption]}
          onPress={() => setBillingCycle('yearly')}
        >
          <Text style={[styles.billingText, billingCycle === 'yearly' && styles.activeText]}>
            Hàng năm
          </Text>
          <Text style={styles.savingsBadge}>Tiết kiệm 33%</Text>
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
          const price = billingCycle === 'monthly' ? tierInfo.price_usd_monthly : tierInfo.price_usd_yearly;
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
                  <Text style={styles.popularBadgeText}>Phổ biến nhất</Text>
                </View>
              )}

              <Text style={styles.tierName}>{tierInfo.name}</Text>
              <Text style={styles.tierDescription}>{tierInfo.description}</Text>

              <View style={styles.priceContainer}>
                <Text style={styles.price}>
                  {price === 0 ? 'Miễn phí' : `$${price.toFixed(2)}`}
                </Text>
                {price > 0 && (
                  <Text style={styles.billingPeriod}>
                    /{billingCycle === 'monthly' ? 'tháng' : 'năm'}
                  </Text>
                )}
              </View>

              {/* Features List */}
              <View style={styles.featuresList}>
                {[
                  { key: 'manual_food_search', label: 'Tìm kiếm thủ công' },
                  { key: 'barcode_scanning', label: 'Quét mã vạch' },
                  { key: 'daily_insights', label: 'Thông tin chi tiết hàng ngày' },
                  { key: 'meal_reminders', label: 'Nhắc nhở ăn uống' },
                  { key: 'ai_coach', label: 'AI Coach' },
                  { key: 'weekly_reports', label: 'Báo cáo hàng tuần' },
                  { key: 'correction_tracking', label: 'Theo dõi sửa đổi' },
                  { key: 'healthkit_sync', label: 'HealthKit Sync' },
                  { key: 'priority_support', label: 'Hỗ trợ ưu tiên' },
                ].map(({ key, label }) => {
                  const hasFeature = tierInfo.features[key as keyof typeof tierInfo.features];
                  return (
                    <View key={key} style={styles.featureRow}>
                      <MaterialIcons
                        name={hasFeature ? 'check-circle' : 'cancel'}
                        size={18}
                        color={hasFeature ? theme.colors.accentMint : theme.colors.textMuted}
                      />
                      <Text style={[styles.featureText, !hasFeature && styles.featureDisabled]}>
                        {label}
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
                  {isCurrentTier ? '✓ Hiện tại' : tier === 'free' ? 'Chuyển về Free' : 'Áp dụng gói này'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* FAQ Section */}
      <View style={styles.faqSection}>
        <Text style={styles.faqTitle}>Câu hỏi thường gặp</Text>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Có thể hủy bất kỳ lúc nào không?</Text>
          <Text style={styles.faqAnswer}>Có, bạn có thể hủy gói của mình bất kỳ lúc nào từ cài đặt.</Text>
        </View>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Có thử nghiệm miễn phí không?</Text>
          <Text style={styles.faqAnswer}>Bạn có thể sử dụng bản miễn phí với các tính năng cơ bản.</Text>
        </View>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Thanh toán an toàn như thế nào?</Text>
          <Text style={styles.faqAnswer}>Chúng tôi sử dụng Stripe để xử lý thanh toán một cách an toàn.</Text>
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
          <Text style={styles.footerLink}>Quay lại</Text>
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


