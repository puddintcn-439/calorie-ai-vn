import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HydrationLog, HydrationSchedule } from '@calorie-ai/types';
import { Text } from '../i18n-text';
import { SurfaceCard } from '../ui-shell';
import { useAppTheme } from '../theme';
import { useI18n } from '../i18n';
import { buildSystemHydrationSlots, normalizeHydrationSlots } from '../../services/hydration-schedule';

type Slot = {
  time: string;
  amountMl: number;
  cumulativeMl: number;
  completed: boolean;
};

function buildSlots(targetMl: number, intakeMl: number, schedule?: HydrationSchedule | null): Slot[] {
  const source = schedule?.mode === 'custom' && schedule.slots.length > 0
    ? normalizeHydrationSlots(schedule.slots)
    : buildSystemHydrationSlots(targetMl);
  let cumulative = 0;
  return source.map((sourceSlot) => {
    const amountMl = Number(sourceSlot.amount_ml);
    cumulative += amountMl;
    return {
      time: sourceSlot.time,
      amountMl,
      cumulativeMl: cumulative,
      completed: intakeMl >= cumulative,
    };
  });
}

export function HydrationScheduleCard({
  targetMl,
  intakeMl,
  logs,
  schedule,
  saving,
  onAddWater,
}: {
  targetMl: number;
  intakeMl: number;
  logs: HydrationLog[];
  schedule?: HydrationSchedule | null;
  saving: boolean;
  onAddWater: (amountMl: number) => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const slots = useMemo(() => buildSlots(targetMl, intakeMl, schedule), [intakeMl, schedule, targetMl]);
  const remainingMl = Math.max(0, targetMl - intakeMl);
  const nextSlot = slots.find((slot) => !slot.completed) ?? null;
  const nextAmount = nextSlot ? Math.min(nextSlot.amountMl, remainingMl) : 0;
  const progress = targetMl > 0 ? Math.min(1, intakeMl / targetMl) : 0;

  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.heroIcon, { backgroundColor: colors.surfaceInfo }]}>
          <Ionicons name="water" size={23} color={colors.info} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>{t('screen.tabs.index.hydration.title' as any)}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t('screen.tabs.index.hydration.subtitle' as any, {
              intake: (intakeMl / 1000).toFixed(1),
              target: (targetMl / 1000).toFixed(1),
            })}
          </Text>
        </View>
        <Text style={[styles.percent, { color: colors.info }]}>{Math.round(progress * 100)}%</Text>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.progressBg }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.info }]} />
      </View>

      <View style={styles.timeline}>
        {slots.map((slot, index) => (
          <View key={`${slot.time}-${index}`} style={styles.slot}>
            <View style={[
              styles.slotDot,
              {
                borderColor: slot.completed ? colors.info : colors.borderStrong,
                backgroundColor: slot.completed ? colors.info : colors.surface,
              },
            ]}>
              {slot.completed ? <Ionicons name="checkmark" size={12} color="#ffffff" /> : null}
            </View>
            <Text style={[styles.slotTime, { color: slot.completed ? colors.text : colors.textMuted }]}>{slot.time}</Text>
            <Text style={[styles.slotAmount, { color: colors.textMuted }]}>{slot.amountMl}ml</Text>
          </View>
        ))}
      </View>

      <View style={[styles.nextBox, { backgroundColor: colors.surfaceInfo, borderColor: colors.borderInfo }]}>
        <View style={styles.nextCopy}>
          <Text style={[styles.nextLabel, { color: colors.info }]}>
            {nextSlot
              ? t('screen.tabs.index.hydration.next' as any, { time: nextSlot.time })
              : t('screen.tabs.index.hydration.complete' as any)}
          </Text>
          <Text style={[styles.nextBody, { color: colors.text }]}>
            {nextSlot
              ? t('screen.tabs.index.hydration.nextBody' as any, { ml: nextAmount })
              : t('screen.tabs.index.hydration.completeBody' as any)}
          </Text>
        </View>
        {nextSlot ? (
          <TouchableOpacity
            style={[styles.logButton, { backgroundColor: colors.info }, saving && styles.disabled]}
            disabled={saving}
            onPress={() => onAddWater(nextAmount)}
          >
            {saving ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="add" size={17} color="#ffffff" />}
            <Text style={styles.logButtonText}>{nextAmount}ml</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          {t('screen.tabs.index.hydration.note' as any, { count: logs.length })}
        </Text>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  heroIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  percent: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  timeline: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
  slot: { flexGrow: 1, flexBasis: '11%', minWidth: 38, alignItems: 'center', gap: 3 },
  slotDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  slotTime: { fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
  slotAmount: { fontSize: 8, fontWeight: '600' },
  nextBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  nextCopy: { flex: 1, minWidth: 0 },
  nextLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3, textTransform: 'uppercase' },
  nextBody: { fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  logButton: { minWidth: 92, minHeight: 42, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  logButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.6 },
  footer: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  footerText: { flex: 1, fontSize: 10.5, lineHeight: 15 },
});
