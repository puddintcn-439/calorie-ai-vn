import React, { useEffect, useRef, useState } from 'react';
import { Animated, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../i18n-text';
import { useI18n } from '../i18n';
import { SurfaceCard } from '../ui-shell';
import { createThemedStyles, useAppTheme } from '../theme';
import { TodayHeroModel, TodayHeroTone } from '../../hooks/useTodayHero';

type TodayHeroProps = {
  model: TodayHeroModel;
  streak: number;
  waterIntakeL: number;
  waterGoalL: number;
  onPressStreak: () => void;
};

export function TodayHero({ model, streak, waterIntakeL, waterGoalL, onPressStreak }: TodayHeroProps) {
  const { colors } = useAppTheme();
  const { locale, t } = useI18n();
  const { width } = useWindowDimensions();
  const isWide = width >= 720;
  const waterProgress = Math.max(0, Math.min(1, waterIntakeL / Math.max(waterGoalL, 0.1)));
  const calorieAnimation = useRef(new Animated.Value(0)).current;
  const waterAnimation = useRef(new Animated.Value(0)).current;
  const numberAnimation = useRef(new Animated.Value(0.96)).current;
  const calorieCount = useRef(new Animated.Value(model.remainingCalories)).current;
  const [displayCalories, setDisplayCalories] = useState(model.remainingCalories);
  useEffect(() => {
    const listener = calorieCount.addListener(({ value }) => setDisplayCalories(Math.round(value)));
    Animated.parallel([
      Animated.timing(calorieAnimation, { toValue: Math.min(1, model.progressPercent / 100), duration: 380, useNativeDriver: false }),
      Animated.timing(waterAnimation, { toValue: waterProgress, duration: 380, useNativeDriver: false }),
      Animated.spring(numberAnimation, { toValue: 1, speed: 18, bounciness: 2, useNativeDriver: true }),
      Animated.timing(calorieCount, { toValue: model.remainingCalories, duration: 360, useNativeDriver: false }),
    ]).start();
    return () => calorieCount.removeListener(listener);
  }, [calorieAnimation, calorieCount, model.progressPercent, model.remainingCalories, numberAnimation, waterAnimation, waterProgress]);
  const statusColors: Record<TodayHeroTone, { background: string; foreground: string; dot: string }> = {
    good: { background: colors.surfaceSuccess, foreground: colors.success, dot: colors.success },
    steady: { background: colors.surfaceWarning, foreground: colors.warning, dot: colors.accentAmber },
    near: { background: colors.surfaceWarning, foreground: colors.warning, dot: colors.accentCoral },
    over: { background: colors.surfaceDanger, foreground: colors.danger, dot: colors.danger },
    complete: { background: colors.surfaceInfo, foreground: colors.info, dot: colors.info },
  };
  const status = statusColors[model.statusTone];
  const progressColor = model.statusTone === 'over'
    ? colors.danger
    : model.statusTone === 'complete'
      ? colors.info
      : model.statusTone === 'near'
        ? colors.accentCoral
        : model.statusTone === 'steady'
          ? colors.accentAmber
          : colors.accentLeaf;

  return (
    <SurfaceCard revealDelay={40} style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.greetingCopy}>
          <Text style={[styles.greeting, { color: colors.text }]}>{model.greeting}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.background }]}>
            <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
            <Text style={[styles.statusText, { color: status.foreground }]}>{model.statusLabel}</Text>
          </View>
        </View>
        <View style={[styles.wellnessPanel, { backgroundColor: colors.surfaceLifted }]}>
          <TouchableOpacity
            style={styles.streakButton}
            onPress={onPressStreak}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`${streak} day streak`}
          >
            <View style={styles.streakValueRow}>
              <Ionicons name="flame" size={17} color={colors.accentAmber} />
              <Text style={[styles.streakText, { color: colors.text }]}>
                {streak > 3
                  ? t('screen.tabs.index.todayHero.streakDays' as any, { days: streak })
                  : streak > 0 ? streak : t('screen.tabs.index.todayHero.streakStart' as any)}
              </Text>
            </View>
            {streak > 0 && <Text style={[styles.streakLabel, { color: colors.textMuted }]}>Streak</Text>}
          </TouchableOpacity>
          <View style={[styles.wellnessDivider, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.waterBlock}>
            <View style={styles.waterValueRow}>
              <Ionicons name="water" size={17} color={colors.info} />
              <Text style={[styles.waterValue, { color: colors.text }]}>
                {waterIntakeL.toFixed(1)}
                <Text style={[styles.waterGoal, { color: colors.textMuted }]}> / {waterGoalL.toFixed(1)} L</Text>
              </Text>
            </View>
            <Text style={[styles.waterLabel, { color: colors.textMuted }]} numberOfLines={1}>
              {waterProgress >= 1
                ? t('screen.tabs.index.todayHero.waterComplete' as any)
                : waterProgress < 0.3
                  ? t('screen.tabs.index.todayHero.waterLow' as any, {
                      ml: Math.min(600, Math.max(0, Math.round((waterGoalL - waterIntakeL) * 1000))),
                    })
                  : t('screen.tabs.index.todayHero.water' as any)}
            </Text>
            <View style={[styles.waterTrack, { backgroundColor: colors.progressBg }]}>
              <Animated.View style={[styles.waterFill, {
                width: waterAnimation.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                backgroundColor: colors.info,
              }]} />
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.heroBody, isWide && styles.heroBodyWide]}>
        <View style={styles.calorieColumn}>
          <View style={styles.calorieBlock}>
            <View style={[styles.calorieIcon, { backgroundColor: colors.surfaceWarning }]}>
              <Ionicons name="flame" size={30} color={colors.accentAmber} />
            </View>
            <View style={styles.calorieCopy}>
              <Animated.Text
                style={[
                  styles.calorieValue,
                  { color: model.statusTone === 'over' ? colors.danger : colors.text },
                  { transform: [{ scale: numberAnimation }] },
                ]}
              >
                {displayCalories.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} <Text style={styles.calorieUnit}>kcal</Text>
              </Animated.Text>
              <Text style={[styles.calorieLabel, { color: colors.textMuted }]}>{model.calorieLabel}</Text>
            </View>
          </View>
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: colors.progressBg }]}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: calorieAnimation.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                    backgroundColor: progressColor,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressPercent, { color: progressColor }]}>{model.progressLabel}</Text>
          </View>
          <Text style={[styles.progressDetail, { color: colors.textMuted }]}>
            {model.calorieProgressDetail}
          </Text>
        </View>

        <View style={[styles.signalGroup, { backgroundColor: colors.surfaceMuted }, isWide && styles.signalGroupWide]}>
          <StatusRow
            icon={model.proteinReached ? 'checkmark-circle' : 'barbell-outline'}
            title={model.proteinTitle}
            detail={model.proteinDetail}
            reached={model.proteinReached}
          />
          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
          <StatusRow
            icon={model.activityReached ? 'checkmark-circle' : 'walk-outline'}
            title={model.activityTitle}
            detail={model.activityDetail}
            reached={model.activityReached}
          />
        </View>
      </View>

      <View style={[styles.aiLine, { backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.aiIcon, { backgroundColor: colors.surfaceSuccess }]}>
          <Ionicons name="sparkles" size={14} color={colors.accentLeaf} />
        </View>
        <Text style={[styles.motivation, { color: colors.textSoft }]}>{model.motivation}</Text>
      </View>
    </SurfaceCard>
  );
}

