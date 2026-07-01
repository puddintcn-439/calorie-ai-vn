import { HydrationScheduleSlot } from '@calorie-ai/types';

export const DEFAULT_HYDRATION_TIMES = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '21:30'];

export function buildSystemHydrationSlots(targetMl: number): HydrationScheduleSlot[] {
  const roundedTarget = Math.max(0, Math.round(targetMl / 50) * 50);
  const totalUnits = Math.max(DEFAULT_HYDRATION_TIMES.length, Math.round(roundedTarget / 50));
  const baseUnits = Math.floor(totalUnits / DEFAULT_HYDRATION_TIMES.length);
  const extraUnits = totalUnits % DEFAULT_HYDRATION_TIMES.length;
  return DEFAULT_HYDRATION_TIMES.map((time, index) => ({
    time,
    amount_ml: (baseUnits + (index < extraUnits ? 1 : 0)) * 50,
  }));
}

export function normalizeHydrationSlots(slots: HydrationScheduleSlot[]) {
  return [...slots]
    .filter((slot) => /^\d{2}:\d{2}$/.test(slot.time) && Number(slot.amount_ml) > 0)
    .sort((left, right) => left.time.localeCompare(right.time));
}

export function hydrationScheduleTotal(slots: HydrationScheduleSlot[]) {
  return slots.reduce((sum, slot) => sum + Number(slot.amount_ml || 0), 0);
}
