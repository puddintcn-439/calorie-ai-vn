import { ActivityType, ACTIVITY_MET } from '@calorie-ai/types';

/**
 * Estimate calories burned for an activity using METs.
 */
export function estimateExerciseCalories(activityType: ActivityType, durationMin: number, weightKg: number): number {
  const met = (ACTIVITY_MET as Record<string, number>)[activityType] ?? 5;
  const safeWeight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 65;
  return Math.max(1, Math.round(met * safeWeight * (durationMin / 60)));
}

/**
 * Heuristic: estimate kcal from steps. Base: 0.04 kcal/step at 65kg.
 * Scales linearly with weight.
 */
export function stepsToKcal(steps: number, weightKg?: number): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;
  const w = typeof weightKg === 'number' && Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 65;
  const baseFactor = 0.04; // kcal per step at 65kg
  return Math.max(0, Math.round(steps * baseFactor * (w / 65)));
}
