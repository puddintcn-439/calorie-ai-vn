import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { authStorage } from './auth-storage';

const DEFAULT_API_URL = 'http://localhost:3000';

function normalizeBaseUrl(url?: string | null): string | null {
  const trimmed = url?.trim().replace(/\/+$/, '');
  return trimmed || null;
}

function uniqueUrls(urls: Array<string | null>): string[] {
  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

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

function resolveLoopbackForPlatform(url: string): string {
  if (Platform.OS === 'web') {
    const browserHost = globalThis.location?.hostname;
    if (browserHost && /localhost|127\.0\.0\.1/i.test(browserHost) && /localhost|127\.0\.0\.1/i.test(url)) {
      return url.replace(/\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, `//${browserHost}:3000`);
    }

    return url;
  }

  const isLoopback = /localhost|127\.0\.0\.1/i.test(url);
  if (!isLoopback) return url;

  const expoHost = extractExpoHost();
  return expoHost ? url.replace(/\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, `//${expoHost}:3000`) : url;
}

function resolveApiUrls(): string[] {
  const configuredUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL) ?? DEFAULT_API_URL;
  const fallbackUrls = (process.env.EXPO_PUBLIC_API_FALLBACK_URLS ?? '')
    .split(',')
    .map(normalizeBaseUrl);

  return uniqueUrls([configuredUrl, ...fallbackUrls].map((url) => (
    url ? resolveLoopbackForPlatform(url) : null
  )));
}

function shouldRetryWithFallback(error: any): boolean {
  if (error?.response) return false;
  if (error?.config?.__apiFallbackTried) return false;
  const message = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '').toLowerCase();
  return code === 'err_network' || message.includes('network') || message.includes('failed to fetch');
}

const API_URLS = resolveApiUrls();
const BASE_URL = API_URLS[0];

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

apiClient.interceptors.response.use(undefined, async (error) => {
  if (!shouldRetryWithFallback(error)) {
    throw error;
  }

  const currentBaseUrl = normalizeBaseUrl(error.config?.baseURL) ?? BASE_URL;
  const nextBaseUrl = API_URLS.find((url) => url !== currentBaseUrl);
  if (!nextBaseUrl) {
    throw error;
  }

  error.config.__apiFallbackTried = true;
  error.config.baseURL = nextBaseUrl;
  return apiClient.request(error.config);
});
