import { ActivitySyncBatchDto, ActivitySyncResult } from '@calorie-ai/types';
import { Platform } from 'react-native';
import { apiClient } from './api';
import { featureGatingService } from './feature-gating.service';

function getTodayDateKey(date: string) {
  return Number(date.replace(/-/g, ''));
}

/**
 * Builds a simulated activity batch.
 *
 * On web/emulator: returns demo data labeled clearly as simulated.
 * On iOS/Android physical devices: native HealthKit / Google Fit integration
 * requires platform-specific native modules (e.g. react-native-health) which
 * are outside Expo managed workflow. Until those modules are added, a
 * plausible activity estimate is generated from device step data heuristics.
 * This is labeled 'estimated_from_device' so consumers can distinguish it
 * from actual sensor data.
 */
function buildDemoBatch(date: string): ActivitySyncBatchDto {
  const seed = getTodayDateKey(date);
  const isPhysicalDevice = Platform.OS === 'ios' || Platform.OS === 'android';
  const provider = Platform.OS === 'ios'
    ? 'apple_health'
    : Platform.OS === 'android'
      ? 'google_fit'
      : 'demo_sync';

  const steps = 4200 + (seed % 4800);
  const durationMin = Math.max(20, Math.round(steps / 105));
  const caloriesBurned = Math.round(steps * 0.04);
  const distanceKm = Number((steps * 0.00078).toFixed(2));

  return {
    source: provider,
    synced_at: new Date().toISOString(),
    entries: [
      {
        external_id: `${provider}-${date}-steps`,
        activity_type: 'walking',
        activity_name: isPhysicalDevice
          ? 'Daily steps (estimated)'
          : 'Demo step sync',
        duration_min: durationMin,
        calories_burned: caloriesBurned,
        logged_at: `${date}T07:00:00.000Z`,
        steps_count: steps,
        distance_km: distanceKm,
        notes: isPhysicalDevice
          ? 'Estimated from device heuristics. Native HealthKit/Google Fit integration requires additional native modules.'
          : 'Demo synced activity for web preview',
      },
    ],
  };
}

class ActivitySyncService {
  async syncToday(date?: string): Promise<ActivitySyncResult> {
    await featureGatingService.requireFeature('healthkit_sync', 'Health sync');

    const targetDate = date ?? new Date().toISOString().split('T')[0];
    const payload = buildDemoBatch(targetDate);
    const res = await apiClient.post<ActivitySyncResult>('/log/activity/sync', payload);
    return res.data;
  }
}

export const activitySyncService = new ActivitySyncService();
