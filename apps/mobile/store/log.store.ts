import { create } from 'zustand';
import { DailyLog, FoodLog, MealType, SavedMeal, ActivityLog, CreateActivityLogDto } from '@calorie-ai/types';
import { apiClient } from '../services/api';

interface LogState {
  dailyLog: DailyLog | null;
  savedMeals: SavedMeal[];
  activityLogs: ActivityLog[];
  isLoading: boolean;
  fetchDailyLog: (date?: string) => Promise<void>;
  fetchSavedMeals: () => Promise<void>;
  fetchActivityLogs: (date?: string) => Promise<void>;
  addLog: (data: Omit<Partial<FoodLog>, 'user_id'>) => Promise<void>;
  removeLog: (id: string) => Promise<void>;
  saveMeal: (name: string, items: SavedMeal['items']) => Promise<void>;
  logSavedMeal: (id: string, mealType: MealType) => Promise<void>;
  deleteSavedMeal: (id: string) => Promise<void>;
  addActivity: (dto: CreateActivityLogDto) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
}

export const useLogStore = create<LogState>((set, get) => ({
  dailyLog: null,
  savedMeals: [],
  activityLogs: [],
  isLoading: false,

  fetchDailyLog: async (date) => {
    set({ isLoading: true });
    try {
      const d = date ?? new Date().toISOString().split('T')[0];
      const res = await apiClient.get(`/log/daily?date=${d}`);
      set({ dailyLog: res.data });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchSavedMeals: async () => {
    const res = await apiClient.get('/log/saved-meals');
    set({ savedMeals: res.data });
  },

  fetchActivityLogs: async (date) => {
    const d = date ?? new Date().toISOString().split('T')[0];
    const res = await apiClient.get(`/log/activity?date=${d}`);
    set({ activityLogs: res.data });
  },

  addLog: async (data) => {
    await apiClient.post('/log', data);
    await get().fetchDailyLog();
  },

  removeLog: async (id) => {
    await apiClient.delete(`/log/${id}`);
    await get().fetchDailyLog();
  },

  saveMeal: async (name, items) => {
    await apiClient.post('/log/saved-meals', { name, items });
    await get().fetchSavedMeals();
  },

  logSavedMeal: async (id, mealType) => {
    await apiClient.post(`/log/saved-meals/${id}/log`, { meal_type: mealType });
    await get().fetchDailyLog();
  },

  deleteSavedMeal: async (id) => {
    await apiClient.delete(`/log/saved-meals/${id}`);
    await get().fetchSavedMeals();
  },

  addActivity: async (dto) => {
    await apiClient.post('/log/activity', dto);
    await get().fetchActivityLogs();
  },

  deleteActivity: async (id) => {
    await apiClient.delete(`/log/activity/${id}`);
    await get().fetchActivityLogs();
  },
}));