function StatusRow({
  icon,
  title,
  detail,
  reached,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  reached: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.statusRow}>
      <View style={[styles.signalIcon, { backgroundColor: colors.surfaceSuccess }]}>
        <Ionicons name={icon} size={22} color={reached ? colors.success : colors.accentLeaf} />
      </View>
      <View style={styles.signalCopy}>
        <Text style={[styles.signalTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.signalDetail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  card: {
    borderRadius: 28,
    paddingTop: 17,
    paddingHorizontal: 18,
    paddingBottom: 18,
    marginBottom: 13,
  },
  topRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
  },
  greetingCopy: { flex: 1, minWidth: 0 },
  greeting: { fontSize: 20, lineHeight: 25, fontWeight: '800' as const, letterSpacing: -0.35 },
  statusBadge: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 7,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 9,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11.5, fontWeight: '800' as const },
  wellnessPanel: {
    minHeight: 64,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  streakButton: {
    minWidth: 55,
    paddingHorizontal: 7,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  streakValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
  },
  streakText: { fontSize: 16, fontWeight: '900' as const, fontVariant: ['tabular-nums'] as any },
  streakLabel: { fontSize: 9.5, fontWeight: '700' as const, marginTop: 2 },
  wellnessDivider: { width: 1, alignSelf: 'stretch' as const, marginVertical: 2 },
  waterBlock: { minWidth: 108, paddingHorizontal: 9 },
  waterValueRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  waterValue: { fontSize: 14, fontWeight: '900' as const, fontVariant: ['tabular-nums'] as any },
  waterGoal: { fontSize: 9.5, fontWeight: '700' as const },
  waterLabel: { fontSize: 8.5, fontWeight: '700' as const, marginTop: 1, marginLeft: 21, maxWidth: 100 },
  waterTrack: { height: 4, borderRadius: 2, overflow: 'hidden' as const, marginTop: 5 },
  waterFill: { height: '100%' as any, borderRadius: 2 },
  heroBody: { marginTop: 18, gap: 14 },
  heroBodyWide: { flexDirection: 'row' as const, alignItems: 'stretch' as const, gap: 24 },
  calorieColumn: { flex: 1.08, minWidth: 0 },
  calorieBlock: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
  },
  calorieIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  calorieCopy: { flex: 1, minWidth: 0 },
  calorieValue: {
    fontSize: 35,
    lineHeight: 39,
    fontWeight: '900' as const,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'] as any,
  },
  calorieUnit: { fontSize: 17, fontWeight: '800' as const, letterSpacing: -0.2 },
  calorieLabel: { fontSize: 12, fontWeight: '600' as const, marginTop: 2 },
  progressRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginTop: 18 },
  progressTrack: { flex: 1, height: 10, borderRadius: 6, overflow: 'hidden' as const },
  progressFill: { height: '100%' as any, borderRadius: 6 },
  progressPercent: { minWidth: 34, fontSize: 12, fontWeight: '900' as const, fontVariant: ['tabular-nums'] as any },
  progressDetail: { fontSize: 11.5, fontWeight: '600' as const, marginTop: 8 },
  signalGroup: { borderRadius: 20, paddingHorizontal: 15, paddingVertical: 5 },
  signalGroupWide: { flex: 0.92, justifyContent: 'center' as const },
  statusRow: {
    minHeight: 62,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  signalIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  signalCopy: { flex: 1, minWidth: 0 },
  signalTitle: { fontSize: 13, lineHeight: 17, fontWeight: '800' as const },
  signalDetail: { fontSize: 11, lineHeight: 15, fontWeight: '600' as const, marginTop: 2 },
  divider: { height: 1, marginLeft: 54 },
  aiLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginTop: 15,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  aiIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  motivation: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '600' as const },
}));
