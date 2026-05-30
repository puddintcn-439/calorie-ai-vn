import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ScreenShell, SurfaceCard, useBottomNavContentPadding } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiInput } from '../../components/ui-input';
import { askCoach } from '../../services/ai.service';
import { useLogStore } from '../../store/log.store';
import { CoachingInsight, CoachingSummary, DailyLog } from '@calorie-ai/types';
import { apiClient } from '../../services/api';
import { VisualHeroCard } from '../../components/visual-hero-card';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { Text } from '../../components/i18n-text';
import { Locale, useI18n } from '../../components/i18n';
import { formatPercent, safeRound, toFiniteNumber } from '../../services/number-format';

const coachHeroIllustration = require('../../assets/images/coach-hero.jpg') as number;

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  text: string;
}

type ActivePlan = {
  title: string;
  body: string;
  status: string;
  tone: 'good' | 'warn' | 'info';
  steps: string[];
  prompts: string[];
  primaryRoute: '/scan' | '/log' | '/progress';
  primaryLabel: string;
};

type WeeklyPlan = {
  title: string;
  body: string;
  status: string;
  tone: 'good' | 'warn' | 'info';
  days: Array<{
    label: string;
    title: string;
    body: string;
  }>;
};

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const MEAL_LABELS: Record<(typeof MEAL_ORDER)[number], string> = {
  breakfast: 'sang',
  lunch: 'trua',
  dinner: 'toi',
  snack: 'vat',
};

function getNextMealLabel(logs: Array<{ meal_type?: string }> = []) {
  const loggedMeals = new Set(logs.map((log) => log.meal_type).filter(Boolean));
  const nextMeal = MEAL_ORDER.find((meal) => !loggedMeals.has(meal)) ?? 'snack';
  return MEAL_LABELS[nextMeal];
}

function buildActivePlan(dailyLog: DailyLog | null): ActivePlan {
  const logs = dailyLog?.logs ?? [];
  const consumed = toFiniteNumber(dailyLog?.total_calories) ?? 0;
  const target = toFiniteNumber(dailyLog?.target_calories) ?? 1800;
  const protein = toFiniteNumber(dailyLog?.total_protein_g) ?? 0;
  const remaining = target - consumed;
  const mealCount = logs.length;
  const nextMeal = getNextMealLabel(logs);
  const proteinTarget = Math.max(70, Math.round(target * 0.075 / 4));

  if (mealCount === 0) {
    return {
      title: 'Bat dau bang 1 bua de app co du lieu',
      body: 'Dung can nhap hoan hao. Uoc luong nhanh van tot hon de trong ngay.',
      status: 'Chua log bua nao',
      tone: 'info',
      steps: [
        'Log bua gan nhat bang anh hoac mo ta ngan.',
        `Giu bua tiep theo quanh ${Math.round(target * 0.3)}-${Math.round(target * 0.4)} kcal.`,
        'Them protein de tranh doi lai sau vai gio.',
      ],
      prompts: [
        'Toi moi bat dau hom nay, nen an bua tiep theo the nao?',
        `Lap ke hoach don gian cho muc tieu ${target} kcal hom nay.`,
      ],
      primaryRoute: '/scan',
      primaryLabel: 'Log bua dau tien',
    };
  }

  if (remaining < -150) {
    return {
      title: 'Hom nay da vuot muc tieu, tap trung cuu ngay',
      body: 'Khong can bo bua. Giam do ngot/dau va them van dong nhe de ngay mai khong bi vo nhip.',
      status: `Du ${Math.abs(Math.round(remaining))} kcal`,
      tone: 'warn',
      steps: [
        'Bua sau chon mon nhieu rau, dam nac, it sot.',
        'Di bo 15-25 phut neu suc khoe cho phep.',
        'Dung an bu qua manh vao ngay mai.',
      ],
      prompts: [
        'Hom nay toi vuot kcal, toi nen an gi cho bua tiep theo?',
        'Goi y mot bua toi nhe nhung khong bi doi.',
      ],
      primaryRoute: '/log',
      primaryLabel: 'Xem lai bua da log',
    };
  }

  if (remaining > 450) {
    return {
      title: `Con room tot cho bua ${nextMeal}`,
      body: 'Dung cat calo qua sau. Mot bua du dam se giup giam an vat ve toi.',
      status: `Con ${Math.round(remaining)} kcal`,
      tone: 'good',
      steps: [
        `Chon bua ${nextMeal} co dam nac va rau.`,
        `Neu doi, dung khoang ${Math.min(450, Math.max(250, Math.round(remaining * 0.55)))} kcal truoc.`,
        'Neu sap ngu, uu tien sua chua/trai cay it ngot/protein nhe.',
      ],
      prompts: [
        `Toi con ${Math.round(remaining)} kcal, goi y bua ${nextMeal} de giam can.`,
        'Goi y 3 mon Viet Nam de an no ma khong vuot kcal.',
      ],
      primaryRoute: '/scan',
      primaryLabel: `Log bua ${nextMeal}`,
    };
  }

  if (protein < proteinTarget * 0.65) {
    return {
      title: 'Can tang protein de do doi hon',
      body: 'Calo dang on, nhung protein thap se lam de them an vat.',
      status: `${Math.round(protein)}/${proteinTarget}g protein`,
      tone: 'info',
      steps: [
        'Them trung, sua chua, dau hu, ga, ca hoac thit nac.',
        'Giu tinh bot vua phai trong bua tiep theo.',
        'Neu an vat, chon protein thay vi tra sua/banh ngot.',
      ],
      prompts: [
        `Toi moi co ${Math.round(protein)}g protein, bua tiep theo nen an gi?`,
        'Goi y snack giau protein, re va de mua.',
      ],
      primaryRoute: '/scan',
      primaryLabel: 'Log mon protein',
    };
  }

  return {
    title: 'Hom nay dang di dung huong',
    body: 'Giu nhip nay. Viec quan trong nhat la log tiep bua sau va khong toi uu qua muc.',
    status: `Con ${Math.max(0, Math.round(remaining))} kcal`,
    tone: 'good',
    steps: [
      `Log bua ${nextMeal} ngay sau khi an.`,
      'Giu do uong khong calo neu dang them ngot.',
      'Cuoi ngay xem Progress de biet co can chinh ngay mai khong.',
    ],
    prompts: [
      'Danh gia nhanh ngay hom nay cua toi va noi buoc tiep theo.',
      'Toi nen an gi de ket thuc ngay ma van giam can?',
    ],
    primaryRoute: '/scan',
    primaryLabel: `Log bua ${nextMeal}`,
  };
}

