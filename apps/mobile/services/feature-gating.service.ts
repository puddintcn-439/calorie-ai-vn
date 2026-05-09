import { SubscriptionFeatures } from '@calorie-ai/types';
import { apiClient } from './api';

class FeatureGatingService {
  private featureCache: SubscriptionFeatures | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 60 * 1000; // 60 seconds

  /**
   * Fetch user's available features (with caching)
   */
  async getUserFeatures(): Promise<SubscriptionFeatures> {
    const now = Date.now();

    // Return cached features if still valid
    if (this.featureCache && now < this.cacheExpiry) {
      return this.featureCache;
    }

    try {
      const res = await apiClient.get<SubscriptionFeatures>('/subscriptions/features');
      this.featureCache = res.data;
      this.cacheExpiry = now + this.CACHE_DURATION;
      return res.data;
    } catch (error) {
      console.error('[FeatureGating] Failed to fetch features:', error);
      // Return default free tier features on error
      return {
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
      };
    }
  }

  /**
   * Check if user has access to a feature
   */
  async canAccessFeature(feature: keyof SubscriptionFeatures): Promise<boolean> {
    const features = await this.getUserFeatures();
    return features[feature];
  }

  /**
   * Verify feature access and throw error if not available
   */
  async requireFeature(feature: keyof SubscriptionFeatures, featureName: string): Promise<void> {
    const hasAccess = await this.canAccessFeature(feature);
    if (!hasAccess) {
      throw new Error(`${featureName} is only available on Premium or Pro plans`);
    }
  }

  /**
   * Invalidate cache (call after subscription changes)
   */
  invalidateCache(): void {
    this.featureCache = null;
    this.cacheExpiry = 0;
  }

  /**
   * Get subscription status and features summary
   */
  async getSubscriptionStatus() {
    try {
      const sub = await apiClient.get('/subscriptions/current');
      const features = await this.getUserFeatures();
      return {
        tier: sub.data.tier,
        isActive: sub.data.is_active,
        renewsAt: sub.data.renews_at,
        features,
      };
    } catch (error) {
      console.error('[FeatureGating] Failed to get subscription status:', error);
      return {
        tier: 'free',
        isActive: true,
        features: await this.getUserFeatures(),
      };
    }
  }
}

export const featureGatingService = new FeatureGatingService();
