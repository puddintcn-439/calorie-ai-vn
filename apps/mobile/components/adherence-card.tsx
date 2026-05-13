import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SurfaceCard } from './ui-shell';
import { UiButton } from './ui-button';
import { apiClient } from '../services/api';
import { router } from 'expo-router';

type WeeklySummary = {
  adherence_percentage: number;
  logs_count: number;
  average_daily_calories: number;
  days_on_target: number;
  days_above_target: number;
  days_below_target: number;
  recommended_action?: string;
};

export default function AdherenceCard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiClient.get('/coaching/weekly-summary');
        if (!mounted) return;
        setSummary(res.data ?? null);
      } catch (err) {
        // ignore silently
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <SurfaceCard style={styles.card}>
        <ActivityIndicator color="#6ee7b7" />
      </SurfaceCard>
    );
  }

  if (!summary) {
    return (
      <SurfaceCard style={styles.card}>
        <Text style={styles.title}>📈 Tuân thủ tuần</Text>
        <Text style={styles.empty}>Chưa có dữ liệu tuần này. Ghi nhật ký ăn uống để nhận phân tích.</Text>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard style={styles.card}>
      <Text style={styles.title}>📈 Tuân thủ tuần</Text>
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Tuân thủ</Text>
          <Text style={styles.value}>{summary.adherence_percentage}%</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Ghi chép</Text>
          <Text style={styles.value}>{summary.logs_count}</Text>
        </View>
      </View>

      <View style={styles.rowSmall}>
        <Text style={styles.small}>Trên mục tiêu: {summary.days_above_target}</Text>
        <Text style={styles.small}>Trên đích: {summary.days_on_target}</Text>
        <Text style={styles.small}>Dưới mục tiêu: {summary.days_below_target}</Text>
      </View>

      {summary.recommended_action ? <Text style={styles.action}>{summary.recommended_action}</Text> : null}

      <UiButton label="Mở Coach" onPress={() => router.push('/(tabs)/coach')} style={{ marginTop: 10 }} />
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, borderColor: '#27426f' },
  title: { color: '#eff6ff', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  col: { flex: 1 },
  label: { color: '#b8c8e8', fontSize: 12 },
  value: { color: '#6ee7b7', fontSize: 18, fontWeight: '800' },
  rowSmall: { flexDirection: 'row', justifyContent: 'space-between' },
  small: { color: '#cfe8ff', fontSize: 12 },
  action: { color: '#cfe8ff', fontSize: 13, marginTop: 8, fontStyle: 'italic' },
  empty: { color: '#7082a9' },
});
