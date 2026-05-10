import { create } from 'zustand';
import { UserSubscription, SubscriptionFeatures } from '@calorie-ai/types';
import { apiClient } from '../services/api';
import { featureGatingService } from '../services/feature-gating.service';

interface SubscriptionState {
  subscription: UserSubscription | null;
  features: SubscriptionFeatures | null;
  isLoading: boolean;
  error: string | null;

  fetchSubscription: () => Promise<void>;
  changeTier: (tier: 'free' | 'premium' | 'pro') => Promise<void>;
  upgrade: (tier: 'premium' | 'pro', provider: 'stripe' | 'in_app' | 'trial', paymentId?: string) => Promise<void>;
  cancel: () => Promise<void>;
  refreshFeatures: () => Promise<void>;
  clear: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  subscription: null,
  features: null,
  isLoading: false,
  error: null,

  fetchSubscription: async () => {
    set({ isLoading: true, error: null });
    try {
      const [subRes, featuresRes] = await Promise.all([
        apiClient.get<UserSubscription>('/subscriptions/current'),
        apiClient.get<SubscriptionFeatures>('/subscriptions/features'),
      ]);
      set({ subscription: subRes.data, features: featuresRes.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to fetch subscription', isLoading: false });
    }
  },

  changeTier: async (tier: 'free' | 'premium' | 'pro') => {
    set({ isLoading: true, error: null });
    try {
      const res = tier === 'free'
        ? await apiClient.delete<UserSubscription>('/subscriptions/cancel')
        : await apiClient.post<UserSubscription>('/subscriptions/upgrade', {
            tier,
            payment_provider: 'trial',
            payment_id: `manual_${tier}_${Date.now()}`,
          });

      featureGatingService.invalidateCache();
      const refreshedFeatures = await featureGatingService.getUserFeatures();
      set({ subscription: res.data, features: refreshedFeatures, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to change subscription tier', isLoading: false });
      throw err;
    }
  },

  upgrade: async (tier: 'premium' | 'pro', provider: 'stripe' | 'in_app' | 'trial', paymentId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post<UserSubscription>('/subscriptions/upgrade', {
        tier,
        payment_provider: provider,
        payment_id: paymentId,
      });
      featureGatingService.invalidateCache();
      const refreshedFeatures = await featureGatingService.getUserFeatures();
      set({ subscription: res.data, features: refreshedFeatures, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to upgrade subscription', isLoading: false });
      throw err;
    }
  },

  cancel: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.delete<UserSubscription>('/subscriptions/cancel');
      featureGatingService.invalidateCache();
      const refreshedFeatures = await featureGatingService.getUserFeatures();
      set({ subscription: res.data, features: refreshedFeatures, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to cancel subscription', isLoading: false });
      throw err;
    }
  },

  refreshFeatures: async () => {
    set({ isLoading: true });
    try {
      const features = await featureGatingService.getUserFeatures();
      set({ features, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to refresh features', isLoading: false });
    }
  },

  clear: () => set({ subscription: null, features: null, isLoading: false, error: null }),
}));
