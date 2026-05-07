import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/auth.store';
import { apiClient } from '../../services/api';
import { User, ActivityLevel, UserGoal } from '@calorie-ai/types';

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
  const [profile, setProfile] = useState<Partial<User>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
    } catch {
      Alert.alert('Lỗi', 'Không thể lưu.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#4ade80" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Hồ sơ</Text>

        <Field label="Họ và tên" value={profile.full_name ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, full_name: v }))} placeholder="Nguyễn Văn A" />
        <Field label="Cân nặng (kg)" value={String(profile.weight_kg ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, weight_kg: Number(v) || undefined }))} keyboardType="numeric" placeholder="65" />
        <Field label="Chiều cao (cm)" value={String(profile.height_cm ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, height_cm: Number(v) || undefined }))} keyboardType="numeric" placeholder="170" />
        <Field label="Tuổi" value={String(profile.age ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, age: Number(v) || undefined }))} keyboardType="numeric" placeholder="25" />

        {/* Gender */}
        <Text style={styles.label}>Giới tính</Text>
        <View style={styles.chipRow}>
          {(['male', 'female'] as const).map((g) => (
            <TouchableOpacity key={g} style={[styles.chip, profile.gender === g && styles.chipActive]} onPress={() => setProfile((p) => ({ ...p, gender: g }))}>
              <Text style={[styles.chipText, profile.gender === g && styles.chipTextActive]}>{g === 'male' ? '👨 Nam' : '👩 Nữ'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Goal */}
        <Text style={styles.label}>Mục tiêu</Text>
        <View style={styles.chipRow}>
          {(Object.keys(GOAL_LABELS) as UserGoal[]).map((g) => (
            <TouchableOpacity key={g} style={[styles.chip, profile.goal === g && styles.chipActive]} onPress={() => setProfile((p) => ({ ...p, goal: g }))}>
              <Text style={[styles.chipText, profile.goal === g && styles.chipTextActive]}>{GOAL_LABELS[g]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Activity Level */}
        <Text style={styles.label}>Mức độ vận động</Text>
        {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
          <TouchableOpacity key={a} style={[styles.activityRow, profile.activity_level === a && styles.activityRowActive]} onPress={() => setProfile((p) => ({ ...p, activity_level: a }))}>
            <Text style={[styles.activityText, profile.activity_level === a && styles.activityTextActive]}>{ACTIVITY_LABELS[a]}</Text>
          </TouchableOpacity>
        ))}

        {/* Calorie Targets */}
        <Text style={styles.sectionTitle}>🎯 Mục tiêu calo</Text>
        <Field label="Tổng calo/ngày" value={String(profile.daily_calorie_target ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, daily_calorie_target: Number(v) || undefined }))} keyboardType="numeric" placeholder="1800" />
        <View style={styles.mealTargetRow}>
          <MealTargetField label="🌅 Sáng" value={String(profile.target_breakfast_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_breakfast_cal: Number(v) || undefined }))} />
          <MealTargetField label="☀️ Trưa" value={String(profile.target_lunch_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_lunch_cal: Number(v) || undefined }))} />
          <MealTargetField label="🌙 Tối" value={String(profile.target_dinner_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_dinner_cal: Number(v) || undefined }))} />
          <MealTargetField label="🍎 Vặt" value={String(profile.target_snack_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_snack_cal: Number(v) || undefined }))} />
        </View>

        <TouchableOpacity style={[styles.saveButton, isSaving && styles.buttonDisabled]} onPress={handleSave} disabled={isSaving}>
          {isSaving ? <ActivityIndicator color="#0f0f1a" /> : <Text style={styles.saveButtonText}>Lưu hồ sơ</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, keyboardType, placeholder }: { label: string; value: string; onChangeText: (v: string) => void; keyboardType?: any; placeholder?: string }) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor="#6b7280" />
    </View>
  );
}

function MealTargetField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={styles.mealTargetField}>
      <Text style={styles.mealTargetLabel}>{label}</Text>
      <TextInput style={styles.mealTargetInput} value={value} onChangeText={onChangeText} keyboardType="numeric" placeholderTextColor="#6b7280" placeholder="0" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginTop: 16, marginBottom: 8 },
  label: { color: '#9ca3af', fontSize: 13, marginBottom: 6, marginTop: 12 },
  fieldContainer: {},
  input: { backgroundColor: '#1a1a2e', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#374151' },
  chipActive: { backgroundColor: '#4ade8022', borderColor: '#4ade80' },
  chipText: { color: '#9ca3af', fontSize: 13 },
  chipTextActive: { color: '#4ade80', fontWeight: '600' },
  activityRow: { backgroundColor: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#1a1a2e' },
  activityRowActive: { borderColor: '#4ade80', backgroundColor: '#4ade8011' },
  activityText: { color: '#9ca3af', fontSize: 14 },
  activityTextActive: { color: '#4ade80', fontWeight: '600' },
  mealTargetRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  mealTargetField: { flex: 1, backgroundColor: '#1a1a2e', borderRadius: 10, padding: 10, alignItems: 'center' },
  mealTargetLabel: { color: '#9ca3af', fontSize: 11, marginBottom: 4 },
  mealTargetInput: { color: '#4ade80', fontWeight: 'bold', fontSize: 16, textAlign: 'center', width: '100%' },
  saveButton: { backgroundColor: '#4ade80', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20, marginBottom: 10 },
  saveButtonText: { color: '#0f0f1a', fontWeight: 'bold', fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
  logoutButton: { backgroundColor: '#ef444422', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 40, borderWidth: 1, borderColor: '#ef4444' },
  logoutText: { color: '#ef4444', fontWeight: 'bold', fontSize: 15 },
});
