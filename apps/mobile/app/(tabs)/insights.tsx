import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WeeklyInsights } from '@calorie-ai/types';
import { useInsightsStore } from '../../store/insights.store';
import { useCalorieTargetStore } from '../../store/calorie-target.store';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';

const screenWidth = Dimensions.get('window').width;

export default function InsightsScreen() {
  const { weeklyInsights, isLoading, fetchWeeklyInsights } = useInsightsStore();
  const {
    recommendations,
    isLoadingRecommendations,
    fetchRecommendations,
  } = useCalorieTargetStore();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    fetchWeeklyInsights();
    fetchRecommendations().catch(() => {});
  }, []);

  if (isLoading) {
    return (
      <ScreenShell>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6ee7b7" />
          <Text style={styles.loadingText}>Đang tải dữ liệu tuần...</Text>
        </View>
      </ScreenShell>
    );
  }

  if (!weeklyInsights) {
    return (
      <ScreenShell>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Không thể tải thông tin tuần.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchWeeklyInsights()}>
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </ScreenShell>
    );
  }

  const data = weeklyInsights;
  const selectedDayData = selectedDay !== null ? data.daily_insights[selectedDay] : null;

  return (
    <ScreenShell>
      <ScrollView>
        <Eyebrow>Thống kê tuần</Eyebrow>
        <HeroTitle>Bạn đã tiến bộ bao nhiêu tuần này?</HeroTitle>
        <BodyText style={styles.periodText}>{data.period}</BodyText>

        {/* ─── Weekly Summary Cards ─── */}
        <View style={styles.summaryGrid}>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Calo trung bình/ngày</Text>
            <Text style={styles.summaryValue}>{data.average_calories_per_day}</Text>
            <Text style={styles.summaryUnit}>kcal</Text>
          </SurfaceCard>

          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Độ tuân thủ</Text>
            <Text style={styles.summaryValue}>{data.weekly_adherence_percentage}%</Text>
            {data.weekly_adherence_percentage >= 90 && data.weekly_adherence_percentage <= 110 ? (
              <Text style={styles.summaryUnitGood}>✅ Tốt</Text>
            ) : (
              <Text style={styles.summaryUnit}>Mục tiêu: 100%</Text>
            )}
          </SurfaceCard>
        </View>

        <View style={styles.summaryGrid}>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Ngày đạt mục tiêu</Text>
            <Text style={styles.summaryValue}>{data.days_on_target}</Text>
            <Text style={styles.summaryUnit}>/ 7 ngày</Text>
          </SurfaceCard>

          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Xu hướng vs tuần trước</Text>
            <Text style={[styles.summaryValue, data.trend_vs_last_week <= 0 ? styles.trendPositive : styles.trendNegative]}>
              {data.trend_vs_last_week > 0 ? '+' : ''}{data.trend_vs_last_week}%
            </Text>
            <Text style={styles.summaryUnit}>
              {data.trend_vs_last_week <= 0 ? '📉 Tốt' : '📈 Tăng'}
            </Text>
          </SurfaceCard>
        </View>

        {/* ─── Daily Breakdown ─── */}
        <Text style={styles.sectionTitle}>Chi tiết từng ngày</Text>
        <View style={styles.dailyGrid}>
          {data.daily_insights.map((day, idx) => (
            <TouchableOpacity
              key={`${day.date}-${idx}`}
              style={[
                styles.dayCard,
                selectedDay === idx && styles.dayCardActive,
                day.adherence_percentage >= 90 && day.adherence_percentage <= 110 && styles.dayCardGood,
              ]}
              onPress={() => setSelectedDay(selectedDay === idx ? null : idx)}
            >
              <Text style={styles.dayName}>{day.day_name.slice(0, 3)}</Text>
              <Text style={styles.dayDate}>{day.date.slice(5)}</Text>
              <View style={styles.adherenceBar}>
                <View
                  style={[
                    styles.adherenceFill,
                    { width: `${Math.min(100, day.adherence_percentage)}%` },
                  ]}
                />
              </View>
              <Text style={styles.dayCalories}>{day.calories}kcal</Text>
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
                <Ionicons name="close" size={24} color="#9fb1d1" />
              </TouchableOpacity>
            </View>

            <View style={styles.dayDetailContent}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Calorie</Text>
                <Text style={styles.detailValue}>
                  {selectedDayData.calories} / {selectedDayData.calorie_target} kcal
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Độ tuân thủ</Text>
                <Text style={[styles.detailValue, selectedDayData.adherence_percentage >= 90 && selectedDayData.adherence_percentage <= 110 ? styles.goodValue : styles.neutralValue]}>
                  {selectedDayData.adherence_percentage}%
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Số bữa ăn</Text>
                <Text style={styles.detailValue}>{selectedDayData.meal_count}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Macro (g)</Text>
                <Text style={styles.detailValue}>
                  P: {Math.round(selectedDayData.protein_g)} | C: {Math.round(selectedDayData.carbs_g)} | F: {Math.round(selectedDayData.fat_g)}
                </Text>
              </View>
            </View>
          </SurfaceCard>
        )}

        {/* ─── Macro Breakdown ─── */}
        <Text style={styles.sectionTitle}>Macro - Tuần này</Text>
        <SurfaceCard style={styles.macroCard}>
          <View style={styles.macroCircle}>
            <Text style={styles.macroPercentage}>{data.macro_breakdown.protein_percentage}%</Text>
            <Text style={styles.macroLabel}>Protein</Text>
            <Text style={styles.macroValue}>{data.macro_breakdown.protein_grams}g</Text>
          </View>

          <View style={styles.macroCircle}>
            <Text style={styles.macroPercentage}>{data.macro_breakdown.carbs_percentage}%</Text>
            <Text style={styles.macroLabel}>Carbs</Text>
            <Text style={styles.macroValue}>{data.macro_breakdown.carbs_grams}g</Text>
          </View>

          <View style={styles.macroCircle}>
            <Text style={styles.macroPercentage}>{data.macro_breakdown.fat_percentage}%</Text>
            <Text style={styles.macroLabel}>Fat</Text>
            <Text style={styles.macroValue}>{data.macro_breakdown.fat_grams}g</Text>
          </View>
        </SurfaceCard>

        {/* ─── Meal Type Breakdown ─── */}
        <Text style={styles.sectionTitle}>Phân bổ theo bữa</Text>
        <SurfaceCard style={styles.mealBreakdownCard}>
          <MealBreakdownRow
            label="🌅 Sáng"
            calories={data.meal_breakdown.breakfast_calories}
            count={data.meal_breakdown.breakfast_count}
            total={data.weekly_calories_total}
          />
          <MealBreakdownRow
            label="🌤️ Trưa"
            calories={data.meal_breakdown.lunch_calories}
            count={data.meal_breakdown.lunch_count}
            total={data.weekly_calories_total}
          />
          <MealBreakdownRow
            label="🌙 Tối"
            calories={data.meal_breakdown.dinner_calories}
            count={data.meal_breakdown.dinner_count}
            total={data.weekly_calories_total}
          />
          <MealBreakdownRow
            label="🍿 Vặt"
            calories={data.meal_breakdown.snack_calories}
            count={data.meal_breakdown.snack_count}
            total={data.weekly_calories_total}
          />
        </SurfaceCard>

        {/* ─── Highlights ─── */}
        <Text style={styles.sectionTitle}>Điểm nổi bật</Text>
        <SurfaceCard style={styles.highlightCard}>
          <View style={styles.highlightRow}>
            <Text style={styles.highlightLabel}>📈 Ngày nhiều calo nhất</Text>
            <Text style={styles.highlightValue}>{data.best_day_calories} kcal</Text>
          </View>
          <View style={styles.highlightRow}>
            <Text style={styles.highlightLabel}>📉 Ngày ít calo nhất</Text>
            <Text style={styles.highlightValue}>{data.worst_day_calories} kcal</Text>
          </View>
          <View style={styles.highlightRow}>
            <Text style={styles.highlightLabel}>🍽️ Tổng bữa ăn</Text>
            <Text style={styles.highlightValue}>{data.total_meals_logged} bữa</Text>
          </View>
        </SurfaceCard>

        {/* ─── Weekly Plan Surface (Sprint 2) ─── */}
        <Text style={styles.sectionTitle}>Gợi ý meal plan tuần</Text>
        <SurfaceCard style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planTitle}>Khuyến nghị cá nhân hóa</Text>
            {isLoadingRecommendations ? (
              <ActivityIndicator size="small" color="#6ee7b7" />
            ) : null}
          </View>

          {recommendations ? (
            <>
              <Text style={styles.planMeta}>
                Remaining hôm nay: {recommendations.remaining_calories} kcal · Adherence TB: {recommendations.weekly_insights.average_adherence}%
              </Text>

              {recommendations.meals.map((meal) => (
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
                  <Text style={styles.planMealCal}>{meal.recommended_calories} kcal</Text>
                </View>
              ))}

              <View style={styles.planSuggestionBox}>
                <Text style={styles.planSuggestionTitle}>Gợi ý tuần</Text>
                <Text style={styles.planSuggestionText}>{recommendations.weekly_insights.suggestion}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.planEmpty}>Chưa có dữ liệu recommendation cho tuần này.</Text>
          )}
        </SurfaceCard>

        <View style={styles.bottomPadding} />
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
  const percentage = total > 0 ? (calories / total) * 100 : 0;
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownLeft}>
        <Text style={styles.breakdownLabel}>{label}</Text>
        <Text style={styles.breakdownMeta}>{count} bữa</Text>
      </View>
      <View style={styles.breakdownBar}>
        <View style={[styles.breakdownFill, { width: `${Math.max(5, percentage)}%` }]} />
      </View>
      <Text style={styles.breakdownValue}>{calories}kcal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
  loadingText: { color: '#9fb1d1', marginTop: 12, fontSize: 14 },
  errorText: { color: '#ef4444', fontSize: 14, marginBottom: 12 },
  retryButton: { backgroundColor: '#6ee7b7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: '#07111f', fontWeight: '600', fontSize: 14 },

  periodText: { marginBottom: 18, color: '#9fb1d1', fontSize: 14 },

  summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: { flex: 1, alignItems: 'center', padding: 16 },
  summaryLabel: { color: '#9fb1d1', fontSize: 12, marginBottom: 8 },
  summaryValue: { color: '#6ee7b7', fontSize: 26, fontWeight: '800' },
  summaryUnit: { color: '#8194ba', fontSize: 11, marginTop: 4 },
  summaryUnitGood: { color: '#4ade80', fontSize: 11, marginTop: 4, fontWeight: '600' },
  trendPositive: { color: '#4ade80' },
  trendNegative: { color: '#ef4444' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#eff6ff', marginTop: 20, marginBottom: 12 },

  dailyGrid: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  dayCard: { flex: 1, minWidth: 70, backgroundColor: '#0f1b3b', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#203463' },
  dayCardActive: { backgroundColor: '#1a2f5c', borderColor: '#6ee7b7' },
  dayCardGood: { borderColor: '#4ade80' },
  dayName: { color: '#9fb1d1', fontSize: 13, fontWeight: '600' },
  dayDate: { color: '#8194ba', fontSize: 12, marginTop: 2 },
  adherenceBar: { width: '100%', height: 4, backgroundColor: '#0b1330', borderRadius: 2, marginVertical: 6, overflow: 'hidden' },
  adherenceFill: { height: '100%', backgroundColor: '#6ee7b7' },
  dayCalories: { color: '#6ee7b7', fontSize: 12, fontWeight: '700' },
  noData: { color: '#555', fontSize: 12 },

  dayDetailCard: { marginBottom: 16 },
  dayDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#203463', paddingBottom: 12 },
  dayDetailTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dayDetailContent: { gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  detailLabel: { color: '#9fb1d1', fontSize: 13 },
  detailValue: { color: '#bfdbfe', fontSize: 13, fontWeight: '600' },
  goodValue: { color: '#4ade80' },
  neutralValue: { color: '#fbbf24' },

  macroCard: { gap: 16, marginBottom: 16 },
  macroCircle: { alignItems: 'center' },
  macroPercentage: { color: '#6ee7b7', fontSize: 24, fontWeight: '800' },
  macroLabel: { color: '#9fb1d1', fontSize: 12, marginTop: 2 },
  macroValue: { color: '#bfdbfe', fontSize: 11, marginTop: 2 },

  mealBreakdownCard: { gap: 12, marginBottom: 16 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakdownLeft: { flex: 0.25 },
  breakdownLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  breakdownMeta: { color: '#8194ba', fontSize: 11, marginTop: 2 },
  breakdownBar: { flex: 1, height: 6, backgroundColor: '#0b1330', borderRadius: 3, overflow: 'hidden' },
  breakdownFill: { height: '100%', backgroundColor: '#7dd3fc' },
  breakdownValue: { flex: 0.2, color: '#bfdbfe', fontSize: 12, fontWeight: '600', textAlign: 'right' },

  highlightCard: { gap: 12, marginBottom: 16 },
  highlightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  highlightLabel: { color: '#9fb1d1', fontSize: 13 },
  highlightValue: { color: '#6ee7b7', fontSize: 14, fontWeight: '700' },

  planCard: { gap: 10, marginBottom: 12 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planTitle: { color: '#eff6ff', fontSize: 15, fontWeight: '700' },
  planMeta: { color: '#9fb1d1', fontSize: 12, lineHeight: 18 },
  planMealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1d2d53',
  },
  planMealLeft: { flex: 1 },
  planMealLabel: { color: '#dbeafe', fontSize: 13, fontWeight: '700' },
  planMealTip: { color: '#8ea3cb', fontSize: 12, marginTop: 3, lineHeight: 17 },
  planMealCal: { color: '#6ee7b7', fontSize: 12, fontWeight: '800' },
  planSuggestionBox: { marginTop: 6, backgroundColor: '#122041', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#223a70' },
  planSuggestionTitle: { color: '#c4b5fd', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  planSuggestionText: { color: '#d7e3fa', fontSize: 12, lineHeight: 18 },
  planEmpty: { color: '#8ea3cb', fontSize: 12 },

  bottomPadding: { height: 40 },
});
