import React, { useState } from 'react';
import { View, Text, TextInput, Button, ScrollView, StyleSheet, Alert } from 'react-native';
import { ScreenShell, BodyText } from '../../components/ui-shell';
import { useLogStore } from '../../store/log.store';

export default function StrengthLogScreen() {
  const { addActivity } = useLogStore();
  type LocalSet = { reps: number; weight_kg: number };
  type LocalExercise = { id: string; name: string; sets: LocalSet[]; repsInput: string; weightInput: string };

  const defaultExercise = (name = ''): LocalExercise => ({ id: String(Date.now()) + Math.random().toString(36).slice(2), name, sets: [{ reps: 5, weight_kg: 50 }], repsInput: '5', weightInput: '50' });

  const [exercises, setExercises] = useState<LocalExercise[]>([defaultExercise('Squat')]);

  const addExercise = (name?: string) => setExercises((s) => [...s, defaultExercise(name ?? '')]);
  const removeExercise = (id: string) => setExercises((s) => s.filter((e) => e.id !== id));

  const updateExerciseName = (id: string, name: string) => setExercises((s) => s.map((e) => (e.id === id ? { ...e, name } : e)));

  const addSetToExercise = (id: string) => {
    setExercises((s) =>
      s.map((e) => {
        if (e.id !== id) return e;
        const reps = Number(e.repsInput || 0);
        const weight = Number(e.weightInput || 0);
        if (!Number.isFinite(reps) || reps <= 0) return e;
        if (!Number.isFinite(weight) || weight < 0) return e;
        return { ...e, sets: [...e.sets, { reps, weight_kg: weight }], repsInput: '', weightInput: '' };
      }),
    );
  };

  const removeSetFromExercise = (id: string, idx: number) => setExercises((s) => s.map((e) => (e.id === id ? { ...e, sets: e.sets.filter((_, i) => i !== idx) } : e)));

  const setExerciseInput = (id: string, reps: string, weight: string) => setExercises((s) => s.map((e) => (e.id === id ? { ...e, repsInput: reps, weightInput: weight } : e)));

  const presets = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row'];

  const submit = async () => {
    if (exercises.length === 0) return Alert.alert('Vui lòng thêm ít nhất 1 bài tập');
    for (const e of exercises) {
      if (!e.name || e.name.trim().length === 0) return Alert.alert('Vui lòng đặt tên cho tất cả bài tập');
      if (!e.sets || e.sets.length === 0) return Alert.alert('Mỗi bài tập cần ít nhất 1 set');
    }

    const totalSets = exercises.reduce((acc, e) => acc + e.sets.length, 0);
    const duration_min = Math.max(5, Math.round(totalSets * 3));

    try {
      await addActivity({ activity_type: 'gym', duration_min, exercises: exercises.map((e) => ({ name: e.name, sets: e.sets.map((s) => ({ reps: s.reps, weight_kg: s.weight_kg })) })) } as any);
      Alert.alert('Đã lưu', 'Buổi tập đã được ghi');
      setExercises([defaultExercise('')]);
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể lưu buổi tập');
    }
  };

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Ghi buổi Strength</Text>

        <Text style={styles.label}>Presets</Text>
        <View style={styles.presetsRow}>
          {presets.map((p) => (
            <View key={p} style={{ marginRight: 8 }}>
              <Button title={p} onPress={() => addExercise(p)} />
            </View>
          ))}
        </View>

        {exercises.map((ex, idx) => (
          <View key={ex.id} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              <TextInput placeholder={`Bài tập #${idx + 1}`} value={ex.name} onChangeText={(v) => updateExerciseName(ex.id, v)} style={[styles.input, { flex: 1 }]} />
              <View style={{ marginLeft: 8 }}>
                <Button title="Xóa" onPress={() => removeExercise(ex.id)} />
              </View>
            </View>

            <Text style={styles.label}>Thêm set</Text>
            <View style={styles.row}>
              <TextInput keyboardType="number-pad" value={ex.repsInput} onChangeText={(v) => setExerciseInput(ex.id, v, ex.weightInput)} style={[styles.input, { flex: 1 }]} placeholder="Reps" />
              <TextInput keyboardType="number-pad" value={ex.weightInput} onChangeText={(v) => setExerciseInput(ex.id, ex.repsInput, v)} style={[styles.input, { flex: 1 }]} placeholder="Weight (kg)" />
              <Button title="Add" onPress={() => addSetToExercise(ex.id)} />
            </View>

            <Text style={styles.label}>Sets</Text>
            {ex.sets.map((s, i) => (
              <View key={i} style={styles.setRow}>
                <BodyText>{`Set ${i + 1}: ${s.reps} reps × ${s.weight_kg} kg`}</BodyText>
                <Button title="Remove" onPress={() => removeSetFromExercise(ex.id, i)} />
              </View>
            ))}
          </View>
        ))}

        <View style={{ marginTop: 16 }}>
          <Button title="Thêm bài tập" onPress={() => addExercise()} />
        </View>

        <View style={{ marginTop: 16 }}>
          <Button title="Save Strength Session" onPress={submit} />
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  label: { marginTop: 12, marginBottom: 6, color: '#334' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
});
