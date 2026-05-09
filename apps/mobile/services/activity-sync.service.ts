import { ActivitySyncBatchDto, ActivitySyncResult } from '@calorie-ai/types';
import { Platform } from 'react-native';
import { apiClient } from './api';
import { featureGatingService } from './feature-gating.service';

type HealthConnectPermission = {
  accessType: 'read' | 'write';
  recordType: string;
};

function toDayRange(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

/**
 * Converts duration to non-negative integer minutes.
 */
function safeMinutes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.round(value));
}

function msToMinutes(ms: number): number {
  return safeMinutes(ms / 60000);
}

function toKcal(energy: { value: number; unit: string } | undefined): number {
  if (!energy) return 0;
  if (!Number.isFinite(energy.value)) return 0;

  switch (energy.unit) {
    case 'kilocalories':
      return energy.value;
    case 'calories':
      return energy.value / 1000;
    case 'kilojoules':
      return energy.value / 4.184;
    case 'joules':
      return energy.value / 4184;
    default:
      return 0;
  }
}

function toKm(length: { value: number; unit: string } | undefined): number {
  if (!length) return 0;
  if (!Number.isFinite(length.value)) return 0;

  switch (length.unit) {
    case 'kilometers':
      return length.value;
    case 'meters':
      return length.value / 1000;
    case 'miles':
      return length.value * 1.609344;
    case 'feet':
      return length.value * 0.0003048;
    case 'inches':
      return length.value * 0.0000254;
    default:
      return 0;
  }
}

function buildSyncedEntry(params: {
  source: 'apple_health' | 'google_fit';
  date: string;
  syncedAt: string;
  steps: number;
  distanceKm: number;
  caloriesBurned: number;
  durationMin: number;
}): ActivitySyncBatchDto {
  const {
    source,
    date,
    syncedAt,
    steps,
    distanceKm,
    caloriesBurned,
    durationMin,
  } = params;

  if (steps <= 0 && distanceKm <= 0 && caloriesBurned <= 0) {
    throw new Error('Khong tim thay du lieu van dong trong ngay da chon.');
  }

  return {
    source,
    synced_at: syncedAt,
    entries: [
      {
        external_id: `${source}-${date}-${Date.now()}`,
        activity_type: 'walking',
        activity_name: source === 'apple_health' ? 'Apple Health sync' : 'Google Health Connect sync',
        duration_min: Math.max(1, durationMin),
        calories_burned: Math.max(0, Math.round(caloriesBurned)),
        logged_at: `${date}T12:00:00.000Z`,
        steps_count: Math.max(0, Math.round(steps)),
        distance_km: Number(Math.max(0, distanceKm).toFixed(2)),
        notes: source === 'apple_health'
          ? 'Synced from Apple HealthKit'
          : 'Synced from Google Health Connect',
      },
    ],
  };
}