function buildWeeklyPlan(summary: CoachingSummary | null, dailyLog: DailyLog | null): WeeklyPlan {
  const logsCount = toFiniteNumber(summary?.logs_count) ?? 0;
  const adherence = toFiniteNumber(summary?.adherence_percentage);
  const averageDailyCalories = toFiniteNumber(summary?.average_daily_calories);
  const target = toFiniteNumber(dailyLog?.target_calories) ?? 1800;
  const todayLogs = dailyLog?.logs?.length ?? 0;

  if (!summary || logsCount < 7) {
    const missingLogs = Math.max(0, 7 - logsCount);
    return {
      title: 'Ke hoach quay lai nhip',
      body: 'Muc tieu tuan nay la tao lai thoi quen, khong phai an hoan hao. Log thieu van co the cuu duoc.',
      status: logsCount > 0 ? `Thieu ${missingLogs} bua log` : 'Can restart nhe',
      tone: 'info',
      days: [
        {
          label: 'Ngay 1-2',
          title: 'Log 1 bua de mo lai da',
          body: todayLogs > 0 ? 'Hom nay da co du lieu. Giu tiep 1 bua nua sau khi an.' : 'Dung camera/text de log bua gan nhat, uoc luong cung duoc.',
        },
        {
          label: 'Ngay 3-4',
          title: 'Lap lai bua de thanh nhanh hon',
          body: 'Dung saved meal hoac mon da log gan day. Muc tieu la giam thao tac.',
        },
        {
          label: 'Ngay 5-7',
          title: 'Them 1 viec nho moi ngay',
          body: 'Di bo 15 phut hoac them protein re: trung, dau hu, sua chua, ga/ca.',
        },
      ],
    };
  }

  if (adherence !== null && adherence > 115) {
    return {
      title: 'Ke hoach 7 ngay de ha kcal mem',
      body: 'Tuan truoc dang cao hon muc tieu. Dieu chinh nho se ben hon cat manh.',
      status: `${Math.round(adherence)}% adherence`,
      tone: 'warn',
      days: [
        {
          label: 'Ngay 1-2',
          title: 'Cat calories long',
          body: 'Doi tra sua/nuoc ngot sang size nho, it duong hoac nuoc khong calo.',
        },
        {
          label: 'Ngay 3-4',
          title: 'Giu bua toi gon hon',
          body: `Dat bua toi quanh ${Math.round(target * 0.28)}-${Math.round(target * 0.34)} kcal, uu tien rau va dam nac.`,
        },
        {
          label: 'Ngay 5-7',
          title: 'Di bo sau bua cao kcal',
          body: 'Neu bua nao vuot ke hoach, them 15-25 phut di bo thay vi bo bua sau.',
        },
      ],
    };
  }

  if (adherence !== null && adherence < 80) {
    return {
      title: 'Ke hoach 7 ngay de an du hon',
      body: 'Tuan truoc co the qua thap hoac log chua du. Giam can ben can du nang luong nen.',
      status: `${Math.round(adherence)}% adherence`,
      tone: 'info',
      days: [
        {
          label: 'Ngay 1-2',
          title: 'Dung bo bua sang/trua',
          body: 'Neu ban khong doi, van log nhanh mot bua nho de app khong hieu sai.',
        },
        {
          label: 'Ngay 3-4',
          title: 'Them protein gia re',
          body: 'Trung, dau hu, sua chua, uc ga hoac ca hop giup no lau hon.',
        },
        {
          label: 'Ngay 5-7',
          title: 'Giu deficit vua phai',
          body: `An gan ${Math.round(target * 0.85)}-${Math.round(target)} kcal thay vi cat qua sau.`,
        },
      ],
    };
  }

  return {
    title: 'Ke hoach 7 ngay giu da giam can',
    body: 'Tuan nay uu tien lap lai nhung viec dang hieu qua thay vi doi qua nhieu.',
    status: averageDailyCalories !== null ? `${Math.round(averageDailyCalories)} kcal/ngay` : 'Dang on dinh',
    tone: 'good',
    days: [
      {
        label: 'Ngay 1-2',
        title: 'Giu bua neo',
        body: 'Chon 1 bua de lap lai moi ngay: sang hoac trua, de giam quyet dinh.',
      },
      {
        label: 'Ngay 3-4',
        title: 'Chuan bi mon fallback',
        body: 'Co san 1 mon re de cuu ngay: com ga nho, bun/pho it topping, salad them dam.',
      },
      {
        label: 'Ngay 5-7',
        title: 'Review va chinh nhe',
        body: 'Neu 3 ngay lien tiep vuot target, giam do uong ngot hoac snack truoc khi cat bua chinh.',
      },
    ],
  };
}

