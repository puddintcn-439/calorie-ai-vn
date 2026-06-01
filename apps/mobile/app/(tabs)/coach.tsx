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
const MEAL_LABELS: Record<Locale, Record<(typeof MEAL_ORDER)[number], string>> = {
  vi: {
    breakfast: 'sáng',
    lunch: 'trưa',
    dinner: 'tối',
    snack: 'vặt',
  },
  en: {
    breakfast: 'breakfast',
    lunch: 'lunch',
    dinner: 'dinner',
    snack: 'snack',
  },
};

function getNextMealLabel(logs: Array<{ meal_type?: string }> = [], locale: Locale) {
  const loggedMeals = new Set(logs.map((log) => log.meal_type).filter(Boolean));
  const nextMeal = MEAL_ORDER.find((meal) => !loggedMeals.has(meal)) ?? 'snack';
  return MEAL_LABELS[locale][nextMeal];
}

function buildActivePlan(dailyLog: DailyLog | null, locale: Locale): ActivePlan {
  const logs = dailyLog?.logs ?? [];
  const consumed = toFiniteNumber(dailyLog?.total_calories) ?? 0;
  const target = toFiniteNumber(dailyLog?.target_calories) ?? 1800;
  const protein = toFiniteNumber(dailyLog?.total_protein_g) ?? 0;
  const remaining = target - consumed;
  const mealCount = logs.length;
  const nextMeal = getNextMealLabel(logs, locale);
  const proteinTarget = Math.max(70, Math.round(target * 0.075 / 4));

  if (mealCount === 0) {
    return {
      title: locale === 'vi' ? 'Bắt đầu bằng một bữa để app có dữ liệu' : 'Start with one meal so the app has context',
      body: locale === 'vi'
        ? 'Không cần nhập hoàn hảo. Ước lượng nhanh vẫn tốt hơn để trống cả ngày.'
        : 'It does not need to be perfect. A quick estimate is still better than leaving the day blank.',
      status: locale === 'vi' ? 'Chưa log bữa nào' : 'No meals logged',
      tone: 'info',
      steps: locale === 'vi' ? [
        'Log bữa gần nhất bằng ảnh hoặc mô tả ngắn.',
        `Giữ bữa tiếp theo quanh ${Math.round(target * 0.3)}-${Math.round(target * 0.4)} kcal.`,
        'Thêm protein để tránh đói lại sau vài giờ.',
      ] : [
        'Log your latest meal with a photo or a short description.',
        `Keep the next meal around ${Math.round(target * 0.3)}-${Math.round(target * 0.4)} kcal.`,
        'Add protein so you are less hungry again in a few hours.',
      ],
      prompts: locale === 'vi' ? [
        'Tôi mới bắt đầu hôm nay, nên ăn bữa tiếp theo thế nào?',
        `Lập kế hoạch đơn giản cho mục tiêu ${target} kcal hôm nay.`,
      ] : [
        'I am just starting today. What should my next meal look like?',
        `Make a simple plan for my ${target} kcal target today.`,
      ],
      primaryRoute: '/scan',
      primaryLabel: locale === 'vi' ? 'Log bữa đầu tiên' : 'Log first meal',
    };
  }

  if (remaining < -150) {
    return {
      title: locale === 'vi' ? 'Hôm nay đã vượt mục tiêu, tập trung cứu ngày' : 'You are over target today, focus on damage control',
      body: locale === 'vi'
        ? 'Không cần bỏ bữa. Giảm đồ ngọt/dầu và thêm vận động nhẹ để ngày mai không bị vỡ nhịp.'
        : 'Do not skip meals. Reduce sweets/oil and add light movement so tomorrow stays on track.',
      status: locale === 'vi' ? `Dư ${Math.abs(Math.round(remaining))} kcal` : `${Math.abs(Math.round(remaining))} kcal over`,
      tone: 'warn',
      steps: locale === 'vi' ? [
        'Bữa sau chọn món nhiều rau, đạm nạc, ít sốt.',
        'Đi bộ 15-25 phút nếu sức khỏe cho phép.',
        'Đừng ăn bù quá mạnh vào ngày mai.',
      ] : [
        'For the next meal, choose vegetables, lean protein, and less sauce.',
        'Walk 15-25 minutes if your health allows.',
        'Avoid over-restricting tomorrow.',
      ],
      prompts: locale === 'vi' ? [
        'Hôm nay tôi vượt kcal, tôi nên ăn gì cho bữa tiếp theo?',
        'Gợi ý một bữa tối nhẹ nhưng không bị đói.',
      ] : [
        'I am over calories today. What should I eat next?',
        'Suggest a light dinner that will still keep me full.',
      ],
      primaryRoute: '/log',
      primaryLabel: locale === 'vi' ? 'Xem lại bữa đã log' : 'Review logged meals',
    };
  }

  if (remaining > 450) {
    return {
      title: locale === 'vi' ? `Còn room tốt cho bữa ${nextMeal}` : `Good room left for ${nextMeal}`,
      body: locale === 'vi'
        ? 'Đừng cắt calo quá sâu. Một bữa đủ đạm sẽ giúp giảm ăn vặt về tối.'
        : 'Do not cut too aggressively. A protein-rich meal helps reduce snacking later.',
      status: locale === 'vi' ? `Còn ${Math.round(remaining)} kcal` : `${Math.round(remaining)} kcal left`,
      tone: 'good',
      steps: locale === 'vi' ? [
        `Chọn bữa ${nextMeal} có đạm nạc và rau.`,
        `Nếu đói, dùng khoảng ${Math.min(450, Math.max(250, Math.round(remaining * 0.55)))} kcal trước.`,
        'Nếu sắp ngủ, ưu tiên sữa chua, trái cây ít ngọt hoặc protein nhẹ.',
      ] : [
        `Choose a ${nextMeal} with lean protein and vegetables.`,
        `If hungry, use about ${Math.min(450, Math.max(250, Math.round(remaining * 0.55)))} kcal first.`,
        'If it is close to bedtime, choose yogurt, low-sugar fruit, or a light protein option.',
      ],
      prompts: locale === 'vi' ? [
        `Tôi còn ${Math.round(remaining)} kcal, gợi ý bữa ${nextMeal} để giảm cân.`,
        'Gợi ý 3 món Việt Nam ăn no mà không vượt kcal.',
      ] : [
        `I have ${Math.round(remaining)} kcal left. Suggest a ${nextMeal} for weight loss.`,
        'Suggest 3 filling meals that do not exceed my calories.',
      ],
      primaryRoute: '/scan',
      primaryLabel: locale === 'vi' ? `Log bữa ${nextMeal}` : `Log ${nextMeal}`,
    };
  }

  if (protein < proteinTarget * 0.65) {
    return {
      title: locale === 'vi' ? 'Cần tăng protein để đỡ đói hơn' : 'Add protein to stay full longer',
      body: locale === 'vi'
        ? 'Calo đang ổn, nhưng protein thấp sẽ làm dễ thèm ăn vặt.'
        : 'Calories look fine, but low protein can make snacking more tempting.',
      status: `${Math.round(protein)}/${proteinTarget}g protein`,
      tone: 'info',
      steps: locale === 'vi' ? [
        'Thêm trứng, sữa chua, đậu hũ, gà, cá hoặc thịt nạc.',
        'Giữ tinh bột vừa phải trong bữa tiếp theo.',
        'Nếu ăn vặt, chọn protein thay vì trà sữa/bánh ngọt.',
      ] : [
        'Add eggs, yogurt, tofu, chicken, fish, or lean meat.',
        'Keep carbs moderate in the next meal.',
        'If snacking, choose protein instead of sweet drinks or cakes.',
      ],
      prompts: locale === 'vi' ? [
        `Tôi mới có ${Math.round(protein)}g protein, bữa tiếp theo nên ăn gì?`,
        'Gợi ý snack giàu protein, rẻ và dễ mua.',
      ] : [
        `I only have ${Math.round(protein)}g protein. What should I eat next?`,
        'Suggest high-protein snacks that are cheap and easy to buy.',
      ],
      primaryRoute: '/scan',
      primaryLabel: locale === 'vi' ? 'Log món protein' : 'Log protein food',
    };
  }

  return {
    title: locale === 'vi' ? 'Hôm nay đang đi đúng hướng' : 'Today is on track',
    body: locale === 'vi'
      ? 'Giữ nhịp này. Việc quan trọng nhất là log tiếp bữa sau và không tối ưu quá mức.'
      : 'Keep this rhythm. The main job is to log the next meal and avoid over-optimizing.',
    status: locale === 'vi' ? `Còn ${Math.max(0, Math.round(remaining))} kcal` : `${Math.max(0, Math.round(remaining))} kcal left`,
    tone: 'good',
    steps: locale === 'vi' ? [
      `Log bữa ${nextMeal} ngay sau khi ăn.`,
      'Giữ đồ uống không calo nếu đang thèm ngọt.',
      'Cuối ngày xem Progress để biết có cần chỉnh ngày mai không.',
    ] : [
      `Log ${nextMeal} right after eating.`,
      'Stick with zero-calorie drinks if you crave something sweet.',
      'Check Progress tonight to see whether tomorrow needs adjustment.',
    ],
    prompts: locale === 'vi' ? [
      'Đánh giá nhanh ngày hôm nay của tôi và nói bước tiếp theo.',
      'Tôi nên ăn gì để kết thúc ngày mà vẫn giảm cân?',
    ] : [
      'Quickly review my day and tell me the next step.',
      'What should I eat to finish the day while still losing weight?',
    ],
    primaryRoute: '/scan',
    primaryLabel: locale === 'vi' ? `Log bữa ${nextMeal}` : `Log ${nextMeal}`,
  };
}

