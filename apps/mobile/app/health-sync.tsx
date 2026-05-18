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
import { getLocalDateYmd } from '../services/date';
import { Text } from '../components/i18n-text';
import { Alert } from '../components/i18n-alert';

function getTodayDateString() {
  return getLocalDateYmd();
}

export default function HealthSyncScreen() {
  useAppTheme();
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
      Alert.alert('Không mở được', error?.message ?? 'Vui lòng thử lại sau.');
    }
  };

  const handleOpenSupport = async () => {
    try {
      await activitySyncService.openSupportUrl();
    } catch (error: any) {
      Alert.alert('Không mở được link', error?.message ?? 'Vui lòng thử lại sau.');
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
      Alert.alert('Không tải lại được', error?.message ?? 'Vui lòng thử lại sau.');
    } finally {
      setIsLoadingDiagnostics(false);
    }
  };

  return (
    <ScreenShell>
      <Eyebrow>Health Sync</Eyebrow>
      <HeroTitle>Kiểm tra Activity Sync trên phone.</HeroTitle>
      <BodyText style={styles.heroBody}>
        Deep link cố định để mở trang này trên bản native là {HEALTH_SYNC_SCREEN_LINK}.
      </BodyText>

      <SurfaceCard style={styles.linkCard}>
        <Text style={styles.sectionLabel}>Link để test trên phone</Text>
        <Text style={styles.linkValue}>{HEALTH_SYNC_SCREEN_LINK}</Text>
        <Text style={styles.helperText}>
          Dùng link này sau khi cài dev build hoặc internal build. Route này không phụ thuộc tab, nên test nhanh hơn.
        </Text>
      </SurfaceCard>

      <SurfaceCard style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>Chẩn đoán thiết bị</Text>
            <Text style={styles.statusSubtitle}>Nền tảng hiện tại: {Platform.OS}</Text>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Quay lại</Text>
          </TouchableOpacity>
        </View>

        {isLoadingInfo ? (
          <ActivityIndicator color={theme.colors.accentMint} style={styles.loader} />
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
          <Text style={styles.statusDetail}>Không đọc được thông tin Health Sync trên thiết bị hiện tại.</Text>
        )}
      </SurfaceCard>

      <SurfaceCard style={styles.stepsCard}>
        <Text style={styles.sectionTitle}>Checklist test trên phone</Text>
        <Text style={styles.checkItem}>1. Cài dev build hoặc internal build của app.</Text>
        <Text style={styles.checkItem}>2. Mở link {HEALTH_SYNC_SCREEN_LINK} trên phone.</Text>
        <Text style={styles.checkItem}>3. Mở Health Connect / Apple Health và cấp quyền đọc steps, distance, calories.</Text>
        <Text style={styles.checkItem}>4. Quay lại trang này và bấm đồng bộ.</Text>
        <Text style={styles.checkItem}>5. Xác nhận calories burned và imported count được cập nhật.</Text>
      </SurfaceCard>

      <SurfaceCard style={styles.stepsCard}>
        <View style={styles.statusHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Diagnostics chi tiết</Text>
            <Text style={styles.statusSubtitle}>Đọc trực tiếp readiness, quyền và dữ liệu hôm nay.</Text>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={handleRefreshDiagnostics}>
            <Text style={styles.backButtonText}>{isLoadingDiagnostics ? 'Đang tải...' : 'Tải lại'}</Text>
          </TouchableOpacity>
        </View>

        <UiInput
          label="Ngày cần kiểm tra (YYYY-MM-DD)"
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
            <Text style={styles.diagLine}>Granted: {diagnostics.grantedPermissions.length ? diagnostics.grantedPermissions.join(', ') : 'Chưa có'}</Text>
            <Text style={styles.diagLine}>Missing: {diagnostics.missingPermissions.length ? diagnostics.missingPermissions.join(', ') : 'Không thiếu'}</Text>

            {diagnostics.today ? (
              <View style={styles.resultBox}>
                <Text style={styles.resultTitle}>Snapshot hôm nay ({diagnostics.today.date})</Text>
                <Text style={styles.resultLine}>Steps: {diagnostics.today.steps}</Text>
                <Text style={styles.resultLine}>Distance: {diagnostics.today.distanceKm} km</Text>
                <Text style={styles.resultLine}>Calories burned: {diagnostics.today.caloriesBurned}</Text>
              </View>
            ) : null}

            <View style={styles.notesBox}>
              <Text style={styles.resultTitle}>Ghi chú chẩn đoán</Text>
              {diagnostics.notes.map((note) => (
                <Text key={note} style={styles.noteLine}>{note}</Text>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.statusDetail}>Không lấy được diagnostics trên thiết bị hiện tại.</Text>
        )}
      </SurfaceCard>

      <SurfaceCard style={styles.syncCard}>
        <Text style={styles.sectionTitle}>Chạy thử đồng bộ</Text>
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
                'Đồng bộ thành công',
                `Đã nhập ${result.imported_count} hoạt động và ${result.total_calories_burned} kcal tiêu hao.`,
              );
            } catch (error: any) {
              Alert.alert('Không thể đồng bộ', error?.message ?? 'Vui lòng thử lại trên phone native.');
            } finally {
              setIsSyncing(false);
            }
          }}
          disabled={isSyncing}
        >
          <Text style={styles.primaryButtonText}>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ activity ngay bây giờ'}</Text>
        </TouchableOpacity>

        {lastSyncResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Kết quả lần gần nhất</Text>
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


