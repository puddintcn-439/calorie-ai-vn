import {
  DailyLog,
  FoodLog,
  MealType,
  TodaySummary,
  SavedMeal,
  ActivityLog,
  CreateActivityLogDto,
  ActivitySyncResult,
  DailyRoadmapItem,
  CreateDailyRoadmapItemDto,
  UpdateDailyRoadmapItemDto,
  DailyRoadmapSyncDto,
  ActivityPreference,
  CreateActivityPreferenceDto,
  UpdateActivityPreferenceDto,
} from '@calorie-ai/types';
import { apiClient } from '../services/api';
import { authStorage } from '../services/auth-storage';
import { activitySyncService } from '../services/activity-sync.service';
import { getLocalDateYmd, getLocalTimezoneOffsetMinutes } from '../services/date';
import { appLogger } from '../services/logger.service';
import { reminderFeedbackService } from '../services/reminder-feedback.service';

const create = require('zustand').create as typeof import('zustand').create;

async function hasAuthToken(): Promise<boolean> {
  return Boolean(await authStorage.getItemAsync('auth_token'));
}

function getLocalDateFromIso(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface LogState {
  dailyLog: DailyLog | null;
  savedMeals: SavedMeal[];
  activityLogs: ActivityLog[];
  dailyRoadmap: DailyRoadmapItem[];
  activityPreferences: ActivityPreference[];
  todaySummary: TodaySummary | null;
  isLoading: boolean;
  fetchTodaySummary: (date?: string) => Promise<void>;
  fetchDailyLog: (date?: string) => Promise<void>;
  fetchSavedMeals: () => Promise<void>;
  fetchActivityLogs: (date?: string) => Promise<void>;
  fetchDailyRoadmap: (date?: string) => Promise<void>;
  addLog: (data: Omit<Partial<FoodLog>, 'user_id'>) => Promise<FoodLog>;
  updateLog: (id: string, data: Partial<FoodLog>) => Promise<void>;
  removeLog: (id: string) => Promise<FoodLog | null>;
  restoreLog: (id: string) => Promise<void>;
  saveMeal: (name: string, items: SavedMeal['items']) => Promise<void>;
  updateSavedMeal: (id: string, data: Partial<Pick<SavedMeal, 'name' | 'items'>>) => Promise<void>;
  logSavedMeal: (id: string, mealType: MealType) => Promise<void>;
  deleteSavedMeal: (id: string) => Promise<void>;
  addActivity: (dto: CreateActivityLogDto) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
  syncActivity: (date?: string) => Promise<ActivitySyncResult>;
  addRoadmapItem: (dto: CreateDailyRoadmapItemDto) => Promise<DailyRoadmapItem>;
  updateRoadmapItem: (itemId: string, dto: UpdateDailyRoadmapItemDto) => Promise<void>;
  deleteRoadmapItem: (itemId: string) => Promise<void>;
  syncRoadmapBatch: (dto: DailyRoadmapSyncDto) => Promise<void>;
  fetchActivityPreferences: () => Promise<void>;
  addActivityPreference: (dto: CreateActivityPreferenceDto) => Promise<ActivityPreference>;
  updateActivityPreference: (preferenceId: string, dto: UpdateActivityPreferenceDto) => Promise<void>;
  deleteActivityPreference: (preferenceId: string) => Promise<void>;
}

export const useLogStore = create<LogState>((set, get) => ({
  dailyLog: null,
  savedMeals: [],
  activityLogs: [],
  dailyRoadmap: [],
  activityPreferences: [],
  todaySummary: null,
  isLoading: false,

  fetchTodaySummary: async (date) => {
    if (!(await hasAuthToken())) {
      set({ isLoading: false });
      return;
    }
    set({ isLoading: true });
    const d = date ?? getLocalDateYmd();
    const tzOffset = getLocalTimezoneOffsetMinutes();
    try {
      const res = await apiClient.get<TodaySummary>(`/today/summary?date=${d}&tz_offset_minutes=${tzOffset}`);
      set({
        todaySummary: res.data,
        dailyLog: res.data.daily_log,
        activityLogs: res.data.activity_logs,
        dailyRoadmap: res.data.daily_roadmap,
        activityPreferences: res.data.activity_preferences,
      });
    } catch (error) {
      appLogger.warn('LogStore', 'Failed to fetch today summary; falling back to split endpoints', error);
      await Promise.allSettled([
        get().fetchDailyLog(d),
        get().fetchActivityLogs(d),
        get().fetchDailyRoadmap(d),
        get().fetchActivityPreferences(),
      ]);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchDailyLog: async (date) => {
    if (!(await hasAuthToken())) {
      set({ isLoading: false });
      return;
    }
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
    if (!(await hasAuthToken())) return;
    const res = await apiClient.get('/log/saved-meals');
    set({ savedMeals: res.data });
  },

  fetchActivityLogs: async (date) => {
    if (!(await hasAuthToken())) return;
    const d = date ?? getLocalDateYmd();
    const tzOffset = getLocalTimezoneOffsetMinutes();
    const res = await apiClient.get(`/log/activity?date=${d}&tz_offset_minutes=${tzOffset}`);
    set({ activityLogs: res.data });
  },

  fetchDailyRoadmap: async (date) => {
    if (!(await hasAuthToken())) return;
    try {
      const d = date ?? getLocalDateYmd();
      const res = await apiClient.get(`/roadmap/${d}`);
      set({ dailyRoadmap: res.data });
    } catch (error) {
      appLogger.warn('LogStore', 'Failed to fetch daily roadmap', error);
      set({ dailyRoadmap: [] });
    }
  },

  addLog: async (data) => {
    const res = await apiClient.post('/log', data);
    await reminderFeedbackService.recordActed('food_log', data.meal_type as MealType | undefined);
    await get().fetchTodaySummary(getLocalDateFromIso(data.logged_at));
    return res.data;
  },

  updateLog: async (id, data) => {
    await apiClient.patch(`/log/${id}`, data);
    await get().fetchTodaySummary(getLocalDateFromIso(data.logged_at));
  },

  removeLog: async (id) => {
    const res = await apiClient.delete(`/log/${id}`);
    await get().fetchTodaySummary();
    return res.data?.deleted ?? null;
  },

  restoreLog: async (id) => {
    await apiClient.post(`/log/${id}/restore`);
    await get().fetchTodaySummary();
  },

  saveMeal: async (name, items) => {
    await apiClient.post('/log/saved-meals', { name, items });
    await get().fetchSavedMeals();
  },

  updateSavedMeal: async (id, data) => {
    await apiClient.patch(`/log/saved-meals/${id}`, data);
    await get().fetchSavedMeals();
  },

  logSavedMeal: async (id, mealType) => {
    await apiClient.post(`/log/saved-meals/${id}/log`, { meal_type: mealType });
    await reminderFeedbackService.recordActed('saved_meal_log', mealType);
    await get().fetchTodaySummary();
  },

  deleteSavedMeal: async (id) => {
    await apiClient.delete(`/log/saved-meals/${id}`);
    await get().fetchSavedMeals();
  },

  addActivity: async (dto) => {
    await apiClient.post('/log/activity', dto);
    await reminderFeedbackService.recordActed('activity_log');
    await get().fetchTodaySummary(getLocalDateFromIso(dto.logged_at));
  },

  deleteActivity: async (id) => {
    await apiClient.delete(`/log/activity/${id}`);
    await get().fetchTodaySummary();
  },

  syncActivity: async (date) => {
    const result = await activitySyncService.syncToday(date);
    await get().fetchTodaySummary(date);
    return result;
  },

  addRoadmapItem: async (dto) => {
    const res = await apiClient.post('/roadmap', dto);
    await get().fetchTodaySummary(dto.logged_date);
    return res.data;
  },

  updateRoadmapItem: async (itemId, dto) => {
    await apiClient.put(`/roadmap/${itemId}`, dto);
    const roadmap = get().dailyRoadmap;
    if (roadmap.length > 0) {
      await get().fetchTodaySummary(roadmap[0].logged_date);
    }
  },

  deleteRoadmapItem: async (itemId) => {
    await apiClient.delete(`/roadmap/${itemId}`);
    const roadmap = get().dailyRoadmap;
    if (roadmap.length > 0) {
      await get().fetchTodaySummary(roadmap[0].logged_date);
    }
  },

  syncRoadmapBatch: async (dto) => {
    await apiClient.post('/roadmap/sync/daily', dto);
    await get().fetchTodaySummary(dto.logged_date);
  },

  fetchActivityPreferences: async () => {
    if (!(await hasAuthToken())) return;
    try {
      const res = await apiClient.get('/activity-preferences');
      set({ activityPreferences: res.data });
    } catch (error) {
      appLogger.warn('LogStore', 'Failed to fetch activity preferences', error);
      set({ activityPreferences: [] });
    }
  },

  addActivityPreference: async (dto) => {
    const res = await apiClient.post('/activity-preferences', dto);
    await get().fetchTodaySummary();
    return res.data;
  },

  updateActivityPreference: async (preferenceId, dto) => {
    await apiClient.put(`/activity-preferences/${preferenceId}`, dto);
    await get().fetchTodaySummary();
  },

  deleteActivityPreference: async (preferenceId) => {
    await apiClient.delete(`/activity-preferences/${preferenceId}`);
    await get().fetchTodaySummary();
  },
}));

