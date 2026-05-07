import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLogStore } from '../../store/log.store';
import { FoodLog, MealType, SavedMeal, ActivityLog, ActivityType, ACTIVITY_LABELS } from '@calorie-ai/types';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '🌅 Bữa sáng',
  lunch: '☀️ Bữa trưa',
  dinner: '🌙 Bữa tối',
  snack: '🍎 Ăn vặt',
};

export default function LogScreen() {
  const { dailyLog, savedMeals, activityLogs, isLoading, fetchDailyLog, fetchSavedMeals, fetchActivityLogs, removeLog, logSavedMeal, deleteSavedMeal, addActivity, deleteActivity } = useLogStore();
  const [perMealTargets, setPerMealTargets] = useState<Record<MealType, number>>({
    breakfast: 400, lunch: 600, dinner: 600, snack: 200,
  });

  useEffect(() => {
    fetchDailyLog();
    fetchSavedMeals();
    fetchActivityLogs();
    // Load per-meal targets from profile
    import('../../services/api').then(({ apiClient }) => {
      apiClient.get('/user/profile').then((res) => {
        const u = res.data;
        setPerMealTargets({
          breakfast: u.target_breakfast_cal ?? 400,
          lunch: u.target_lunch_cal ?? 600,
          dinner: u.target_dinner_cal ?? 600,
          snack: u.target_snack_cal ?? 200,
        });
      }).catch(() => {});
    });
  }, []);

  const logsByMeal = (dailyLog?.logs ?? []).reduce<Record<MealType, FoodLog[]>>(
    (acc, log) => {
      if (!acc[log.meal_type]) acc[log.meal_type] = [];
      acc[log.meal_type].push(log);
      return acc;
    },
    {} as Record<MealType, FoodLog[]>,
  );

  const handleQuickLog = (meal: SavedMeal) => {
    Alert.alert(
      `Log "${meal.name}"`,
      `${meal.total_calories} kcal · Vào bữa nào?`,
      (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((m) => ({
        text: MEAL_LABELS[m],
        onPress: async () => {
          try {
            await logSavedMeal(meal.id, m);
            Alert.alert('✅', `Đã log "${meal.name}" vào ${MEAL_LABELS[m]}`);
          } catch {
            Alert.alert('Lỗi', 'Không thể log bữa ăn.');
          }
        },
      })),
    );
  };

  const handleDeleteSaved = (meal: SavedMeal) => {
    Alert.alert('Xoá bộ sưu tập', `Xoá "${meal.name}"?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: () => deleteSavedMeal(meal.id) },
    ]);
  };

  const handleAddActivity = () => {
    const types = Object.keys(ACTIVITY_LABELS) as ActivityType[];
    Alert.alert('🏃 Ghi hoạt động', 'Chọn loại hoạt động:', [
      ...types.map((a) => ({
        text: ACTIVITY_LABELS[a],
        onPress: () => {
          Alert.prompt(`${ACTIVITY_LABELS[a]}`, 'Thời gian (phút):', async (mins) => {
            if (!mins || isNaN(Number(mins))) return;
            try { await addActivity({ activity_type: a, duration_min: Number(mins) }); }
            catch { Alert.alert('Lỗi', 'Không thể ghi hoạt động'); }
          }, 'plain-text', '30', 'numeric');
        },
      })),
      { text: 'Huỷ', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Nhật ký hôm nay</Text>

      {isLoading && <ActivityIndicator color="#4ade80" style={{ marginTop: 40 }} />}

      <ScrollView>
        {/* ---- Saved Meals Quick Log ---- */}
        {savedMeals.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.savedTitle}>⚡ Log nhanh</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedList}>
              {savedMeals.map((meal) => (
                <TouchableOpacity key={meal.id} style={styles.savedCard} onPress={() => handleQuickLog(meal)}>
                  <Text style={styles.savedName} numberOfLines={1}>{meal.name}</Text>
                  <Text style={styles.savedCalorie}>{meal.total_calories} kcal</Text>
                  <Text style={styles.savedMacro}>P:{Math.round(meal.total_protein_g)} C:{Math.round(meal.total_carbs_g)} F:{Math.round(meal.total_fat_g)}</Text>
                  <TouchableOpacity style={styles.savedDelete} onPress={() => handleDeleteSaved(meal)}>
                    <Ionicons name="close-circle" size={16} color="#6b7280" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ---- Daily Logs by Meal ---- */}
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((meal) => {
          const logs = logsByMeal[meal] ?? [];
          const total = logs.reduce((s, l) => s + l.calories, 0);
          return (
            <View key={meal} style={styles.mealSection}>
              <View style={styles.mealHeader}>
                <Text style={styles.mealLabel}>{MEAL_LABELS[meal]}</Text>
                <View style={styles.mealHeaderRight}>
                  {total > 0 && <Text style={styles.mealTotal}>{total} kcal</Text>}
                  <Text style={styles.mealTarget}>/{perMealTargets[meal]}</Text>
                </View>
              </View>
              {total > 0 && (
                <View style={styles.mealProgressBar}>
                  <View style={[styles.mealProgressFill, {
                    width: `${Math.min(total / perMealTargets[meal] * 100, 100)}%` as any,
                    backgroundColor: total > perMealTargets[meal] ? '#ef4444' : '#4ade80',
                  }]} />
                </View>
              )}
              {logs.map((log) => (
                <View key={log.id} style={styles.logRow}>
                  <View style={styles.logInfo}>
                    <Text style={styles.logName}>{log.name_vi ?? log.name}</Text>
                    <Text style={styles.logDetail}>
                      {log.estimated_grams}g · P:{Math.round(log.protein_g)}g C:{Math.round(log.carbs_g)}g F:{Math.round(log.fat_g)}g
                    </Text>
                  </View>
                  <View style={styles.logRight}>
                    <Text style={styles.logCalorie}>{log.calories} kcal</Text>
                    <TouchableOpacity onPress={() => removeLog(log.id)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {logs.length === 0 && (
                <Text style={styles.emptyMeal}>Chưa có gì</Text>
              )}
            </View>
          );
        })}

        {/* ---- Activity Section ---- */}
        <View style={styles.activitySection}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>🏃 Hoạt động</Text>
            <TouchableOpacity style={styles.addActivityBtn} onPress={handleAddActivity}>
              <Ionicons name="add" size={18} color="#0f0f1a" />
            </TouchableOpacity>
          </View>
          {activityLogs.length === 0 ? (
            <Text style={styles.emptyMeal}>Chưa có hoạt động nào</Text>
          ) : (
            activityLogs.map((act) => (
              <View key={act.id} style={styles.activityRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityName}>{ACTIVITY_LABELS[act.activity_type] ?? act.activity_type}</Text>
                  <Text style={styles.activityDetail}>{act.duration_min} phút · -{act.calories_burned} kcal</Text>
                </View>
                <TouchableOpacity onPress={() => deleteActivity(act.id)}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))
          )}
          {activityLogs.length > 0 && (
            <Text style={styles.activityBurned}>
              Đã đốt: {activityLogs.reduce((s, a) => s + a.calories_burned, 0)} kcal
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  savedSection: { marginBottom: 16 },
  savedTitle: { color: '#fff', fontWeight: '600', fontSize: 15, marginBottom: 10 },
  savedList: { gap: 10, paddingRight: 16 },
  savedCard: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 12, width: 140, position: 'relative' },
  savedName: { color: '#fff', fontWeight: '600', fontSize: 13, marginBottom: 4, paddingRight: 16 },
  savedCalorie: { color: '#4ade80', fontWeight: 'bold', fontSize: 15, marginBottom: 2 },
  savedMacro: { color: '#6b7280', fontSize: 11 },
  savedDelete: { position: 'absolute', top: 8, right: 8 },
  mealSection: { backgroundColor: '#1a1a2e', borderRadius: 14, padding: 14, marginBottom: 12 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  mealHeaderRight: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  mealLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
  mealTotal: { color: '#4ade80', fontWeight: 'bold' },
  mealTarget: { color: '#6b7280', fontSize: 12 },
  mealProgressBar: { height: 4, backgroundColor: '#374151', borderRadius: 2, marginBottom: 10, overflow: 'hidden' },
  mealProgressFill: { height: '100%', borderRadius: 2 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#374151' },
  logInfo: { flex: 1 },
  logName: { color: '#fff', fontSize: 14 },
  logDetail: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  logRight: { alignItems: 'flex-end', gap: 4 },
  logCalorie: { color: '#4ade80', fontWeight: '600' },
  emptyMeal: { color: '#6b7280', fontSize: 13, fontStyle: 'italic' },
  activitySection: { backgroundColor: '#1a1a2e', borderRadius: 14, padding: 14, marginBottom: 20, marginTop: 4 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  activityTitle: { color: '#fff', fontWeight: '600', fontSize: 15 },
  addActivityBtn: { backgroundColor: '#4ade80', borderRadius: 16, width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#374151' },
  activityName: { color: '#fff', fontWeight: '500', fontSize: 14 },
  activityDetail: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  activityBurned: { color: '#fb923c', fontWeight: '600', fontSize: 13, marginTop: 8, textAlign: 'right' },
});