function getInsightContentKey(insight: Pick<CoachingInsight, 'title' | 'description' | 'action_suggestion'>): string {
  return [
    insight.title,
    insight.description,
    insight.action_suggestion ?? '',
  ].map((value) => String(value).trim().toLowerCase()).join('|');
}

function dedupeInsights(items: CoachingInsight[]) {
  const byContent = new Map<string, CoachingInsight>();

  for (const item of items) {
    const key = getInsightContentKey(item);
    const existing = byContent.get(key);

    if (!existing) {
      byContent.set(key, item);
      continue;
    }

    const existingScore = existing.impact_score ?? 0;
    const itemScore = item.impact_score ?? 0;
    const existingDate = Date.parse(existing.created_at ?? '') || 0;
    const itemDate = Date.parse(item.created_at ?? '') || 0;

    if (itemScore > existingScore || (itemScore === existingScore && itemDate > existingDate)) {
      byContent.set(key, item);
    }
  }

  return [...byContent.values()];
}

const INSIGHT_TYPE_LABELS: Record<string, string> = {
  pattern_alert: 'Mẫu hành vi',
  recommendation: 'Gợi ý',
  achievement: 'Tiến bộ',
  warning: 'Cần chú ý',
  prediction: 'Dự báo',
};

const INSIGHT_TEXT_TRANSLATIONS: Record<string, string> = {
  '⏭️ Skipping Meals': '⏭️ Bỏ bữa nhiều lần',
  'You skipped meals multiple times this week. This can lead to overeating later.': 'Tuần này bạn bỏ bữa vài lần. Điều này dễ làm bạn đói quá mức và ăn bù về sau.',
  'Try eating something small every 4-5 hours to maintain stable energy levels.': 'Chuẩn bị một bữa nhỏ mỗi 4-5 giờ để giữ năng lượng ổn định.',
  '🍽️ Binge Eating Pattern': '🍽️ Ngày ăn vượt nhiều',
  'Your data shows several high-calorie days. These spikes make it hard to hit your goals.': 'Dữ liệu có vài ngày calo tăng vọt, khiến mục tiêu tuần khó ổn định.',
  'Identify triggers (stress, time, emotions) and plan alternatives for next time.': 'Ghi lại bối cảnh như stress, thiếu ngủ hoặc tiệc để chuẩn bị phương án nhẹ hơn lần sau.',
  '🌙 Late-Night Eating': '🌙 Ăn muộn buổi tối',
  'Most of your calories come from late evening. This can disrupt sleep and metabolism.': 'Phần lớn calo đang rơi vào cuối ngày, có thể ảnh hưởng giấc ngủ và cảm giác đói hôm sau.',
  'Try a 2-hour eating cutoff before bed. Have herbal tea instead if needed.': 'Thử chốt bữa trước giờ ngủ khoảng 2 tiếng; nếu đói hãy chọn đồ nhẹ giàu protein.',
  '📅 Weekend Inconsistency': '📅 Cuối tuần lệch nhịp',
  'Your weekend eating differs significantly from weekdays, making consistency hard.': 'Cách ăn cuối tuần khác khá nhiều so với ngày thường, làm tiến độ khó đều.',
  'Plan weekend meals in advance to reduce variance and maintain progress.': 'Chọn trước 1-2 bữa chính cuối tuần để vẫn linh hoạt mà không lệch quá xa.',
  '💭 Emotional Eating': '💭 Ăn theo cảm xúc',
  'Your eating patterns suggest emotional triggers may be influencing your food choices.': 'Mẫu ăn uống cho thấy cảm xúc có thể đang ảnh hưởng đến lựa chọn món.',
  'Track your mood when logging food. Look for patterns between emotions and eating.': 'Khi log bữa, thêm một ghi chú ngắn về tâm trạng để nhận ra trigger.',
  '📝 Logging Gaps': '📝 Ghi chép chưa đều',
  'You logged only a few days this week. Consistent logging = accurate tracking.': 'Tuần này bạn chỉ log vài ngày. Log đều giúp app tính mục tiêu và gợi ý chính xác hơn.',
  'Set a daily reminder to log after each meal. Even rough estimates help!': 'Đặt nhắc nhở sau mỗi bữa. Ước lượng nhanh vẫn hữu ích hơn bỏ trống.',
  '😰 Stress Eating': '😰 Ăn khi căng thẳng',
  'On high-stress days, your calorie intake increases significantly.': 'Những ngày stress cao, lượng calo của bạn có xu hướng tăng rõ.',
  'Practice stress management: exercise, meditation, or talking to someone before eating.': 'Trước khi ăn thêm, thử đi bộ 5-10 phút hoặc uống nước rồi quyết định lại.',
  '⏰ Timing Preference': '⏰ Khung giờ ăn ổn định',
  'You prefer eating at a specific time, which is actually helpful for consistency!': 'Bạn có xu hướng ăn vào khung giờ khá ổn định, đây là nền tốt để duy trì thói quen.',
  'Keep this routine - consistency is a sign of good habits forming.': 'Giữ nhịp này và chuẩn bị sẵn bữa phù hợp trước khung giờ quen thuộc.',
  '🎉 Amazing consistency! Keep up this excellent work.': '🎉 Tuần này rất đều. Giữ nhịp hiện tại là đủ tốt.',
  '👍 Good progress! Try to log a bit more consistently.': '👍 Tiến độ ổn. Log đều hơn một chút sẽ giúp gợi ý chính xác hơn.',
  '📈 You\'re on the right track. Consistent logging will help you see patterns.': '📈 Bạn đang đi đúng hướng. Hãy ưu tiên log đều trước khi tối ưu sâu.',
};

