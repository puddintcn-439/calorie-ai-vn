import { apiClient } from '../services/api';
import { authStorage } from '../services/auth-storage';
import { pushNotificationService } from '../services/push-notification.service';

const create = require('zustand').create as typeof import('zustand').create;

interface AuthState {
  token: string | null;
  userId: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  loadToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  isLoading: true,

  loadToken: async () => {
    const token = await authStorage.getItemAsync('auth_token');
    const userId = await authStorage.getItemAsync('user_id');
    if (!token) {
      set({ token: null, userId: null, isLoading: false });
      return;
    }

    try {
      // Validate cached token before routing to protected tabs.
      await apiClient.get('/user/profile');
      set({ token, userId, isLoading: false });
      pushNotificationService.initializePushNotifications();
    } catch {
      await authStorage.deleteItemAsync('auth_token');
      await authStorage.deleteItemAsync('user_id');
      set({ token: null, userId: null, isLoading: false });
    }
  },

  login: async (email, password) => {
    const res = await apiClient.post('/auth/login', { email, password });
    const { access_token, user_id } = res.data;
    await authStorage.setItemAsync('auth_token', access_token);
    await authStorage.setItemAsync('user_id', user_id);
    set({ token: access_token, userId: user_id });
    pushNotificationService.initializePushNotifications();
  },

  register: async (email, password, fullName) => {
    const res = await apiClient.post('/auth/register', { email, password, full_name: fullName });
    const { access_token, user_id } = res.data;
    await authStorage.setItemAsync('auth_token', access_token);
    await authStorage.setItemAsync('user_id', user_id);
    set({ token: access_token, userId: user_id });
    pushNotificationService.initializePushNotifications();
  },

  logout: async () => {
    await pushNotificationService.unregisterPushToken();
    await authStorage.deleteItemAsync('auth_token');
    await authStorage.deleteItemAsync('user_id');
    set({ token: null, userId: null });
  },
}));
