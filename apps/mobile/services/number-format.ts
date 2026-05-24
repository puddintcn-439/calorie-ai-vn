export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function safeNumber(value: unknown, fallback = 0): number {
  return toFiniteNumber(value) ?? fallback;
}

export function safePositiveNumber(value: unknown, fallback: number): number {
  const numeric = toFiniteNumber(value);
  return numeric !== null && numeric > 0 ? numeric : fallback;
}

export function safeRound(value: unknown, fallback = 0): number {
  const numeric = toFiniteNumber(value);
  return numeric === null ? fallback : Math.round(numeric);
}

export function roundTo(value: unknown, decimals = 1, fallback = 0): number {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return fallback;
  const factor = 10 ** decimals;
  return Math.round(numeric * factor) / factor;
}

export function formatNumberVi(value: unknown, fallback = '0'): string {
  const numeric = toFiniteNumber(value);
  return numeric === null ? fallback : Math.round(numeric).toLocaleString('vi-VN');
}

export function formatKcal(value: unknown, fallback = '0'): string {
  return `${formatNumberVi(value, fallback)} kcal`;
}

export function formatMacro(value: unknown, fallback = '0'): string {
  const numeric = toFiniteNumber(value);
  return numeric === null ? `${fallback}g` : `${Math.round(numeric).toLocaleString('vi-VN')}g`;
}

export function formatPercent(value: unknown, fallback = '--'): string {
  const numeric = toFiniteNumber(value);
  return numeric === null ? fallback : `${Math.round(numeric)}%`;
}
