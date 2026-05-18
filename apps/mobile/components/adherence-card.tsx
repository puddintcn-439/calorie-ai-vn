import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View
} from 'react-native';
import { router } from 'expo-router';
import { SurfaceCard } from './ui-shell';
import { UiButton } from './ui-button';
import { useAppTheme } from './theme';
import { apiClient } from '../services/api';
import { Text } from './i18n-text';

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
  const { colors } = useAppTheme();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiClient.get('/coaching/weekly-summary');
        if (!mounted) return;
        setSummary(res.data ?? null);
      } catch (err) {
        // Keep this card passive so coach availability does not block Today.
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <SurfaceCard style={[styles.card, { borderColor: colors.borderInfo }]}>
        <ActivityIndicator color={colors.accentMint} />
      </SurfaceCard>
    );
  }

  if (!summary) {
    return (
      <SurfaceCard style={[styles.card, { borderColor: colors.borderInfo }]}>
        <Text style={[styles.title, { color: colors.text }]} i18nKey="screen.components.adherenceCard.text.001" />
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          Chưa có dữ liệu tuần này. Ghi nhật ký ăn uống để nhận phân tích.
        </Text>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard style={[styles.card, { borderColor: colors.borderInfo }]}>
      <Text style={[styles.title, { color: colors.text }]} i18nKey="screen.components.adherenceCard.text.001" />
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={[styles.label, { color: colors.textSoft }]} i18nKey="screen.components.adherenceCard.text.002" />
          <Text style={[styles.value, { color: colors.accentMint }]}>{summary.adherence_percentage}%</Text>
        </View>
        <View style={styles.col}>
          <Text style={[styles.label, { color: colors.textSoft }]} i18nKey="screen.components.adherenceCard.text.003" />
          <Text style={[styles.value, { color: colors.accentMint }]}>{summary.logs_count}</Text>
        </View>
      </View>

      <View style={styles.rowSmall}>
        <Text style={[styles.small, { color: colors.textSoft }]}>Trên mục tiêu: {summary.days_above_target}</Text>
        <Text style={[styles.small, { color: colors.textSoft }]}>Đúng đích: {summary.days_on_target}</Text>
        <Text style={[styles.small, { color: colors.textSoft }]}>Dưới mục tiêu: {summary.days_below_target}</Text>
      </View>

      {summary.recommended_action ? (
        <Text style={[styles.action, { color: colors.textSoft }]}>{summary.recommended_action}</Text>
      ) : null}

      <UiButton label="screen.components.adherenceCard.label.001" onPress={() => router.push('/(tabs)/coach')} style={{ marginTop: 10 }} />
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  col: { flex: 1 },
  label: { fontSize: 12 },
  value: { fontSize: 18, fontWeight: '800' },
  rowSmall: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  small: { fontSize: 12 },
  action: { fontSize: 13, marginTop: 8, fontStyle: 'italic' },
  empty: { fontSize: 13, lineHeight: 19 },
});
