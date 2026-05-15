import React, { useEffect, useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { FoodLog, MealType } from '@calorie-ai/types';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';
import { theme } from '../../components/theme';
import { useGamificationStore } from '../../store/gamification.store';
import { useLogStore } from '../../store/log.store';

const mealIllustration = require('../../assets/images/vietnamese-meal.png') as number;
const emptyMealIllustration = require('../../assets/images/empty-meal.png') as number;

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Sáng',
  lunch: 'Trưa',
  dinner: 'Tối',
  snack: 'Vặt',
};

const MEAL_HINTS: Record<MealType, string> = {
  breakfast: 'Bắt nhịp ngày mới',
  lunch: 'Giữ năng lượng ổn',
  dinner: 'Nhẹ nhưng đủ chất',
  snack: 'Chống đói thông minh',
};

type NudgeTone = 'good' | 'warn' | 'info';

function formatNumber(value: number) {
  return Math.round(value).toLocaleString('vi-VN');
}

function groupLogsByMeal(logs: FoodLog[]) {
  return logs.reduce<Record<MealType, FoodLog[]>>(
    (acc, log) => {
      acc[log.meal_type].push(log);
      return acc;
    },
    { breakfast: [], lunch: [], dinner: [], snack: [] },
  );
}

function hasVeg(logs: FoodLog[]) {
  const vegWords = ['rau', 'salad', 'xà lách', 'dưa leo', 'cải', 'canh', 'bông cải', 'giá'];
  return logs.some((log) => vegWords.some((word) => `${log.name_vi ?? ''} ${log.name}`.toLowerCase().includes(word)));
}

function buildNutritionNudges(logs: FoodLog[], protein: number, fat: number, calories: number, target: number) {
  const fatCalories = fat * 9;
  const items: { title: string; body: string; tone: NudgeTone; icon: keyof typeof Ionicons.glyphMap }[] = [];

  if (protein >= 75) {
    items.push({ title: 'Ăn đủ protein', body: 'Bữa tới giữ rau và nước là ổn.', tone: 'good', icon: 'checkmark-circle' });
  } else {
    items.push({ title: 'Thêm protein', body: '+1 trứng, sữa chua hoặc đậu hũ.', tone: 'info', icon: 'barbell' });
  }

  if (!hasVeg(logs)) {
    items.push({ title: 'Thiếu rau', body: 'Thêm canh hoặc rau luộc ở bữa kế.', tone: 'warn', icon: 'leaf' });
  }

  if (calories > 0 && fatCalories / Math.max(calories, 1) > 0.38) {
    items.push({ title: 'Fat hơi lệch', body: 'Ưu tiên hấp, luộc hoặc nướng.', tone: 'warn', icon: 'flame' });
  }

  if (target - calories > 350) {
    items.push({ title: 'Còn dư calo đẹp', body: 'Chọn bữa sau đủ đạm, ít dầu.', tone: 'good', icon: 'sparkles' });
  }

  return items.slice(0, 3);
}

