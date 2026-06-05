import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { router } from 'expo-router';
import { ActivitySyncResult } from '@calorie-ai/types';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../components/ui-shell';
import { UiInput } from '../components/ui-input';
import { createThemedStyles, theme, useAppTheme } from '../components/theme';
import { useLogStore } from '../store/log.store';
import {
  activitySyncService,
  ActivitySyncDiagnostics,
  ActivitySyncPhoneCheckInfo,
  HEALTH_SYNC_SCREEN_LINK,
} from '../services/activity-sync.service';
import { featureGatingService, isPremiumFeatureError } from '../services/feature-gating.service';
import { getLocalDateYmd } from '../services/date';
import { Text } from '../components/i18n-text';
import { Alert } from '../components/i18n-alert';
import { useI18n } from '../components/i18n';

function getTodayDateString() {
  return getLocalDateYmd();
}

export default function HealthSyncScreen() {
  useAppTheme();
  const { t, tx } = useI18n();
  const { syncActivity } = useLogStore();
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [phoneCheckInfo, setPhoneCheckInfo] = useState<ActivitySyncPhoneCheckInfo | null>(null);
  const [diagnostics, setDiagnostics] = useState<ActivitySyncDiagnostics | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<ActivitySyncResult | null>(null);
  const [hasHealthSyncAccess, setHasHealthSyncAccess] = useState<boolean | null>(null);

  const openHealthSyncPaywall = () => {
    router.push({
      pathname: '/paywall',
      params: { returnTo: '/health-sync', feature: 'healthkit_sync' },
    } as never);
  };

  useEffect(() => {
    const load = async (date: string) => {
      try {
        featureGatingService.canAccessFeature('healthkit_sync')
          .then(setHasHealthSyncAccess)
          .catch(() => setHasHealthSyncAccess(false));
        const [info, details] = await Promise.all([
          activitySyncService.getPhoneCheckInfo(),
          activitySyncService.getDiagnostics(date),
        ]);
        setPhoneCheckInfo(info);
        setDiagnostics(details);
      } catch {
        setPhoneCheckInfo(null);
        setDiagnostics(null);
      } finally {
        setIsLoadingInfo(false);
        setIsLoadingDiagnostics(false);
      }
    };

    load(selectedDate).catch(() => {});
  }, []);

  const handleOpenProvider = async () => {
    try {
      await activitySyncService.openProviderSettings();
    } catch (error: any) {
      Alert.alert('screen.healthSync.alert.001', error?.message ?? 'screen.healthSync.alert.002');
    }
  };

  const handleOpenSupport = async () => {
    try {
      await activitySyncService.openSupportUrl();
    } catch (error: any) {
      Alert.alert('screen.healthSync.alert.003', error?.message ?? 'screen.healthSync.alert.004');
    }
  };

  const handleRefreshDiagnostics = async () => {
    setIsLoadingDiagnostics(true);
    try {
      const details = await activitySyncService.getDiagnostics(selectedDate);
      const info = await activitySyncService.getPhoneCheckInfo();
      setDiagnostics(details);
      setPhoneCheckInfo(info);
    } catch (error: any) {
      Alert.alert('screen.healthSync.alert.005', error?.message ?? 'screen.healthSync.alert.006');
    } finally {
      setIsLoadingDiagnostics(false);
    }
  };

  return (
    <ScreenShell>
      <Eyebrow>screen.healthSync.hero.eyebrow</Eyebrow>
      <HeroTitle>screen.healthSync.hero.title</HeroTitle>
      <BodyText style={styles.heroBody}>
        {t('screen.healthSync.hero.body', { link: HEALTH_SYNC_SCREEN_LINK })}
      </BodyText>

      <SurfaceCard style={styles.linkCard}>
        <Text style={styles.sectionLabel} i18nKey="screen.healthSync.text.001" />
        <Text style={styles.linkValue}>{HEALTH_SYNC_SCREEN_LINK}</Text>
        <Text style={styles.helperText} i18nKey="screen.healthSync.link.help" />
      </SurfaceCard>

      <SurfaceCard style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle} i18nKey="screen.healthSync.text.002" />
            <Text style={styles.statusSubtitle}>{t('screen.healthSync.status.platform', { platform: Platform.OS })}</Text>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText} i18nKey="screen.healthSync.text.003" />
          </TouchableOpacity>
        </View>

        {isLoadingInfo ? (
          <ActivityIndicator color={theme.colors.accentMint} style={styles.loader} />
        ) : phoneCheckInfo ? (
          <>
            <View style={styles.pillRow}>
              <Text style={styles.providerPill}>{phoneCheckInfo.providerName}</Text>
              <Text style={styles.statusPill}>{tx(phoneCheckInfo.statusLabel)}</Text>
            </View>
            <Text style={styles.statusDetail}>{tx(phoneCheckInfo.detail)}</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleOpenProvider}>
                <Text style={styles.primaryButtonText}>{tx(phoneCheckInfo.actionLabel)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleOpenSupport}>
                <Text style={styles.secondaryButtonText}>{tx(phoneCheckInfo.installLabel)}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={styles.statusDetail} i18nKey="screen.healthSync.text.004" />
        )}
      </SurfaceCard>

      <SurfaceCard style={styles.stepsCard}>
        <Text style={styles.sectionTitle} i18nKey="screen.healthSync.text.005" />
        <Text style={styles.checkItem} i18nKey="screen.healthSync.text.006" />
        <Text style={styles.checkItem}>{t('screen.healthSync.check.002', { link: HEALTH_SYNC_SCREEN_LINK })}</Text>
        <Text style={styles.checkItem} i18nKey="screen.healthSync.text.007" />
        <Text style={styles.checkItem} i18nKey="screen.healthSync.text.008" />
        <Text style={styles.checkItem} i18nKey="screen.healthSync.text.009" />
      </SurfaceCard>

      <SurfaceCard style={styles.stepsCard}>
        <View style={styles.statusHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle} i18nKey="screen.healthSync.text.010" />
            <Text style={styles.statusSubtitle} i18nKey="screen.healthSync.text.011" />
          </View>
          <TouchableOpacity style={styles.backButton} onPress={handleRefreshDiagnostics}>
            <Text style={styles.backButtonText}>{isLoadingDiagnostics ? t('screen.healthSync.action.loading') : t('screen.healthSync.action.reload')}</Text>
          </TouchableOpacity>
        </View>

        <UiInput
          label="screen.healthSync.label.001"
          value={selectedDate}
          onChangeText={setSelectedDate}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="2026-05-09"
        />

        {isLoadingDiagnostics ? (
          <ActivityIndicator color={theme.colors.accentMint} style={styles.loader} />
        ) : diagnostics ? (
          <>
            <Text style={styles.diagLine}>Availability: {diagnostics.availability}</Text>
            <Text style={styles.diagLine}>
              {t('screen.healthSync.diag.granted', {
                value: diagnostics.grantedPermissions.length ? diagnostics.grantedPermissions.join(', ') : t('screen.healthSync.value.none'),
              })}
            </Text>
            <Text style={styles.diagLine}>
              {t('screen.healthSync.diag.missing', {
                value: diagnostics.missingPermissions.length ? diagnostics.missingPermissions.join(', ') : t('screen.healthSync.value.noneMissing'),
              })}
            </Text>

            {diagnostics.today ? (
              <View style={styles.resultBox}>
                <Text style={styles.resultTitle}>{t('screen.healthSync.diag.snapshot', { date: diagnostics.today.date })}</Text>
                <Text style={styles.resultLine}>Steps: {diagnostics.today.steps}</Text>
                <Text style={styles.resultLine}>Distance: {diagnostics.today.distanceKm} km</Text>
                <Text style={styles.resultLine}>Calories burned: {diagnostics.today.caloriesBurned}</Text>
              </View>
            ) : null}

            <View style={styles.notesBox}>
              <Text style={styles.resultTitle} i18nKey="screen.healthSync.text.012" />
              {diagnostics.notes.map((note) => (
                <Text key={note} style={styles.noteLine}>{tx(note)}</Text>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.statusDetail} i18nKey="screen.healthSync.text.013" />
        )}
      </SurfaceCard>

      {hasHealthSyncAccess === false ? (
        <SurfaceCard style={styles.premiumGateCard}>
          <Text style={styles.premiumGateTitle} i18nKey="screen.premiumGate.title" />
          <Text style={styles.premiumGateBody} i18nKey="screen.premiumGate.healthBody" />
          <TouchableOpacity style={styles.premiumGateButton} onPress={openHealthSyncPaywall}>
            <Text style={styles.premiumGateButtonText} i18nKey="screen.premiumGate.cta" />
          </TouchableOpacity>
        </SurfaceCard>
      ) : null}

      <SurfaceCard style={styles.syncCard}>
        <Text style={styles.sectionTitle} i18nKey="screen.healthSync.text.014" />
        <TouchableOpacity
          style={[styles.primaryButton, isSyncing && styles.disabledButton]}
          onPress={async () => {
            if (hasHealthSyncAccess === false) {
              openHealthSyncPaywall();
              return;
            }
            setIsSyncing(true);
            try {
              const result = await syncActivity(selectedDate);
              const refreshedDiagnostics = await activitySyncService.getDiagnostics(selectedDate);
              setLastSyncResult(result);
              setDiagnostics(refreshedDiagnostics);
              Alert.alert(
                'screen.healthSync.alert.007',
                t('screen.healthSync.alert.syncSuccessBody', { count: result.imported_count, calories: result.total_calories_burned }),
              );
            } catch (error: any) {
              if (isPremiumFeatureError(error)) {
                setHasHealthSyncAccess(false);
                openHealthSyncPaywall();
                return;
              }
              Alert.alert('screen.healthSync.alert.008', error?.message ?? 'screen.healthSync.alert.009');
            } finally {
              setIsSyncing(false);
            }
          }}
          disabled={isSyncing}
        >
          <Text style={styles.primaryButtonText}>{isSyncing ? t('screen.healthSync.sync.loading') : t('screen.healthSync.sync.cta')}</Text>
        </TouchableOpacity>

        {lastSyncResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle} i18nKey="screen.healthSync.text.015" />
            <Text style={styles.resultLine}>Source: {lastSyncResult.source}</Text>
            <Text style={styles.resultLine}>Imported: {lastSyncResult.imported_count}</Text>
            <Text style={styles.resultLine}>Skipped: {lastSyncResult.skipped_count}</Text>
            <Text style={styles.resultLine}>Calories burned: {lastSyncResult.total_calories_burned}</Text>
          </View>
        )}
      </SurfaceCard>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  heroBody: {
    marginBottom: 16,
    maxWidth: 760,
  },
  linkCard: {
    marginBottom: 14,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  sectionLabel: {
    color: colors.accentMint,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  linkValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  helperText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  statusCard: {
    marginBottom: 14,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  statusSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  backButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  loader: {
    marginVertical: 14,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  providerPill: {
    color: colors.text,
    backgroundColor: colors.info,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
  },
  statusPill: {
    color: colors.textOnAccent,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
  },
  statusDetail: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: colors.info,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  secondaryButtonText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  stepsCard: {
    marginBottom: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  checkItem: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
  syncCard: {
    marginBottom: 20,
  },
  premiumGateCard: {
    marginBottom: 14,
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
    gap: 9,
  },
  premiumGateTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  premiumGateBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  premiumGateButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumGateButtonText: {
    color: colors.textOnAccent,
    fontSize: 12,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.6,
  },
  resultBox: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  resultTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  resultLine: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 4,
  },
  diagLine: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  notesBox: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  noteLine: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
}));


