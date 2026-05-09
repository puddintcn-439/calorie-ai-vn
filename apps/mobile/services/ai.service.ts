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
  formData.append('image', {
    uri,
    name: 'food.jpg',
    type: 'image/jpeg',
  } as any);

  const res = await apiClient.post<AIScanResponse>('/ai/scan/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });

  return res.data;
}

export async function scanText(text: string): Promise<AIScanResponse> {
  const res = await apiClient.post<AIScanResponse>('/ai/scan/text', { text });
  return res.data;
}

export async function scanVoice(payload: ScanVoicePayload): Promise<AIScanResponse> {
  const res = await apiClient.post<AIScanResponse>('/ai/scan/voice', payload);
  return res.data;
}

export async function scanReceipt(payload: ScanReceiptPayload): Promise<AIScanResponse> {
  const formData = new FormData();
  formData.append('receipt_image', {
    uri: payload.uri,
    name: 'receipt.jpg',
    type: 'image/jpeg',
  } as any);

  if (payload.locale) formData.append('locale', payload.locale);
  if (payload.currency) formData.append('currency', payload.currency);
  if (payload.merchant_hint) formData.append('merchant_hint', payload.merchant_hint);
  if (payload.meal_hint) formData.append('meal_hint', payload.meal_hint);

  const res = await apiClient.post<AIScanResponse>('/ai/scan/receipt', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });

  return res.data;
}

export async function refineScan(
  originalItemsSummary: string,
  context: string,
  scanId: string,
): Promise<AIScanResponse> {
  const res = await apiClient.post<AIScanResponse>('/ai/scan/refine', {
    scan_id: scanId,
    context,
    original_items_summary: originalItemsSummary,
  });
  return res.data;
}

export async function askCoach(
  message: string,
  context: { today_calories: number; target_calories: number },
): Promise<AICoachResponse> {
  // Check subscription access to AI Coach
  await featureGatingService.requireFeature('ai_coach', 'AI Coach');

  const res = await apiClient.post<AICoachResponse>('/ai/coach', {
    message,
    ...context,
  });
  return res.data;
}
