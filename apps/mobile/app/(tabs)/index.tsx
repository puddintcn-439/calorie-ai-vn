import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useLogStore } from '../../store/log.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import { ActivitySyncResult } from '@calorie-ai/types';
import { useGamificationStore } from '../../store/gamification.store';
import { useCalorieTargetStore } from '../../store/calorie-target.store';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';

export default function DashboardScreen() {
  const { dailyLog, activityLogs, isLoading, fetchDailyLog, fetchActivityLogs, syncActivity } = useLogStore();
  const { features, fetchSubscription } = useSubscriptionStore();
  const { summary, fetchSummary } = useGamificationStore();
  const {
    recommendations,
    latestAdjustment,
    isLoadingRecommendations,
    isApplyingAdjustment,
    fetchRecommendations,
    applyWeeklyAdjustment,
  } = useCalorieTargetStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<ActivitySyncResult | null>(null);

  useEffect(() => {
    fetchDailyLog().catch(() => {});
    fetchActivityLogs().catch(() => {});
    fetchSubscription().catch(() => {});
    fetchSummary().catch(() => {});
    fetchRecommendations().catch(() => {});
  }, []);

  const consumed = dailyLog?.total_calories ?? 0;
  const burned = activityLogs.reduce((s, a) => s + a.calories_burned, 0);
  const net = consumed - burned;
  const target = dailyLog?.target_calories ?? 1800;
  const remaining = target - net;
  const progress = Math.min(net / target, 1);
  const hasHealthSync = features?.healthkit_sync ?? false;

  const handleSyncActivity = async () => {
    setIsSyncing(true);
    try {
      const result = await syncActivity();
      setLastSyncResult(result);
      Alert.alert('Đồng bộ thành công', `Đã nhập ${result.imported_count} hoạt động và ${result.total_calories_burned} kcal tiêu hao.`);
    } catch (error: any) {
      Alert.alert('Không thể đồng bộ', error?.message ?? 'Vui lòng thử lại.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleApplyWeeklyAdjustment = async () => {
    try {
      await applyWeeklyAdjustment();
      Alert.alert('Đã cập nhật', 'Mục tiêu calo tuần này đã được điều chỉnh theo mức độ bám kế hoạch.');
      await Promise.all([
        fetchDailyLog(),
        fetchRecommendations(),
      ]);
    } catch (error: any) {
      Alert.alert('Không thể cập nhật', error?.message ?? 'Vui lòng thử lại sau.');
    }
  };

  return (
    <ScreenShell>
      <Eyebrow>Daily Overview</Eyebrow>
      <HeroTitle>Hôm nay của bạn đang đi đúng nhịp chưa?</HeroTitle>
      <BodyText style={styles.heroBody}>Theo dõi năng lượng nạp vào, tiêu hao và macro trong một dashboard rõ ràng, dễ nhìn.</BodyText>

        <SurfaceCard style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Text style={styles.calorieNumber}>{net}</Text>
          <Text style={styles.calorieLabel}>kcal net (đã ăn - đốt)</Text>
          {burned > 0 && (
            <Text style={styles.burnedLabel}>🔥 Đốt {burned} kcal · Nạp {consumed} kcal</Text>
          )}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.remaining}>
            {remaining > 0 ? `Còn ${remaining} kcal` : `Đã vượt ${Math.abs(remaining)} kcal`}
          </Text>
          <View style={styles.miniStats}>
            <View style={styles.statChip}><Text style={styles.statValue}>{target}</Text><Text style={styles.statLabel}>Target</Text></View>
            <View style={styles.statChip}><Text style={styles.statValue}>{consumed}</Text><Text style={styles.statLabel}>Nạp</Text></View>
            <View style={styles.statChip}><Text style={styles.statValue}>{burned}</Text><Text style={styles.statLabel}>Đốt</Text></View>
          </View>
        </SurfaceCard>

        <View style={styles.macroRow}>
          <MacroCard label="Protein" value={dailyLog?.total_protein_g ?? 0} unit="g" color="#f97316" />
          <MacroCard label="Carbs" value={dailyLog?.total_carbs_g ?? 0} unit="g" color="#3b82f6" />
          <MacroCard label="Fat" value={dailyLog?.total_fat_g ?? 0} unit="g" color="#eab308" />
        </View>

        {summary && (
          <SurfaceCard style={styles.streakCard}>
            <View style={styles.streakHeader}>
              <View>
                <Text style={styles.streakTitle}>Streak & Thành tích</Text>
                <Text style={styles.streakSubtitle}>
                  {summary.current_streak > 0
                    ? `Bạn đang giữ ${summary.current_streak} ngày liên tiếp.`
                    : 'Bắt đầu một streak mới ngay hôm nay.'}
                </Text>
              </View>
              <View style={styles.streakPill}>
                <Text style={styles.streakPillValue}>🔥 {summary.current_streak}</Text>
              </View>
            </View>

            <View style={styles.streakStatsRow}>
              <View style={styles.streakStatBox}>
                <Text style={styles.streakStatValue}>{summary.longest_streak}</Text>
                <Text style={styles.streakStatLabel}>Best streak</Text>
              </View>
              <View style={styles.streakStatBox}>
                <Text style={styles.streakStatValue}>{summary.active_days_last_30}</Text>
                <Text style={styles.streakStatLabel}>Ngày active / 30</Text>
              </View>
              <View style={styles.streakStatBox}>
                <Text style={styles.streakStatValue}>{summary.total_food_logs}</Text>
                <Text style={styles.streakStatLabel}>Food logs</Text>
              </View>
            </View>

            {summary.next_streak_milestone && (
              <Text style={styles.nextMilestoneText}>
                Còn {Math.max(0, summary.next_streak_milestone - summary.current_streak)} ngày để chạm mốc {summary.next_streak_milestone}.
              </Text>
            )}

            <View style={styles.badgesRow}>
              {summary.badges.slice(0, 4).map((badge) => (
                <View key={badge.id} style={[styles.badgeChip, badge.unlocked ? styles.badgeChipUnlocked : styles.badgeChipLocked]}>
                  <Text style={styles.badgeIcon}>{badge.icon}</Text>
                  <Text style={[styles.badgeLabel, !badge.unlocked && styles.badgeLabelLocked]}>{badge.label}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.achievementLink} onPress={() => router.push('../achievements')}>
              <Text style={styles.achievementLinkText}>Xem toàn bộ thành tích</Text>
            </TouchableOpacity>
          </SurfaceCard>
        )}

        <SurfaceCard style={styles.syncCard}>
          <View style={styles.syncHeader}>
            <View>
              <Text style={styles.syncTitle}>Health Activity Sync</Text>
              <Text style={styles.syncDescription}>
                {hasHealthSync
                  ? 'Đồng bộ bước đi và vận động vào calories burned trên dashboard.'
                  : 'Mở khóa đồng bộ HealthKit / Google Fit với gói Pro.'}
              </Text>
            </View>
            <Text style={styles.syncBadge}>{hasHealthSync ? 'PRO' : 'LOCKED'}</Text>
          </View>

          {lastSyncResult && hasHealthSync && (
            <View style={styles.syncResultRow}>
              <Text style={styles.syncResultText}>
                Lần gần nhất: +{lastSyncResult.total_calories_burned} kcal · {lastSyncResult.imported_count} mục mới
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.syncButton, !hasHealthSync && styles.syncButtonLocked]}
            onPress={() => (hasHealthSync ? handleSyncActivity() : router.push('/paywall'))}
            disabled={isSyncing}
          >
            <Text style={[styles.syncButtonText, !hasHealthSync && styles.syncButtonTextLocked]}>
              {isSyncing ? 'Đang đồng bộ...' : hasHealthSync ? 'Đồng bộ hoạt động' : 'Nâng cấp để dùng'}
            </Text>
          </TouchableOpacity>
        </SurfaceCard>

        <SurfaceCard style={styles.recommendationCard}>
          <View style={styles.recommendationHeader}>
            <View>
              <Text style={styles.recommendationTitle}>Gợi ý tuần này</Text>
              <Text style={styles.recommendationSubtitle}>
                {recommendations
                  ? `Còn ${recommendations.remaining_calories} kcal hôm nay · xu hướng ${recommendations.weekly_insights.trend}`
                  : 'Lấy gợi ý bữa ăn theo target cá nhân hóa'}
              </Text>
            </View>
            {isLoadingRecommendations ? <ActivityIndicator color="#6ee7b7" /> : null}
          </View>

          {recommendations?.meals.slice(0, 2).map((meal) => (
            <View key={meal.meal_type} style={styles.recommendationRow}>
              <Text style={styles.recommendationMeal}>
                {meal.meal_type === 'breakfast'
                  ? '🌅 Sáng'
                  : meal.meal_type === 'lunch'
                    ? '🌤️ Trưa'
                    : meal.meal_type === 'dinner'
                      ? '🌙 Tối'
                      : '🍿 Vặt'}
              </Text>
              <Text style={styles.recommendationValue}>{meal.recommended_calories} kcal</Text>
            </View>
          ))}

          {recommendations?.weekly_insights?.suggestion ? (
            <Text style={styles.recommendationHint}>{recommendations.weekly_insights.suggestion}</Text>
          ) : null}

          {latestAdjustment ? (
            <Text style={styles.recommendationAdjustment}>
              Điều chỉnh mới: {latestAdjustment.adjustment_percentage > 0 ? '+' : ''}
              {latestAdjustment.adjustment_percentage}% → {latestAdjustment.adjusted_daily_target} kcal/ngày
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.adjustButton}
            onPress={handleApplyWeeklyAdjustment}
            disabled={isApplyingAdjustment}
          >
            <Text style={styles.adjustButtonText}>
              {isApplyingAdjustment ? 'Đang điều chỉnh...' : 'Áp dụng điều chỉnh tuần'}
            </Text>
          </TouchableOpacity>
        </SurfaceCard>

        <TouchableOpacity style={styles.scanButton} onPress={() => router.push('/(tabs)/scan')}>
          <Text style={styles.scanButtonText}>📸 Scan đồ ăn</Text>
          <Text style={styles.scanButtonSubtext}>Thêm bữa ăn mới chỉ với vài giây</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Hôm nay</Text>
        {isLoading && <ActivityIndicator color="#4ade80" />}
        {dailyLog?.logs.map((log) => (
          <SurfaceCard key={log.id} style={styles.logItem}>
            <Text style={styles.logName}>{log.name_vi ?? log.name}</Text>
            <Text style={styles.logCalorie}>{log.calories} kcal</Text>
          </SurfaceCard>
        ))}
        {dailyLog?.logs.length === 0 && (
          <EmptyState
            icon="🍽️"
            title="Hôm nay chưa có bữa nào"
            description="Scan món ăn đầu tiên để bắt đầu theo dõi calo và macro trong ngày."
          />
        )}
    </ScreenShell>
  );
}

function MacroCard({ label, value, unit, color }: any) {
  return (
    <SurfaceCard style={[styles.macroCard, { borderTopColor: color }]}> 
      <Text style={styles.macroValue}>{Math.round(value)}{unit}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  heroBody: { marginBottom: 16, maxWidth: 640 },
  heroCard: { marginBottom: 16, alignItems: 'center', overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: -40, right: -20, width: 160, height: 160, borderRadius: 80, backgroundColor: '#6ee7b730' },
  calorieNumber: { fontSize: 56, fontWeight: '800', color: '#6ee7b7' },
  calorieLabel: { color: '#b4c5e4', marginBottom: 4, fontSize: 15 },
  burnedLabel: { color: '#fbbf24', fontSize: 12, marginBottom: 12, fontWeight: '600' },
  progressBar: { height: 10, backgroundColor: '#213055', borderRadius: 999, width: '100%', marginBottom: 10, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#4ade80', borderRadius: 4 },
  remaining: { color: '#9fb1d1', fontSize: 13 },
  miniStats: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  statChip: { flex: 1, backgroundColor: '#122041', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#223a70' },
  statValue: { color: '#eff6ff', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#8ca0c3', fontSize: 12, marginTop: 2 },
  macroRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  macroCard: { flex: 1, minWidth: 100, borderTopWidth: 3, alignItems: 'center' },
  macroValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
  macroLabel: { color: '#9fb1d1', fontSize: 12 },
  streakCard: { marginBottom: 16 },
  streakHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 },
  streakTitle: { color: '#eff6ff', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  streakSubtitle: { color: '#9fb1d1', fontSize: 13, lineHeight: 19, maxWidth: 250 },
  streakPill: { backgroundColor: '#25133f', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#6d28d9' },
  streakPillValue: { color: '#f0abfc', fontSize: 18, fontWeight: '800' },
  streakStatsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  streakStatBox: { flex: 1, backgroundColor: '#122041', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: '#223a70', alignItems: 'center' },
  streakStatValue: { color: '#fff', fontSize: 18, fontWeight: '800' },
  streakStatLabel: { color: '#8ca0c3', fontSize: 11, marginTop: 4, textAlign: 'center' },
  nextMilestoneText: { color: '#c4b5fd', fontSize: 12, fontWeight: '600', marginBottom: 12 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  badgeChipUnlocked: { backgroundColor: '#13291f', borderColor: '#14532d' },
  badgeChipLocked: { backgroundColor: '#172033', borderColor: '#24324f' },
  badgeIcon: { fontSize: 13 },
  badgeLabel: { color: '#d1fae5', fontSize: 12, fontWeight: '700' },
  badgeLabelLocked: { color: '#94a3b8' },
  achievementLink: { marginTop: 14, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  achievementLinkText: { color: '#e2e8f0', fontSize: 12, fontWeight: '700' },
  syncCard: { marginBottom: 16 },
  syncHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  syncTitle: { color: '#eff6ff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  syncDescription: { color: '#9fb1d1', fontSize: 13, lineHeight: 19, maxWidth: 260 },
  syncBadge: { color: '#6ee7b7', fontSize: 12, fontWeight: '800', backgroundColor: '#122041', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  syncResultRow: { marginTop: 12, padding: 10, backgroundColor: '#122041', borderRadius: 12, borderWidth: 1, borderColor: '#223a70' },
  syncResultText: { color: '#b4c5e4', fontSize: 12, fontWeight: '600' },
  syncButton: { marginTop: 14, backgroundColor: '#60a5fa', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  syncButtonLocked: { backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151' },
  syncButtonText: { color: '#07111f', fontSize: 14, fontWeight: '800' },
  syncButtonTextLocked: { color: '#d1d5db' },
  recommendationCard: { marginBottom: 16 },
  recommendationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 },
  recommendationTitle: { color: '#eff6ff', fontSize: 16, fontWeight: '700' },
  recommendationSubtitle: { color: '#9fb1d1', fontSize: 12, marginTop: 3 },
  recommendationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recommendationMeal: { color: '#dbeafe', fontSize: 13, fontWeight: '700' },
  recommendationValue: { color: '#6ee7b7', fontSize: 13, fontWeight: '800' },
  recommendationHint: { color: '#cbd5e1', fontSize: 12, marginTop: 2, lineHeight: 18 },
  recommendationAdjustment: { color: '#c4b5fd', fontSize: 12, marginTop: 10, fontWeight: '600' },
  adjustButton: { marginTop: 12, borderRadius: 12, backgroundColor: '#22d3ee', paddingVertical: 12, alignItems: 'center' },
  adjustButtonText: { color: '#06202a', fontSize: 13, fontWeight: '800' },
  scanButton: { backgroundColor: '#6ee7b7', borderRadius: 18, padding: 18, alignItems: 'center', marginBottom: 24 },
  scanButtonText: { color: '#07111f', fontWeight: '800', fontSize: 17 },
  scanButtonSubtext: { color: '#0f2a1b', marginTop: 4, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#eff6ff', marginBottom: 12 },
  logItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  logName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  logCalorie: { color: '#6ee7b7', fontWeight: '700' },
});
