import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { WeeklyInsights } from '@calorie-ai/types';
import { useInsightsStore } from '../../store/insights.store';
import { useCalorieTargetStore } from '../../store/calorie-target.store';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard, useBottomNavContentPadding } from '../../components/ui-shell';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';
import { formatKcal, formatMacro, formatNumberVi, formatPercent, safeNumber } from '../../services/number-format';

const screenWidth = Dimensions.get('window').width;

export default function InsightsScreen() {
  useAppTheme();
  const bottomContentPadding = useBottomNavContentPadding();
  const { weeklyInsights, isLoading, fetchWeeklyInsights } = useInsightsStore();
  const {
    recommendations,
    isLoadingRecommendations,
    fetchRecommendations,
  } = useCalorieTargetStore();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const loadInsightsData = useCallback(() => {
    fetchWeeklyInsights();
    fetchRecommendations().catch(() => {});
  }, [fetchRecommendations, fetchWeeklyInsights]);

  useEffect(() => {
    loadInsightsData();
  }, [loadInsightsData]);

  useFocusEffect(
    useCallback(() => {
      loadInsightsData();
    }, [loadInsightsData]),
  );

  if (isLoading) {
    return (
      <ScreenShell>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.accentMint} />
          <Text style={styles.loadingText} i18nKey="screen.tabs.insights.text.001" />
        </View>
      </ScreenShell>
    );
  }

  if (!weeklyInsights) {
    return (
      <ScreenShell>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText} i18nKey="screen.tabs.insights.text.002" />
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchWeeklyInsights()}>
            <Text style={styles.retryButtonText} i18nKey="screen.tabs.insights.text.003" />
          </TouchableOpacity>
        </View>
      </ScreenShell>
    );
  }

  const data = weeklyInsights;
  const dailyInsights = Array.isArray(data.daily_insights) ? data.daily_insights : [];
  const macroBreakdown = (data.macro_breakdown ?? {}) as Partial<typeof data.macro_breakdown>;
  const mealBreakdown = (data.meal_breakdown ?? {}) as Partial<typeof data.meal_breakdown>;
  const selectedDayData = selectedDay !== null ? dailyInsights[selectedDay] : null;

  return (
    <ScreenShell scroll={false} reserveBottomNav={false}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomContentPadding }]}>
        <Eyebrow>Thống kê tuần</Eyebrow>
        <HeroTitle>Bạn đã tiến bộ bao nhiêu tuần này?</HeroTitle>
        <BodyText style={styles.periodText}>{data.period}</BodyText>

        {/* ─── Weekly Summary Cards ─── */}
        <View style={styles.summaryGrid}>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel} i18nKey="screen.tabs.insights.text.004" />
            <Text style={styles.summaryValue}>{formatNumberVi(data.average_calories_per_day)}</Text>
            <Text style={styles.summaryUnit} i18nKey="screen.tabs.insights.text.005" />
          </SurfaceCard>

          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel} i18nKey="screen.tabs.insights.text.006" />
            <Text style={styles.summaryValue}>{formatPercent(data.weekly_adherence_percentage)}</Text>
            {safeNumber(data.weekly_adherence_percentage) >= 90 && safeNumber(data.weekly_adherence_percentage) <= 110 ? (
              <Text style={styles.summaryUnitGood} i18nKey="screen.tabs.insights.text.007" />
            ) : (
              <Text style={styles.summaryUnit} i18nKey="screen.tabs.insights.text.008" />
            )}
          </SurfaceCard>
        </View>

        <View style={styles.summaryGrid}>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel} i18nKey="screen.tabs.insights.text.009" />
            <Text style={styles.summaryValue}>{formatNumberVi(data.days_on_target)}</Text>
            <Text style={styles.summaryUnit} i18nKey="screen.tabs.insights.text.010" />
          </SurfaceCard>

          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel} i18nKey="screen.tabs.insights.text.011" />
            <Text style={[styles.summaryValue, safeNumber(data.trend_vs_last_week) <= 0 ? styles.trendPositive : styles.trendNegative]}>
              {safeNumber(data.trend_vs_last_week) > 0 ? '+' : ''}{formatPercent(data.trend_vs_last_week)}
            </Text>
            <Text style={styles.summaryUnit}>
              {safeNumber(data.trend_vs_last_week) <= 0 ? '📉 Tốt' : '📈 Tăng'}
            </Text>
          </SurfaceCard>
        </View>

        {/* ─── Daily Breakdown ─── */}
        <Text style={styles.sectionTitle} i18nKey="screen.tabs.insights.text.012" />
        <View style={styles.dailyGrid}>
          {dailyInsights.map((day, idx) => (
            <TouchableOpacity
              key={`${day.date}-${idx}`}
              style={[
                styles.dayCard,
                selectedDay === idx && styles.dayCardActive,
                safeNumber(day.adherence_percentage) >= 90 && safeNumber(day.adherence_percentage) <= 110 && styles.dayCardGood,
              ]}
              onPress={() => setSelectedDay(selectedDay === idx ? null : idx)}
            >
              <Text style={styles.dayName}>{day.day_name.slice(0, 3)}</Text>
              <Text style={styles.dayDate}>{day.date.slice(5)}</Text>
              <View style={styles.adherenceBar}>
                <View
                  style={[
                    styles.adherenceFill,
                    { width: `${Math.min(100, safeNumber(day.adherence_percentage))}%` },
                  ]}
                />
              </View>
              <Text style={styles.dayCalories}>{formatKcal(day.calories)}</Text>
              {day.meal_count === 0 && <Text style={styles.noData}>-</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Selected Day Detail ─── */}
        {selectedDayData && (
          <SurfaceCard style={styles.dayDetailCard}>
            <View style={styles.dayDetailHeader}>
              <Text style={styles.dayDetailTitle}>
                {selectedDayData.day_name}, {selectedDayData.date}
              </Text>
              <TouchableOpacity onPress={() => setSelectedDay(null)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.dayDetailContent}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} i18nKey="screen.tabs.insights.text.013" />
                <Text style={styles.detailValue}>
                  {formatNumberVi(selectedDayData.calories)} / {formatKcal(selectedDayData.calorie_target)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} i18nKey="screen.tabs.insights.text.006" />
                <Text style={[styles.detailValue, safeNumber(selectedDayData.adherence_percentage) >= 90 && safeNumber(selectedDayData.adherence_percentage) <= 110 ? styles.goodValue : styles.neutralValue]}>
                  {formatPercent(selectedDayData.adherence_percentage)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} i18nKey="screen.tabs.insights.text.014" />
                <Text style={styles.detailValue}>{selectedDayData.meal_count}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} i18nKey="screen.tabs.insights.text.015" />
                <Text style={styles.detailValue}>
                  P: {formatMacro(selectedDayData.protein_g)} | C: {formatMacro(selectedDayData.carbs_g)} | F: {formatMacro(selectedDayData.fat_g)}
                </Text>
              </View>
            </View>
          </SurfaceCard>
        )}

        {/* ─── Macro Breakdown ─── */}
        <Text style={styles.sectionTitle} i18nKey="screen.tabs.insights.text.016" />
        <SurfaceCard style={styles.macroCard}>
          <View style={styles.macroCircle}>
            <Text style={styles.macroPercentage}>{formatPercent(macroBreakdown.protein_percentage)}</Text>
            <Text style={styles.macroLabel} i18nKey="screen.tabs.insights.text.017" />
            <Text style={styles.macroValue}>{formatMacro(macroBreakdown.protein_grams)}</Text>
          </View>

          <View style={styles.macroCircle}>
            <Text style={styles.macroPercentage}>{formatPercent(macroBreakdown.carbs_percentage)}</Text>
            <Text style={styles.macroLabel} i18nKey="screen.tabs.insights.text.018" />
            <Text style={styles.macroValue}>{formatMacro(macroBreakdown.carbs_grams)}</Text>
          </View>

          <View style={styles.macroCircle}>
            <Text style={styles.macroPercentage}>{formatPercent(macroBreakdown.fat_percentage)}</Text>
            <Text style={styles.macroLabel} i18nKey="screen.tabs.insights.text.019" />
            <Text style={styles.macroValue}>{formatMacro(macroBreakdown.fat_grams)}</Text>
          </View>
        </SurfaceCard>

        {/* ─── Meal Type Breakdown ─── */}
        <Text style={styles.sectionTitle} i18nKey="screen.tabs.insights.text.020" />
        <SurfaceCard style={styles.mealBreakdownCard}>
          <MealBreakdownRow
            label="screen.tabs.insights.label.001"
            calories={mealBreakdown.breakfast_calories}
            count={mealBreakdown.breakfast_count}
            total={data.weekly_calories_total}
          />
          <MealBreakdownRow
            label="screen.tabs.insights.label.002"
            calories={mealBreakdown.lunch_calories}
            count={mealBreakdown.lunch_count}
            total={data.weekly_calories_total}
          />
          <MealBreakdownRow
            label="screen.tabs.insights.label.003"
            calories={mealBreakdown.dinner_calories}
            count={mealBreakdown.dinner_count}
            total={data.weekly_calories_total}
          />
          <MealBreakdownRow
            label="screen.tabs.insights.label.004"
            calories={mealBreakdown.snack_calories}
            count={mealBreakdown.snack_count}
            total={data.weekly_calories_total}
          />
        </SurfaceCard>

        {/* ─── Highlights ─── */}
        <Text style={styles.sectionTitle} i18nKey="screen.tabs.insights.text.021" />
        <SurfaceCard style={styles.highlightCard}>
          <View style={styles.highlightRow}>
            <Text style={styles.highlightLabel} i18nKey="screen.tabs.insights.text.022" />
            <Text style={styles.highlightValue}>{formatKcal(data.best_day_calories)}</Text>
          </View>
          <View style={styles.highlightRow}>
            <Text style={styles.highlightLabel} i18nKey="screen.tabs.insights.text.023" />
            <Text style={styles.highlightValue}>{formatKcal(data.worst_day_calories)}</Text>
          </View>
          <View style={styles.highlightRow}>
            <Text style={styles.highlightLabel} i18nKey="screen.tabs.insights.text.024" />
            <Text style={styles.highlightValue}>{formatNumberVi(data.total_meals_logged)} bữa</Text>
          </View>
        </SurfaceCard>

        {/* ─── Weekly Plan Surface (Sprint 2) ─── */}
        <Text style={styles.sectionTitle} i18nKey="screen.tabs.insights.text.025" />
        <SurfaceCard style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planTitle} i18nKey="screen.tabs.insights.text.026" />
            {isLoadingRecommendations ? (
              <ActivityIndicator size="small" color={theme.colors.accentMint} />
            ) : null}
          </View>

          {recommendations ? (
            <>
              <Text style={styles.planMeta}>
                Remaining hôm nay: {formatKcal(recommendations.remaining_calories)} · Adherence TB: {formatPercent(recommendations.weekly_insights?.average_adherence)}
              </Text>

              {(Array.isArray(recommendations.meals) ? recommendations.meals : []).map((meal) => (
                <View key={meal.meal_type} style={styles.planMealRow}>
                  <View style={styles.planMealLeft}>
                    <Text style={styles.planMealLabel}>
                      {meal.meal_type === 'breakfast'
                        ? '🌅 Sáng'
                        : meal.meal_type === 'lunch'
                          ? '🌤️ Trưa'
                          : meal.meal_type === 'dinner'
                            ? '🌙 Tối'
                            : '🍿 Vặt'}
                    </Text>
                    <Text style={styles.planMealTip}>{meal.tips}</Text>
                  </View>
                  <Text style={styles.planMealCal}>{formatKcal(meal.recommended_calories)}</Text>
                </View>
              ))}

              <View style={styles.planSuggestionBox}>
                <Text style={styles.planSuggestionTitle} i18nKey="screen.tabs.insights.text.027" />
                <Text style={styles.planSuggestionText}>{recommendations.weekly_insights?.suggestion ?? 'Chưa đủ dữ liệu để gợi ý tuần này.'}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.planEmpty} i18nKey="screen.tabs.insights.text.028" />
          )}
        </SurfaceCard>

      </ScrollView>
    </ScreenShell>
  );
}

