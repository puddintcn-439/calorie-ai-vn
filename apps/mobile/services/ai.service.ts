import { Platform } from 'react-native';
import { AIScanResponse, AICoachResponse } from '@calorie-ai/types';
import { apiClient } from './api';
import { featureGatingService } from './feature-gating.service';

export interface ScanVoicePayload {
  transcript: string;
  locale?: string;
  timezone?: string;
  meal_hint?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  context?: {
    source?: string;
    device_language?: string;
  };
}

export interface ScanReceiptPayload {
  uri: string;
  locale?: string;
  currency?: string;
  merchant_hint?: string;
  meal_hint?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export async function scanImageFromUri(uri: string): Promise<AIScanResponse> {
  const formData = new FormData();
  // Resize & compress on the client to reduce upload size and provider cost
  const file = await prepareImageForUpload(uri, 'food.jpg', 768, 0.64);

  if (Platform.OS === 'web') {
    formData.append('image', file as Blob, 'food.jpg');
  } else {
    formData.append('image', file as any);
  }

  const res = await withRetry(() => apiClient.post<AIScanResponse>('/ai/scan/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 45000,
  }));

  return res.data;
}

export async function scanText(text: string): Promise<AIScanResponse> {
  const res = await withRetry(() => apiClient.post<AIScanResponse>('/ai/scan/text', { text }));
  return res.data;
}

export async function scanVoice(payload: ScanVoicePayload): Promise<AIScanResponse> {
  const res = await withRetry(() => apiClient.post<AIScanResponse>('/ai/scan/voice', payload));
  return res.data;
}

export async function scanReceipt(payload: ScanReceiptPayload): Promise<AIScanResponse> {
  const formData = new FormData();
  const file = await prepareImageForUpload(payload.uri, 'receipt.jpg');
  if (Platform.OS === 'web') {
    formData.append('receipt_image', file as Blob, 'receipt.jpg');
  } else {
    formData.append('receipt_image', file as any);
  }

  if (payload.locale) formData.append('locale', payload.locale);
  if (payload.currency) formData.append('currency', payload.currency);
  if (payload.merchant_hint) formData.append('merchant_hint', payload.merchant_hint);
  if (payload.meal_hint) formData.append('meal_hint', payload.meal_hint);

  const res = await withRetry(() => apiClient.post<AIScanResponse>('/ai/scan/receipt', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 45000,
  }));

  return res.data;
}

/**
 * Resize and compress an image for upload.
 * - On native (Expo) uses expo-image-manipulator.
 * - On web uses canvas to downscale and toBlob.
 */
async function prepareImageForUpload(
  uri: string,
  filename = 'photo.jpg',
  maxWidth = 1024,
  quality = 0.7,
): Promise<Blob | { uri: string; name: string; type: string }> {
  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    const blob = await resp.blob();

    // Create an ImageBitmap for efficient drawing
    const imageBitmap = await (globalThis as any).createImageBitmap(blob);
    let width = imageBitmap.width;
    let height = imageBitmap.height;

    if (width > maxWidth) {
      const ratio = maxWidth / width;
      width = Math.round(maxWidth);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(imageBitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b || blob), 'image/jpeg', quality);
    });
  }

  // Native path: use expo-image-manipulator (loaded at runtime)
  // require at runtime to avoid build-time errors when dependency isn't installed in some environments
  // (the package is declared in package.json above)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ImageManipulator = require('expo-image-manipulator');
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
  );

  return { uri: result.uri, name: filename, type: 'image/jpeg' };
}

export async function refineScan(
  originalItemsSummary: string,
  context: string,
  scanId: string,
): Promise<AIScanResponse> {
  const res = await withRetry(() => apiClient.post<AIScanResponse>('/ai/scan/refine', {
    scan_id: scanId,
    context,
    original_items_summary: originalItemsSummary,
  }));
  return res.data;
}

export async function askCoach(
  message: string,
  context: { today_calories: number; target_calories: number },
): Promise<AICoachResponse> {
  // Check subscription access to AI Coach
  await featureGatingService.requireFeature('ai_coach', 'AI Coach');

  const res = await withRetry(() => apiClient.post<AICoachResponse>('/ai/coach', {
    message,
    ...context,
  }));
  return res.data;
}

// Small retry wrapper with exponential backoff for transient errors
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelay = 600): Promise<T> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Determine if error is retryable
      const status = err?.response?.status;
      const code = err?.code;
      const isServerError = typeof status === 'number' && (status >= 500 || status === 429 || status === 503);
      const isNetwork = code === 'ECONNABORTED' || code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ERR_NETWORK';
      const shouldRetry = isServerError || isNetwork;
      if (!shouldRetry || attempt === attempts) break;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastError;
}