async function buildAndroidHealthConnectBatch(date: string): Promise<ActivitySyncBatchDto> {
  const healthConnect = await import('react-native-health-connect');
  const { startIso, endIso } = toDayRange(date);

  const sdkStatus = await healthConnect.getSdkStatus();
  if (sdkStatus !== healthConnect.SdkAvailabilityStatus.SDK_AVAILABLE) {
    throw new Error('Google Health Connect chua san sang tren thiet bi nay.');
  }

  await healthConnect.initialize();

  const permissions: HealthConnectPermission[] = [
    { accessType: 'read', recordType: 'Steps' },
    { accessType: 'read', recordType: 'Distance' },
    { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  ];
  await healthConnect.requestPermission(permissions as any);

  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: startIso,
    endTime: endIso,
  };

  const [stepsRes, distanceRes, activeCaloriesRes, totalCaloriesRes] = await Promise.all([
    healthConnect.readRecords('Steps', { timeRangeFilter }),
    healthConnect.readRecords('Distance', { timeRangeFilter }),
    healthConnect.readRecords('ActiveCaloriesBurned', { timeRangeFilter }),
    healthConnect.readRecords('TotalCaloriesBurned', { timeRangeFilter }),
  ]);

  const steps = stepsRes.records.reduce((sum, record: any) => sum + (record.count ?? 0), 0);

  const distanceKm = distanceRes.records.reduce(
    (sum, record: any) => sum + toKm(record.distance),
    0,
  );

  const activeCalories = activeCaloriesRes.records.reduce(
    (sum, record: any) => sum + toKcal(record.energy),
    0,
  );
  const totalCalories = totalCaloriesRes.records.reduce(
    (sum, record: any) => sum + toKcal(record.energy),
    0,
  );
  const caloriesBurned = activeCalories > 0 ? activeCalories : totalCalories;

  const durationFromIntervals = stepsRes.records.reduce((sum, record: any) => {
    if (!record.startTime || !record.endTime) return sum;
    const start = new Date(record.startTime).getTime();
    const end = new Date(record.endTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return sum;
    return sum + (end - start);
  }, 0);
  const durationMin = durationFromIntervals > 0
    ? msToMinutes(durationFromIntervals)
    : safeMinutes(steps / 105);

  return buildSyncedEntry({
    source: 'google_fit',
    date,
    syncedAt: new Date().toISOString(),
    steps,
    distanceKm,
    caloriesBurned,
    durationMin,
  });
}

function withCallback<T>(
  invoke: (cb: (error: string | null, result: T) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    invoke((error, result) => {
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve(result);
    });
  });
}

async function buildIosHealthKitBatch(date: string): Promise<ActivitySyncBatchDto> {
  const healthkitModule = await import('react-native-health');
  const AppleHealthKit = healthkitModule.default;
  const { startIso, endIso } = toDayRange(date);

  await withCallback<any>((cb) => AppleHealthKit.isAvailable((error, available) => {
    cb(error as any, available as any);
  }));

  const permissions = {
    permissions: {
      read: [
        AppleHealthKit.Constants.Permissions.Steps,
        AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
        AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
      ],
      write: [],
    },
  };

  await withCallback<any>((cb) => AppleHealthKit.initHealthKit(permissions as any, (error, result) => {
    cb(error as any, result as any);
  }));

  const [stepCount, distance, activeEnergySamples] = await Promise.all([
    withCallback<any>((cb) => AppleHealthKit.getStepCount({ date }, (error, result) => cb(error as any, result as any))),
    withCallback<any>((cb) => AppleHealthKit.getDistanceWalkingRunning({ startDate: startIso, endDate: endIso }, (error, result) => cb(error as any, result as any))),
    withCallback<any[]>((cb) => AppleHealthKit.getActiveEnergyBurned({ startDate: startIso, endDate: endIso }, (error, result) => cb(error as any, result as any))),
  ]);

  const steps = Number(stepCount?.value ?? 0);
  const distanceKm = Number(distance?.value ?? 0) / 1000;
  const caloriesBurned = activeEnergySamples.reduce((sum, sample: any) => {
    const val = Number(sample?.value ?? 0);
    return sum + (Number.isFinite(val) ? val : 0);
  }, 0);
  const durationMin = safeMinutes(steps / 105);

  return buildSyncedEntry({
    source: 'apple_health',
    date,
    syncedAt: new Date().toISOString(),
    steps,
    distanceKm,
    caloriesBurned,
    durationMin,
  });
}

async function buildNativeBatch(date: string): Promise<ActivitySyncBatchDto> {
  if (Platform.OS === 'android') {
    return buildAndroidHealthConnectBatch(date);
  }

  if (Platform.OS === 'ios') {
    return buildIosHealthKitBatch(date);
  }

  throw new Error('Health sync chi ho tro tren iOS/Android native build.');
}

class ActivitySyncService {
  async syncToday(date?: string): Promise<ActivitySyncResult> {
    await featureGatingService.requireFeature('healthkit_sync', 'Health sync');

    const targetDate = date ?? new Date().toISOString().split('T')[0];
    const payload = await buildNativeBatch(targetDate);
    const res = await apiClient.post<ActivitySyncResult>('/log/activity/sync', payload);
    return res.data;
  }
}

export const activitySyncService = new ActivitySyncService();
