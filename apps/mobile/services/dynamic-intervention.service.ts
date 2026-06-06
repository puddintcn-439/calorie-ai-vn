import type {
  BehaviorMemory,
  DynamicIntervention,
  DynamicInterventionAction,
  DynamicInterventionMode,
  SuccessForecast,
  SuccessForecastReason,
} from '@calorie-ai/types';

type InterventionLocale = 'vi' | 'en' | string;

function localized(locale: InterventionLocale, vi: string, en: string) {
  return locale === 'vi' ? vi : en;
}

function modeForScore(score: number): DynamicInterventionMode {
  if (score > 85) return 'silent';
  if (score >= 70) return 'light_nudge';
  if (score >= 50) return 'coach_action';
  if (score >= 30) return 'recovery_plan';
  return 'high_risk';
}

function chooseInterventionType(
  forecast: SuccessForecast,
  memory?: BehaviorMemory | null,
): DynamicIntervention['intervention_type'] {
  const reasons = forecast.reasons;
  if (forecast.score < 30) return 'high_risk_recovery';
  if (reasons.includes('ignored_reminders') || reasons.includes('low_reminder_action')) return 'reminder_tuning';
  if (reasons.includes('activity_gap') || (memory?.low_activity_days.length ?? 0) > 0) return 'activity_recovery';
  if (reasons.includes('plan_gap')) return 'plan_completion';
  if (reasons.includes('logging_gap')) return 'meal_logging';
  if (reasons.includes('nutrition_gap') || (memory?.high_protein_adherence ?? 1) < 0.55) return 'protein_nudge';
  return 'maintain';
}

function choosePrimaryAction(
  mode: DynamicInterventionMode,
  interventionType: DynamicIntervention['intervention_type'],
  forecast: SuccessForecast,
): DynamicInterventionAction {
  if (mode === 'silent') return 'none';
  if (mode === 'coach_action') return 'open_coach';
  if (interventionType === 'reminder_tuning') return 'adjust_reminders';
  if (interventionType === 'activity_recovery') return 'move';
  if (interventionType === 'plan_completion') return 'complete_plan';
  if (interventionType === 'meal_logging' || interventionType === 'protein_nudge') return 'log_meal';
  if (mode === 'high_risk') return 'open_coach';
  return forecast.recovery_plan.primary_action === 'maintain' ? 'open_coach' : forecast.recovery_plan.primary_action;
}

function actionLabel(action: DynamicInterventionAction, locale: InterventionLocale) {
  if (action === 'adjust_reminders') return localized(locale, 'Chỉnh reminder', 'Tune reminders');
  if (action === 'move') return localized(locale, 'Thêm vận động', 'Add movement');
  if (action === 'complete_plan') return localized(locale, 'Hoàn thành plan', 'Complete plan');
  if (action === 'log_meal') return localized(locale, 'Log bữa gần nhất', 'Log nearest meal');
  if (action === 'open_coach') return localized(locale, 'Mở Coach', 'Open Coach');
  return localized(locale, 'Giữ nhịp', 'Keep rhythm');
}

function titleFor(
  mode: DynamicInterventionMode,
  interventionType: DynamicIntervention['intervention_type'],
  locale: InterventionLocale,
) {
  if (mode === 'silent') return localized(locale, 'Đang ổn, không cần can thiệp', 'On track, no intervention needed');
  if (mode === 'high_risk') return localized(locale, 'Cần cứu nhịp ngay hôm nay', 'High-risk recovery needed today');
  if (mode === 'recovery_plan') return localized(locale, 'Kích hoạt recovery plan', 'Recovery plan activated');
  if (mode === 'coach_action') return localized(locale, 'Coach nên can thiệp nhẹ', 'Coach intervention recommended');
  if (interventionType === 'reminder_tuning') return localized(locale, 'Reminder cần chỉnh lại', 'Reminder timing needs tuning');
  if (interventionType === 'activity_recovery') return localized(locale, 'Thêm một nhịp vận động nhỏ', 'Add a small movement reset');
  if (interventionType === 'protein_nudge') return localized(locale, 'Ưu tiên protein ở bữa tới', 'Prioritize protein next meal');
  return localized(locale, 'Nhắc nhẹ để giữ đà', 'Light nudge to keep momentum');
}

