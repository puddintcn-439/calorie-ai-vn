import React, { useState } from 'react';
import { View, Text, TextInput, Button, ScrollView, StyleSheet, Alert } from 'react-native';
import { ScreenShell, BodyText } from '../../components/ui-shell';
import { useLogStore } from '../../store/log.store';

export default function StrengthLogScreen() {
  const { addActivity } = useLogStore();
  const [exerciseName, setExerciseName] = useState('Squat');
  const [sets, setSets] = useState<Array<{ reps: number; weight_kg: number }>>([
    { reps: 5, weight_kg: 100 },
  ]);
  const [repsInput, setRepsInput] = useState('5');
  const [weightInput, setWeightInput] = useState('100');

  const addSet = () => {
    const reps = Number(repsInput || 0);
    const weight = Number(weightInput || 0);
    if (!Number.isFinite(reps) || reps <= 0) return Alert.alert('Invalid reps');
    if (!Number.isFinite(weight) || weight < 0) return Alert.alert('Invalid weight');
    setSets((s) => [...s, { reps, weight_kg: weight }]);
  };

  const removeSet = (idx: number) => setSets((s) => s.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!exerciseName) return Alert.alert('Tên bài tập trống');
    if (sets.length === 0) return Alert.alert('Vui lòng thêm ít nhất 1 set');

    const duration_min = Math.max(5, Math.round(sets.length * 3));

    try {
      await addActivity({
        activity_type: 'gym',
        duration_min,
        exercises: [
          {
            name: exerciseName,
            sets: sets.map((s) => ({ reps: s.reps, weight_kg: s.weight_kg })),
          },
        ],
      } as any);
      Alert.alert('Đã lưu', 'Buổi tập đã được ghi');
      setExerciseName('');
      setSets([]);
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể lưu buổi tập');
    }
  };

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Ghi buổi Strength</Text>

        <Text style={styles.label}>Tên bài tập</Text>
        <TextInput value={exerciseName} onChangeText={setExerciseName} style={styles.input} />

        <Text style={styles.label}>Thêm set</Text>
        <View style={styles.row}>
          <TextInput keyboardType="number-pad" value={repsInput} onChangeText={setRepsInput} style={[styles.input, { flex: 1 }]} placeholder="Reps" />
          <TextInput keyboardType="number-pad" value={weightInput} onChangeText={setWeightInput} style={[styles.input, { flex: 1 }]} placeholder="Weight (kg)" />
          <Button title="Add" onPress={addSet} />
        </View>

        <Text style={styles.label}>Sets</Text>
        {sets.map((s, i) => (
          <View key={i} style={styles.setRow}>
            <BodyText>{`Set ${i + 1}: ${s.reps} reps × ${s.weight_kg} kg`}</BodyText>
            <Button title="Remove" onPress={() => removeSet(i)} />
          </View>
        ))}

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
