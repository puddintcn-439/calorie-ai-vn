import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { authStorage } from './auth-storage';

function extractExpoHost(): string | null {
  const hostSource = Constants.expoConfig?.hostUri
    ?? Constants.linkingUri
    ?? Constants.experienceUrl
    ?? null;

  if (!hostSource) {
    return null;
  }

  const normalized = hostSource.replace(/^exp:\/\//, 'http://').replace(/^exps:\/\//, 'https://');

  try {
    const parsed = new URL(normalized);
    return parsed.hostname || null;
  } catch {
    const match = normalized.match(/^(?:https?:\/\/)?([^/:]+)/i);
    return match?.[1] ?? null;
  }
}

function resolveBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

  if (Platform.OS === 'web') {
    const browserHost = globalThis.location?.hostname;
    if (browserHost && /localhost|127\.0\.0\.1/i.test(browserHost)) {
      return `http://${browserHost}:3000`;
    }

    return configuredUrl;
  }

  const isLoopback = /localhost|127\.0\.0\.1/i.test(configuredUrl);
  if (!isLoopback) {
    return configuredUrl;
  }

  const expoHost = extractExpoHost();
  if (!expoHost) {
    return configuredUrl;
  }

  return `http://${expoHost}:3000`;
}

const BASE_URL = resolveBaseUrl();

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
apiClient.interceptors.request.use(async (config) => {
  const token = await authStorage.getItemAsync('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
