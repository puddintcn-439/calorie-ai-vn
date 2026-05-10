import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from './api';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class PushNotificationService {
  private getExpoProjectId(): string | null {
    return Constants.easConfig?.projectId
      ?? Constants.expoConfig?.extra?.eas?.projectId
      ?? null;
  }

  /**
   * Initialize push notifications for the app
   */
  async initializePushNotifications(): Promise<string | null> {
    try {
      // Web push needs VAPID setup; skip token registration on web to avoid noisy runtime errors.
      if (Platform.OS === 'web') {
        return null;
      }

      // Request user permission for notifications
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[Push] User declined notification permissions');
        return null;
      }

      const projectId = this.getExpoProjectId();
      if (!projectId) {
        console.log('[Push] Skipping Expo push token registration because no Expo projectId is configured');
        return null;
      }

      // Get push token (on physical device or simulator with proper setup)
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log('[Push] Expo push token:', token);

      // Register token with backend so server-side cron can send pushes
      try {
        await apiClient.post('/reminders/push-token', {
          token,
          platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
        });
        console.log('[Push] Token registered with backend');
      } catch (err) {
        console.warn('[Push] Failed to register token with backend:', err);
      }

      // Set up notification channels for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
          name: 'Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6ee7b7',
          sound: 'default',
        });
      }

      return token;
    } catch (error) {
      console.warn('[Push] Failed to initialize notifications:', error);
      return null;
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
      console.error('[Push] Failed to send notification:', error);
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

      console.log(`[Push] Scheduled notification for ${options.time}`);
    } catch (error) {
      console.error('[Push] Failed to schedule notification:', error);
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

      console.log(`[Push] Scheduled recurring notification daily at ${options.time}`);
    } catch (error) {
      console.error('[Push] Failed to schedule recurring notification:', error);
    }
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('[Push] Cancelled all notifications');
    } catch (error) {
      console.error('[Push] Failed to cancel notifications:', error);
    }
  }

  /**
   * Add notification response listener (when user taps notification)
   */
  onNotificationResponse(callback: (response: Notifications.NotificationResponse) => void) {
    const subscription = Notifications.addNotificationResponseReceivedListener(callback);
    return subscription;
  }
}

export const pushNotificationService = new PushNotificationService();