function getInsightTypeLabel(type: string) {
  return INSIGHT_TYPE_LABELS[type] ?? 'Gợi ý';
}

function localizeInsightText(text?: string | null) {
  if (!text) return '';
  return INSIGHT_TEXT_TRANSLATIONS[text] ?? text;
}

const CANONICAL_INSIGHT_TEXT_VI: Record<string, string> = {
  'Skipping meals': 'Bỏ bữa nhiều lần',
  'You skipped meals several times this week. That can make you overly hungry and more likely to overeat later.': 'Tuần này bạn bỏ bữa vài lần. Điều này dễ làm bạn đói quá mức và ăn bù về sau.',
  'Prepare a small meal or protein snack every 4-5 hours to keep energy steadier.': 'Chuẩn bị một bữa nhỏ hoặc snack giàu protein mỗi 4-5 giờ để giữ năng lượng ổn định.',
  'High-calorie spikes': 'Ngày ăn vượt nhiều',
  'Your data shows a few days with large calorie jumps, which can make weekly progress less stable.': 'Dữ liệu có vài ngày calo tăng vọt, khiến tiến độ tuần khó ổn định.',
  'Note the context, such as stress, poor sleep, or social meals, and plan a lighter fallback for next time.': 'Ghi lại bối cảnh như stress, thiếu ngủ hoặc tiệc để chuẩn bị phương án nhẹ hơn lần sau.',
  'Late-night eating': 'Ăn muộn buổi tối',
  'A large share of calories is landing late in the day, which may affect sleep and next-day hunger.': 'Phần lớn calo đang rơi vào cuối ngày, có thể ảnh hưởng giấc ngủ và cảm giác đói hôm sau.',
  'Try finishing your last main meal about 2 hours before bed; if hungry, choose a light protein option.': 'Thử chốt bữa chính trước giờ ngủ khoảng 2 tiếng; nếu đói hãy chọn đồ nhẹ giàu protein.',
  'Weekend variance': 'Cuối tuần lệch nhịp',
  'Weekend eating differs a lot from weekdays, making progress harder to keep consistent.': 'Cách ăn cuối tuần khác khá nhiều so với ngày thường, làm tiến độ khó đều.',
  'Pre-plan 1-2 key weekend meals so you can stay flexible without drifting too far.': 'Chọn trước 1-2 bữa chính cuối tuần để vẫn linh hoạt mà không lệch quá xa.',
  'Emotional eating cue': 'Ăn theo cảm xúc',
  'Your eating pattern suggests mood may be influencing food choices.': 'Mẫu ăn uống cho thấy cảm xúc có thể đang ảnh hưởng đến lựa chọn món.',
  'Add a short mood note when logging meals so recurring triggers become easier to spot.': 'Khi log bữa, thêm một ghi chú ngắn về tâm trạng để nhận ra trigger lặp lại.',
  'Logging gaps': 'Ghi chép chưa đều',
  'You logged only a few days this week. Consistent logging helps the app calculate targets and coaching more accurately.': 'Tuần này bạn chỉ log vài ngày. Log đều giúp app tính mục tiêu và gợi ý chính xác hơn.',
  'Set a reminder after meals. A rough estimate is still more useful than a blank day.': 'Đặt nhắc nhở sau mỗi bữa. Ước lượng nhanh vẫn hữu ích hơn bỏ trống.',
  'Stress eating': 'Ăn khi căng thẳng',
  'On higher-stress days, your calorie intake appears to rise noticeably.': 'Những ngày stress cao, lượng calo của bạn có xu hướng tăng rõ.',
  'Before eating more, try a 5-10 minute walk or a glass of water, then decide again.': 'Trước khi ăn thêm, thử đi bộ 5-10 phút hoặc uống nước rồi quyết định lại.',
  'Stable meal timing': 'Khung giờ ăn ổn định',
  'You tend to eat at a consistent time window, which is a useful base for habit building.': 'Bạn có xu hướng ăn vào khung giờ khá ổn định, đây là nền tốt để duy trì thói quen.',
  'Keep this rhythm and prepare suitable meals before your usual eating window.': 'Giữ nhịp này và chuẩn bị sẵn bữa phù hợp trước khung giờ quen thuộc.',
  'Great consistency this week. Keep the current rhythm.': 'Tuần này rất đều. Giữ nhịp hiện tại là đủ tốt.',
  'Solid progress. Logging a bit more consistently will make recommendations more accurate.': 'Tiến độ ổn. Log đều hơn một chút sẽ giúp gợi ý chính xác hơn.',
  'You are moving in the right direction. Prioritize consistent logging before optimizing details.': 'Bạn đang đi đúng hướng. Hãy ưu tiên log đều trước khi tối ưu sâu.',
  'Start with one meal log today. Even a rough estimate gives Coach enough context to personalize the next step.': 'Bắt đầu bằng một bữa log hôm nay. Ước lượng nhanh cũng đủ để Coach cá nhân hóa bước tiếp theo.',
  'Prioritize small, regular meals to avoid getting overly hungry late in the day.': 'Ưu tiên bữa nhỏ đều hơn để tránh đói quá mức vào cuối ngày.',
  'Identify triggers and prepare an easier fallback meal before the next high-risk moment.': 'Nhận diện trigger và chuẩn bị trước bữa thay thế dễ kiểm soát hơn.',
  'Try finishing your last main meal about 2 hours before bed to support better sleep.': 'Thử chốt bữa chính trước giờ ngủ khoảng 2 tiếng để ngủ tốt hơn.',
  'Plan a few weekend choices in advance so you can enjoy flexibility without drifting too far.': 'Lên trước vài lựa chọn cuối tuần để vẫn vui mà không lệch quá xa.',
  'Use one short stress-reduction action before deciding to eat more.': 'Dùng một hành động giảm stress ngắn trước khi quyết định ăn thêm.',
  'Add mood notes when logging meals to spot recurring triggers.': 'Ghi chú cảm xúc khi log bữa để nhận ra trigger lặp lại.',
  'Log right after meals, even roughly, so the data is not empty.': 'Log ngay sau bữa, kể cả ước lượng nhanh, để dữ liệu không bị rỗng.',
  'Use your natural eating window to keep a stable routine.': 'Tận dụng khung giờ ăn tự nhiên để duy trì nhịp ổn định.',
};

