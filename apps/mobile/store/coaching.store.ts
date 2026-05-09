import { create } from 'zustand';
import { CoachingInsight, CoachingSummary } from '@calorie-ai/types';

interface CoachingStore {
  insights: CoachingInsight[];
  summary: CoachingSummary | null;
  loading: boolean;
  lastUpdated: Date | null;

  setInsights: (insights: CoachingInsight[]) => void;
  setSummary: (summary: CoachingSummary | null) => void;
  setLoading: (loading: boolean) => void;
  removeInsight: (id: number) => void;
  clearCoachingData: () => void;
  updateLastUpdated: () => void;
}

export const useCoachingStore = create<CoachingStore>((set) => ({
  insights: [],
  summary: null,
  loading: false,
  lastUpdated: null,

  setInsights: (insights) => set({ insights }),
  setSummary: (summary) => set({ summary }),
  setLoading: (loading) => set({ loading }),

  removeInsight: (id) =>
    set((state) => ({
      insights: state.insights.filter((i) => i.id !== id),
    })),

  clearCoachingData: () =>
    set({
      insights: [],
      summary: null,
      lastUpdated: null,
    }),

  updateLastUpdated: () => set({ lastUpdated: new Date() }),
}));
