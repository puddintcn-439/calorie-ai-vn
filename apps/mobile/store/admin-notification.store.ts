import { Platform } from 'react-native';
import { adminService, AdminNotification } from '../services/admin.service';

const create = require('zustand').create as typeof import('zustand').create;
const STORAGE_KEY = 'calorie-ai.admin.seen-notifications';

function readSeenIds(): string[] {
  if (Platform.OS !== 'web') return [];
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function saveSeenIds(ids: string[]) {
  if (Platform.OS !== 'web') return;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, 500)));
  } catch {
    // Notification read state is non-critical and can stay in memory.
  }
}

type AdminNotificationState = {
  notifications: AdminNotification[];
  seenIds: string[];
  unreadCount: number;
  loading: boolean;
  initialized: boolean;
  toast: AdminNotification | null;
  refresh: (silent?: boolean) => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissToast: () => void;
};

function countUnread(items: AdminNotification[], seenIds: string[]) {
  const seen = new Set(seenIds);
  return items.filter((item) => item.needs_attention && !seen.has(item.id)).length;
}

export const useAdminNotificationStore = create<AdminNotificationState>((set, get) => ({
  notifications: [],
  seenIds: readSeenIds(),
  unreadCount: 0,
  loading: false,
  initialized: false,
  toast: null,

  refresh: async (silent = false) => {
    if (!silent) set({ loading: true });
    try {
      const response = await adminService.fetchNotifications();
      const notifications = response.notifications ?? [];
      const previous = new Set(get().notifications.map((item) => item.id));
      const toast = get().initialized
        ? notifications.find((item) => item.needs_attention && !previous.has(item.id)) ?? null
        : null;
      set({
        notifications,
        unreadCount: countUnread(notifications, get().seenIds),
        initialized: true,
        ...(toast ? { toast } : {}),
      });
    } finally {
      if (!silent) set({ loading: false });
    }
  },

  markRead: (id) => {
    const seenIds = [...new Set([id, ...get().seenIds])];
    saveSeenIds(seenIds);
    set({
      seenIds,
      unreadCount: countUnread(get().notifications, seenIds),
      toast: get().toast?.id === id ? null : get().toast,
    });
  },

  markAllRead: () => {
    const seenIds = [...new Set([...get().notifications.map((item) => item.id), ...get().seenIds])];
    saveSeenIds(seenIds);
    set({ seenIds, unreadCount: 0, toast: null });
  },

  dismissToast: () => set({ toast: null }),
}));