function getLocalizedInsightTypeLabel(type: string, locale: Locale) {
  if (locale === 'en') {
    const labels: Record<string, string> = {
      pattern_alert: 'Pattern',
      recommendation: 'Recommendation',
      achievement: 'Progress',
      warning: 'Needs attention',
      prediction: 'Forecast',
    };
    return labels[type] ?? 'Recommendation';
  }

  return INSIGHT_TYPE_LABELS[type] ?? 'Gợi ý';
}

function localizeInsightTextForLocale(text: string | null | undefined, locale: Locale) {
  if (!text) return '';
  if (locale !== 'vi') return text;
  return CANONICAL_INSIGHT_TEXT_VI[text] ?? INSIGHT_TEXT_TRANSLATIONS[text] ?? text;
}

void getInsightTypeLabel;
void localizeInsightText;

function formatSummaryNumber(value: unknown, fallback = '--') {
  const numeric = toFiniteNumber(value);
  return numeric === null ? fallback : String(safeRound(numeric));
}

function formatSummaryPercent(value: unknown) {
  return formatPercent(value);
}

function getCoachErrorMessage(error: unknown): string {
  const fallback = 'Xin lỗi, tôi đang bị gián đoạn kết nối. Bạn thử lại sau ít phút nhé.';

  const err: any = error;
  const rawMessage = String(err?.message ?? '').toLowerCase();
  const status = Number(err?.response?.status ?? 0);
  const backendMessage = String(err?.response?.data?.message ?? '').trim();

  if (rawMessage.includes('only available on premium') || rawMessage.includes('premium or pro')) {
    return 'AI Coach hiện chỉ mở cho gói Premium/Pro. Bạn nâng cấp để tiếp tục dùng tính năng này nhé.';
  }

  if (status === 401) {
    return 'Phiên đăng nhập đã hết hạn. Bạn vui lòng đăng nhập lại để tiếp tục chat với Coach.';
  }

  if (status >= 500 && backendMessage) {
    return `Coach tạm thời gặp lỗi hệ thống: ${backendMessage}`;
  }

  if (backendMessage) {
    return backendMessage;
  }

  if (rawMessage.includes('network')) {
    return 'Không thể kết nối backend. Bạn kiểm tra lại server và thử lại giúp mình nhé.';
  }

  return fallback;
}

