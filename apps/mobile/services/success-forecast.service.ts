import type { ReminderEffectivenessSummary, SuccessForecast, SuccessForecastReason, TodaySummary } from '@calorie-ai/types';

type ForecastLocale = 'vi' | 'en' | string;

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueReasons(reasons: SuccessForecastReason[]) {
  return Array.from(new Set(reasons));
}

function localized(locale: ForecastLocale, vi: string, en: string) {
  return locale === 'vi' ? vi : en;
}

function trendDriver(score: TodaySummary['health_score']) {
  const delta = score.trend.delta_vs_7d;
  if (score.trend.days_with_data < 3 || delta === null) return 55;
  if (delta >= 8) return 95;
  if (delta >= 3) return 82;
  if (delta >= -2) return 68;
  if (delta >= -7) return 45;
  return 25;
}

function patternRiskDriver(score: TodaySummary['health_score'], reminder?: ReminderEffectivenessSummary | null) {
  let risk = 0;
  const weekly = score.weekly_adherence;
  if (weekly.nutrition < 65) risk += 18;
  if (weekly.activity < 65) risk += 18;
  if (weekly.logging < 70) risk += 18;
  if (weekly.plan < 65) risk += 14;
  if (score.trend.direction === 'down') risk += 14;
  if ((reminder?.ignore_rate ?? 0) >= 50) risk += 12;
  if ((reminder?.action_rate ?? 100) <= 25 && (reminder?.sent ?? 0) >= 3) risk += 10;
  return clampScore(100 - Math.min(100, risk));
}

function buildReasons(score: TodaySummary['health_score'], reminder?: ReminderEffectivenessSummary | null): SuccessForecastReason[] {
  const reasons: SuccessForecastReason[] = [];
  const weekly = score.weekly_adherence;

  if (score.trend.days_with_data < 3) reasons.push('limited_data');
  if (weekly.overall < 70) reasons.push('low_weekly_adherence');
  if (score.trend.direction === 'down' && (score.trend.delta_vs_7d ?? 0) <= -3) reasons.push('declining_health_score');
  if (weekly.nutrition < 65) reasons.push('nutrition_gap');
  if (weekly.activity < 65) reasons.push('activity_gap');
  if (weekly.logging < 70) reasons.push('logging_gap');
  if (weekly.plan < 65) reasons.push('plan_gap');
  if ((reminder?.ignore_rate ?? 0) >= 50) reasons.push('ignored_reminders');
  if ((reminder?.action_rate ?? 100) <= 25 && (reminder?.sent ?? 0) >= 3) reasons.push('low_reminder_action');

  return uniqueReasons(reasons);
}

function choosePrimaryAction(reasons: SuccessForecastReason[]): SuccessForecast['recovery_plan']['primary_action'] {
  if (reasons.includes('ignored_reminders') || reasons.includes('low_reminder_action')) return 'adjust_reminders';
  if (reasons.includes('logging_gap') || reasons.includes('nutrition_gap')) return 'log_meal';
  if (reasons.includes('activity_gap')) return 'move';
  if (reasons.includes('plan_gap')) return 'complete_plan';
  return 'maintain';
}

function buildRecoveryPlan(
  forecastScore: number,
  reasons: SuccessForecastReason[],
  primaryAction: SuccessForecast['recovery_plan']['primary_action'],
  locale: ForecastLocale,
): SuccessForecast['recovery_plan'] {
  const atRisk = forecastScore < 60;
  const title = atRisk
    ? localized(locale, 'Kế hoạch cứu nhịp tuần này', 'Recovery plan for this week')
    : localized(locale, 'Kế hoạch giữ đà', 'Momentum plan');

  const steps: string[] = [];
  if (reasons.includes('logging_gap') || reasons.includes('nutrition_gap')) {
    steps.push(localized(locale, 'Log bữa gần nhất trước, không cần hoàn hảo.', 'Log the nearest meal first, even if it is rough.'));
  }
  if (reasons.includes('activity_gap')) {
    steps.push(localized(locale, 'Đi bộ hoặc vận động nhẹ 15 phút để kéo activity lên lại.', 'Add a 15-minute light walk to lift activity back up.'));
  }
  if (reasons.includes('plan_gap')) {
    steps.push(localized(locale, 'Hoàn thành một task nhỏ trong Today Plan.', 'Complete one small task from Today Plan.'));
  }
  if (reasons.includes('ignored_reminders') || reasons.includes('low_reminder_action')) {
    steps.push(localized(locale, 'Dời reminder yếu nhất 30-60 phút hoặc đổi sang lời nhắc nhẹ hơn.', 'Shift the weakest reminder by 30-60 minutes or use a gentler reminder style.'));
  }
  if (steps.length === 0) {
    steps.push(localized(locale, 'Giữ nhịp log và lặp lại bữa/hoạt động đang hiệu quả.', 'Keep logging and repeat the meal/activity rhythm that is working.'));
  }

  return {
    title,
    steps: steps.slice(0, 3),
    primary_action: primaryAction,
  };
}

export function buildSuccessForecast(args: {
  healthScore?: TodaySummary['health_score'] | null;
  reminderEffectiveness?: ReminderEffectivenessSummary | null;
  locale?: ForecastLocale;
}): SuccessForecast | null {
  const score = args.healthScore;
  if (!score) return null;

  const reminder = args.reminderEffectiveness ?? null;
  const adherenceDriver = clampScore(score.weekly_adherence.overall);
  const trend = trendDriver(score);
  const reminderResponse = reminder && reminder.sent > 0 ? clampScore(reminder.effectiveness_score) : 55;
  const patternRisk = patternRiskDriver(score, reminder);
  const forecastScore = clampScore(
    adherenceDriver * 0.4
    + trend * 0.3
    + reminderResponse * 0.2
    + patternRisk * 0.1,
  );
  const reasons = buildReasons(score, reminder);
  const riskLevel: SuccessForecast['risk_level'] = forecastScore < 55 ? 'high' : forecastScore < 75 ? 'medium' : 'low';
  const label: SuccessForecast['label'] = forecastScore < 55
    ? 'at_risk'
    : forecastScore < 75
      ? 'needs_attention'
      : forecastScore < 90
        ? 'on_track'
        : 'strong';
  const confidence: SuccessForecast['confidence'] = score.trend.days_with_data < 3
    ? 'low'
    : reminder && reminder.sent >= 3
      ? 'high'
      : 'medium';
  const primaryAction = choosePrimaryAction(reasons);
  const patterns = [
    ...score.weekly_adherence.patterns,
    ...(reminder?.patterns ?? []),
  ].slice(0, 4);

  return {
    score: forecastScore,
    label,
    risk_level: riskLevel,
    confidence,
    drivers: {
      adherence: adherenceDriver,
      trend,
      reminder_response: reminderResponse,
      pattern_risk: patternRisk,
    },
    reasons,
    patterns,
    recovery_plan: buildRecoveryPlan(forecastScore, reasons, primaryAction, args.locale ?? 'en'),
  };
}