function MealBreakdownRow({
  label,
  calories,
  count,
  total,
}: {
  label: string;
  calories: number;
  count: number;
  total: number;
}) {
  const safeCalories = safeNumber(calories);
  const safeTotal = safeNumber(total);
  const percentage = safeTotal > 0 ? (safeCalories / safeTotal) * 100 : 0;
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownLeft}>
        <Text style={styles.breakdownLabel}>{label}</Text>
        <Text style={styles.breakdownMeta}>{formatNumberVi(count)} bữa</Text>
      </View>
      <View style={styles.breakdownBar}>
        <View style={[styles.breakdownFill, { width: `${Math.max(5, Math.min(100, percentage))}%` }]} />
      </View>
      <Text style={styles.breakdownValue}>{formatKcal(safeCalories)}</Text>
    </View>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  scrollContent: { paddingTop: 14 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
  loadingText: { color: colors.textMuted, marginTop: 12, fontSize: 14 },
  errorText: { color: colors.danger, fontSize: 14, marginBottom: 12 },
  retryButton: { backgroundColor: colors.accentMint, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: colors.textOnAccent, fontWeight: '600', fontSize: 14 },

  periodText: { marginBottom: 18, color: colors.textMuted, fontSize: 14 },

  summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: { flex: 1, alignItems: 'center', padding: 16 },
  summaryLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  summaryValue: { color: colors.accentMint, fontSize: 26, fontWeight: '800' },
  summaryUnit: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  summaryUnitGood: { color: colors.success, fontSize: 11, marginTop: 4, fontWeight: '600' },
  trendPositive: { color: colors.success },
  trendNegative: { color: colors.danger },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 20, marginBottom: 12 },

  dailyGrid: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  dayCard: { flex: 1, minWidth: 70, backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  dayCardActive: { backgroundColor: colors.surfaceInfo, borderColor: colors.accentMint },
  dayCardGood: { borderColor: colors.success },
  dayName: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  dayDate: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  adherenceBar: { width: '100%', height: 4, backgroundColor: colors.surfacePressed, borderRadius: 2, marginVertical: 6, overflow: 'hidden' },
  adherenceFill: { height: '100%', backgroundColor: colors.accentMint },
  dayCalories: { color: colors.accentMint, fontSize: 12, fontWeight: '700' },
  noData: { color: colors.textDisabled, fontSize: 12 },

  dayDetailCard: { marginBottom: 16 },
  dayDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 12 },
  dayDetailTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  dayDetailContent: { gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  detailLabel: { color: colors.textMuted, fontSize: 13 },
  detailValue: { color: colors.textSoft, fontSize: 13, fontWeight: '600' },
  goodValue: { color: colors.success },
  neutralValue: { color: colors.warning },

  macroCard: { gap: 16, marginBottom: 16 },
  macroCircle: { alignItems: 'center' },
  macroPercentage: { color: colors.accentMint, fontSize: 24, fontWeight: '800' },
  macroLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  macroValue: { color: colors.textSoft, fontSize: 11, marginTop: 2 },

  mealBreakdownCard: { gap: 12, marginBottom: 16 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakdownLeft: { flex: 0.25 },
  breakdownLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  breakdownMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  breakdownBar: { flex: 1, height: 6, backgroundColor: colors.surfacePressed, borderRadius: 3, overflow: 'hidden' },
  breakdownFill: { height: '100%', backgroundColor: colors.info },
  breakdownValue: { flex: 0.2, color: colors.textSoft, fontSize: 12, fontWeight: '600', textAlign: 'right' },

  highlightCard: { gap: 12, marginBottom: 16 },
  highlightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  highlightLabel: { color: colors.textMuted, fontSize: 13 },
  highlightValue: { color: colors.accentMint, fontSize: 14, fontWeight: '700' },

  planCard: { gap: 10, marginBottom: 12 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  planMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  planMealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  planMealLeft: { flex: 1 },
  planMealLabel: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  planMealTip: { color: colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  planMealCal: { color: colors.accentMint, fontSize: 12, fontWeight: '800' },
  planSuggestionBox: { marginTop: 6, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  planSuggestionTitle: { color: colors.accentPlum, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  planSuggestionText: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  planEmpty: { color: colors.textMuted, fontSize: 12 },

}));


