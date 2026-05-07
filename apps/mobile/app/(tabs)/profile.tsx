import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Alert,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Platform } from 'react-native';
import { useAuthStore } from '../../store/auth.store';
import { apiClient } from '../../services/api';
import { User, ActivityLevel, UserGoal } from '@calorie-ai/types';
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
  const { logout } = useAuthStore();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<Partial<User>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isDesktop = width >= 900;

  useEffect(() => {
    apiClient.get('/user/profile').then((res) => {
      setProfile(res.data);
    }).catch(() => {
      setProfile({});
    }).finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await apiClient.patch('/user/profile', {
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
      setProfile(res.data);
      Alert.alert('✅', 'Đã lưu hồ sơ!');
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

      <View style={[styles.actionRow, isDesktop && styles.actionRowDesktop]}>
        <UiButton label="Lưu hồ sơ" onPress={handleSave} loading={isSaving} style={styles.saveButton} />
        <UiButton label="Đăng xuất" onPress={handleLogout} variant="danger" style={styles.logoutBtn} />
      </View>
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
});
