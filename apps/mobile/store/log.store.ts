import { DailyLog, FoodLog, MealType, SavedMeal, ActivityLog, CreateActivityLogDto, ActivitySyncResult, DailyRoadmapItem, CreateDailyRoadmapItemDto, UpdateDailyRoadmapItemDto, DailyRoadmapSyncDto } from '@calorie-ai/types';
import { apiClient } from '../services/api';
import { activitySyncService } from '../services/activity-sync.service';
import { getLocalDateYmd, getLocalTimezoneOffsetMinutes } from '../services/date';

const create = require('zustand').create as typeof import('zustand').create;

interface LogState {
  dailyLog: DailyLog | null;
  savedMeals: SavedMeal[];
  activityLogs: ActivityLog[];
  dailyRoadmap: DailyRoadmapItem[];
  isLoading: boolean;
  fetchDailyLog: (date?: string) => Promise<void>;
  fetchSavedMeals: () => Promise<void>;
  fetchActivityLogs: (date?: string) => Promise<void>;
  fetchDailyRoadmap: (date?: string) => Promise<void>;
  addLog: (data: Omit<Partial<FoodLog>, 'user_id'>) => Promise<void>;
  removeLog: (id: string) => Promise<void>;
  saveMeal: (name: string, items: SavedMeal['items']) => Promise<void>;
  logSavedMeal: (id: string, mealType: MealType) => Promise<void>;
  deleteSavedMeal: (id: string) => Promise<void>;
  addActivity: (dto: CreateActivityLogDto) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
  syncActivity: (date?: string) => Promise<ActivitySyncResult>;
  addRoadmapItem: (dto: CreateDailyRoadmapItemDto) => Promise<DailyRoadmapItem>;
  updateRoadmapItem: (itemId: string, dto: UpdateDailyRoadmapItemDto) => Promise<void>;
  deleteRoadmapItem: (itemId: string) => Promise<void>;
  syncRoadmapBatch: (dto: DailyRoadmapSyncDto) => Promise<void>;
}

export const useLogStore = create<LogState>((set, get) => ({
  dailyLog: null,
  savedMeals: [],
  activityLogs: [],
  dailyRoadmap: [],
  isLoading: false,

  fetchDailyLog: async (date) => {
    set({ isLoading: true });
    try {
      const d = date ?? getLocalDateYmd();
      const tzOffset = getLocalTimezoneOffsetMinutes();
      const res = await apiClient.get(`/log/daily?date=${d}&tz_offset_minutes=${tzOffset}`);
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
    const d = date ?? getLocalDateYmd();
    const tzOffset = getLocalTimezoneOffsetMinutes();
    const res = await apiClient.get(`/log/activity?date=${d}&tz_offset_minutes=${tzOffset}`);
    set({ activityLogs: res.data });
  },

  fetchDailyRoadmap: async (date) => {
    try {
      const d = date ?? getLocalDateYmd();
      const res = await apiClient.get(`/roadmap/${d}`);
      set({ dailyRoadmap: res.data });
    } catch (error) {
      console.error('Failed to fetch daily roadmap:', error);
      set({ dailyRoadmap: [] });
    }
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

  syncActivity: async (date) => {
    const result = await activitySyncService.syncToday(date);
    await get().fetchActivityLogs(date);
    return result;
  },

  addRoadmapItem: async (dto) => {
    const res = await apiClient.post('/roadmap', dto);
    await get().fetchDailyRoadmap(dto.logged_date);
    return res.data;
  },

  updateRoadmapItem: async (itemId, dto) => {
    await apiClient.put(`/roadmap/${itemId}`, dto);
    const roadmap = get().dailyRoadmap;
    if (roadmap.length > 0) {
      await get().fetchDailyRoadmap(roadmap[0].logged_date);
    }
  },

  deleteRoadmapItem: async (itemId) => {
    await apiClient.delete(`/roadmap/${itemId}`);
    const roadmap = get().dailyRoadmap;
    if (roadmap.length > 0) {
      await get().fetchDailyRoadmap(roadmap[0].logged_date);
    }
  },

  syncRoadmapBatch: async (dto) => {
    await apiClient.post('/roadmap/sync/daily', dto);
    await get().fetchDailyRoadmap(dto.logged_date);
  },
}));