function bodyFor(args: {
  mode: DynamicInterventionMode;
  interventionType: DynamicIntervention['intervention_type'];
  forecast: SuccessForecast;
  memory?: BehaviorMemory | null;
  locale: InterventionLocale;
}) {
  const { mode, interventionType, forecast, memory, locale } = args;
  if (mode === 'silent') {
    return localized(locale, `Forecast ${forecast.score}%. Tiếp tục nhịp hiện tại, không cần thêm áp lực.`, `Forecast ${forecast.score}%. Keep the current rhythm without extra pressure.`);
  }
  if (mode === 'high_risk') {
    return localized(locale, `Forecast còn ${forecast.score}%. Tập trung một hành động nhỏ thay vì cố sửa cả ngày.`, `Forecast is ${forecast.score}%. Focus on one tiny action instead of fixing the whole day.`);
  }
  if (interventionType === 'reminder_tuning') {
    const hour = memory?.best_reminder_hour;
    return hour == null
      ? localized(locale, 'Reminder đang chưa tạo đủ hành động. Hãy đổi thời điểm hoặc làm lời nhắc nhẹ hơn.', 'Reminders are not converting well. Shift timing or make the prompt gentler.')
      : localized(locale, `Bạn phản hồi reminder tốt nhất khoảng ${hour}:00. Ưu tiên dời reminder yếu về gần khung này.`, `You respond best around ${hour}:00. Move weak reminders closer to this window.`);
  }
  if (interventionType === 'activity_recovery') {
    const days = memory?.low_activity_days?.join(', ');
    return days
      ? localized(locale, `Activity thường thấp vào ${days}. Một buổi đi bộ 15 phút là đủ để cứu nhịp.`, `Activity is usually low on ${days}. A 15-minute walk is enough to reset the rhythm.`)
      : localized(locale, 'Activity đang là điểm yếu nhất. Chọn một vận động nhẹ, ngắn, dễ hoàn thành.', 'Activity is the weakest spot. Pick a short, easy movement session.');
  }
  if (interventionType === 'protein_nudge') {
    return localized(locale, 'Bữa tới chỉ cần thêm một nguồn đạm rõ ràng trước, chưa cần tối ưu toàn bộ khẩu phần.', 'For the next meal, add one clear protein source first. No need to optimize the whole plate.');
  }
  if (interventionType === 'meal_logging') {
    return localized(locale, 'Dữ liệu log đang hụt. Log bữa gần nhất, kể cả ước lượng thô, sẽ giúp Coach kéo lại kế hoạch.', 'Logging is slipping. Log the nearest meal, even roughly, so Coach can recover the plan.');
  }
  if (interventionType === 'plan_completion') {
    return localized(locale, 'Hoàn thành một task nhỏ trong Today Plan để biến forecast thành hành động thật.', 'Complete one small Today Plan task to turn the forecast into action.');
  }
  return localized(locale, `Forecast ${forecast.score}%. Một nhắc nhẹ là đủ để giữ tuần này đi đúng hướng.`, `Forecast ${forecast.score}%. One light nudge is enough to keep this week on track.`);
}

function cooldownHours(mode: DynamicInterventionMode) {
  if (mode === 'silent') return 24;
  if (mode === 'light_nudge') return 12;
  if (mode === 'coach_action') return 8;
  if (mode === 'recovery_plan') return 4;
  return 2;
}

function priorityForMode(mode: DynamicInterventionMode): DynamicIntervention['priority'] {
  if (mode === 'high_risk') return 'critical';
  if (mode === 'recovery_plan') return 'high';
  if (mode === 'coach_action') return 'medium';
  return 'low';
}

function compactReasons(reasons: SuccessForecastReason[]) {
  return Array.from(new Set(reasons)).slice(0, 4);
}

export function buildDynamicIntervention(args: {
  successForecast?: SuccessForecast | null;
  behaviorMemory?: BehaviorMemory | null;
  locale?: InterventionLocale;
}): DynamicIntervention | null {
  const forecast = args.successForecast;
  if (!forecast) return null;

  const locale = args.locale ?? 'en';
  const mode = modeForScore(forecast.score);
  const interventionType = chooseInterventionType(forecast, args.behaviorMemory);
  const primaryAction = choosePrimaryAction(mode, interventionType, forecast);

  return {
    mode,
    priority: priorityForMode(mode),
    should_surface: mode !== 'silent',
    intervention_type: interventionType,
    title: titleFor(mode, interventionType, locale),
    body: bodyFor({
      mode,
      interventionType,
      forecast,
      memory: args.behaviorMemory,
      locale,
    }),
    primary_action: primaryAction,
    action_label: actionLabel(primaryAction, locale),
    reasons: compactReasons(forecast.reasons),
    recovery_steps: forecast.recovery_plan.steps.slice(0, mode === 'high_risk' ? 3 : 2),
    cooldown_hours: cooldownHours(mode),
    generated_at: new Date().toISOString(),
  };
}
