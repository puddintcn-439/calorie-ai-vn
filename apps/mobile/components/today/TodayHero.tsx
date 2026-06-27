import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../i18n-text';
import { SurfaceCard } from '../ui-shell';
import { createThemedStyles, useAppTheme } from '../theme';
import { TodayHeroModel, TodayHeroTone } from '../../hooks/useTodayHero';

type TodayHeroProps = {
  model: TodayHeroModel;
  streak: number;
  onPressStreak: () => void;
};

export function TodayHero({ model, streak, onPressStreak }: TodayHeroProps) {
  const { colors } = useAppTheme();
  const statusColors: Record<TodayHeroTone, { background: string; foreground: string; dot: string }> = {
    good: { background: colors.surfaceSuccess, foreground: colors.success, dot: colors.success },
    steady: { background: colors.surfaceWarning, foreground: colors.warning, dot: colors.accentAmber },
    near: { background: colors.surfaceWarning, foreground: colors.warning, dot: colors.accentCoral },
    over: { background: colors.surfaceDanger, foreground: colors.danger, dot: colors.danger },
  };
  const status = statusColors[model.statusTone];

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
        <TouchableOpacity
          style={[styles.streakButton, { backgroundColor: colors.surfaceWarm }]}
          onPress={onPressStreak}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${streak} day streak`}
        >
          <Ionicons name="flame" size={16} color={colors.accentAmber} />
          <Text style={[styles.streakText, { color: colors.text }]}>{streak}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calorieBlock}>
        <View style={[styles.calorieIcon, { backgroundColor: colors.surfaceWarning }]}>
          <Ionicons name="flame" size={28} color={colors.accentAmber} />
        </View>
        <View>
          <Text style={[styles.calorieValue, { color: colors.text }]}>
            {model.remainingCalories.toLocaleString()} <Text style={styles.calorieUnit}>kcal</Text>
          </Text>
          <Text style={[styles.calorieLabel, { color: colors.textMuted }]}>{model.calorieLabel}</Text>
        </View>
      </View>

      <View style={[styles.signalGroup, { backgroundColor: colors.surfaceMuted }]}>
        <StatusRow
          icon={model.proteinReached ? 'checkmark-circle' : 'barbell-outline'}
          label={model.proteinStatus}
          reached={model.proteinReached}
        />
        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
        <StatusRow
          icon={model.activityReached ? 'checkmark-circle' : 'walk-outline'}
          label={model.activityStatus}
          reached={model.activityReached}
        />
      </View>

      <View style={styles.aiLine}>
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
  label,
  reached,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  reached: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.statusRow}>
      <Ionicons name={icon} size={19} color={reached ? colors.success : colors.accentLeaf} />
      <Text style={[styles.signalText, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  card: {
    borderRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 22,
    marginBottom: 16,
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
  streakButton: {
    minWidth: 48,
    minHeight: 40,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
  },
  streakText: { fontSize: 13, fontWeight: '800' as const, fontVariant: ['tabular-nums'] as any },
  calorieBlock: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    marginTop: 24,
    marginBottom: 20,
  },
  calorieIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  calorieValue: {
    fontSize: 35,
    lineHeight: 39,
    fontWeight: '900' as const,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'] as any,
  },
  calorieUnit: { fontSize: 17, fontWeight: '800' as const, letterSpacing: -0.2 },
  calorieLabel: { fontSize: 12, fontWeight: '600' as const, marginTop: 2 },
  signalGroup: { borderRadius: 17, paddingHorizontal: 14, paddingVertical: 4 },
  statusRow: {
    minHeight: 42,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  signalText: { flex: 1, fontSize: 12.5, fontWeight: '700' as const },
  divider: { height: 1, marginLeft: 29 },
  aiLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginTop: 15,
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
