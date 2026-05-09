import { create } from 'zustand';
import { WeeklyInsights } from '@calorie-ai/types';
import { apiClient } from '../services/api';

interface InsightsState {
  weeklyInsights: WeeklyInsights | null;
  isLoading: boolean;
  error: string | null;

  fetchWeeklyInsights: (weekStartDate?: string) => Promise<void>;
  clear: () => void;
}

export const useInsightsStore = create<InsightsState>((set) => ({
  weeklyInsights: null,
  isLoading: false,
  error: null,

  fetchWeeklyInsights: async (weekStartDate?: string) => {
    set({ isLoading: true, error: null });
    try {
      const params = weekStartDate ? `?week_start_date=${weekStartDate}` : '';
      const res = await apiClient.get<WeeklyInsights>(`/insights/weekly${params}`);
      set({ weeklyInsights: res.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to fetch insights', isLoading: false });
    }
  },

  clear: () => set({ weeklyInsights: null, isLoading: false, error: null }),
}));
