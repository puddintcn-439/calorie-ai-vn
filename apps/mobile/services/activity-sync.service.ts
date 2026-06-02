import { ActivitySyncBatchDto, ActivitySyncResult } from '@calorie-ai/types';
import { Linking, Platform } from 'react-native';
import { apiClient } from './api';
import { featureGatingService } from './feature-gating.service';
import { getLocalDateYmd } from './date';

type HealthConnectPermission = {
  accessType: 'read' | 'write';
  recordType: string;
};

export interface ActivitySyncPhoneCheckInfo {
  platform: string;
  providerName: string;
  status: 'ready' | 'needs-install' | 'needs-native-build' | 'needs-permission' | 'unsupported';
  statusLabel: string;
  detail: string;
  deepLink: string;
  actionLabel: string;
  installLabel: string;
  supportUrl?: string;
  today?: ActivitySyncDiagnostics['today'];
}

export interface ActivitySyncDiagnostics {
  platform: string;
  providerName: string;
  availability: string;
  grantedPermissions: string[];
  missingPermissions: string[];
  today: {
    date: string;
    steps: number;
    distanceKm: number;
    caloriesBurned: number;
    steps_estimated_kcal?: number;
  } | null;
  notes: string[];
}

export const HEALTH_SYNC_SCREEN_LINK = 'calorieai://health-sync';
const HEALTH_CONNECT_STORE_URL = 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';
const APPLE_HEALTH_SUPPORT_URL = 'https://support.apple.com/108779';
const HEALTH_SYNC_PERMISSION_KEYS = ['Steps', 'Distance', 'ActiveCaloriesBurned', 'TotalCaloriesBurned'] as const;
const APPLE_HEALTH_READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
] as const;

type AppleHealthKitModule = typeof import('@kingstinct/react-native-healthkit');

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

function readHealthKitQuantity(statistics: { sumQuantity?: { quantity?: number } } | null | undefined): number {
  const value = Number(statistics?.sumQuantity?.quantity ?? 0);
  return Number.isFinite(value) ? value : 0;
}

async function getAppleHealthKitModule(): Promise<AppleHealthKitModule> {
  return import('@kingstinct/react-native-healthkit');
}

async function requestAppleHealthAuthorization(healthkit: AppleHealthKitModule): Promise<boolean> {
  return healthkit.requestAuthorization({
    toRead: APPLE_HEALTH_READ_TYPES,
  });
}

async function readAppleHealthDailySnapshot(date: string) {
  const healthkit = await getAppleHealthKitModule();
  const available = await healthkit.isHealthDataAvailableAsync();
  if (!available) {
    return {
      available: false,
      authorized: false,
      steps: 0,
      distanceKm: 0,
      caloriesBurned: 0,
    };
  }

  const authorized = await requestAppleHealthAuthorization(healthkit);
  if (!authorized) {
    return {
      available: true,
      authorized: false,
      steps: 0,
      distanceKm: 0,
      caloriesBurned: 0,
    };
  }

  const { startIso, endIso } = toDayRange(date);
  const filter = {
    date: {
      startDate: new Date(startIso),
      endDate: new Date(endIso),
    },
  };

  const [stepsStats, distanceStats, activeEnergyStats] = await Promise.all([
    healthkit.queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      { filter, unit: 'count' },
    ),
    healthkit.queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      ['cumulativeSum'],
      { filter, unit: 'm' },
    ),
    healthkit.queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      ['cumulativeSum'],
      { filter, unit: 'kcal' },
    ),
  ]);

  return {
    available: true,
    authorized: true,
    steps: readHealthKitQuantity(stepsStats),
    distanceKm: readHealthKitQuantity(distanceStats) / 1000,
    caloriesBurned: readHealthKitQuantity(activeEnergyStats),
  };
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

