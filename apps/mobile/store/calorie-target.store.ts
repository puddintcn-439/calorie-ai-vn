import { create } from 'zustand';
import {
  calorieTargetService,
  WeeklyRecommendations,
  WeeklyAdaptiveResult,
} from '../services/calorie-target.service';

interface CalorieTargetState {
  recommendations: WeeklyRecommendations | null;
  latestAdjustment: WeeklyAdaptiveResult | null;
  isLoadingRecommendations: boolean;
  isApplyingAdjustment: boolean;
  error: string | null;

  fetchRecommendations: () => Promise<void>;
  applyWeeklyAdjustment: () => Promise<void>;
  clear: () => void;
}

export const useCalorieTargetStore = create<CalorieTargetState>((set) => ({
  recommendations: null,
  latestAdjustment: null,
  isLoadingRecommendations: false,
  isApplyingAdjustment: false,
  error: null,

  fetchRecommendations: async () => {
    set({ isLoadingRecommendations: true, error: null });
    try {
      const recommendations = await calorieTargetService.getMyRecommendations();
      set({ recommendations, isLoadingRecommendations: false });
    } catch (err: any) {
      set({
        isLoadingRecommendations: false,
        error: err?.message ?? 'Failed to fetch calorie recommendations',
      });
    }
  },

  applyWeeklyAdjustment: async () => {
    set({ isApplyingAdjustment: true, error: null });
    try {
      const latestAdjustment = await calorieTargetService.applyWeeklyAdjustment();
      set({ latestAdjustment, isApplyingAdjustment: false });
    } catch (err: any) {
      set({
        isApplyingAdjustment: false,
        error: err?.message ?? 'Failed to apply weekly adjustment',
      });
    }
  },

  clear: () => {
    set({
      recommendations: null,
      latestAdjustment: null,
      isLoadingRecommendations: false,
      isApplyingAdjustment: false,
      error: null,
    });
  },
}));
