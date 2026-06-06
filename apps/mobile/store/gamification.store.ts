import { create } from 'zustand';
import { GamificationSummary } from '@calorie-ai/types';
import { apiClient } from '../services/api';
import { authStorage } from '../services/auth-storage';
import { getLocalTimezoneOffsetMinutes } from '../services/date';
import { safeNumber } from '../services/number-format';

function normalizeSummary(summary: Partial<GamificationSummary> | null | undefined): GamificationSummary {
  return {
    current_streak: safeNumber(summary?.current_streak),
    longest_streak: safeNumber(summary?.longest_streak),
    active_days_last_30: safeNumber(summary?.active_days_last_30),
    total_food_logs: safeNumber(summary?.total_food_logs),
    total_activity_logs: safeNumber(summary?.total_activity_logs),
    next_streak_milestone: summary?.next_streak_milestone == null ? null : safeNumber(summary.next_streak_milestone),
    badges: Array.isArray(summary?.badges) ? summary.badges : [],
  };
}

async function hasAuthToken(): Promise<boolean> {
  return Boolean(await authStorage.getItemAsync('auth_token'));
}

interface GamificationState {
  summary: GamificationSummary | null;
  isLoading: boolean;
  error: string | null;
  fetchSummary: () => Promise<void>;
  clear: () => void;
}

export const useGamificationStore = create<GamificationState>((set) => ({
  summary: null,
  isLoading: false,
  error: null,

  fetchSummary: async () => {
    if (!(await hasAuthToken())) {
      set({ isLoading: false, error: null });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const tzOffset = getLocalTimezoneOffsetMinutes();
      const res = await apiClient.get<GamificationSummary>('/gamification/summary', {
        params: { tz_offset_minutes: tzOffset },
      });
      set({ summary: normalizeSummary(res.data), isLoading: false });
    } catch (error: any) {
      set({ error: error?.message ?? 'Failed to load streak summary', isLoading: false });
    }
  },

  clear: () => set({ summary: null, isLoading: false, error: null }),
}));
