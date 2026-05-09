import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../components/ui-shell';
import { useGamificationStore } from '../store/gamification.store';

export default function AchievementsScreen() {
  const { summary, isLoading, fetchSummary } = useGamificationStore();

  useEffect(() => {
    fetchSummary().catch(() => {});
  }, []);

  return (
    <ScreenShell>
      <Eyebrow>Gamification</Eyebrow>
      <HeroTitle>Streak và thành tích của bạn</HeroTitle>
      <BodyText style={styles.heroBody}>
        Theo dõi chuỗi ngày liên tiếp, số ngày active và toàn bộ badges bạn đã mở khóa.
      </BodyText>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>← Quay lại dashboard</Text>
      </TouchableOpacity>

      {summary && (
        <>
          <SurfaceCard style={styles.overviewCard}>
            <View style={styles.overviewHeader}>
              <View>
                <Text style={styles.overviewTitle}>Chuỗi hiện tại</Text>
                <Text style={styles.overviewSubtitle}>
                  {summary.current_streak > 0
                    ? `Bạn đang giữ ${summary.current_streak} ngày liên tiếp.`
                    : 'Chưa có streak active, hôm nay là thời điểm tốt để bắt đầu.'}
                </Text>
              </View>
              <Text style={styles.streakValue}>🔥 {summary.current_streak}</Text>
            </View>

            <View style={styles.metricsRow}>
              <MetricCard value={summary.longest_streak} label="Best streak" />
              <MetricCard value={summary.active_days_last_30} label="Ngày active / 30" />
              <MetricCard value={summary.total_activity_logs} label="Activity logs" />
            </View>

            {summary.next_streak_milestone && (
              <Text style={styles.milestoneText}>
                Còn {Math.max(0, summary.next_streak_milestone - summary.current_streak)} ngày để đạt mốc {summary.next_streak_milestone}.
              </Text>
            )}
          </SurfaceCard>

          <Text style={styles.sectionTitle}>Tất cả badges</Text>
          <View style={styles.badgesList}>
            {summary.badges.map((badge) => (
              <SurfaceCard key={badge.id} style={[styles.badgeCard, badge.unlocked ? styles.badgeUnlocked : styles.badgeLocked]}>
                <View style={styles.badgeTopRow}>
                  <Text style={styles.badgeIcon}>{badge.icon}</Text>
                  <Text style={[styles.badgeState, badge.unlocked ? styles.badgeStateUnlocked : styles.badgeStateLocked]}>
                    {badge.unlocked ? 'Unlocked' : 'Locked'}
                  </Text>
                </View>
                <Text style={styles.badgeTitle}>{badge.label}</Text>
                <Text style={styles.badgeDescription}>{badge.description}</Text>
              </SurfaceCard>
            ))}
          </View>
        </>
      )}

      {!summary && !isLoading && (
        <SurfaceCard>
          <Text style={styles.emptyTitle}>Chưa có dữ liệu thành tích</Text>
          <Text style={styles.emptyText}>Hãy bắt đầu log bữa ăn hoặc hoạt động để hệ thống mở khóa streak và badges.</Text>
        </SurfaceCard>
      )}
    </ScreenShell>
  );
}

function MetricCard({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroBody: { marginBottom: 16, maxWidth: 700 },
  backButton: { alignSelf: 'flex-start', marginBottom: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#13213f', borderWidth: 1, borderColor: '#23386b' },
  backButtonText: { color: '#dbeafe', fontSize: 13, fontWeight: '700' },
  overviewCard: { marginBottom: 18 },
  overviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  overviewTitle: { color: '#eff6ff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  overviewSubtitle: { color: '#9fb1d1', fontSize: 13, lineHeight: 19, maxWidth: 240 },
  streakValue: { color: '#f0abfc', fontSize: 30, fontWeight: '800' },
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metricCard: { flex: 1, backgroundColor: '#122041', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10, borderWidth: 1, borderColor: '#223a70', alignItems: 'center' },
  metricValue: { color: '#eff6ff', fontSize: 18, fontWeight: '800' },
  metricLabel: { color: '#8ca0c3', fontSize: 11, marginTop: 4, textAlign: 'center' },
  milestoneText: { color: '#c4b5fd', fontSize: 12, fontWeight: '600' },
  sectionTitle: { color: '#eff6ff', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  badgesList: { gap: 12, marginBottom: 18 },
  badgeCard: { borderWidth: 1 },
  badgeUnlocked: { borderColor: '#14532d', backgroundColor: '#10231d' },
  badgeLocked: { borderColor: '#24324f', backgroundColor: '#111b31' },
  badgeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badgeIcon: { fontSize: 24 },
  badgeState: { fontSize: 11, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeStateUnlocked: { color: '#d1fae5', backgroundColor: '#14532d' },
  badgeStateLocked: { color: '#cbd5e1', backgroundColor: '#24324f' },
  badgeTitle: { color: '#eff6ff', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  badgeDescription: { color: '#9fb1d1', fontSize: 13, lineHeight: 19 },
  emptyTitle: { color: '#eff6ff', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  emptyText: { color: '#9fb1d1', fontSize: 13, lineHeight: 19 },
});