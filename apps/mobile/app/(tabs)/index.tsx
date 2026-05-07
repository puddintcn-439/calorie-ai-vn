import React, { useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useLogStore } from '../../store/log.store';

export default function DashboardScreen() {
  const { dailyLog, activityLogs, isLoading, fetchDailyLog, fetchActivityLogs } = useLogStore();

  useEffect(() => {
    fetchDailyLog();
    fetchActivityLogs();
  }, []);

  const consumed = dailyLog?.total_calories ?? 0;
  const burned = activityLogs.reduce((s, a) => s + a.calories_burned, 0);
  const net = consumed - burned;
  const target = dailyLog?.target_calories ?? 1800;
  const remaining = target - net;
  const progress = Math.min(net / target, 1);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Text style={styles.greeting}>Hôm nay 👋</Text>

        {/* Calorie Ring */}
        <View style={styles.card}>
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
        </View>

        {/* Macros */}
        <View style={styles.macroRow}>
          <MacroCard label="Protein" value={dailyLog?.total_protein_g ?? 0} unit="g" color="#f97316" />
          <MacroCard label="Carbs" value={dailyLog?.total_carbs_g ?? 0} unit="g" color="#3b82f6" />
          <MacroCard label="Fat" value={dailyLog?.total_fat_g ?? 0} unit="g" color="#eab308" />
        </View>

        {/* Scan CTA */}
        <TouchableOpacity style={styles.scanButton} onPress={() => router.push('/(tabs)/scan')}>
          <Text style={styles.scanButtonText}>📸 Scan đồ ăn</Text>
        </TouchableOpacity>

        {/* Today logs */}
        <Text style={styles.sectionTitle}>Hôm nay</Text>
        {isLoading && <ActivityIndicator color="#4ade80" />}
        {dailyLog?.logs.map((log) => (
          <View key={log.id} style={styles.logItem}>
            <Text style={styles.logName}>{log.name_vi ?? log.name}</Text>
            <Text style={styles.logCalorie}>{log.calories} kcal</Text>
          </View>
        ))}
        {dailyLog?.logs.length === 0 && (
          <Text style={styles.emptyText}>Chưa log gì hôm nay. Scan đồ ăn để bắt đầu!</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MacroCard({ label, value, unit, color }: any) {
  return (
    <View style={[styles.macroCard, { borderTopColor: color }]}>
      <Text style={styles.macroValue}>{Math.round(value)}{unit}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', padding: 16 },
  greeting: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  card: { backgroundColor: '#1a1a2e', borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center' },
  calorieNumber: { fontSize: 48, fontWeight: 'bold', color: '#4ade80' },
  calorieLabel: { color: '#9ca3af', marginBottom: 4 },
  burnedLabel: { color: '#fb923c', fontSize: 12, marginBottom: 10 },
  progressBar: { height: 8, backgroundColor: '#374151', borderRadius: 4, width: '100%', marginBottom: 8 },
  progressFill: { height: 8, backgroundColor: '#4ade80', borderRadius: 4 },
  remaining: { color: '#9ca3af', fontSize: 13 },
  macroRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  macroCard: { flex: 1, backgroundColor: '#1a1a2e', borderRadius: 12, padding: 12, borderTopWidth: 3, alignItems: 'center' },
  macroValue: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  macroLabel: { color: '#9ca3af', fontSize: 12 },
  scanButton: { backgroundColor: '#4ade80', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 24 },
  scanButtonText: { color: '#0f0f1a', fontWeight: 'bold', fontSize: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 12 },
  logItem: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1a1a2e', padding: 14, borderRadius: 10, marginBottom: 8 },
  logName: { color: '#fff', fontSize: 15 },
  logCalorie: { color: '#4ade80', fontWeight: '600' },
  emptyText: { color: '#6b7280', textAlign: 'center', marginTop: 20, fontSize: 14 },
});