function buildWeeklyPlan(summary: CoachingSummary | null, dailyLog: DailyLog | null, locale: Locale): WeeklyPlan {
  const logsCount = toFiniteNumber(summary?.logs_count) ?? 0;
  const adherence = toFiniteNumber(summary?.adherence_percentage);
  const averageDailyCalories = toFiniteNumber(summary?.average_daily_calories);
  const target = toFiniteNumber(dailyLog?.target_calories) ?? 1800;
  const todayLogs = dailyLog?.logs?.length ?? 0;

  if (!summary || logsCount < 7) {
    const missingLogs = Math.max(0, 7 - logsCount);
    return {
      title: locale === 'vi' ? 'Kế hoạch quay lại nhịp' : 'Plan to rebuild momentum',
      body: locale === 'vi'
        ? 'Mục tiêu tuần này là tạo lại thói quen, không phải ăn hoàn hảo. Log thiếu vẫn có thể cứu được.'
        : 'This week is about rebuilding the habit, not eating perfectly. Missing logs can still be recovered.',
      status: logsCount > 0
        ? (locale === 'vi' ? `Thiếu ${missingLogs} bữa log` : `${missingLogs} meal logs missing`)
        : (locale === 'vi' ? 'Cần restart nhẹ' : 'Needs a light restart'),
      tone: 'info',
      days: [
        {
          label: locale === 'vi' ? 'Ngày 1-2' : 'Day 1-2',
          title: locale === 'vi' ? 'Log 1 bữa để mở lại đà' : 'Log one meal to restart',
          body: todayLogs > 0
            ? (locale === 'vi' ? 'Hôm nay đã có dữ liệu. Giữ tiếp 1 bữa nữa sau khi ăn.' : 'You already have data today. Log one more meal after eating.')
            : (locale === 'vi' ? 'Dùng camera/text để log bữa gần nhất, ước lượng cũng được.' : 'Use camera or text to log the latest meal; an estimate is fine.'),
        },
        {
          label: locale === 'vi' ? 'Ngày 3-4' : 'Day 3-4',
          title: locale === 'vi' ? 'Lặp lại bữa để nhanh hơn' : 'Repeat meals to move faster',
          body: locale === 'vi' ? 'Dùng saved meal hoặc món đã log gần đây. Mục tiêu là giảm thao tác.' : 'Use saved meals or recently logged foods. The goal is fewer steps.',
        },
        {
          label: locale === 'vi' ? 'Ngày 5-7' : 'Day 5-7',
          title: locale === 'vi' ? 'Thêm 1 việc nhỏ mỗi ngày' : 'Add one small action per day',
          body: locale === 'vi' ? 'Đi bộ 15 phút hoặc thêm protein rẻ: trứng, đậu hũ, sữa chua, gà/cá.' : 'Walk 15 minutes or add affordable protein: eggs, tofu, yogurt, chicken, or fish.',
        },
      ],
    };
  }

  if (adherence !== null && adherence > 115) {
    return {
      title: locale === 'vi' ? 'Kế hoạch 7 ngày để hạ kcal mềm' : '7-day plan to reduce calories gently',
      body: locale === 'vi'
        ? 'Tuần trước đang cao hơn mục tiêu. Điều chỉnh nhỏ sẽ bền hơn cắt mạnh.'
        : 'Last week was above target. Small adjustments are more sustainable than hard restriction.',
      status: locale === 'vi' ? `${Math.round(adherence)}% tuân thủ` : `${Math.round(adherence)}% adherence`,
      tone: 'warn',
      days: [
        {
          label: locale === 'vi' ? 'Ngày 1-2' : 'Day 1-2',
          title: locale === 'vi' ? 'Cắt calories lỏng' : 'Cut liquid calories',
          body: locale === 'vi' ? 'Đổi trà sữa/nước ngọt sang size nhỏ, ít đường hoặc nước không calo.' : 'Switch sweet drinks to a smaller size, less sugar, or zero-calorie drinks.',
        },
        {
          label: locale === 'vi' ? 'Ngày 3-4' : 'Day 3-4',
          title: locale === 'vi' ? 'Giữ bữa tối gọn hơn' : 'Keep dinner lighter',
          body: locale === 'vi'
            ? `Đặt bữa tối quanh ${Math.round(target * 0.28)}-${Math.round(target * 0.34)} kcal, ưu tiên rau và đạm nạc.`
            : `Keep dinner around ${Math.round(target * 0.28)}-${Math.round(target * 0.34)} kcal with vegetables and lean protein.`,
        },
        {
          label: locale === 'vi' ? 'Ngày 5-7' : 'Day 5-7',
          title: locale === 'vi' ? 'Đi bộ sau bữa cao kcal' : 'Walk after high-calorie meals',
          body: locale === 'vi' ? 'Nếu bữa nào vượt kế hoạch, thêm 15-25 phút đi bộ thay vì bỏ bữa sau.' : 'If a meal goes over plan, add a 15-25 minute walk instead of skipping the next meal.',
        },
      ],
    };
  }

  if (adherence !== null && adherence < 80) {
    return {
      title: locale === 'vi' ? 'Kế hoạch 7 ngày để ăn đủ hơn' : '7-day plan to eat enough',
      body: locale === 'vi'
        ? 'Tuần trước có thể quá thấp hoặc log chưa đủ. Giảm cân bền cần đủ năng lượng nền.'
        : 'Last week may have been too low or under-logged. Sustainable weight loss still needs enough baseline energy.',
      status: locale === 'vi' ? `${Math.round(adherence)}% tuân thủ` : `${Math.round(adherence)}% adherence`,
      tone: 'info',
      days: [
        {
          label: locale === 'vi' ? 'Ngày 1-2' : 'Day 1-2',
          title: locale === 'vi' ? 'Đừng bỏ bữa sáng/trưa' : 'Do not skip breakfast or lunch',
          body: locale === 'vi' ? 'Nếu bạn không đói, vẫn log nhanh một bữa nhỏ để app không hiểu sai.' : 'If you are not hungry, still log a small meal so the app does not misread the day.',
        },
        {
          label: locale === 'vi' ? 'Ngày 3-4' : 'Day 3-4',
          title: locale === 'vi' ? 'Thêm protein giá rẻ' : 'Add affordable protein',
          body: locale === 'vi' ? 'Trứng, đậu hũ, sữa chua, ức gà hoặc cá hộp giúp no lâu hơn.' : 'Eggs, tofu, yogurt, chicken breast, or canned fish help you stay full longer.',
        },
        {
          label: locale === 'vi' ? 'Ngày 5-7' : 'Day 5-7',
          title: locale === 'vi' ? 'Giữ deficit vừa phải' : 'Keep a moderate deficit',
          body: locale === 'vi'
            ? `Ăn gần ${Math.round(target * 0.85)}-${Math.round(target)} kcal thay vì cắt quá sâu.`
            : `Aim for about ${Math.round(target * 0.85)}-${Math.round(target)} kcal instead of cutting too deeply.`,
        },
      ],
    };
  }

  return {
    title: locale === 'vi' ? 'Kế hoạch 7 ngày giữ đà giảm cân' : '7-day plan to keep weight-loss momentum',
    body: locale === 'vi'
      ? 'Tuần này ưu tiên lặp lại những việc đang hiệu quả thay vì đổi quá nhiều.'
      : 'This week, repeat what is already working instead of changing too much.',
    status: averageDailyCalories !== null
      ? (locale === 'vi' ? `${Math.round(averageDailyCalories)} kcal/ngày` : `${Math.round(averageDailyCalories)} kcal/day`)
      : (locale === 'vi' ? 'Đang ổn định' : 'Stable'),
    tone: 'good',
    days: [
      {
        label: locale === 'vi' ? 'Ngày 1-2' : 'Day 1-2',
        title: locale === 'vi' ? 'Giữ bữa neo' : 'Keep an anchor meal',
        body: locale === 'vi' ? 'Chọn 1 bữa để lặp lại mỗi ngày: sáng hoặc trưa, để giảm quyết định.' : 'Choose one meal to repeat daily, breakfast or lunch, to reduce decision fatigue.',
      },
      {
        label: locale === 'vi' ? 'Ngày 3-4' : 'Day 3-4',
        title: locale === 'vi' ? 'Chuẩn bị món fallback' : 'Prepare a fallback meal',
        body: locale === 'vi' ? 'Có sẵn 1 món rẻ để cứu ngày: cơm gà nhỏ, bún/phở ít topping, salad thêm đạm.' : 'Keep one cheap fallback: small chicken rice, lighter noodle soup, or salad with extra protein.',
      },
      {
        label: locale === 'vi' ? 'Ngày 5-7' : 'Day 5-7',
        title: locale === 'vi' ? 'Review và chỉnh nhẹ' : 'Review and adjust lightly',
        body: locale === 'vi' ? 'Nếu 3 ngày liên tiếp vượt target, giảm đồ uống ngọt hoặc snack trước khi cắt bữa chính.' : 'If 3 days in a row exceed target, reduce sweet drinks or snacks before cutting main meals.',
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

function getCoachErrorMessage(error: unknown, locale: Locale): string {
  const fallback = locale === 'vi'
    ? 'Xin lỗi, tôi đang bị gián đoạn kết nối. Bạn thử lại sau ít phút nhé.'
    : 'Sorry, I am having a connection issue. Please try again in a few minutes.';

  const err: any = error;
  const rawMessage = String(err?.message ?? '').toLowerCase();
  const status = Number(err?.response?.status ?? 0);
  const backendMessage = String(err?.response?.data?.message ?? '').trim();

  if (rawMessage.includes('only available on premium') || rawMessage.includes('premium or pro')) {
    return locale === 'vi'
      ? 'AI Coach hiện chỉ mở cho gói Premium/Pro. Bạn nâng cấp để tiếp tục dùng tính năng này nhé.'
      : 'AI Coach is available on Premium/Pro. Upgrade to keep using this feature.';
  }

  if (status === 401) {
    return locale === 'vi'
      ? 'Phiên đăng nhập đã hết hạn. Bạn vui lòng đăng nhập lại để tiếp tục chat với Coach.'
      : 'Your session has expired. Please log in again to keep chatting with Coach.';
  }

  if (status >= 500 && backendMessage) {
    return locale === 'vi'
      ? `Coach tạm thời gặp lỗi hệ thống: ${backendMessage}`
      : `Coach is temporarily unavailable: ${backendMessage}`;
  }

  if (backendMessage) {
    return backendMessage;
  }

  if (rawMessage.includes('network')) {
    return locale === 'vi'
      ? 'Không thể kết nối backend. Bạn kiểm tra lại server và thử lại giúp mình nhé.'
      : 'Cannot connect to the backend. Please check the server and try again.';
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
        setInsightsError(getCoachErrorMessage(insightsResult.reason, locale));
      }

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value.data || null);
      } else {
        setSummary(null);
        if (insightsResult.status === 'fulfilled') {
          setInsightsError(getCoachErrorMessage(summaryResult.reason, locale));
        }
      }
    } catch (error) {
      setInsights([]);
      setSummary(null);
      setInsightsError(getCoachErrorMessage(error, locale));
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
  const activePlan = useMemo(() => buildActivePlan(dailyLog, locale), [dailyLog, locale]);
  const weeklyPlan = useMemo(() => buildWeeklyPlan(summary, dailyLog, locale), [summary, dailyLog, locale]);
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
        text: getCoachErrorMessage(error, locale),
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
  }, [locale]);

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
              <Text style={styles.activePlanEyebrow}>{locale === 'vi' ? 'KẾ HOẠCH HÔM NAY' : "TODAY'S PLAN"}</Text>
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
              label={locale === 'vi' ? 'Xem Today' : 'View Today'}
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
              <Text style={styles.weeklyPlanEyebrow}>{locale === 'vi' ? 'KẾ HOẠCH 7 NGÀY' : '7-DAY PLAN'}</Text>
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
            <UiButton label="common.tryAgain" onPress={() => loadInsights().catch(() => {})} />
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


