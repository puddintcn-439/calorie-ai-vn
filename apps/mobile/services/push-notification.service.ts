import type * as ExpoNotifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from './api';
import { authStorage } from './auth-storage';
import { appLogger } from './logger.service';

type NotificationsModule = typeof ExpoNotifications;

let notificationsModule: NotificationsModule | null | undefined;

function getNotificationsModule(): NotificationsModule | null {
  if (Platform.OS === 'web') {
    return null;
  }

  if (notificationsModule === undefined) {
    // Avoid loading expo-notifications on web; it registers unsupported web listeners at module load time.
    notificationsModule = require('expo-notifications') as NotificationsModule;
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }

  return notificationsModule;
}

class PushNotificationService {
  private initPromise: Promise<string | null> | null = null;

  private getExpoProjectId(): string | null {
    return Constants.easConfig?.projectId
      ?? Constants.expoConfig?.extra?.eas?.projectId
      ?? null;
  }

  private getRegistrationMetadata() {
    const expoConfig = Constants.expoConfig;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return {
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
      device_id: Constants.sessionId ?? Constants.installationId ?? undefined,
      app_version: expoConfig?.version ?? undefined,
      timezone,
      timezone_offset_minutes: new Date().getTimezoneOffset(),
    };
  }

  private async ensureAndroidReminderChannel(Notifications: NotificationsModule) {
    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Meal reminders',
      description: 'Meal logging reminders and weight-loss plan nudges',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6ee7b7',
      sound: 'default',
    });
  }

  /**
   * Initialize push notifications for the app
   */
  async initializePushNotifications(): Promise<string | null> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initializePushNotificationsInternal().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  private async initializePushNotificationsInternal(): Promise<string | null> {
    try {
      const Notifications = getNotificationsModule();
      // Web push needs VAPID setup; skip token registration on web to avoid noisy runtime errors.
      if (!Notifications) {
        return null;
      }

      await this.ensureAndroidReminderChannel(Notifications);

      const existingPermissions = await Notifications.getPermissionsAsync();
      const finalPermissions = existingPermissions.granted
        ? existingPermissions
        : await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          });

      if (!finalPermissions.granted) {
        appLogger.info('Push', 'User declined notification permissions');
        return null;
      }

      const projectId = this.getExpoProjectId();
      if (!projectId) {
        appLogger.info('Push', 'Skipping Expo push token registration because no Expo projectId is configured');
        return null;
      }

      // Get push token (on physical device or simulator with proper setup)
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      const cachedToken = await authStorage.getItemAsync('push_token');

      try {
        const metadata = this.getRegistrationMetadata();
        await apiClient.post('/reminders/push-token', {
          token,
          ...metadata,
        });
        if (cachedToken && cachedToken !== token) {
          await this.unregisterPushToken(cachedToken, false);
        }
        await authStorage.setItemAsync('push_token', token);
        appLogger.info('Push', 'Token registered with backend');
      } catch (err) {
        appLogger.warn('Push', 'Failed to register token with backend', err);
      }

      return token;
    } catch (error) {
      appLogger.warn('Push', 'Failed to initialize notifications', error);
      return null;
    }
  }

  async unregisterPushToken(token?: string | null, clearLocalToken = true): Promise<void> {
    const resolvedToken = token ?? await authStorage.getItemAsync('push_token');
    if (!resolvedToken) return;

    try {
      await apiClient.delete('/reminders/push-token', { data: { token: resolvedToken } });
    } catch (error) {
      appLogger.warn('Push', 'Failed to unregister token with backend', error);
    } finally {
      if (clearLocalToken) {
        await authStorage.deleteItemAsync('push_token');
      }
    }
  }

  /**
   * Send local notification immediately
   */
  async sendLocalNotification(options: {
    title: string;
    body: string;
    data?: Record<string, any>;
  }) {
    try {
      const Notifications = getNotificationsModule();
      if (!Notifications) {
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: options.title,
          body: options.body,
          data: options.data ?? {},
          sound: 'default',
          badge: 1,
        },
        trigger: null, // Send immediately
      });
    } catch (error) {
      appLogger.warn('Push', 'Failed to send notification', error);
    }
  }

  /**
   * Schedule notification for specific time
   */
  async scheduleNotificationAtTime(options: {
    title: string;
    body: string;
    time: string; // HH:MM format
    data?: Record<string, any>;
  }) {
    try {
      const Notifications = getNotificationsModule();
      if (!Notifications) {
        return;
      }

      const [hours, minutes] = options.time.split(':').map(Number);
      const trigger = new Date();
      trigger.setHours(hours, minutes, 0);

      // If time is in the past today, schedule for tomorrow
      if (trigger < new Date()) {
        trigger.setDate(trigger.getDate() + 1);
      }

      const seconds = Math.floor((trigger.getTime() - Date.now()) / 1000);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: options.title,
          body: options.body,
          data: options.data ?? {},
          sound: 'default',
          badge: 1,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, seconds),
        },
      });

      appLogger.info('Push', 'Scheduled notification', { time: options.time });
    } catch (error) {
      appLogger.warn('Push', 'Failed to schedule notification', error);
    }
  }

  /**
   * Schedule recurring daily notification
   */
  async scheduleRecurringNotification(options: {
    title: string;
    body: string;
    time: string; // HH:MM format
    data?: Record<string, any>;
  }) {
    try {
      const Notifications = getNotificationsModule();
      if (!Notifications) {
        return;
      }

      const [hours, minutes] = options.time.split(':').map(Number);

      // Schedule daily notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: options.title,
          body: options.body,
          data: options.data ?? {},
          sound: 'default',
          badge: 1,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour: hours,
          minute: minutes,
          repeats: true,
        },
      });

      appLogger.info('Push', 'Scheduled recurring notification', { time: options.time });
    } catch (error) {
      appLogger.warn('Push', 'Failed to schedule recurring notification', error);
    }
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications() {
    try {
      const Notifications = getNotificationsModule();
      if (!Notifications) {
        return;
      }

      await Notifications.cancelAllScheduledNotificationsAsync();
      appLogger.info('Push', 'Cancelled all notifications');
    } catch (error) {
      appLogger.warn('Push', 'Failed to cancel notifications', error);
    }
  }

  /**
   * Add notification response listener (when user taps notification)
   */
  onNotificationResponse(callback: (response: ExpoNotifications.NotificationResponse) => void) {
    const Notifications = getNotificationsModule();
    if (!Notifications) {
      return { remove: () => {} };
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(callback);
    return subscription;
  }

  async syncHydrationReminders(slots: Array<{ time: string; amount_ml: number }>, enabled = true) {
    try {
      const Notifications = getNotificationsModule();
      if (!Notifications) return;

      await this.ensureAndroidReminderChannel(Notifications);
      const validSlots = slots
        .filter((slot) => /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time) && Number(slot.amount_ml) > 0)
        .sort((left, right) => left.time.localeCompare(right.time));
      const desiredSignature = validSlots.map((slot) => `${slot.time}:${Math.round(slot.amount_ml)}`).join('|');
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const hydrationNotifications = scheduled.filter((item) => item.content.data?.kind === 'hydration_reminder');
      if (!enabled) {
        await Promise.all(hydrationNotifications.map((item) => (
          Notifications.cancelScheduledNotificationAsync(item.identifier)
        )));
        appLogger.info('Push', 'Hydration reminders disabled');
        return;
      }
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.status !== 'granted') return;
      const existingSignature = hydrationNotifications
        .map((item) => `${String(item.content.data?.time ?? '')}:${Number(item.content.data?.amount_ml ?? 0)}`)
        .sort()
        .join('|');

      if (desiredSignature === existingSignature) return;

      await Promise.all(hydrationNotifications.map((item) => (
        Notifications.cancelScheduledNotificationAsync(item.identifier)
      )));

      await Promise.all(validSlots.map(async (slot) => {
        const [hour, minute] = slot.time.split(':').map(Number);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Đến giờ uống nước',
            body: `Uống khoảng ${Math.round(slot.amount_ml)}ml và ghi nhận trong Nhật ký.`,
            data: {
              kind: 'hydration_reminder',
              route: '/log',
              time: slot.time,
              amount_ml: Math.round(slot.amount_ml),
            },
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            hour,
            minute,
            repeats: true,
          },
        });
      }));
      appLogger.info('Push', 'Hydration reminders synchronized', { count: validSlots.length });
    } catch (error) {
      appLogger.warn('Push', 'Failed to synchronize hydration reminders', error);
    }
  }

  /**
   * Listen while the app is open so the in-app bell and banner update immediately.
   */
  onNotificationReceived(callback: (notification: ExpoNotifications.Notification) => void) {
    const Notifications = getNotificationsModule();
    if (!Notifications) {
      return { remove: () => {} };
    }

    return Notifications.addNotificationReceivedListener(callback);
  }
}

export const pushNotificationService = new PushNotificationService();
