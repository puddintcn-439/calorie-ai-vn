import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { ActivitySyncResult } from '@calorie-ai/types';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../components/ui-shell';
import { UiInput } from '../components/ui-input';
import { useLogStore } from '../store/log.store';
import {
  activitySyncService,
  ActivitySyncDiagnostics,
  ActivitySyncPhoneCheckInfo,
  HEALTH_SYNC_SCREEN_LINK,
} from '../services/activity-sync.service';
import { getLocalDateYmd } from '../services/date';

function getTodayDateString() {
  return getLocalDateYmd();
}

export default function HealthSyncScreen() {
  const { syncActivity } = useLogStore();
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [phoneCheckInfo, setPhoneCheckInfo] = useState<ActivitySyncPhoneCheckInfo | null>(null);
  const [diagnostics, setDiagnostics] = useState<ActivitySyncDiagnostics | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<ActivitySyncResult | null>(null);

  useEffect(() => {
    const load = async (date: string) => {
      try {
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
      Alert.alert('Khong mo duoc', error?.message ?? 'Vui long thu lai sau.');
    }
  };

  const handleOpenSupport = async () => {
    try {
      await activitySyncService.openSupportUrl();
    } catch (error: any) {
      Alert.alert('Khong mo duoc link', error?.message ?? 'Vui long thu lai sau.');
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
      Alert.alert('Khong tai lai duoc', error?.message ?? 'Vui long thu lai sau.');
    } finally {
      setIsLoadingDiagnostics(false);
    }
  };

  return (
    <ScreenShell>
      <Eyebrow>Health Sync</Eyebrow>
      <HeroTitle>Trang kiem tra Activity Sync tren phone.</HeroTitle>
      <BodyText style={styles.heroBody}>
        Deep link co dinh de mo trang nay tren ban native la {HEALTH_SYNC_SCREEN_LINK}.
      </BodyText>

      <SurfaceCard style={styles.linkCard}>
        <Text style={styles.sectionLabel}>Link de toi check tren phone</Text>
        <Text style={styles.linkValue}>{HEALTH_SYNC_SCREEN_LINK}</Text>
        <Text style={styles.helperText}>
          Dung link nay sau khi cai dev build/internal build. Route nay khong phu thuoc tab, de test nhanh hon.
        </Text>
      </SurfaceCard>

      <SurfaceCard style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>Chan doan thiet bi</Text>
            <Text style={styles.statusSubtitle}>Nen tang hien tai: {Platform.OS}</Text>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Quay lai</Text>
          </TouchableOpacity>
        </View>

        {isLoadingInfo ? (
          <ActivityIndicator color="#6ee7b7" style={styles.loader} />
        ) : phoneCheckInfo ? (
          <>
            <View style={styles.pillRow}>
              <Text style={styles.providerPill}>{phoneCheckInfo.providerName}</Text>
              <Text style={styles.statusPill}>{phoneCheckInfo.statusLabel}</Text>
            </View>
            <Text style={styles.statusDetail}>{phoneCheckInfo.detail}</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleOpenProvider}>
                <Text style={styles.primaryButtonText}>{phoneCheckInfo.actionLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleOpenSupport}>
                <Text style={styles.secondaryButtonText}>{phoneCheckInfo.installLabel}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={styles.statusDetail}>Khong doc duoc thong tin Health Sync tren thiet bi hien tai.</Text>
        )}
      </SurfaceCard>

      <SurfaceCard style={styles.stepsCard}>
        <Text style={styles.sectionTitle}>Checklist test tren phone</Text>
        <Text style={styles.checkItem}>1. Cai dev build hoac internal build cua app.</Text>
        <Text style={styles.checkItem}>2. Mo link {HEALTH_SYNC_SCREEN_LINK} tren phone.</Text>
        <Text style={styles.checkItem}>3. Bam mo Health Connect / Apple Health va cap quyen doc steps, distance, calories.</Text>
        <Text style={styles.checkItem}>4. Quay lai trang nay va bam dong bo.</Text>
        <Text style={styles.checkItem}>5. Xac nhan calories burned va imported count duoc cap nhat.</Text>
      </SurfaceCard>

      <SurfaceCard style={styles.stepsCard}>
        <View style={styles.statusHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Diagnostics chi tiet</Text>
            <Text style={styles.statusSubtitle}>Doc truc tiep readiness, quyen va du lieu hom nay.</Text>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={handleRefreshDiagnostics}>
            <Text style={styles.backButtonText}>{isLoadingDiagnostics ? 'Dang tai...' : 'Tai lai'}</Text>
          </TouchableOpacity>
        </View>

        <UiInput
          label="Ngay can kiem tra (YYYY-MM-DD)"
          value={selectedDate}
          onChangeText={setSelectedDate}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="2026-05-09"
        />

        {isLoadingDiagnostics ? (
          <ActivityIndicator color="#6ee7b7" style={styles.loader} />
        ) : diagnostics ? (
          <>
            <Text style={styles.diagLine}>Availability: {diagnostics.availability}</Text>
            <Text style={styles.diagLine}>Granted: {diagnostics.grantedPermissions.length ? diagnostics.grantedPermissions.join(', ') : 'Chua co'}</Text>
            <Text style={styles.diagLine}>Missing: {diagnostics.missingPermissions.length ? diagnostics.missingPermissions.join(', ') : 'Khong thieu'}</Text>

            {diagnostics.today ? (
              <View style={styles.resultBox}>
                <Text style={styles.resultTitle}>Snapshot hom nay ({diagnostics.today.date})</Text>
                <Text style={styles.resultLine}>Steps: {diagnostics.today.steps}</Text>
                <Text style={styles.resultLine}>Distance: {diagnostics.today.distanceKm} km</Text>
                <Text style={styles.resultLine}>Calories burned: {diagnostics.today.caloriesBurned}</Text>
              </View>
            ) : null}

            <View style={styles.notesBox}>
              <Text style={styles.resultTitle}>Ghi chu chan doan</Text>
              {diagnostics.notes.map((note) => (
                <Text key={note} style={styles.noteLine}>{note}</Text>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.statusDetail}>Khong lay duoc diagnostics tren thiet bi hien tai.</Text>
        )}
      </SurfaceCard>

      <SurfaceCard style={styles.syncCard}>
        <Text style={styles.sectionTitle}>Chay thu dong bo</Text>
        <TouchableOpacity
          style={[styles.primaryButton, isSyncing && styles.disabledButton]}
          onPress={async () => {
            setIsSyncing(true);
            try {
              const result = await syncActivity(selectedDate);
              const refreshedDiagnostics = await activitySyncService.getDiagnostics(selectedDate);
              setLastSyncResult(result);
              setDiagnostics(refreshedDiagnostics);
              Alert.alert(
                'Dong bo thanh cong',
                `Da nhap ${result.imported_count} hoat dong va ${result.total_calories_burned} kcal tieu hao.`,
              );
            } catch (error: any) {
              Alert.alert('Khong the dong bo', error?.message ?? 'Vui long thu lai tren phone native.');
            } finally {
              setIsSyncing(false);
            }
          }}
          disabled={isSyncing}
        >
          <Text style={styles.primaryButtonText}>{isSyncing ? 'Dang dong bo...' : 'Dong bo activity ngay bay gio'}</Text>
        </TouchableOpacity>

        {lastSyncResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Ket qua lan gan nhat</Text>
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

const styles = StyleSheet.create({
  heroBody: {
    marginBottom: 16,
    maxWidth: 760,
  },
  linkCard: {
    marginBottom: 14,
    borderColor: '#14532d',
    backgroundColor: '#0d2019',
  },
  sectionLabel: {
    color: '#6ee7b7',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  linkValue: {
    color: '#eff6ff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  helperText: {
    color: '#b8c8e8',
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
    color: '#eff6ff',
    fontSize: 16,
    fontWeight: '800',
  },
  statusSubtitle: {
    color: '#9fb1d1',
    fontSize: 12,
    marginTop: 4,
  },
  backButton: {
    backgroundColor: '#122041',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#223a70',
  },
  backButtonText: {
    color: '#dbeafe',
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
    color: '#eff6ff',
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
  },
  statusPill: {
    color: '#07111f',
    backgroundColor: '#6ee7b7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
  },
  statusDetail: {
    color: '#cbd5e1',
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
    backgroundColor: '#60a5fa',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#07111f',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#122041',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryButtonText: {
    color: '#dbeafe',
    fontSize: 13,
    fontWeight: '700',
  },
  stepsCard: {
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#eff6ff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  checkItem: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
  syncCard: {
    marginBottom: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
  resultBox: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#122041',
    borderWidth: 1,
    borderColor: '#223a70',
    padding: 12,
  },
  resultTitle: {
    color: '#eff6ff',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  resultLine: {
    color: '#b8c8e8',
    fontSize: 12,
    marginBottom: 4,
  },
  diagLine: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  notesBox: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#0f1b3b',
    borderWidth: 1,
    borderColor: '#223a70',
    padding: 12,
  },
  noteLine: {
    color: '#b8c8e8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
});