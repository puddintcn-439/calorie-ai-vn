// Subscription and premium feature types

export type SubscriptionTier = 'free' | 'premium' | 'pro';

export interface SubscriptionFeatures {
  daily_insights: boolean;
  meal_reminders: boolean;
  ai_coach: boolean;
  manual_food_search: boolean;
  barcode_scanning: boolean;
  weekly_reports: boolean;
  correction_tracking: boolean;
  healthkit_sync: boolean;
  custom_goals: boolean;
  priority_support: boolean;
}

export interface SubscriptionTierInfo {
  tier: SubscriptionTier;
  name: string;
  description: string;
  price_usd_monthly: number;
  price_usd_yearly: number;
  features: SubscriptionFeatures;
  tag?: string; // "Most Popular", "Best Value", etc.
}

export interface UserSubscription {
  id?: string;
  user_id: string;
  tier: SubscriptionTier;
  started_at: string;
  renews_at: string;
  cancelled_at?: string;
  is_active: boolean;
  payment_provider: 'stripe' | 'in_app' | 'trial';
  created_at?: string;
}

export interface SubscriptionDto {
  tier: SubscriptionTier;
  payment_provider: 'stripe' | 'in_app' | 'trial';
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, SubscriptionTierInfo> = {
  free: {
    tier: 'free',
    name: 'Miễn phí',
    description: 'Bắt đầu theo dõi calo của bạn',
    price_usd_monthly: 0,
    price_usd_yearly: 0,
    features: {
      daily_insights: false,
      meal_reminders: false,
      ai_coach: false,
      manual_food_search: true,
      barcode_scanning: true,
      weekly_reports: false,
      correction_tracking: false,
      healthkit_sync: false,
      custom_goals: false,
      priority_support: false,
    },
  },
  premium: {
    tier: 'premium',
    name: 'Premium',
    description: 'AI Coach và hỗ trợ AI tối ưu',
    price_usd_monthly: 9.99,
    price_usd_yearly: 79.99,
    features: {
      daily_insights: true,
      meal_reminders: true,
      ai_coach: true,
      manual_food_search: true,
      barcode_scanning: true,
      weekly_reports: true,
      correction_tracking: true,
      healthkit_sync: false,
      custom_goals: true,
      priority_support: false,
    },
    tag: 'Most Popular',
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    description: 'Mọi thứ + HealthKit + Hỗ trợ ưu tiên',
    price_usd_monthly: 19.99,
    price_usd_yearly: 159.99,
    features: {
      daily_insights: true,
      meal_reminders: true,
      ai_coach: true,
      manual_food_search: true,
      barcode_scanning: true,
      weekly_reports: true,
      correction_tracking: true,
      healthkit_sync: true,
      custom_goals: true,
      priority_support: true,
    },
    tag: 'Best Value',
  },
};
