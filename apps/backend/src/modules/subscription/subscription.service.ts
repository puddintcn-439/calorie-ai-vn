import { Injectable, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { UserSubscription, SubscriptionTier, SubscriptionDto, SUBSCRIPTION_TIERS, SubscriptionFeatures } from '@calorie-ai/types';

@Injectable()
export class SubscriptionService {
  constructor(private supabase: SupabaseService) {}

  private allowMissingTableFallback(): boolean {
    return (process.env.NODE_ENV ?? 'development') === 'development';
  }

  private isMissingTableError(error: any, tableName: string): boolean {
    const message = String(error?.message ?? error?.details ?? '');
    return message.includes(`public.${tableName}`) && message.includes('schema cache');
  }

  private isDuplicateKeyError(error: any): boolean {
    const message = String(error?.message ?? error?.details ?? '').toLowerCase();
    return error?.code === '23505' || message.includes('duplicate key');
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
      created_at: startedAt,
      updated_at: startedAt,
    } as UserSubscription;
  }

  private currentAccessSubscription(subscription: UserSubscription): UserSubscription {
    const tier = String(subscription.tier ?? 'free') as SubscriptionTier;
    const isPaidTier = tier === 'premium' || tier === 'pro';
    const renewsAt = subscription.renews_at ? new Date(String(subscription.renews_at)) : null;
    const isExpired = Boolean(renewsAt && !Number.isNaN(renewsAt.getTime()) && renewsAt <= new Date());
    const isCurrentPaid = isPaidTier && subscription.is_active !== false && !subscription.cancelled_at && !isExpired;

    if (isCurrentPaid || tier === 'free') return subscription;

    return {
      ...subscription,
      tier: 'free',
      is_active: true,
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

    if (error && this.isMissingTableError(error, 'user_subscriptions') && this.allowMissingTableFallback()) {
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

      if (createError && this.isDuplicateKeyError(createError)) {
        const { data: existing, error: refetchError } = await this.supabase.db
          .from('user_subscriptions')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (!refetchError && existing) return this.currentAccessSubscription(existing as UserSubscription);
      }

      if (createError) throw createError;

      // Update users table subscription_tier
      await this.supabase.db
        .from('users')
        .update({ subscription_tier: 'free' })
        .eq('id', userId);

      return created as UserSubscription;
    }

    if (error) throw error;
    return this.currentAccessSubscription(data as UserSubscription);
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
          cancelled_at: null,
          is_active: true,
          payment_provider: dto.payment_provider,
          updated_at: now.toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (error && this.isMissingTableError(error, 'user_subscriptions') && this.allowMissingTableFallback()) {
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
        is_active: false,
        updated_at: now.toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error && this.isMissingTableError(error, 'user_subscriptions') && this.allowMissingTableFallback()) {
      return this.buildFallbackFreeSubscription(userId);
    }

    if (error) throw error;

    // Sync cancellation to billing_subscriptions — cancel all non-cancelled rows,
    // not just status='active', to catch past_due/trialing states too.
    await this.supabase.db
      .from('billing_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('user_id', userId)
      .is('cancelled_at', null);

    // Update users table subscription_tier
    await this.supabase.db
      .from('users')
      .update({ subscription_tier: 'free', updated_at: now.toISOString() })
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
