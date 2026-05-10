import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSubscriptionStore } from '../store/subscription.store';
import { SUBSCRIPTION_TIERS } from '@calorie-ai/types';

export default function PaywallScreen() {
  const router = useRouter();
  const { subscription, isLoading, error, upgrade } = useSubscriptionStore();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const { width } = useWindowDimensions();
  const isWide = width >= 1120;
  const isTablet = width >= 820;

  useEffect(() => {
    useSubscriptionStore.getState().fetchSubscription();
  }, []);

  const handleUpgrade = async (tier: 'premium' | 'pro') => {
    try {
      // In production, this would integrate with Stripe or in-app purchase
      // For now, we'll just call upgrade with trial provider
      await upgrade(tier, 'in_app', `payment_${Date.now()}`);
      Alert.alert('Success', `Upgraded to ${tier} tier!`);
      // Navigate back to home
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#F97316" />
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
        <Text style={styles.title}>Nâng cấp kế hoạch</Text>
        <Text style={styles.subtitle}>Mở khóa các tính năng cao cấp</Text>
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
                        color={hasFeature ? '#10b981' : '#d1d5db'}
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
                  tier === 'free' && styles.freeButton,
                ]}
                onPress={() => tier !== 'free' && handleUpgrade(tier as 'premium' | 'pro')}
                disabled={isCurrentTier || tier === 'free'}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    isCurrentTier && styles.currentButtonText,
                    tier === 'free' && styles.freeButtonText,
                  ]}
                >
                  {isCurrentTier ? '✓ Hiện tại' : tier === 'free' ? 'Đang dùng' : 'Nâng cấp'}
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
          <MaterialIcons name="error" size={20} color="#dc2626" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 24,
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
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  billingOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeOption: {
    backgroundColor: '#fff',
  },
  billingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeText: {
    color: '#1f2937',
  },
  savingsBadge: {
    fontSize: 12,
    color: '#10b981',
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
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#e5e7eb',
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
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  popularTierCard: {
    borderColor: '#f97316',
    backgroundColor: '#fff7ed',
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    left: 20,
    backgroundColor: '#f97316',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  tierName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  tierDescription: {
    fontSize: 14,
    color: '#6b7280',
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
    color: '#1f2937',
  },
  billingPeriod: {
    fontSize: 14,
    color: '#6b7280',
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
    color: '#374151',
    fontWeight: '500',
  },
  featureDisabled: {
    color: '#d1d5db',
  },
  actionButton: {
    backgroundColor: '#f97316',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentButton: {
    backgroundColor: '#e5e7eb',
  },
  freeButton: {
    backgroundColor: '#f3f4f6',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  currentButtonText: {
    color: '#6b7280',
  },
  freeButtonText: {
    color: '#9ca3af',
  },
  faqSection: {
    marginBottom: 24,
  },
  faqTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
  },
  faqItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  faqQuestion: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 6,
  },
  faqAnswer: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerLink: {
    fontSize: 14,
    color: '#f97316',
    fontWeight: '600',
  },
});
