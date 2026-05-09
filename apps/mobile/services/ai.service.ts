import { AIScanResponse, AICoachResponse } from '@calorie-ai/types';
import { apiClient } from './api';
import { featureGatingService } from './feature-gating.service';
import * as FileSystem from 'expo-file-system';

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
