import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BodyProgressEntry, BodyProgressTrend, CreateBodyProgressDto } from '@calorie-ai/types';
import { ScreenShell, SurfaceCard, Eyebrow, HeroTitle, BodyText } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { apiClient } from '../../services/api';
import { calorieTargetService, WeeklyAdaptiveResult } from '../../services/calorie-target.service';
import { getLocalDateYmd } from '../../services/date';

const ENERGY_LABELS = ['', '😴 Rất mệt', '😐 Mệt', '😊 Bình thường', '😄 Tốt', '🔥 Xuất sắc'];

function DeltaBadge({ value, unit, lowerIsBetter = false }: { value: number | null; unit: string; lowerIsBetter?: boolean }) {
  if (value === null) return null;
  const isPositive = value > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;
  const color = value === 0 ? '#7082a9' : isGood ? '#6ee7b7' : '#fda4af';
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '—';
  return (
    <Text style={[styles.deltaBadge, { color }]}>
      {arrow} {Math.abs(value)}{unit}
    </Text>
  );
}

export default function BodyProgressScreen() {
  const [trend, setTrend] = useState<BodyProgressTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [weightKg, setWeightKg] = useState('');
  const [waistCm, setWaistCm] = useState('');
  const [hipCm, setHipCm] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [energyLevel, setEnergyLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [note, setNote] = useState('');

  const loadData = useCallback(async () => {
    try {
      const res = await apiClient.get('/body-progress/trend');
      setTrend(res.data);

      // Pre-fill form with today's entry if exists
      const todayEntry = res.data?.entries?.find(
        (e: BodyProgressEntry) => e.recorded_at === getLocalDateYmd(),
      );
      if (todayEntry) {
        setWeightKg(todayEntry.weight_kg?.toString() ?? '');
        setWaistCm(todayEntry.waist_cm?.toString() ?? '');
        setHipCm(todayEntry.hip_cm?.toString() ?? '');
        setBodyFatPct(todayEntry.body_fat_pct?.toString() ?? '');
        setEnergyLevel((todayEntry.energy_level ?? 3) as 1 | 2 | 3 | 4 | 5);
        setNote(todayEntry.note ?? '');
      }
    } catch (error) {
      console.error('Failed to load body progress:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const [preview, setPreview] = useState<WeeklyAdaptiveResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await calorieTargetService.getWeeklyAdjustmentPreview();
      setPreview(res);
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể lấy dữ liệu điều chỉnh.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApplyAdjustment = () => {
    if (!preview) return Alert.alert('Không có dữ liệu', 'Chưa có kết quả để áp dụng.');
    Alert.alert(
      'Áp dụng điều chỉnh',
      `Áp dụng mục tiêu mới ${preview.adjusted_daily_target} kcal/ngày?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Áp dụng',
          onPress: async () => {
            setSaving(true);
            try {
              const res = await calorieTargetService.applyWeeklyAdjustment();
              Alert.alert('Đã áp dụng', 'Mục tiêu đã được cập nhật.');
              setPreview(res);
              loadData();
            } catch (err) {
              Alert.alert('Lỗi', 'Không thể áp dụng điều chỉnh.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSave = async () => {
    if (!weightKg && !waistCm) {
      Alert.alert('Thiếu thông tin', 'Nhập ít nhất cân nặng hoặc vòng eo.');
      return;
    }

    setSaving(true);
    try {
      const dto: CreateBodyProgressDto = {
        recorded_at: getLocalDateYmd(),
        energy_level: energyLevel,
      };
      if (weightKg) dto.weight_kg = parseFloat(weightKg);
      if (waistCm) dto.waist_cm = parseFloat(waistCm);
      if (hipCm) dto.hip_cm = parseFloat(hipCm);
      if (bodyFatPct) dto.body_fat_pct = parseFloat(bodyFatPct);
      if (note.trim()) dto.note = note.trim();

      await apiClient.post('/body-progress', dto);
      Alert.alert('✅ Đã lưu', 'Số liệu hôm nay đã được ghi lại.');
      setShowForm(false);
      loadData();
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể lưu. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = (entry: BodyProgressEntry) => {
    Alert.alert(
      'Xoá mục nhập',
      `Xoá số liệu ngày ${entry.recorded_at}?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/body-progress/${entry.id}`);
              loadData();
            } catch {
              Alert.alert('Lỗi', 'Không thể xoá.');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6ee7b7" />
        </View>
      </ScreenShell>
    );
  }

  const latest = trend?.latest_entry;

  return (
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Eyebrow>Theo dõi cơ thể</Eyebrow>
        <HeroTitle>Tiến trình của bạn qua từng ngày</HeroTitle>
        <BodyText style={styles.heroBody}>
          Ghi lại cân nặng và số đo để thấy sự thay đổi thực sự theo thời gian.
        </BodyText>

        {/* ── Trend Summary ── */}
        {trend && trend.days_tracked > 0 && (
          <SurfaceCard style={styles.trendCard}>
            <Text style={styles.trendTitle}>📊 Tổng quan tiến trình</Text>
            <View style={styles.trendGrid}>
              <View style={styles.trendItem}>
                <Text style={styles.trendLabel}>Cân nặng HT</Text>
                <Text style={styles.trendValue}>
                  {latest?.weight_kg != null ? `${latest.weight_kg} kg` : '—'}
                </Text>
                <DeltaBadge value={trend.weight_change_7d} unit="kg" lowerIsBetter />
              </View>
              <View style={styles.trendItem}>
                <Text style={styles.trendLabel}>Vòng eo HT</Text>
                <Text style={styles.trendValue}>
                  {latest?.waist_cm != null ? `${latest.waist_cm} cm` : '—'}
                </Text>
                <DeltaBadge value={trend.waist_change_cm} unit="cm" lowerIsBetter />
              </View>
              <View style={styles.trendItem}>
                <Text style={styles.trendLabel}>Ngày ghi</Text>
                <Text style={styles.trendValue}>{trend.days_tracked}</Text>
              </View>
            </View>
            {trend.weight_change_kg !== null && (
              <Text style={styles.totalChange}>
                Tổng thay đổi cân nặng:{' '}
                <Text style={{ color: (trend.weight_change_kg ?? 0) < 0 ? '#6ee7b7' : '#fda4af' }}>
                  {(trend.weight_change_kg ?? 0) > 0 ? '+' : ''}{trend.weight_change_kg} kg
                </Text>
              </Text>
            )}
          </SurfaceCard>
        )}

        {/* ── Why This Target (Preview) ── */}
        <SurfaceCard style={styles.previewCard}>
          <Text style={styles.trendTitle}>❓ Tại sao mục tiêu này?</Text>
          <BodyText style={{ marginTop: 6 }}>Tính toán điều chỉnh dựa trên nhật ký ăn uống và cân nặng. Xem trước điều chỉnh tuần này và lý do (ActualTDEE, clamp).</BodyText>
          <View style={{ marginTop: 10 }}>
            <UiButton label={preview ? 'Làm mới' : 'Xem lý do'} onPress={fetchPreview} loading={previewLoading} />
            {preview && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.previewRow}>Phiên bản: {preview.algorithm_version}</Text>
                <Text style={styles.previewRow}>Actual TDEE: {preview.actual_tdee ?? '—'} kcal</Text>
                <Text style={styles.previewRow}>Clamp: {preview.clamp_reason ?? '—'}</Text>
                <Text style={styles.previewRow}>Mục tiêu hiện tại: {preview.original_daily_target} kcal</Text>
                <Text style={styles.previewRow}>Mục tiêu đề xuất: {preview.adjusted_daily_target} kcal ({preview.adjustment_percentage}%)</Text>
                <Text style={[styles.previewRow, { marginTop: 6 }]}>{preview.recommendation}</Text>
                <UiButton label="Áp dụng điều chỉnh" onPress={handleApplyAdjustment} loading={saving} style={{ marginTop: 8 }} />
              </View>
            )}
          </View>
        </SurfaceCard>

        {/* ── Log Today Button ── */}
        <UiButton
          label={showForm ? 'Ẩn form' : '📝 Ghi số liệu hôm nay'}
          onPress={() => setShowForm(!showForm)}
          style={styles.logButton}
        />

        {/* ── Input Form ── */}
        {showForm && (
          <SurfaceCard style={styles.formCard}>
            <Text style={styles.formTitle}>📅 Hôm nay, {new Date().toLocaleDateString('vi-VN')}</Text>

            <View style={styles.formRow}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Cân nặng (kg)</Text>
                <TextInput
                  style={styles.textInput}
                  value={weightKg}
                  onChangeText={setWeightKg}
                  keyboardType="decimal-pad"
                  placeholder="VD: 65.5"
                  placeholderTextColor="#4a6080"
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Vòng eo (cm)</Text>
                <TextInput
                  style={styles.textInput}
                  value={waistCm}
                  onChangeText={setWaistCm}
                  keyboardType="decimal-pad"
                  placeholder="VD: 78"
                  placeholderTextColor="#4a6080"
                />
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Vòng hông (cm)</Text>
                <TextInput
                  style={styles.textInput}
                  value={hipCm}
                  onChangeText={setHipCm}
                  keyboardType="decimal-pad"
                  placeholder="VD: 92"
                  placeholderTextColor="#4a6080"
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Mỡ cơ thể (%)</Text>
                <TextInput
                  style={styles.textInput}
                  value={bodyFatPct}
                  onChangeText={setBodyFatPct}
                  keyboardType="decimal-pad"
                  placeholder="VD: 22.5"
                  placeholderTextColor="#4a6080"
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Mức năng lượng hôm nay</Text>
            <View style={styles.energyRow}>
              {([1, 2, 3, 4, 5] as const).map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[styles.energyChip, energyLevel === level && styles.energyChipActive]}
                  onPress={() => setEnergyLevel(level)}
                >
                  <Text style={styles.energyLabel}>{ENERGY_LABELS[level]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Ghi chú (tuỳ chọn)</Text>
            <TextInput
              style={[styles.textInput, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="VD: Ngủ tốt, đi gym buổi sáng..."
              placeholderTextColor="#4a6080"
              multiline
            />

            <UiButton
              label="Lưu hôm nay"
              onPress={handleSave}
              loading={saving}
              style={styles.saveButton}
            />
          </SurfaceCard>
        )}

        {/* ── History List ── */}
        {trend && trend.entries.length > 0 && (
          <>
            <Text style={styles.historyTitle}>Lịch sử ({trend.entries.length} mục)</Text>
            {trend.entries.slice(0, 30).map((entry) => (
              <SurfaceCard key={entry.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>{entry.recorded_at}</Text>
                  <View style={styles.historyRight}>
                    {entry.energy_level && (
                      <Text style={styles.energyEmoji}>
                        {ENERGY_LABELS[entry.energy_level].split(' ')[0]}
                      </Text>
                    )}
                    <TouchableOpacity
                      onPress={() => handleDeleteEntry(entry)}
                      style={styles.deleteButton}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fda4af" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.metricsRow}>
                  {entry.weight_kg != null && (
                    <Text style={styles.metricChip}>⚖️ {entry.weight_kg} kg</Text>
                  )}
                  {entry.waist_cm != null && (
                    <Text style={styles.metricChip}>📏 {entry.waist_cm} cm</Text>
                  )}
                  {entry.body_fat_pct != null && (
                    <Text style={styles.metricChip}>💧 {entry.body_fat_pct}%</Text>
                  )}
                </View>
                {entry.note && <Text style={styles.historyNote}>{entry.note}</Text>}
              </SurfaceCard>
            ))}
          </>
        )}

        {trend?.days_tracked === 0 && !showForm && (
          <SurfaceCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Chưa có dữ liệu. Bắt đầu ghi lại số liệu hôm nay để theo dõi tiến trình!
            </Text>
          </SurfaceCard>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroBody: { marginBottom: 16, maxWidth: 720 },
  trendCard: { marginBottom: 14, borderColor: '#27426f', backgroundColor: '#0f1c38' },
  trendTitle: { color: '#eff6ff', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  trendGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  trendItem: { alignItems: 'center', flex: 1 },
  trendLabel: { color: '#b8c8e8', fontSize: 12, marginBottom: 4 },
  trendValue: { color: '#eff6ff', fontSize: 16, fontWeight: '700' },
  deltaBadge: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  totalChange: { color: '#b8c8e8', fontSize: 13, marginTop: 8, textAlign: 'center' },
  logButton: { marginBottom: 14 },
  formCard: { marginBottom: 14, borderColor: '#4a6080' },
  formTitle: { color: '#eff6ff', fontSize: 14, fontWeight: '700', marginBottom: 14 },
  formRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  formField: { flex: 1 },
  fieldLabel: { color: '#b8c8e8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  textInput: {
    backgroundColor: '#0d1733',
    borderColor: '#27426f',
    borderWidth: 1,
    borderRadius: 8,
    color: '#eff6ff',
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noteInput: { minHeight: 60, textAlignVertical: 'top' },
  energyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  energyChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27426f',
    backgroundColor: '#0d1733',
  },
  energyChipActive: { borderColor: '#6ee7b7', backgroundColor: '#0f2d2a' },
  energyLabel: { color: '#b8c8e8', fontSize: 11 },
  saveButton: { marginTop: 8 },
  historyTitle: { color: '#eff6ff', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  historyCard: { marginBottom: 10, borderColor: '#27426f' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  historyDate: { color: '#93c5fd', fontSize: 13, fontWeight: '600' },
  historyRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  energyEmoji: { fontSize: 18 },
  deleteButton: { padding: 4 },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricChip: { color: '#eff6ff', fontSize: 13, backgroundColor: '#0d1733', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  historyNote: { color: '#7082a9', fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  emptyCard: { borderColor: '#27426f', backgroundColor: '#101a37' },
  emptyText: { color: '#7082a9', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  previewCard: { marginBottom: 14, borderColor: '#335273', backgroundColor: '#081423' },
  previewRow: { color: '#cfe8ff', fontSize: 13, marginTop: 4 },
});
