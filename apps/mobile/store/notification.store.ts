import { notificationsService, UserNotification } from '../services/notifications.service';

const create = require('zustand').create as typeof import('zustand').create;

type NotificationState = {
  notifications: UserNotification[];
  unreadCount: number;
  loading: boolean;
  initialized: boolean;
  toast: UserNotification | null;
  refresh: (silent?: boolean) => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  ingestPush: (notification: UserNotification) => void;
  dismissToast: () => void;
  clear: () => void;
};

function unreadCount(items: UserNotification[]) {
  return items.filter((item) => !item.read_at).length;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  initialized: false,
  toast: null,

  refresh: async (silent = false) => {
    if (!silent) set({ loading: true });
    try {
      const response = await notificationsService.fetchNotifications();
      const next = response.notifications ?? [];
      const previousIds = new Set(get().notifications.map((item) => item.id));
      const newest = get().initialized
        ? next.find((item) => !item.read_at && !previousIds.has(item.id)) ?? null
        : null;
      set({
        notifications: next,
        unreadCount: Number.isFinite(response.unread_count)
          ? response.unread_count
          : unreadCount(next),
        initialized: true,
        ...(newest ? { toast: newest } : {}),
      });
    } finally {
      if (!silent) set({ loading: false });
    }
  },

  markRead: async (notificationId) => {
    const previous = get().notifications;
    const now = new Date().toISOString();
    const optimistic = previous.map((item) => (
      item.id === notificationId ? { ...item, read_at: item.read_at ?? now } : item
    ));
    set({ notifications: optimistic, unreadCount: unreadCount(optimistic) });
    try {
      const updated = await notificationsService.markNotificationRead(notificationId);
      const next = get().notifications.map((item) => item.id === notificationId ? updated : item);
      set({ notifications: next, unreadCount: unreadCount(next) });
    } catch {
      set({ notifications: previous, unreadCount: unreadCount(previous) });
      throw new Error('mark_read_failed');
    }
  },

  markAllRead: async () => {
    const previous = get().notifications;
    const now = new Date().toISOString();
    set({
      notifications: previous.map((item) => ({ ...item, read_at: item.read_at ?? now })),
      unreadCount: 0,
    });
    try {
      await notificationsService.markAllRead();
    } catch {
      set({ notifications: previous, unreadCount: unreadCount(previous) });
      throw new Error('mark_all_read_failed');
    }
  },

  ingestPush: (notification) => {
    const current = get().notifications;
    const existing = current.find((item) => item.id === notification.id);
    const next = existing
      ? current.map((item) => item.id === notification.id ? { ...item, ...notification } : item)
      : [notification, ...current];
    set({
      notifications: next,
      unreadCount: unreadCount(next),
      initialized: true,
      toast: notification,
    });
  },

  dismissToast: () => set({ toast: null }),

  clear: () => set({
    notifications: [],
    unreadCount: 0,
    loading: false,
    initialized: false,
    toast: null,
  }),
}));
