import React, { useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../components/ui-shell';
import { useGamificationStore } from '../store/gamification.store';
import { createThemedStyles, theme, useAppTheme } from '../components/theme';
import { Text } from '../components/i18n-text';
import { useI18n } from '../components/i18n';

export default function AchievementsScreen() {
  useAppTheme();
  const { t } = useI18n();
  const { summary, isLoading, fetchSummary } = useGamificationStore();

  useEffect(() => {
    fetchSummary().catch(() => {});
  }, []);

  return (
    <ScreenShell>
      <Eyebrow>screen.achievements.eyebrow</Eyebrow>
      <HeroTitle>screen.achievements.title</HeroTitle>
      <BodyText style={styles.heroBody}>screen.achievements.body</BodyText>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText} i18nKey="screen.achievements.text.001" />
      </TouchableOpacity>

      {summary && (
        <>
          <SurfaceCard style={styles.overviewCard}>
            <View style={styles.overviewHeader}>
              <View>
                <Text style={styles.overviewTitle} i18nKey="screen.achievements.text.002" />
                <Text style={styles.overviewSubtitle}>
                  {summary.current_streak > 0
                    ? t('screen.achievements.streakActive', { days: summary.current_streak })
                    : t('screen.achievements.streakEmpty')}
                </Text>
              </View>
              <View style={styles.streakWrap}>
                <Ionicons name="flame" size={24} color={theme.colors.accentAmber} />
                <Text style={styles.streakValue}>{summary.current_streak}</Text>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <MetricCard value={summary.longest_streak} label="screen.achievements.label.001" />
              <MetricCard value={summary.active_days_last_30} label="screen.achievements.label.002" />
              <MetricCard value={summary.total_activity_logs} label="screen.achievements.label.003" />
            </View>

            {summary.next_streak_milestone && (
              <Text style={styles.milestoneText}>
                {t('screen.achievements.milestone', {
                  days: Math.max(0, summary.next_streak_milestone - summary.current_streak),
                  milestone: summary.next_streak_milestone,
                })}
              </Text>
            )}
          </SurfaceCard>

          <Text style={styles.sectionTitle} i18nKey="screen.achievements.text.003" />
          <View style={styles.badgesList}>
            {summary.badges.map((badge) => (
              <SurfaceCard key={badge.id} style={[styles.badgeCard, badge.unlocked ? styles.badgeUnlocked : styles.badgeLocked]}>
                <View style={styles.badgeTopRow}>
                  <Text style={styles.badgeIcon}>{badge.icon}</Text>
                  <View style={[styles.badgeState, badge.unlocked ? styles.badgeStateUnlocked : styles.badgeStateLocked]}>
                    <Ionicons
                      name={badge.unlocked ? 'checkmark-circle' : 'lock-closed'}
                      size={14}
                      color={badge.unlocked ? theme.colors.success : theme.colors.textMuted}
                    />
                    <Text style={styles.badgeStateText}>
                      {badge.unlocked ? t('screen.achievements.badgeUnlocked') : t('screen.achievements.badgeLocked')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.badgeTitle}>{badge.label}</Text>
                <Text style={styles.badgeDescription}>{badge.description}</Text>
              </SurfaceCard>
            ))}
          </View>
        </>
      )}

      {!summary && !isLoading && (
        <SurfaceCard>
          <Text style={styles.emptyTitle} i18nKey="screen.achievements.text.004" />
          <Text style={styles.emptyText} i18nKey="screen.achievements.text.005" />
        </SurfaceCard>
      )}
    </ScreenShell>
  );
}

function MetricCard({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = createThemedStyles((colors, radii, spacing, layout) => ({
  heroBody: { marginBottom: 16, maxWidth: 700 },
  backButton: { alignSelf: 'flex-start', minHeight: layout.minTouchTarget, justifyContent: 'center', marginBottom: spacing.md, paddingHorizontal: spacing.md, borderRadius: 999, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  backButtonText: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  overviewCard: { marginBottom: spacing.md },
  overviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  overviewTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  overviewSubtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, maxWidth: 240 },
  streakWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  streakValue: { color: colors.accentPlum, fontSize: 30, fontWeight: '800' },
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metricCard: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  metricValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  metricLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' },
  milestoneText: { color: colors.accentPlum, fontSize: 12, fontWeight: '600' },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
  badgesList: { gap: spacing.md, marginBottom: spacing.md },
  badgeCard: { borderWidth: 1 },
  badgeUnlocked: { borderColor: colors.borderSuccess, backgroundColor: colors.surfaceSuccess },
  badgeLocked: { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  badgeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badgeIcon: { fontSize: 24 },
  badgeState: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 999 },
  badgeStateText: { color: colors.textSoft, fontSize: 11, fontWeight: '800' },
  badgeStateUnlocked: { backgroundColor: colors.surfaceSuccess, borderWidth: 1, borderColor: colors.borderSuccess },
  badgeStateLocked: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  badgeTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  badgeDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  emptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
}));


