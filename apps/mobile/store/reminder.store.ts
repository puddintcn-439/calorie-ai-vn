import { create } from 'zustand';
import { NudgeMessage, ReminderPreferences } from '@calorie-ai/types';
import { apiClient } from '../services/api';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface ReminderState {
  preferences: ReminderPreferences | null;
  previewNudge: NudgeMessage | null;
  isLoading: boolean;
  isPreviewLoading: boolean;
  error: string | null;

  fetchPreferences: () => Promise<void>;
  updatePreferences: (prefs: Partial<ReminderPreferences>) => Promise<void>;
  fetchPreviewNudge: (mealType: MealType, caloriesLogged?: number) => Promise<void>;
  clear: () => void;
}

export const useReminderStore = create<ReminderState>((set) => ({
  preferences: null,
  previewNudge: null,
  isLoading: false,
  isPreviewLoading: false,
  error: null,

  fetchPreferences: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.get<ReminderPreferences>('/reminders/preferences');
      set({ preferences: res.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to fetch preferences', isLoading: false });
    }
  },

  updatePreferences: async (prefs: Partial<ReminderPreferences>) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.put<ReminderPreferences>('/reminders/preferences', prefs);
      set({ preferences: res.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to update preferences', isLoading: false });
    }
  },

  fetchPreviewNudge: async (mealType: MealType, caloriesLogged?: number) => {
    set({ isPreviewLoading: true, error: null });
    try {
      const res = await apiClient.post<NudgeMessage>('/reminders/nudge-test', {
        meal_type: mealType,
        calories_logged: caloriesLogged,
      });
      set({ previewNudge: res.data, isPreviewLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to preview nudge', isPreviewLoading: false });
    }
  },

  clear: () => set({ preferences: null, previewNudge: null, isLoading: false, isPreviewLoading: false, error: null }),
}));
