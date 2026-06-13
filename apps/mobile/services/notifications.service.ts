import { apiClient } from './api';

export type UserNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, any>;
  read_at: string | null;
  created_at: string | null;
};

export const notificationsService = {
  async fetchNotifications(): Promise<{ notifications: UserNotification[] }> {
    const { data } = await apiClient.get<{ notifications: UserNotification[] }>('/notifications');
    return data;
  },

  async markNotificationRead(notificationId: string): Promise<UserNotification> {
    const { data } = await apiClient.patch<UserNotification>(`/notifications/${encodeURIComponent(notificationId)}/read`);
    return data;
  },
};
