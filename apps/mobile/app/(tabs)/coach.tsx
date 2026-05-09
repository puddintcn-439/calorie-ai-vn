import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  FlatList,
} from 'react-native';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiInput } from '../../components/ui-input';
import { askCoach } from '../../services/ai.service';
import { useLogStore } from '../../store/log.store';
import { CoachingInsight, CoachingSummary } from '@calorie-ai/types';
import { apiClient } from '../../services/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  text: string;
}

export default function CoachScreen() {
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
      text: 'Xin chao. Toi la AI Coach. Ban co the hoi ve bua an, macro hoac cach dat muc tieu calo hom nay.',
    },
  ]);

  useEffect(() => {
    fetchDailyLog().catch(() => {});
    loadInsights();
  }, []);

  const loadInsights = async () => {
    try {
      setLoadingInsights(true);
      const [insightsRes, summaryRes] = await Promise.all([
        apiClient.get('/coaching/insights'),
        apiClient.get('/coaching/weekly-summary'),
      ]);
      setInsights(insightsRes.data || []);
      setSummary(summaryRes.data || null);
    } catch (error) {
      console.error('Failed to load insights:', error);
    } finally {
      setLoadingInsights(false);
    }
  };

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
    } catch {
      const fallback: ChatMessage = {
        id: `c-${Date.now()}`,
        role: 'coach',
        text: 'Xin loi, toi dang bi gian doan ket noi. Ban thu lai sau it phut nhe.',
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeInsight = async (insightId: number) => {
    try {
      await apiClient.post(`/coaching/insights/${insightId}/acknowledge`);
      setInsights((prev) => prev.filter((i) => i.id !== insightId));
    } catch (error) {
      console.error('Failed to acknowledge insight:', error);
    }
  };

  const renderInsightCard = (insight: CoachingInsight) => (
    <View key={insight.id} style={styles.insightCard}>
      <View style={styles.insightHeader}>
        <Text style={styles.insightEmoji}>{insight.emoji || '💡'}</Text>
        <View style={styles.insightTitleContainer}>
          <Text style={styles.insightTitle}>{insight.title}</Text>
          <Text style={styles.insightType}>{insight.insight_type}</Text>
        </View>
      </View>
      <Text style={styles.insightDescription}>{insight.description}</Text>
      {insight.action_suggestion && (
        <Text style={styles.insightAction}>💡 {insight.action_suggestion}</Text>
      )}
      <UiButton
        label="Tôi đã hiểu"
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
        <Eyebrow>AI Coach</Eyebrow>
        <HeroTitle>Gợi ý riêng cho bạn hôm nay</HeroTitle>
        <BodyText style={styles.heroBody}>
          Coach sử dụng dữ liệu ăn uống và mục tiêu của bạn để cung cấp gợi ý cá nhân hóa.
        </BodyText>

        {/* Weekly Summary */}
        {summary && (
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>📊 Tóm tắt tuần này</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Tuân thủ</Text>
                <Text style={styles.summaryValue}>{summary.adherence_percentage}%</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Ghi chép</Text>
                <Text style={styles.summaryValue}>{summary.logs_count}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Trung bình</Text>
                <Text style={styles.summaryValue}>
                  {Math.round(summary.average_daily_calories)}
                </Text>
              </View>
            </View>
            <Text style={styles.summaryRecommendation}>{summary.recommended_action}</Text>
          </SurfaceCard>
        )}

        {/* Insights List */}
        {loadingInsights ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#6ee7b7" size="large" />
          </View>
        ) : insights.length > 0 ? (
          <View style={styles.insightsContainer}>
            <Text style={styles.insightsTitle}>Những gợi ý cho bạn:</Text>
            {insights.map((insight) => renderInsightCard(insight))}
          </View>
        ) : (
          <SurfaceCard style={styles.noInsightsCard}>
            <Text style={styles.noInsightsText}>
              ✨ Bạn đang làm rất tốt! Không có cảnh báo nào ngay bây giờ.
            </Text>
          </SurfaceCard>
        )}

        {/* Context Card */}
        <SurfaceCard style={styles.contextCard}>
          <Text style={styles.contextTitle}>Hôm nay của bạn</Text>
          <Text style={styles.contextLine}>Đã ăn: {context.today_calories} kcal</Text>
          <Text style={styles.contextLine}>Mục tiêu: {context.target_calories} kcal</Text>
          <Text style={styles.contextLine}>
            Còn lại: {context.target_calories - context.today_calories} kcal
          </Text>
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
              <Text style={styles.roleLabel}>{msg.role === 'user' ? 'Bạn' : 'Coach'}</Text>
              <Text style={styles.messageText}>{msg.text}</Text>
            </SurfaceCard>
          ))}
        </View>

        {/* Input Area */}
        <SurfaceCard style={styles.inputCard}>
          <UiInput
            label="Đặt câu hỏi"
            value={input}
            onChangeText={setInput}
            placeholder="VD: Tôi còn 400 kcal thì nên ăn gì tối nay?"
            multiline
            style={styles.input}
          />
          <UiButton label="Gửi cho Coach" onPress={handleSend} loading={loading} />
          {loading ? <ActivityIndicator color="#6ee7b7" style={styles.loading} /> : null}
        </SurfaceCard>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  heroBody: {
    marginBottom: 14,
    maxWidth: 720,
  },
  summaryCard: {
    marginBottom: 12,
    borderColor: '#27426f',
    backgroundColor: '#0f1c38',
  },
  summaryTitle: {
    color: '#eff6ff',
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
    color: '#b8c8e8',
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    color: '#6ee7b7',
    fontSize: 18,
    fontWeight: '700',
  },
  summaryRecommendation: {
    color: '#ecf2ff',
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  insightsContainer: {
    marginBottom: 12,
  },
  insightsTitle: {
    color: '#eff6ff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  insightCard: {
    backgroundColor: '#0f1c38',
    borderColor: '#6ee7b7',
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
    color: '#eff6ff',
    fontSize: 14,
    fontWeight: '700',
  },
  insightType: {
    color: '#6ee7b7',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  insightDescription: {
    color: '#b8c8e8',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  insightAction: {
    color: '#ecf2ff',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
    backgroundColor: 'rgba(110, 231, 183, 0.1)',
    padding: 8,
    borderRadius: 8,
  },
  acknowledgeButton: {
    marginTop: 8,
  },
  noInsightsCard: {
    marginBottom: 12,
    borderColor: '#27426f',
    backgroundColor: '#0f2d2a',
  },
  noInsightsText: {
    color: '#6ee7b7',
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
    borderColor: '#27426f',
  },
  contextTitle: {
    color: '#eff6ff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  contextLine: {
    color: '#b8c8e8',
    fontSize: 13,
    marginBottom: 4,
  },
  chatList: {
    gap: 10,
    marginBottom: 12,
  },
  messageCard: {
    borderWidth: 1,
  },
  userCard: {
    borderColor: '#6ee7b7',
    backgroundColor: '#0f2d2a',
  },
  coachCard: {
    borderColor: '#2b3f6f',
    backgroundColor: '#101a37',
  },
  roleLabel: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  messageText: {
    color: '#ecf2ff',
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
});
