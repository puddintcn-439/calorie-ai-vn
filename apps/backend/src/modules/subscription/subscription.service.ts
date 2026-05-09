import { Injectable, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { UserSubscription, SubscriptionTier, SubscriptionDto, SUBSCRIPTION_TIERS, SubscriptionFeatures } from '@calorie-ai/types';

@Injectable()
export class SubscriptionService {
  constructor(private supabase: SupabaseService) {}

  private isMissingTableError(error: any, tableName: string): boolean {
    const message = String(error?.message ?? error?.details ?? '');
    return message.includes(`public.${tableName}`) && message.includes('schema cache');
  }

  private buildFallbackFreeSubscription(userId: string): UserSubscription {
    const startedAt = new Date().toISOString();
    return {
      id: `fallback-${userId}`,
      user_id: userId,
      tier: 'free',
      started_at: startedAt,
      renews_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelled_at: undefined,
      is_active: true,
      payment_provider: 'trial',
      payment_id: undefined,
      created_at: startedAt,
      updated_at: startedAt,
    } as UserSubscription;
  }

  /**
   * Get user's current subscription (or create free trial if not exists)
   */
  async getUserSubscription(userId: string): Promise<UserSubscription> {
    let { data, error } = await this.supabase.db
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && this.isMissingTableError(error, 'user_subscriptions')) {
      // Local/dev environments may not have this migration yet.
      // Fall back to free tier so app bootstrap does not fail.
      return this.buildFallbackFreeSubscription(userId);
    }

    if (error && error.code === 'PGRST116') {
      // No subscription found, create free tier
      const freeTrial = {
        user_id: userId,
        tier: 'free' as SubscriptionTier,
        started_at: new Date().toISOString(),
        renews_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
        payment_provider: 'trial',
      };

      const { data: created, error: createError } = await this.supabase.db
        .from('user_subscriptions')
        .insert(freeTrial)
        .select()
        .single();

      if (createError) throw createError;

      // Update users table subscription_tier
      await this.supabase.db
        .from('users')
        .update({ subscription_tier: 'free' })
        .eq('id', userId);

      return created as UserSubscription;
    }

    if (error) throw error;
    return data as UserSubscription;
  }

  /**
   * Upgrade subscription to a new tier
   */
  async upgradeSubscription(userId: string, dto: SubscriptionDto): Promise<UserSubscription> {
    // Validate tier exists
    if (!SUBSCRIPTION_TIERS[dto.tier]) {
      throw new ForbiddenException('Invalid subscription tier');
    }

    const now = new Date();
    const renewsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data, error } = await this.supabase.db
      .from('user_subscriptions')
      .upsert(
        {
          user_id: userId,
          tier: dto.tier,
          started_at: now.toISOString(),
          renews_at: renewsAt.toISOString(),
          is_active: true,
          payment_provider: dto.payment_provider,
          payment_id: dto.payment_id,
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (error && this.isMissingTableError(error, 'user_subscriptions')) {
      return this.buildFallbackFreeSubscription(userId);
    }

    if (error) throw error;

    // Update users table subscription_tier
    await this.supabase.db
      .from('users')
      .update({ subscription_tier: dto.tier })
      .eq('id', userId);

    return data as UserSubscription;
  }

  /**
   * Cancel subscription (revert to free)
   */
  async cancelSubscription(userId: string): Promise<UserSubscription> {
    const now = new Date();

    const { data, error } = await this.supabase.db
      .from('user_subscriptions')
      .update({
        tier: 'free',
        cancelled_at: now.toISOString(),
        is_active: true,
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error && this.isMissingTableError(error, 'user_subscriptions')) {
      return this.buildFallbackFreeSubscription(userId);
    }

    if (error) throw error;

    // Update users table subscription_tier
    await this.supabase.db
      .from('users')
      .update({ subscription_tier: 'free' })
      .eq('id', userId);

    return data as UserSubscription;
  }

  /**
   * Check if user has access to a feature
   */
  async hasFeatureAccess(userId: string, feature: keyof SubscriptionFeatures): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    const tierInfo = SUBSCRIPTION_TIERS[subscription.tier];

    if (!subscription.is_active) return false;
    return tierInfo.features[feature];
  }

  /**
   * Get available features for user's tier
   */
  async getUserFeatures(userId: string): Promise<SubscriptionFeatures> {
    const subscription = await this.getUserSubscription(userId);
    return SUBSCRIPTION_TIERS[subscription.tier].features;
  }

  /**
   * Sync renewal dates for subscriptions expiring soon
   */
  async syncSubscriptionRenewals(): Promise<number> {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data, error } = await this.supabase.db
      .from('user_subscriptions')
      .select('id')
      .eq('is_active', true)
      .gte('renews_at', now.toISOString())
      .lte('renews_at', nextWeek.toISOString());

    if (error) throw error;
    return data?.length ?? 0;
  }
}