async function buildIosHealthKitBatch(date: string): Promise<ActivitySyncBatchDto> {
  const snapshot = await readAppleHealthDailySnapshot(date);
  if (!snapshot.available) {
    throw new Error('Apple Health khong kha dung tren thiet bi hien tai.');
  }
  if (!snapshot.authorized) {
    throw new Error('Can cap quyen Apple Health truoc khi dong bo.');
  }

  return buildSyncedEntry({
    source: 'apple_health',
    date,
    syncedAt: new Date().toISOString(),
    steps: snapshot.steps,
    distanceKm: snapshot.distanceKm,
    caloriesBurned: snapshot.caloriesBurned,
    durationMin: safeMinutes(snapshot.steps / 105),
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
  async getDiagnostics(date?: string): Promise<ActivitySyncDiagnostics> {
    const targetDate = date ?? getLocalDateYmd();

    if (Platform.OS === 'android') {
      const healthConnect = await import('react-native-health-connect');
      const sdkStatus = await healthConnect.getSdkStatus();
      const availability = sdkStatus === healthConnect.SdkAvailabilityStatus.SDK_AVAILABLE
        ? 'SDK available'
        : sdkStatus === healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
          ? 'Provider update required'
          : 'SDK unavailable';

      if (sdkStatus !== healthConnect.SdkAvailabilityStatus.SDK_AVAILABLE) {
        return {
          platform: 'android',
          providerName: 'Google Health Connect',
          availability,
          grantedPermissions: [],
          missingPermissions: [...HEALTH_SYNC_PERMISSION_KEYS],
          today: null,
          notes: ['Health Connect chua san sang tren thiet bi nay.'],
        };
      }

      await healthConnect.initialize();
      const grantedPermissions = await healthConnect.getGrantedPermissions();
      const grantedKeys = grantedPermissions
        .filter((permission: any) => permission.accessType === 'read')
        .map((permission: any) => permission.recordType);
      const missingPermissions = HEALTH_SYNC_PERMISSION_KEYS.filter((key) => !grantedKeys.includes(key));

      if (missingPermissions.length > 0) {
        return {
          platform: 'android',
          providerName: 'Google Health Connect',
          availability,
          grantedPermissions: grantedKeys,
          missingPermissions: [...missingPermissions],
          today: null,
          notes: ['Can cap them quyen truoc khi doc du lieu van dong hom nay.'],
        };
      }

      const { startIso, endIso } = toDayRange(targetDate);
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
      const distanceKm = distanceRes.records.reduce((sum, record: any) => sum + toKm(record.distance), 0);
      const activeCalories = activeCaloriesRes.records.reduce((sum, record: any) => sum + toKcal(record.energy), 0);
      const totalCalories = totalCaloriesRes.records.reduce((sum, record: any) => sum + toKcal(record.energy), 0);

      const estimatedStepsKcal = Math.max(0, Math.round(steps * 0.04));

      return {
        platform: 'android',
        providerName: 'Google Health Connect',
        availability,
        grantedPermissions: grantedKeys,
        missingPermissions: [],
        today: {
          date: targetDate,
          steps: Math.round(steps),
          distanceKm: Number(distanceKm.toFixed(2)),
          caloriesBurned: Math.round(activeCalories > 0 ? activeCalories : totalCalories),
          steps_estimated_kcal: estimatedStepsKcal,
        },
        notes: ['Snapshot doc truc tiep tu Google Health Connect tren thiet bi hien tai.'],
      };
    }

    if (Platform.OS === 'ios') {
      const snapshot = await readAppleHealthDailySnapshot(targetDate);
      if (!snapshot.available) {
        return {
          platform: 'ios',
          providerName: 'Apple Health',
          availability: 'Health unavailable',
          grantedPermissions: [],
          missingPermissions: [...APPLE_HEALTH_READ_TYPES],
          today: null,
          notes: ['Apple Health khong kha dung tren thiet bi hien tai.'],
        };
      }

      if (!snapshot.authorized) {
        return {
          platform: 'ios',
          providerName: 'Apple Health',
          availability: 'Health available',
          grantedPermissions: [],
          missingPermissions: [...APPLE_HEALTH_READ_TYPES],
          today: null,
          notes: ['Can cap quyen Apple Health truoc khi doc du lieu van dong hom nay.'],
        };
      }

      const steps = Math.round(snapshot.steps);
      const estimatedStepsKcal = Math.max(0, Math.round(steps * 0.04));
      return {
        platform: 'ios',
        providerName: 'Apple Health',
        availability: 'Health available',
        grantedPermissions: [...APPLE_HEALTH_READ_TYPES],
        missingPermissions: [],
        today: {
          date: targetDate,
          steps,
          distanceKm: Number(snapshot.distanceKm.toFixed(2)),
          caloriesBurned: Math.round(snapshot.caloriesBurned),
          steps_estimated_kcal: estimatedStepsKcal,
        },
        notes: ['Snapshot doc truc tiep tu Apple Health tren thiet bi hien tai.'],
      };
    }

    return {
      platform: Platform.OS,
      providerName: 'Health Sync',
      availability: 'Unsupported platform',
      grantedPermissions: [],
      missingPermissions: [],
      today: null,
      notes: ['Trang nay chi co y nghia tren ban native Android/iOS.'],
    };
  }

  async getPhoneCheckInfo(): Promise<ActivitySyncPhoneCheckInfo> {
    try {
      const diagnostics = await this.getDiagnostics();

      if (Platform.OS === 'android') {
        if (diagnostics.availability === 'SDK unavailable' || diagnostics.availability === 'Provider update required') {
          return {
            platform: 'android',
            providerName: 'Google Health Connect',
            status: 'needs-install',
            statusLabel: 'Can cai hoac cap nhat',
            detail: 'Health Connect chua san sang tren may nay. Cai dat hoac cap nhat roi mo lai app de test sync.',
            deepLink: HEALTH_SYNC_SCREEN_LINK,
            actionLabel: 'Mo trang cai dat',
            installLabel: 'Cai Health Connect',
            supportUrl: HEALTH_CONNECT_STORE_URL,
          };
        }

        if (diagnostics.missingPermissions.length > 0) {
          return {
            platform: 'android',
            providerName: 'Google Health Connect',
            status: 'needs-permission',
            statusLabel: 'Can cap quyen',
            detail: `Con thieu quyen: ${diagnostics.missingPermissions.join(', ')}. Mo Health Connect de cap quyen roi quay lai dong bo.`,
            deepLink: HEALTH_SYNC_SCREEN_LINK,
            actionLabel: 'Mo Health Connect',
            installLabel: 'Mo trang test',
            supportUrl: HEALTH_CONNECT_STORE_URL,
          };
        }

        return {
          platform: 'android',
          providerName: 'Google Health Connect',
          status: 'ready',
          statusLabel: 'San sang tren phone',
          detail: 'Health Connect da san sang va da co du quyen doc du lieu van dong.',
          deepLink: HEALTH_SYNC_SCREEN_LINK,
          actionLabel: 'Mo Health Connect',
          installLabel: 'Mo trang test',
          supportUrl: HEALTH_CONNECT_STORE_URL,
        };
      }

      if (Platform.OS === 'ios') {
        if (diagnostics.availability !== 'Health available') {
          return {
            platform: 'ios',
            providerName: 'Apple Health',
            status: 'unsupported',
            statusLabel: 'Health khong kha dung',
            detail: 'Apple Health khong kha dung tren thiet bi hien tai.',
            deepLink: HEALTH_SYNC_SCREEN_LINK,
            actionLabel: 'Mo Health / Settings',
            installLabel: 'Xem huong dan',
            supportUrl: APPLE_HEALTH_SUPPORT_URL,
          };
        }

        if (diagnostics.missingPermissions.length > 0) {
          return {
            platform: 'ios',
            providerName: 'Apple Health',
            status: 'needs-permission',
            statusLabel: 'Can cap quyen',
            detail: `Con thieu quyen: ${diagnostics.missingPermissions.join(', ')}. Mo Apple Health hoac Settings de cap quyen.`,
            deepLink: HEALTH_SYNC_SCREEN_LINK,
            actionLabel: 'Mo Health / Settings',
            installLabel: 'Mo trang test',
            supportUrl: APPLE_HEALTH_SUPPORT_URL,
          };
        }

        return {
          platform: 'ios',
          providerName: 'Apple Health',
          status: 'ready',
          statusLabel: 'San sang tren iPhone',
          detail: 'Apple Health da san sang va da co du quyen doc du lieu van dong.',
          deepLink: HEALTH_SYNC_SCREEN_LINK,
          actionLabel: 'Mo Health / Settings',
          installLabel: 'Mo trang test',
          supportUrl: APPLE_HEALTH_SUPPORT_URL,
        };
      }
    } catch {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        return {
          platform: Platform.OS,
          providerName: Platform.OS === 'android' ? 'Google Health Connect' : 'Apple Health',
          status: 'needs-native-build',
          statusLabel: 'Can native dev build',
          detail: 'Ban dang chay web/Expo Go. Health sync native chi hoat dong trong dev build hoac ban app da build.',
          deepLink: HEALTH_SYNC_SCREEN_LINK,
          actionLabel: 'Mo app settings',
          installLabel: 'Mo trang test',
          supportUrl: Platform.OS === 'android' ? HEALTH_CONNECT_STORE_URL : APPLE_HEALTH_SUPPORT_URL,
        };
      }
    }

    return {
      platform: Platform.OS,
      providerName: 'Health Sync',
      status: 'unsupported',
      statusLabel: 'Chi test duoc tren phone',
      detail: 'Man hinh nay dang chay tren web. Hay mo ban native tren Android/iPhone de test Activity Sync.',
      deepLink: HEALTH_SYNC_SCREEN_LINK,
      actionLabel: 'Mo app tren phone',
      installLabel: 'Xem huong dan',
    };
  }

  async openProviderSettings(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        const healthConnect = await import('react-native-health-connect');
        healthConnect.openHealthConnectSettings();
        return;
      } catch {
        await Linking.openURL(HEALTH_CONNECT_STORE_URL);
        return;
      }
    }

    if (Platform.OS === 'ios') {
      const urls = ['x-apple-health://', 'app-settings:'];

      for (const url of urls) {
        try {
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) {
            await Linking.openURL(url);
            return;
          }
        } catch {
          // Try the next candidate URL.
        }
      }

      await Linking.openURL(APPLE_HEALTH_SUPPORT_URL);
      return;
    }

    throw new Error('Chi mo duoc Health settings tren phone native.');
  }

  async openSupportUrl(): Promise<void> {
    if (Platform.OS === 'android') {
      await Linking.openURL(HEALTH_CONNECT_STORE_URL);
      return;
    }

    if (Platform.OS === 'ios') {
      await Linking.openURL(APPLE_HEALTH_SUPPORT_URL);
      return;
    }

    throw new Error('Khong co support link tren nen tang hien tai.');
  }

  async syncToday(date?: string): Promise<ActivitySyncResult> {
    await featureGatingService.requireFeature('healthkit_sync', 'Health sync');

    const targetDate = date ?? getLocalDateYmd();
    const payload = await buildNativeBatch(targetDate);
    const res = await apiClient.post<ActivitySyncResult>('/log/activity/sync', payload);
    return res.data;
  }
}

export const activitySyncService = new ActivitySyncService();
