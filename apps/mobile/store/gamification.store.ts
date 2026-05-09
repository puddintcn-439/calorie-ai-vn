import { create } from 'zustand';
import { GamificationSummary } from '@calorie-ai/types';
import { apiClient } from '../services/api';

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
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.get<GamificationSummary>('/gamification/summary');
      set({ summary: res.data, isLoading: false });
    } catch (error: any) {
      set({ error: error?.message ?? 'Failed to load streak summary', isLoading: false });
    }
  },

  clear: () => set({ summary: null, isLoading: false, error: null }),
}));