export default function CoachScreen() {
  useAppTheme();
  const coachScrollRef = useRef<ScrollView>(null);
  const bottomContentPadding = useBottomNavContentPadding();
  const { locale, t } = useI18n();
  const { dailyLog, fetchDailyLog } = useLogStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<CoachingInsight[]>([]);
  const [summary, setSummary] = useState<CoachingSummary | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'coach',
      text: 'Xin chào. Tôi là AI Coach. Bạn có thể hỏi về bữa ăn, macro hoặc cách đặt mục tiêu calo hôm nay.',
    },
  ]);

  useEffect(() => {
    setMessages((prev) => prev.map((message) => (
      message.id === 'welcome'
        ? { ...message, text: t('screen.tabs.coach.message.welcome') }
        : message
    )));
  }, [t]);

  const loadInsights = useCallback(async () => {
    try {
      setLoadingInsights(true);
      setInsightsError(null);
      const [insightsResult, summaryResult] = await Promise.allSettled([
        apiClient.get('/coaching/insights'),
        apiClient.get('/coaching/weekly-summary'),
      ]);

      if (insightsResult.status === 'fulfilled') {
        setInsights(dedupeInsights(insightsResult.value.data || []));
      } else {
        setInsights([]);
        setInsightsError(getCoachErrorMessage(insightsResult.reason));
      }

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value.data || null);
      } else {
        setSummary(null);
        if (insightsResult.status === 'fulfilled') {
          setInsightsError(getCoachErrorMessage(summaryResult.reason));
        }
      }
    } catch (error) {
      setInsights([]);
      setSummary(null);
      setInsightsError(getCoachErrorMessage(error));
    } finally {
      setLoadingInsights(false);
    }
  }, []);

  const refreshCoachData = useCallback(() => {
    fetchDailyLog().catch(() => {});
    loadInsights().catch(() => {});
  }, [fetchDailyLog, loadInsights]);

  useEffect(() => {
    refreshCoachData();
  }, [refreshCoachData]);

  useFocusEffect(
    useCallback(() => {
      refreshCoachData();
    }, [refreshCoachData]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchDailyLog(), loadInsights()]);
    } finally {
      setRefreshing(false);
    }
  };

  const context = useMemo(() => {
    const consumed = dailyLog?.total_calories ?? 0;
    const target = dailyLog?.target_calories ?? 1800;
    return {
      today_calories: consumed,
      target_calories: target,
    };
  }, [dailyLog]);
  const activePlan = useMemo(() => buildActivePlan(dailyLog), [dailyLog]);
  const weeklyPlan = useMemo(() => buildWeeklyPlan(summary, dailyLog), [summary, dailyLog]);
  const summaryRecommendation = localizeInsightTextForLocale(summary?.recommended_action, locale) || t('screen.tabs.coach.summaryFallback')
    || 'Coach cần thêm dữ liệu log trong tuần để đưa ra gợi ý chính xác hơn.';

  const handleSend = async () => {
    const message = input.trim();
    if (!message || loading) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: message,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await askCoach(message, context);
      const coachMessage: ChatMessage = {
        id: `c-${Date.now()}`,
        role: 'coach',
        text: res.message,
      };
      setMessages((prev) => [...prev, coachMessage]);
    } catch (error) {
      const fallback: ChatMessage = {
        id: `c-${Date.now()}`,
        role: 'coach',
        text: getCoachErrorMessage(error),
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeInsight = async (insightId: number) => {
    try {
      await apiClient.post(`/coaching/insights/${insightId}/acknowledge`);
      const acknowledged = insights.find((insight) => insight.id === insightId);
      const acknowledgedKey = acknowledged ? getInsightContentKey(acknowledged) : null;
      setInsights((prev) => prev.filter((insight) => (
        insight.id !== insightId && (!acknowledgedKey || getInsightContentKey(insight) !== acknowledgedKey)
      )));
    } catch (error) {
      console.error('Failed to acknowledge insight:', error);
    }
  };

  const handleUsePrompt = (prompt: string) => {
    setInput(prompt);
  };

  const scrollToInput = useCallback(() => {
    setTimeout(() => {
      coachScrollRef.current?.scrollToEnd({ animated: true });
    }, Platform.OS === 'ios' ? 280 : 180);
  }, []);

  const renderInsightCard = (insight: CoachingInsight) => (
    <View key={insight.id} style={styles.insightCard}>
      <View style={styles.insightHeader}>
        <Text style={styles.insightEmoji}>{insight.emoji || '💡'}</Text>
        <View style={styles.insightTitleContainer}>
          <Text style={styles.insightTitle}>{localizeInsightTextForLocale(insight.title, locale)}</Text>
          <Text style={styles.insightType}>{getLocalizedInsightTypeLabel(insight.insight_type, locale)}</Text>
        </View>
      </View>
      <Text style={styles.insightDescription}>{localizeInsightTextForLocale(insight.description, locale)}</Text>
      {insight.action_suggestion && (
        <Text style={styles.insightAction}>💡 {localizeInsightTextForLocale(insight.action_suggestion, locale)}</Text>
      )}
      <UiButton
        label="screen.tabs.coach.label.001"
        onPress={() => handleAcknowledgeInsight(insight.id)}
        style={styles.acknowledgeButton}
      />
    </View>
  );

  return (
    <ScreenShell scroll={false} reserveBottomNav={false}>
      <ScrollView
        ref={coachScrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomContentPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <VisualHeroCard
          imageSource={coachHeroIllustration}
          eyebrow="screen.tabs.coach.eyebrow.001"
          title="screen.tabs.coach.title.001"
          body="screen.tabs.coach.body.001"
        />

        <SurfaceCard
          style={[
            styles.activePlanCard,
            activePlan.tone === 'good' && styles.activePlanGood,
            activePlan.tone === 'warn' && styles.activePlanWarn,
          ]}
        >
          <View style={styles.activePlanHeader}>
            <View style={styles.activePlanCopy}>
              <Text style={styles.activePlanEyebrow}>KE HOACH HOM NAY</Text>
              <Text style={styles.activePlanTitle}>{activePlan.title}</Text>
              <Text style={styles.activePlanBody}>{activePlan.body}</Text>
            </View>
            <View style={[
              styles.activePlanStatusPill,
              activePlan.tone === 'warn' && styles.activePlanStatusPillWarn,
            ]}>
              <Text style={[
                styles.activePlanStatusText,
                activePlan.tone === 'warn' && styles.activePlanStatusTextWarn,
              ]}>
                {activePlan.status}
              </Text>
            </View>
          </View>

          <View style={styles.planSteps}>
            {activePlan.steps.map((step, index) => (
              <View key={`${step}-${index}`} style={styles.planStep}>
                <Text style={styles.planStepIndex}>{index + 1}</Text>
                <Text style={styles.planStepText}>{step}</Text>
              </View>
            ))}
          </View>

          <View style={styles.planActions}>
            <UiButton
              label={activePlan.primaryLabel}
              onPress={() => router.push(activePlan.primaryRoute)}
              style={styles.planPrimaryAction}
            />
            <UiButton
              label="Xem Today"
              variant="secondary"
              onPress={() => router.push('/')}
              style={styles.planSecondaryAction}
            />
          </View>

          <View style={styles.promptRow}>
            {activePlan.prompts.map((prompt) => (
              <TouchableOpacity key={prompt} style={styles.promptChip} onPress={() => handleUsePrompt(prompt)}>
                <Text style={styles.promptChipText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </SurfaceCard>

        <SurfaceCard
          style={[
            styles.weeklyPlanCard,
            weeklyPlan.tone === 'good' && styles.weeklyPlanGood,
            weeklyPlan.tone === 'warn' && styles.weeklyPlanWarn,
          ]}
        >
          <View style={styles.weeklyPlanHeader}>
            <View style={styles.weeklyPlanCopy}>
              <Text style={styles.weeklyPlanEyebrow}>KE HOACH 7 NGAY</Text>
              <Text style={styles.weeklyPlanTitle}>{weeklyPlan.title}</Text>
              <Text style={styles.weeklyPlanBody}>{weeklyPlan.body}</Text>
            </View>
            <Text style={[
              styles.weeklyPlanStatus,
              weeklyPlan.tone === 'warn' && styles.weeklyPlanStatusWarn,
            ]}>
              {weeklyPlan.status}
            </Text>
          </View>

          <View style={styles.weeklyPlanGrid}>
            {weeklyPlan.days.map((day) => (
              <View key={day.label} style={styles.weeklyPlanDay}>
                <Text style={styles.weeklyPlanDayLabel}>{day.label}</Text>
                <Text style={styles.weeklyPlanDayTitle}>{day.title}</Text>
                <Text style={styles.weeklyPlanDayBody}>{day.body}</Text>
              </View>
            ))}
          </View>
        </SurfaceCard>

        {/* Weekly Summary */}
        {summary && (
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryTitle} i18nKey="screen.tabs.coach.text.001" />
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel} i18nKey="screen.tabs.coach.text.002" />
                <Text style={styles.summaryValue}>{formatSummaryPercent(summary.adherence_percentage)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel} i18nKey="screen.tabs.coach.text.003" />
                <Text style={styles.summaryValue}>{formatSummaryNumber(summary.logs_count, '0')}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel} i18nKey="screen.tabs.coach.text.004" />
                <Text style={styles.summaryValue}>
                  {formatSummaryNumber(summary.average_daily_calories)}
                </Text>
              </View>
            </View>
            <Text style={styles.summaryRecommendation}>{summaryRecommendation}</Text>
          </SurfaceCard>
        )}

        {/* Insights List */}
        {loadingInsights ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={theme.colors.accentMint} size="large" />
          </View>
        ) : insightsError ? (
          <SurfaceCard style={styles.noInsightsCard}>
            <Text style={styles.noInsightsText}>{insightsError}</Text>
            <UiButton label="Thử lại" onPress={() => loadInsights().catch(() => {})} />
          </SurfaceCard>
        ) : insights.length > 0 ? (
          <View style={styles.insightsContainer}>
            <Text style={styles.insightsTitle} i18nKey="screen.tabs.coach.text.005" />
            {insights.map((insight) => renderInsightCard(insight))}
          </View>
        ) : (
          <SurfaceCard style={styles.noInsightsCard}>
            <Text style={styles.noInsightsText}>
              {t('screen.tabs.coach.emptyInsights')}
              {false ? <>
              ✨ Bạn đang làm rất tốt! Không có cảnh báo nào ngay bây giờ.
              </> : null}
            </Text>
          </SurfaceCard>
        )}

        {/* Context Card */}
        <SurfaceCard style={styles.contextCard}>
          <Text style={styles.contextTitle} i18nKey="screen.tabs.coach.text.006" />
          <Text style={styles.contextLine}>{t('screen.tabs.coach.context.consumed')}: {context.today_calories} kcal</Text>
          <Text style={styles.contextLine}>{t('screen.tabs.coach.context.target')}: {context.target_calories} kcal</Text>
          <Text style={styles.contextLine}>
            {t('screen.tabs.coach.context.remaining')}: {context.target_calories - context.today_calories} kcal
          </Text>
          <View style={styles.contextActions}>
            <UiButton
              label="screen.tabs.coach.action.logMeal"
              onPress={() => router.push('/scan')}
              style={styles.contextActionButton}
            />
            <UiButton
              label="screen.tabs.coach.action.today"
              variant="secondary"
              onPress={() => router.push('/')}
              style={styles.contextActionButton}
            />
          </View>
          {false ? <>
          <Text style={styles.contextLine}>Đã ăn: {context.today_calories} kcal</Text>
          <Text style={styles.contextLine}>Mục tiêu: {context.target_calories} kcal</Text>
          <Text style={styles.contextLine}>
            Còn lại: {context.target_calories - context.today_calories} kcal
          </Text>
          </> : null}
        </SurfaceCard>

        {/* Chat Messages */}
        <View style={styles.chatList}>
          {messages.map((msg) => (
            <SurfaceCard
              key={msg.id}
              style={[
                styles.messageCard,
                msg.role === 'user' ? styles.userCard : styles.coachCard,
              ]}
            >
              <Text style={styles.roleLabel}>{msg.role === 'user' ? t('screen.tabs.coach.role.user') : 'Coach'}</Text>
              <Text style={styles.messageText}>{msg.text}</Text>
            </SurfaceCard>
          ))}
        </View>

        {/* Input Area */}
        <SurfaceCard style={styles.inputCard}>
          <UiInput
            label="screen.tabs.coach.label.002"
            value={input}
            onChangeText={setInput}
            placeholder="screen.tabs.coach.placeholder.001"
            multiline
            onFocus={scrollToInput}
            style={styles.input}
          />
          <UiButton label="screen.tabs.coach.label.003" onPress={handleSend} loading={loading} />
          {loading ? <ActivityIndicator color={theme.colors.accentMint} style={styles.loading} /> : null}
        </SurfaceCard>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  scrollContent: {
    flexGrow: 1,
    paddingTop: 14,
  },
  heroBody: {
    marginBottom: 14,
    maxWidth: 720,
  },
  activePlanCard: {
    marginBottom: 12,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
  },
  activePlanGood: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  activePlanWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  activePlanHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  activePlanCopy: {
    flex: 1,
    minWidth: 0,
  },
  activePlanEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
  },
  activePlanTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  activePlanBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  activePlanStatusPill: {
    minHeight: 30,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePlanStatusPillWarn: {
    borderColor: colors.borderWarning,
  },
  activePlanStatusText: {
    color: colors.accentCyan,
    fontSize: 12,
    fontWeight: '900',
  },
  activePlanStatusTextWarn: {
    color: colors.accentAmber,
  },
  planSteps: {
    gap: 8,
  },
  planStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  planStepIndex: {
    width: 22,
    height: 22,
    borderRadius: 999,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 22,
    color: colors.textOnAccent,
    backgroundColor: colors.accentMint,
    fontSize: 12,
    fontWeight: '900',
  },
  planStepText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  planActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  planPrimaryAction: {
    flex: 1.1,
    paddingVertical: 11,
  },
  planSecondaryAction: {
    flex: 0.9,
    paddingVertical: 11,
  },
  promptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  promptChip: {
    flexGrow: 1,
    flexBasis: '46%',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  promptChipText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  weeklyPlanCard: {
    marginBottom: 12,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
  },
  weeklyPlanGood: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  weeklyPlanWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  weeklyPlanHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  weeklyPlanCopy: {
    flex: 1,
    minWidth: 0,
  },
  weeklyPlanEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
  },
  weeklyPlanTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  weeklyPlanBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  weeklyPlanStatus: {
    color: colors.accentCyan,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    maxWidth: 128,
  },
  weeklyPlanStatusWarn: {
    color: colors.accentAmber,
  },
  weeklyPlanGrid: {
    gap: 8,
  },
  weeklyPlanDay: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
  },
  weeklyPlanDayLabel: {
    color: colors.accentCyan,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
  },
  weeklyPlanDayTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  weeklyPlanDayBody: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  summaryCard: {
    marginBottom: 12,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    color: colors.accentMint,
    fontSize: 18,
    fontWeight: '700',
  },
  summaryRecommendation: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  insightsContainer: {
    marginBottom: 12,
  },
  insightsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  insightCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.accentMint,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  insightEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  insightTitleContainer: {
    flex: 1,
  },
  insightTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  insightType: {
    color: colors.accentMint,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  insightDescription: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  insightAction: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
    backgroundColor: colors.surfaceSuccess,
    padding: 8,
    borderRadius: 8,
  },
  acknowledgeButton: {
    marginTop: 8,
  },
  noInsightsCard: {
    marginBottom: 12,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSuccess,
  },
  noInsightsText: {
    color: colors.accentMint,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  loadingContainer: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },
  contextCard: {
    marginBottom: 12,
    borderColor: colors.border,
  },
  contextTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  contextLine: {
    color: colors.textSoft,
    fontSize: 13,
    marginBottom: 4,
  },
  contextActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  contextActionButton: {
    flex: 1,
    paddingVertical: 11,
  },
  chatList: {
    gap: 10,
    marginBottom: 12,
  },
  messageCard: {
    borderWidth: 1,
  },
  userCard: {
    borderColor: colors.accentMint,
    backgroundColor: colors.surfaceSuccess,
  },
  coachCard: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  roleLabel: {
    color: colors.info,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  messageText: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  inputCard: {
    marginBottom: 20,
  },
  input: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  loading: {
    marginTop: 10,
  },
}));