function CaloriesRing({ consumed, burned, target }: { consumed: number; burned: number; target: number }) {
  const size = 214;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const net = Math.max(0, consumed - burned);
  const progress = Math.min(net / Math.max(target, 1), 1);
  const remaining = target - net;

  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.progressBg} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={remaining >= 0 ? theme.colors.accentMint : theme.colors.accentCoral}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringValue}>{formatNumber(net)}</Text>
        <Text style={styles.ringLabel}>net kcal</Text>
        <Text style={[styles.ringRemain, remaining < 0 && styles.ringRemainOver]}>
          {remaining >= 0 ? `còn ${formatNumber(remaining)}` : `dư ${formatNumber(Math.abs(remaining))}`}
        </Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const { dailyLog, activityLogs, fetchDailyLog, fetchActivityLogs } = useLogStore();
  const { summary, fetchSummary } = useGamificationStore();

  useEffect(() => {
    fetchDailyLog().catch(() => {});
    fetchActivityLogs().catch(() => {});
    fetchSummary().catch(() => {});
  }, [fetchActivityLogs, fetchDailyLog, fetchSummary]);

  const logs = dailyLog?.logs ?? [];
  const logsByMeal = useMemo(() => groupLogsByMeal(logs), [logs]);
  const consumed = dailyLog?.total_calories ?? 0;
  const burned = activityLogs.reduce((sum, item) => sum + item.calories_burned, 0);
  const target = dailyLog?.target_calories ?? 1800;
  const protein = dailyLog?.total_protein_g ?? 0;
  const carbs = dailyLog?.total_carbs_g ?? 0;
  const fat = dailyLog?.total_fat_g ?? 0;
  const nudges = useMemo(() => buildNutritionNudges(logs, protein, fat, consumed, target), [consumed, fat, logs, protein, target]);
  const latestMeals = logs.slice(0, 4);

  return (
    <ScreenShell contentStyle={styles.screen}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Eyebrow>Hôm nay</Eyebrow>
          <HeroTitle>Daily cockpit</HeroTitle>
          <BodyText style={styles.heroBody}>Nhìn nhanh calo, bữa ăn và việc cần chỉnh ở bữa kế tiếp.</BodyText>
        </View>
        <TouchableOpacity style={styles.streakPill} onPress={() => router.push('/achievements' as never)}>
          <Ionicons name="flame" size={16} color={theme.colors.accentAmber} />
          <Text style={styles.streakText}>{summary?.current_streak ?? 0} ngày</Text>
        </TouchableOpacity>
      </View>

      <SurfaceCard style={styles.cockpitCard}>
        <View style={styles.cockpitMain}>
          <CaloriesRing consumed={consumed} burned={burned} target={target} />
          <View style={styles.cockpitSide}>
            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>Target</Text>
              <Text style={styles.targetValue}>{formatNumber(target)} kcal</Text>
            </View>
            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>Đã nạp</Text>
              <Text style={styles.targetValue}>{formatNumber(consumed)}</Text>
            </View>
            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>Đã đốt</Text>
              <Text style={styles.targetValueBurned}>-{formatNumber(burned)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.macroRow}>
          <MacroPill label="Protein" value={`${Math.round(protein)}g`} color={theme.colors.accentCoral} />
          <MacroPill label="Carbs" value={`${Math.round(carbs)}g`} color={theme.colors.accentCyan} />
          <MacroPill label="Fat" value={`${Math.round(fat)}g`} color={theme.colors.accentAmber} />
        </View>
      </SurfaceCard>

      <View style={styles.actionGrid}>
        <TouchableOpacity style={styles.primaryAction} onPress={() => router.push('/scan' as never)}>
          <Ionicons name="camera" size={20} color="#07111f" />
          <Text style={styles.primaryActionText}>Scan bữa ăn</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryAction} onPress={() => router.push('/log' as never)}>
          <Ionicons name="create-outline" size={18} color={theme.colors.accentMint} />
          <Text style={styles.secondaryActionText}>Log thủ công</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.nudgeRow}>
        {nudges.map((nudge) => (
          <View key={nudge.title} style={[styles.nudgeChip, styles[`${nudge.tone}Nudge`]]}>
            <Ionicons name={nudge.icon} size={16} color={nudge.tone === 'warn' ? theme.colors.accentAmber : theme.colors.accentMint} />
            <View style={styles.nudgeCopy}>
              <Text style={styles.nudgeTitle}>{nudge.title}</Text>
              <Text style={styles.nudgeBody}>{nudge.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Bữa ăn hôm nay</Text>
        <TouchableOpacity onPress={() => router.push('/log' as never)}>
          <Text style={styles.sectionLink}>Xem nhật ký</Text>
        </TouchableOpacity>
      </View>

      {latestMeals.length > 0 ? (
        <View style={styles.mealList}>
          {MEAL_ORDER.map((meal) => {
            const mealLogs = logsByMeal[meal];
            const mealCalories = mealLogs.reduce((sum, log) => sum + log.calories, 0);
            return (
              <SurfaceCard key={meal} style={styles.mealCard}>
                <Image source={mealIllustration} style={styles.mealImage} resizeMode="cover" />
                <View style={styles.mealContent}>
                  <View style={styles.mealTopRow}>
                    <View>
                      <Text style={styles.mealName}>{MEAL_LABELS[meal]}</Text>
                      <Text style={styles.mealHint}>{MEAL_HINTS[meal]}</Text>
                    </View>
                    <Text style={styles.mealCalories}>{formatNumber(mealCalories)} kcal</Text>
                  </View>
                  {mealLogs.length > 0 ? (
                    <Text style={styles.mealItems} numberOfLines={2}>
                      {mealLogs.map((log) => log.name_vi ?? log.name).join(', ')}
                    </Text>
                  ) : (
                    <Text style={styles.mealItemsMuted}>Chưa log</Text>
                  )}
                </View>
              </SurfaceCard>
            );
          })}
        </View>
      ) : (
        <EmptyState
          imageSource={emptyMealIllustration}
          icon="🍚"
          title="Chưa có bữa nào hôm nay"
          description="Scan món Việt đầu tiên hoặc log nhanh từ nhật ký."
        />
      )}

      <View style={styles.quickLinks}>
        <QuickLink icon="body" label="Cơ thể" onPress={() => router.push('/progress' as never)} />
        <QuickLink icon="stats-chart" label="Insight" onPress={() => router.push('/insights' as never)} />
        <QuickLink icon="ribbon" label="Thành tích" onPress={() => router.push('/achievements' as never)} />
      </View>
    </ScreenShell>
  );
}

function MacroPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.macroPill}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

function QuickLink({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickLink} onPress={onPress}>
      <Ionicons name={icon} size={18} color={theme.colors.accentCyan} />
      <Text style={styles.quickLinkText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 96,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  headerCopy: {
    flex: 1,
  },
  heroBody: {
    maxWidth: 520,
  },
  streakPill: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radii.lg,
    paddingHorizontal: 12,
    backgroundColor: '#1f2117',
    borderWidth: 1,
    borderColor: '#4b4323',
  },
  streakText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  cockpitCard: {
    marginBottom: 12,
    backgroundColor: '#101f1a',
    borderColor: '#2f473a',
  },
  cockpitMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ringWrap: {
    width: 214,
    height: 214,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    color: theme.colors.text,
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 46,
  },
  ringLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  ringRemain: {
    color: theme.colors.accentMint,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 7,
  },
  ringRemainOver: {
    color: theme.colors.accentCoral,
  },
  cockpitSide: {
    flex: 1,
    gap: 8,
  },
  targetRow: {
    borderRadius: theme.radii.lg,
    backgroundColor: '#15251e',
    borderWidth: 1,
    borderColor: '#2a3e34',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  targetLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  targetValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  targetValueBurned: {
    color: theme.colors.accentAmber,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  macroPill: {
    flex: 1,
    minHeight: 58,
    borderRadius: theme.radii.lg,
    backgroundColor: '#14231d',
    borderWidth: 1,
    borderColor: '#2a3e34',
    padding: 10,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 5,
  },
  macroValue: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  macroLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  primaryAction: {
    flex: 1.25,
    minHeight: 56,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.accentMint,
    borderWidth: 1,
    borderColor: '#84e4b5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: {
    color: '#07111f',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryAction: {
    flex: 1,
    minHeight: 56,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryActionText: {
    color: theme.colors.accentMint,
    fontSize: 15,
    fontWeight: '800',
  },
  nudgeRow: {
    gap: 8,
    marginBottom: 16,
  },
  nudgeChip: {
    minHeight: 58,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  goodNudge: {
    backgroundColor: '#14261d',
    borderColor: '#2f5d42',
  },
  infoNudge: {
    backgroundColor: '#122536',
    borderColor: '#31506a',
  },
  warnNudge: {
    backgroundColor: '#2a2315',
    borderColor: '#5c4520',
  },
  nudgeCopy: {
    flex: 1,
  },
  nudgeTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  nudgeBody: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionLink: {
    color: theme.colors.accentCyan,
    fontSize: 13,
    fontWeight: '800',
  },
  mealList: {
    gap: 10,
  },
  mealCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  mealImage: {
    width: 78,
    height: 78,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceAlt,
  },
  mealContent: {
    flex: 1,
    justifyContent: 'center',
  },
  mealTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'flex-start',
  },
  mealName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  mealHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  mealCalories: {
    color: theme.colors.accentMint,
    fontSize: 13,
    fontWeight: '900',
  },
  mealItems: {
    color: theme.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  mealItemsMuted: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 8,
  },
  quickLinks: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  quickLink: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  quickLinkText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
  },
});
