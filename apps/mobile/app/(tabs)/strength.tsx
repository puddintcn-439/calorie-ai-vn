import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell, SurfaceCard, Eyebrow, HeroTitle, BodyText } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiInput } from '../../components/ui-input';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { useLogStore } from '../../store/log.store';
import { loadPresets, savePreset as savePresetService, removePreset as removePresetService } from '../../services/presets.service';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';

type LocalSet = { reps: number; weight_kg: number };
type LocalExercise = {
  id: string;
  name: string;
  sets: LocalSet[];
  repsInput: string;
  weightInput: string;
  notes?: string;
};

const fallbackPresets = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row'];

const defaultExercise = (name = ''): LocalExercise => ({
  id: String(Date.now()) + Math.random().toString(36).slice(2),
  name,
  sets: [{ reps: 5, weight_kg: 50 }],
  repsInput: '5',
  weightInput: '50',
  notes: '',
});

export default function StrengthLogScreen() {
  useAppTheme();
  const { addActivity } = useLogStore();
  const [exercises, setExercises] = useState<LocalExercise[]>([defaultExercise('Squat')]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [presetsState, setPresetsState] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => {
    const totalSets = exercises.reduce((acc, exercise) => acc + exercise.sets.length, 0);
    const totalVolume = exercises.reduce(
      (acc, exercise) => acc + exercise.sets.reduce((setAcc, set) => setAcc + set.reps * set.weight_kg, 0),
      0,
    );
    return {
      exercises: exercises.length,
      totalSets,
      totalVolume,
      duration: Math.max(5, Math.round(totalSets * 3)),
    };
  }, [exercises]);

  useEffect(() => {
    let mounted = true;
    loadPresets()
      .then((presets) => {
        if (mounted) setPresetsState(presets);
      })
      .catch(() => {
        if (mounted) setPresetsState(fallbackPresets);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const addExercise = (name?: string) => setExercises((current) => [...current, defaultExercise(name ?? '')]);
  const removeExercise = (id: string) => setExercises((current) => current.filter((exercise) => exercise.id !== id));

  const updateExerciseName = (id: string, name: string) =>
    setExercises((current) => current.map((exercise) => (exercise.id === id ? { ...exercise, name } : exercise)));

  const updateExerciseNotes = (id: string, notes: string) =>
    setExercises((current) => current.map((exercise) => (exercise.id === id ? { ...exercise, notes } : exercise)));

  const setExerciseInput = (id: string, reps: string, weight: string) =>
    setExercises((current) => current.map((exercise) => (exercise.id === id ? { ...exercise, repsInput: reps, weightInput: weight } : exercise)));

  const addSetToExercise = (id: string) => {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== id) return exercise;
        const reps = Number(exercise.repsInput || 0);
        const weight = Number(exercise.weightInput || 0);
        if (!Number.isFinite(reps) || reps <= 0) return exercise;
        if (!Number.isFinite(weight) || weight < 0) return exercise;
        return { ...exercise, sets: [...exercise.sets, { reps, weight_kg: weight }], repsInput: '', weightInput: '' };
      }),
    );
  };

  const removeSetFromExercise = (id: string, idx: number) =>
    setExercises((current) =>
      current.map((exercise) => (exercise.id === id ? { ...exercise, sets: exercise.sets.filter((_, setIdx) => setIdx !== idx) } : exercise)),
    );

  const handleSavePreset = async (name: string) => {
    if (!name || name.trim().length === 0) {
      Alert.alert('Thiếu tên bài tập');
      return;
    }
    try {
      await savePresetService(name.trim());
      const presets = await loadPresets();
      setPresetsState(presets);
      Alert.alert('Đã lưu mẫu');
    } catch (err) {
      Alert.alert('Không lưu được mẫu', 'Vui lòng thử lại sau.');
    }
  };

  const handleRemovePreset = async (name: string) => {
    try {
      await removePresetService(name);
      const presets = await loadPresets();
      setPresetsState(presets);
    } catch (err) {
      console.warn('remove preset failed', err);
    }
  };

  const submit = async () => {
    if (exercises.length === 0) return Alert.alert('Vui lòng thêm ít nhất 1 bài tập');
    for (const exercise of exercises) {
      if (!exercise.name || exercise.name.trim().length === 0) return Alert.alert('Vui lòng đặt tên cho tất cả bài tập');
      if (!exercise.sets || exercise.sets.length === 0) return Alert.alert('Mỗi bài tập cần ít nhất 1 set');
    }

    setSaving(true);
    try {
      await addActivity({
        activity_type: 'gym',
        duration_min: stats.duration,
        notes: sessionNotes,
        exercises: exercises.map((exercise) => ({
          name: exercise.name,
          sets: exercise.sets.map((set) => ({ reps: set.reps, weight_kg: set.weight_kg })),
          notes: exercise.notes,
        })),
      } as any);
      Alert.alert('Đã lưu', 'Buổi tập đã được ghi lại.');
      setExercises([defaultExercise('')]);
      setSessionNotes('');
    } catch (err) {
      Alert.alert('Không lưu được buổi tập', 'Vui lòng thử lại sau.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell contentStyle={styles.container}>
      <Eyebrow>Tập luyện</Eyebrow>
      <HeroTitle>Ghi buổi tập tạ</HeroTitle>
      <BodyText style={styles.heroBody}>Lưu set, reps và mức tạ để nhìn rõ sức mạnh qua từng buổi.</BodyText>

      <View style={styles.statsGrid}>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>{stats.exercises}</Text>
          <Text style={styles.statLabel}>bài tập</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>{stats.totalSets}</Text>
          <Text style={styles.statLabel}>sets</Text>
        </View>
        <View style={styles.statTileWide}>
          <Text style={styles.statValue}>{Math.round(stats.totalVolume).toLocaleString('vi-VN')} kg</Text>
          <Text style={styles.statLabel}>tổng volume</Text>
        </View>
      </View>

      <SurfaceCard style={styles.formCard}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Ghi chú buổi tập</Text>
            <Text style={styles.sectionMeta}>Ước tính {stats.duration} phút</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="barbell" size={18} color={theme.colors.accentMint} />
          </View>
        </View>

        <UiInput
          value={sessionNotes}
          onChangeText={setSessionNotes}
          placeholder="Ghi chú buổi tập..."
          multiline
          style={styles.notesInput}
        />

        <Text style={styles.fieldLabel}>Mẫu bài tập</Text>
        <View style={styles.presetsRow}>
          {presetsState.map((preset) => (
            <View key={preset} style={styles.presetPill}>
              <Pressable onPress={() => addExercise(preset)} style={styles.presetName}>
                <Text style={styles.presetText}>{preset}</Text>
              </Pressable>
              <Pressable accessibilityLabel={`Xóa mẫu ${preset}`} onPress={() => handleRemovePreset(preset)} style={styles.presetRemove}>
                <Ionicons name="close" size={14} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      </SurfaceCard>

      {exercises.map((exercise, idx) => (
        <SurfaceCard key={exercise.id} style={styles.exerciseCard}>
          <View style={styles.exerciseHeader}>
            <View style={styles.exerciseTitleBlock}>
              <Text style={styles.exerciseKicker}>Bài #{idx + 1}</Text>
              <Text style={styles.exerciseTitle}>{exercise.name.trim() || 'Chưa đặt tên'}</Text>
            </View>
            <Pressable accessibilityLabel={`Xóa bài tập ${idx + 1}`} onPress={() => removeExercise(exercise.id)} style={styles.iconDangerButton}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            </Pressable>
          </View>

          <UiInput
            value={exercise.name}
            onChangeText={(value) => updateExerciseName(exercise.id, value)}
            placeholder={`Bài tập #${idx + 1}`}
            containerStyle={styles.nameInput}
          />

          <View style={styles.setComposer}>
            <UiInput
              keyboardType="number-pad"
              value={exercise.repsInput}
              onChangeText={(value) => setExerciseInput(exercise.id, value, exercise.weightInput)}
              placeholder="Reps"
              containerStyle={styles.compactInput}
            />
            <UiInput
              keyboardType="decimal-pad"
              value={exercise.weightInput}
              onChangeText={(value) => setExerciseInput(exercise.id, exercise.repsInput, value)}
              placeholder="Kg"
              containerStyle={styles.compactInput}
            />
            <Pressable onPress={() => addSetToExercise(exercise.id)} style={styles.addSetButton}>
              <Ionicons name="add" size={18} color={theme.colors.textOnAccent} />
              <Text style={styles.addSetText}>Thêm set</Text>
            </Pressable>
          </View>

          <View style={styles.setList}>
            {exercise.sets.map((set, setIdx) => (
              <View key={`${set.reps}-${set.weight_kg}-${setIdx}`} style={styles.setRow}>
                <View style={styles.setIndex}>
                  <Text style={styles.setIndexText}>{setIdx + 1}</Text>
                </View>
                <Text style={styles.setValue}>{set.reps} reps</Text>
                <Text style={styles.setValue}>{set.weight_kg} kg</Text>
                <Pressable accessibilityLabel={`Xóa set ${setIdx + 1}`} onPress={() => removeSetFromExercise(exercise.id, setIdx)} style={styles.removeSetButton}>
                  <Ionicons name="remove" size={16} color={theme.colors.accentCyan} />
                </Pressable>
              </View>
            ))}
          </View>

          <UiInput
            value={exercise.notes}
            onChangeText={(value) => updateExerciseNotes(exercise.id, value)}
            placeholder="Ghi chú bài tập..."
            multiline
            style={styles.exerciseNotesInput}
          />

          <View style={styles.exerciseActions}>
            <UiButton label="Lưu mẫu" onPress={() => handleSavePreset(exercise.name)} variant="secondary" style={styles.actionButton} />
          </View>
        </SurfaceCard>
      ))}

      <View style={styles.footerActions}>
        <UiButton label="Thêm bài tập" onPress={() => addExercise()} variant="secondary" style={styles.footerButton} />
        <UiButton label="Lưu buổi tập" onPress={submit} loading={saving} style={styles.footerButton} />
      </View>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  container: {
    paddingBottom: 96,
  },
  heroBody: {
    marginBottom: 14,
    maxWidth: 720,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statTile: {
    flex: 1,
    minHeight: 72,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    justifyContent: 'center',
  },
  statTileWide: {
    flex: 1.45,
    minHeight: 72,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceWarm,
    padding: 12,
    justifyContent: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  formCard: {
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  sectionMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSuccess,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
  },
  notesInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  fieldLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  presetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  presetName: {
    paddingVertical: 9,
    paddingLeft: 12,
    paddingRight: 8,
  },
  presetText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  presetRemove: {
    height: 34,
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  exerciseCard: {
    marginBottom: 12,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  exerciseTitleBlock: {
    flex: 1,
  },
  exerciseKicker: {
    color: colors.accentCyan,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  exerciseTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  iconDangerButton: {
    width: 38,
    height: 38,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDanger,
    backgroundColor: colors.surfaceDanger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    marginBottom: 4,
  },
  setComposer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 2,
  },
  compactInput: {
    flex: 1,
    marginBottom: 0,
  },
  addSetButton: {
    minHeight: 48,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.accentMint,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
  },
  addSetText: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontWeight: '800',
  },
  setList: {
    marginTop: 12,
    marginBottom: 4,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  setRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  setIndex: {
    width: 26,
    height: 26,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSuccess,
  },
  setIndexText: {
    color: colors.accentMint,
    fontSize: 12,
    fontWeight: '800',
  },
  setValue: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
  },
  removeSetButton: {
    width: 32,
    height: 32,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceInfo,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseNotesInput: {
    minHeight: 48,
    textAlignVertical: 'top',
  },
  exerciseActions: {
    alignItems: 'flex-start',
  },
  actionButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  footerActions: {
    gap: 10,
    marginTop: 2,
  },
  footerButton: {
    width: '100%',
  },
}));


