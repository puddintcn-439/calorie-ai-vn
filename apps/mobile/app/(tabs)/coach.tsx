import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiInput } from '../../components/ui-input';
import { askCoach } from '../../services/ai.service';
import { useLogStore } from '../../store/log.store';
import { CoachingInsight, CoachingSummary } from '@calorie-ai/types';
import { apiClient } from '../../services/api';
import { VisualHeroCard } from '../../components/visual-hero-card';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { Text } from '../../components/i18n-text';
import { Locale, useI18n } from '../../components/i18n';

const coachHeroIllustration = require('../../assets/images/coach-hero.jpg') as number;

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  text: string;
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

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatSummaryNumber(value: unknown, fallback = '--') {
  const numeric = finiteNumber(value);
  return numeric === null ? fallback : String(Math.round(numeric));
}

function formatSummaryPercent(value: unknown) {
  const numeric = finiteNumber(value);
  return numeric === null ? '--' : `${Math.round(numeric)}%`;
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
  const { locale, t } = useI18n();
  const { dailyLog, fetchDailyLog } = useLogStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<CoachingInsight[]>([]);
  const [summary, setSummary] = useState<CoachingSummary | null>(null);
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
      const [insightsRes, summaryRes] = await Promise.all([
        apiClient.get('/coaching/insights'),
        apiClient.get('/coaching/weekly-summary'),
      ]);
      setInsights(dedupeInsights(insightsRes.data || []));
      setSummary(summaryRes.data || null);
    } catch (error) {
      console.error('Failed to load insights:', error);
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
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <VisualHeroCard
          imageSource={coachHeroIllustration}
          eyebrow="screen.tabs.coach.eyebrow.001"
          title="screen.tabs.coach.title.001"
          body="screen.tabs.coach.body.001"
        />

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
  heroBody: {
    marginBottom: 14,
    maxWidth: 720,
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


