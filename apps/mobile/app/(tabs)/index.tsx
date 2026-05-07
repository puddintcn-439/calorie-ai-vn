import React, { useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useLogStore } from '../../store/log.store';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';

export default function DashboardScreen() {
  const { dailyLog, activityLogs, isLoading, fetchDailyLog, fetchActivityLogs } = useLogStore();

  useEffect(() => {
    fetchDailyLog().catch(() => {});
    fetchActivityLogs().catch(() => {});
  }, []);

  const consumed = dailyLog?.total_calories ?? 0;
  const burned = activityLogs.reduce((s, a) => s + a.calories_burned, 0);
  const net = consumed - burned;
  const target = dailyLog?.target_calories ?? 1800;
  const remaining = target - net;
  const progress = Math.min(net / target, 1);

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
  scanButton: { backgroundColor: '#6ee7b7', borderRadius: 18, padding: 18, alignItems: 'center', marginBottom: 24 },
  scanButtonText: { color: '#07111f', fontWeight: '800', fontSize: 17 },
  scanButtonSubtext: { color: '#0f2a1b', marginTop: 4, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#eff6ff', marginBottom: 12 },
  logItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  logName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  logCalorie: { color: '#6ee7b7', fontWeight: '700' },
});
