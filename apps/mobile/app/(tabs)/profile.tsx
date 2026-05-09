import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Alert,
  ActivityIndicator, useWindowDimensions, Switch, ScrollView, TouchableOpacity,
} from 'react-native';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { useReminderStore } from '../../store/reminder.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import { apiClient } from '../../services/api';
import { User, ActivityLevel, UserGoal, ReminderPreferences } from '@calorie-ai/types';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiChip } from '../../components/ui-chip';
import { UiInput } from '../../components/ui-input';

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: '🪑 Ít vận động',
  light: '🚶 Nhẹ (1-3 ngày/tuần)',
  moderate: '🏃 Vừa (3-5 ngày/tuần)',
  active: '💪 Nhiều (6-7 ngày/tuần)',
  very_active: '🔥 Rất nhiều',
};

const GOAL_LABELS: Record<UserGoal, string> = {
  lose_weight: '📉 Giảm cân',
  maintain: '⚖️ Duy trì',
  gain_muscle: '💪 Tăng cơ',
};

export default function ProfileScreen() {
  const router = useRouter();
  const { logout } = useAuthStore();
  const {
    preferences: reminderPrefs,
    previewNudge,
    isPreviewLoading,
    fetchPreferences: fetchReminders,
    updatePreferences: updateReminders,
    fetchPreviewNudge,
  } = useReminderStore();
  const { subscription, features, fetchSubscription } = useSubscriptionStore();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<Partial<User>>({});
  const [reminders, setReminders] = useState<Partial<ReminderPreferences>>({});
  const [previewMeal, setPreviewMeal] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isDesktop = width >= 900;

  useEffect(() => {
    Promise.all([
      apiClient.get('/user/profile').then((res) => {
        setProfile(res.data);
      }).catch(() => {
        setProfile({});
      }),
      fetchReminders().then(() => {
        if (reminderPrefs) setReminders(reminderPrefs);
      }).catch(() => {
        setReminders({});
      }),
      fetchSubscription(),
      fetchPreviewNudge('lunch').catch(() => {}),
    ]).finally(() => setIsLoading(false));
  }, []);

  // Update local reminders state when reminder prefs are fetched
  useEffect(() => {
    if (reminderPrefs) {
      setReminders(reminderPrefs);
    }
  }, [reminderPrefs]);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      // Save profile
      const profileRes = await apiClient.patch('/user/profile', {
        full_name: profile.full_name,
        weight_kg: profile.weight_kg ? Number(profile.weight_kg) : undefined,
        height_cm: profile.height_cm ? Number(profile.height_cm) : undefined,
        age: profile.age ? Number(profile.age) : undefined,
        gender: profile.gender,
        activity_level: profile.activity_level,
        goal: profile.goal,
        daily_calorie_target: profile.daily_calorie_target ? Number(profile.daily_calorie_target) : undefined,
        target_breakfast_cal: profile.target_breakfast_cal ? Number(profile.target_breakfast_cal) : undefined,
        target_lunch_cal: profile.target_lunch_cal ? Number(profile.target_lunch_cal) : undefined,
        target_dinner_cal: profile.target_dinner_cal ? Number(profile.target_dinner_cal) : undefined,
        target_snack_cal: profile.target_snack_cal ? Number(profile.target_snack_cal) : undefined,
      });
      setProfile(profileRes.data);

      // Save reminders if changed
      const reminderUpdates = {
        breakfast_reminder_enabled: reminders.breakfast_reminder_enabled,
        breakfast_reminder_time: reminders.breakfast_reminder_time,
        lunch_reminder_enabled: reminders.lunch_reminder_enabled,
        lunch_reminder_time: reminders.lunch_reminder_time,
        dinner_reminder_enabled: reminders.dinner_reminder_enabled,
        dinner_reminder_time: reminders.dinner_reminder_time,
        snack_reminder_enabled: reminders.snack_reminder_enabled,
        snack_reminder_time: reminders.snack_reminder_time,
        allow_push_notifications: reminders.allow_push_notifications,
        nudge_motivation_style: reminders.nudge_motivation_style,
      };

      await updateReminders(reminderUpdates);
      await fetchPreviewNudge(previewMeal);

      Alert.alert('✅', 'Đã lưu hồ sơ và thông báo!');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể lưu.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm?.('Bạn có chắc muốn đăng xuất?') ?? true;
      if (confirmed) {
        void logout();
      }
      return;
    }

    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  if (isLoading) {
    return (
      <ScreenShell>
        <ActivityIndicator color="#4ade80" style={{ marginTop: 80 }} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Eyebrow>Personal Coach</Eyebrow>
        <HeroTitle>Thiết lập hồ sơ để AI tính target hợp lý hơn.</HeroTitle>
        <BodyText style={styles.heroBody}>
          Điều chỉnh thông tin cơ thể, mục tiêu và phân bổ calo theo từng bữa để dashboard và nhật ký phản ánh sát thực tế hơn.
        </BodyText>

      <View style={[styles.summaryRow, isDesktop && styles.summaryRowDesktop]}>
        <SurfaceCard style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{profile.daily_calorie_target ?? '--'}</Text>
          <Text style={styles.summaryLabel}>Kcal mỗi ngày</Text>
        </SurfaceCard>
        <SurfaceCard style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{profile.goal ? GOAL_LABELS[profile.goal] : '--'}</Text>
          <Text style={styles.summaryLabel}>Mục tiêu hiện tại</Text>
        </SurfaceCard>
        <SurfaceCard style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{profile.activity_level ? ACTIVITY_LABELS[profile.activity_level] : '--'}</Text>
          <Text style={styles.summaryLabel}>Mức vận động</Text>
        </SurfaceCard>
      </View>

      <SurfaceCard style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Thông tin cơ bản</Text>
        <View style={[styles.metricsGrid, isDesktop && styles.metricsGridDesktop]}>
          <Field label="Họ và tên" value={profile.full_name ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, full_name: v }))} placeholder="Nguyễn Văn A" fullWidth />
          <Field label="Cân nặng (kg)" value={String(profile.weight_kg ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, weight_kg: Number(v) || undefined }))} keyboardType="numeric" placeholder="65" />
          <Field label="Chiều cao (cm)" value={String(profile.height_cm ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, height_cm: Number(v) || undefined }))} keyboardType="numeric" placeholder="170" />
          <Field label="Tuổi" value={String(profile.age ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, age: Number(v) || undefined }))} keyboardType="numeric" placeholder="25" />
        </View>

        <Text style={styles.label}>Giới tính</Text>
        <View style={styles.chipRow}>
          {(['male', 'female'] as const).map((g) => (
            <UiChip key={g} label={g === 'male' ? '👨 Nam' : '👩 Nữ'} selected={profile.gender === g} onPress={() => setProfile((p) => ({ ...p, gender: g }))} />
          ))}
        </View>
      </SurfaceCard>

      <SurfaceCard style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Phong cách mục tiêu</Text>
        <Text style={styles.helperText}>Chọn kết quả bạn đang muốn đạt được và mức vận động thực tế mỗi tuần.</Text>

        <Text style={styles.label}>Mục tiêu</Text>
        <View style={styles.chipRow}>
          {(Object.keys(GOAL_LABELS) as UserGoal[]).map((g) => (
            <UiChip key={g} label={GOAL_LABELS[g]} selected={profile.goal === g} onPress={() => setProfile((p) => ({ ...p, goal: g }))} />
          ))}
        </View>

        <Text style={styles.label}>Mức độ vận động</Text>
        {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
          <UiChip key={a} label={ACTIVITY_LABELS[a]} selected={profile.activity_level === a} onPress={() => setProfile((p) => ({ ...p, activity_level: a }))} style={styles.activityChip} />
        ))}
      </SurfaceCard>

      <SurfaceCard style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>🎯 Mục tiêu calo</Text>
        <Text style={styles.helperText}>Phân bổ mức calo theo từng bữa để app hiển thị tiến độ rõ hơn trong nhật ký.</Text>
        <Field label="Tổng calo/ngày" value={String(profile.daily_calorie_target ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, daily_calorie_target: Number(v) || undefined }))} keyboardType="numeric" placeholder="1800" fullWidth />
        <View style={[styles.mealTargetRow, isDesktop && styles.mealTargetRowDesktop]}>
          <MealTargetField label="🌅 Sáng" value={String(profile.target_breakfast_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_breakfast_cal: Number(v) || undefined }))} />
          <MealTargetField label="☀️ Trưa" value={String(profile.target_lunch_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_lunch_cal: Number(v) || undefined }))} />
          <MealTargetField label="🌙 Tối" value={String(profile.target_dinner_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_dinner_cal: Number(v) || undefined }))} />
          <MealTargetField label="🍎 Vặt" value={String(profile.target_snack_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_snack_cal: Number(v) || undefined }))} />
        </View>
      </SurfaceCard>

      <SurfaceCard style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>🔔 Nhận thông báo</Text>
        <Text style={styles.helperText}>Bật thông báo mealtime để nhận nhắc nhở ăn và cập nhật tiến độ.</Text>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Cho phép thông báo push</Text>
          <Switch
            value={reminders.allow_push_notifications ?? true}
            onValueChange={(v) => setReminders((r) => ({ ...r, allow_push_notifications: v }))}
            trackColor={{ false: '#203463', true: '#4ade80' }}
            thumbColor={reminders.allow_push_notifications ? '#6ee7b7' : '#7082a9'}
          />
        </View>

        <Text style={styles.label}>Phong cách nhắc nhở</Text>
        <View style={styles.chipRow}>
          {(['encouraging', 'neutral', 'warning'] as const).map((style) => (
            <UiChip
              key={style}
              label={style === 'encouraging' ? '💪 Khuyến khích' : style === 'neutral' ? '📝 Trung lập' : '⚠️ Cảnh báo'}
              selected={reminders.nudge_motivation_style === style}
              onPress={() => setReminders((r) => ({ ...r, nudge_motivation_style: style }))}
            />
          ))}
        </View>

        <ReminderTimePickerRow
          meal="breakfast"
          mealLabel="🌅 Sáng"
          enabled={reminders.breakfast_reminder_enabled ?? true}
          time={reminders.breakfast_reminder_time ?? '07:00'}
          onEnabledChange={(v) => setReminders((r) => ({ ...r, breakfast_reminder_enabled: v }))}
          onTimeChange={(v) => setReminders((r) => ({ ...r, breakfast_reminder_time: v }))}
        />

        <ReminderTimePickerRow
          meal="lunch"
          mealLabel="🌤️ Trưa"
          enabled={reminders.lunch_reminder_enabled ?? true}
          time={reminders.lunch_reminder_time ?? '12:00'}
          onEnabledChange={(v) => setReminders((r) => ({ ...r, lunch_reminder_enabled: v }))}
          onTimeChange={(v) => setReminders((r) => ({ ...r, lunch_reminder_time: v }))}
        />

        <ReminderTimePickerRow
          meal="dinner"
          mealLabel="🌙 Tối"
          enabled={reminders.dinner_reminder_enabled ?? true}
          time={reminders.dinner_reminder_time ?? '19:00'}
          onEnabledChange={(v) => setReminders((r) => ({ ...r, dinner_reminder_enabled: v }))}
          onTimeChange={(v) => setReminders((r) => ({ ...r, dinner_reminder_time: v }))}
        />

        <ReminderTimePickerRow
          meal="snack"
          mealLabel="🍿 Vặt"
          enabled={reminders.snack_reminder_enabled ?? false}
          time={reminders.snack_reminder_time ?? '15:00'}
          onEnabledChange={(v) => setReminders((r) => ({ ...r, snack_reminder_enabled: v }))}
          onTimeChange={(v) => setReminders((r) => ({ ...r, snack_reminder_time: v }))}
        />

        <View style={styles.previewSection}>
          <Text style={styles.label}>Xem trước nudge theo bữa</Text>
          <View style={styles.chipRow}>
            {([
              ['breakfast', '🌅 Sáng'],
              ['lunch', '🌤️ Trưa'],
              ['dinner', '🌙 Tối'],
              ['snack', '🍿 Vặt'],
            ] as const).map(([mealType, label]) => (
              <UiChip
                key={mealType}
                label={label}
                selected={previewMeal === mealType}
                onPress={() => {
                  setPreviewMeal(mealType);
                  void fetchPreviewNudge(mealType);
                }}
              />
            ))}
          </View>

          <SurfaceCard style={styles.previewCard}>
            {isPreviewLoading && <ActivityIndicator color="#6ee7b7" />}
            {!isPreviewLoading && previewNudge && (
              <>
                <Text style={styles.previewTitle}>{previewNudge.emoji} {previewNudge.title}</Text>
                <Text style={styles.previewBody}>{previewNudge.body}</Text>
                {!!previewNudge.streakContext && (
                  <Text style={styles.previewMeta}>
                    Streak hiện tại {previewNudge.streakContext.currentStreak} ngày · Best {previewNudge.streakContext.longestStreak} ngày
                  </Text>
                )}
              </>
            )}
          </SurfaceCard>
        </View>
      </SurfaceCard>

      <SurfaceCard style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>💎 Gói dịch vụ</Text>
        <View style={styles.subscriptionCard}>
          <View style={styles.subscriptionHeader}>
            <View>
              <Text style={styles.subscriptionTier}>{subscription?.tier === 'premium' ? 'Premium' : subscription?.tier === 'pro' ? 'Pro' : 'Miễn phí'}</Text>
              <Text style={styles.subscriptionStatus}>
                {subscription?.is_active ? 'Đang hoạt động' : 'Hết hạn'}
              </Text>
            </View>
            <MaterialIcons
              name={subscription?.tier === 'pro' ? 'star' : subscription?.tier === 'premium' ? 'favorite' : 'favorite-border'}
              size={32}
              color={subscription?.tier === 'pro' ? '#fbbf24' : subscription?.tier === 'premium' ? '#f97316' : '#6b7280'}
            />
          </View>

          {features && (
            <View style={styles.featuresPreview}>
              <Text style={styles.featuresLabel}>Các tính năng:</Text>
              <View style={styles.featureGrid}>
                {[
                  { name: 'ai_coach', label: 'AI Coach' },
                  { name: 'meal_reminders', label: 'Nhắc nhở' },
                  { name: 'weekly_reports', label: 'Báo cáo' },
                  { name: 'healthkit_sync', label: 'HealthKit' },
                ].map(({ name, label }) => (
                  <View key={name} style={styles.featureCheckItem}>
                    <MaterialIcons
                      name={features[name as keyof typeof features] ? 'check-circle' : 'cancel'}
                      size={18}
                      color={features[name as keyof typeof features] ? '#10b981' : '#d1d5db'}
                    />
                    <Text style={[styles.featureCheckLabel, !features[name as keyof typeof features] && styles.featureCheckLabelDisabled]}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {subscription?.tier === 'free' && (
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => router.push('/paywall')}
            >
              <Text style={styles.upgradeButtonText}>Nâng cấp gói</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </SurfaceCard>

      <View style={[styles.actionRow, isDesktop && styles.actionRowDesktop]}>
        <UiButton label="Lưu hồ sơ" onPress={handleSaveProfile} loading={isSaving} style={styles.saveButton} />
        <UiButton label="Đăng xuất" onPress={handleLogout} variant="danger" style={styles.logoutBtn} />
      </View>
      </ScrollView>
    </ScreenShell>
  );
}

function Field({ label, value, onChangeText, keyboardType, placeholder, fullWidth }: { label: string; value: string; onChangeText: (v: string) => void; keyboardType?: any; placeholder?: string; fullWidth?: boolean }) {
  return (
    <View style={[styles.fieldContainer, fullWidth && styles.fieldContainerFull]}>
      <UiInput label={label} value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholder={placeholder} />
    </View>
  );
}

function MealTargetField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={styles.mealTargetField}>
      <UiInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder="0"
        containerStyle={{ marginBottom: 0 }}
        style={styles.mealTargetInput}
      />
    </View>
  );
}

function ReminderTimePickerRow({
  meal,
  mealLabel,
  enabled,
  time,
  onEnabledChange,
  onTimeChange,
}: {
  meal: string;
  mealLabel: string;
  enabled: boolean;
  time: string;
  onEnabledChange: (v: boolean) => void;
  onTimeChange: (v: string) => void;
}) {
  const [showPicker, setShowPicker] = React.useState(false);

  const handleTimeSelect = (hours: number, minutes: number) => {
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    onTimeChange(timeStr);
    setShowPicker(false);
  };

  const hours = parseInt(time.split(':')[0]);
  const minutes = parseInt(time.split(':')[1]);

  return (
    <View style={styles.reminderRow}>
      <View style={styles.reminderLabel}>
        <Text style={styles.reminderMealLabel}>{mealLabel}</Text>
        <Switch
          value={enabled}
          onValueChange={onEnabledChange}
          trackColor={{ false: '#203463', true: '#4ade80' }}
          thumbColor={enabled ? '#6ee7b7' : '#7082a9'}
        />
      </View>

      {enabled && (
        <View style={styles.reminderTimeInputs}>
          <View style={styles.timeInputGroup}>
            <Text style={styles.timeInputLabel}>Giờ</Text>
            <UiInput
              value={String(hours).padStart(2, '0')}
              onChangeText={(v) => {
                const h = Math.max(0, Math.min(23, parseInt(v) || 0));
                handleTimeSelect(h, minutes);
              }}
              keyboardType="number-pad"
              placeholder="HH"
              maxLength={2}
              containerStyle={{ marginBottom: 0 }}
              style={styles.timeInput}
            />
          </View>

          <Text style={styles.timeSeparator}>:</Text>

          <View style={styles.timeInputGroup}>
            <Text style={styles.timeInputLabel}>Phút</Text>
            <UiInput
              value={String(minutes).padStart(2, '0')}
              onChangeText={(v) => {
                const m = Math.max(0, Math.min(59, parseInt(v) || 0));
                handleTimeSelect(hours, m);
              }}
              keyboardType="number-pad"
              placeholder="MM"
              maxLength={2}
              containerStyle={{ marginBottom: 0 }}
              style={styles.timeInput}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heroBody: { marginBottom: 18, maxWidth: 720 },
  summaryRow: { gap: 12, marginBottom: 14 },
  summaryRowDesktop: { flexDirection: 'row' },
  summaryCard: { flex: 1, minHeight: 106, justifyContent: 'center' },
  summaryValue: { color: '#eff6ff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  summaryLabel: { color: '#8ea2c8', fontSize: 13, lineHeight: 18 },
  sectionCard: { marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#dbeafe', marginBottom: 6 },
  helperText: { color: '#8ea2c8', fontSize: 13, lineHeight: 19, marginBottom: 8 },
  label: { color: '#94a3b8', fontSize: 13, marginBottom: 6, marginTop: 12, fontWeight: '500' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricsGridDesktop: { gap: 14 },
  fieldContainer: { width: '48%' },
  fieldContainerFull: { width: '100%' },
  input: {
    backgroundColor: '#121d3f',
    borderRadius: 14,
    padding: 14,
    color: '#f8fafc',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#23386b',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  activityChip: { marginBottom: 8 },
  mealTargetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  mealTargetRowDesktop: {
    gap: 14,
  },
  mealTargetField: {
    width: '48%',
  },
  mealTargetInput: { color: '#66f0a0', fontWeight: '800', fontSize: 18, textAlign: 'center' },
  actionRow: { gap: 10, marginTop: 4, marginBottom: 10 },
  actionRowDesktop: { flexDirection: 'row', alignItems: 'stretch' },
  saveButton: { flex: 1 },
  logoutBtn: { minWidth: 160 },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingVertical: 10 },
  switchLabel: { color: '#dbeafe', fontSize: 14, fontWeight: '600' },

  reminderRow: { marginBottom: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#203463' },
  reminderLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reminderMealLabel: { color: '#dbeafe', fontSize: 14, fontWeight: '600' },
  reminderTimeInputs: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  timeInputGroup: { flex: 1 },
  timeInputLabel: { color: '#8ea2c8', fontSize: 12, marginBottom: 4, fontWeight: '500' },
  timeInput: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#6ee7b7' },
  timeSeparator: { color: '#dbeafe', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  previewSection: { marginTop: 12 },
  previewCard: { marginTop: 10, backgroundColor: '#0f172a', borderColor: '#1e3a5f' },
  previewTitle: { color: '#eff6ff', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  previewBody: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  previewMeta: { color: '#8ea2c8', fontSize: 12, marginTop: 10, fontWeight: '600' },
  subscriptionCard: { backgroundColor: '#111827', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1f2937' },
  subscriptionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  subscriptionTier: { fontSize: 18, fontWeight: '700', color: '#dbeafe', marginBottom: 2 },
  subscriptionStatus: { fontSize: 12, color: '#6b7280' },
  featuresPreview: { marginBottom: 14 },
  featuresLabel: { fontSize: 12, color: '#8ea2c8', fontWeight: '500', marginBottom: 8 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featureCheckItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#0f1419', borderRadius: 6 },
  featureCheckLabel: { fontSize: 12, color: '#dbeafe', fontWeight: '500' },
  featureCheckLabelDisabled: { color: '#6b7280' },
  upgradeButton: { backgroundColor: '#f97316', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  upgradeButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
