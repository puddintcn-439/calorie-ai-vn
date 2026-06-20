import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleProp, StyleSheet, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useI18n } from './i18n';
import { Text } from './i18n-text';
import { useAppTheme } from './theme';

export type PortionPreset = {
  id: string;
  label: string;
  value: number;
};

type PortionInputProps = {
  value: number;
  onChange: (value: number) => void;
  unit?: 'g' | 'ml';
  label?: string;
  presets?: PortionPreset[];
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const GRAM_PRESETS: PortionPreset[] = [
  { id: '50g', label: '50 g', value: 50 },
  { id: '100g', label: '100 g', value: 100 },
  { id: 'bowl', label: '1 tô', value: 350 },
  { id: 'piece', label: '1 cái', value: 100 },
];

const ML_PRESETS: PortionPreset[] = [
  { id: '100ml', label: '100 ml', value: 100 },
  { id: '250ml', label: '250 ml', value: 250 },
  { id: 'cup', label: '1 cốc', value: 240 },
  { id: 'glass', label: '1 ly', value: 300 },
];

function sanitizePositiveNumber(value: string) {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const [whole, ...decimal] = normalized.split('.');
  return decimal.length > 0 ? `${whole}.${decimal.join('')}` : whole;
}

export function PortionInput({
  value,
  onChange,
  unit = 'g',
  label = 'screen.components.portionInput.label',
  presets,
  compact = false,
  style,
  testID = 'portion-input',
}: PortionInputProps) {
  const { colors, radii, spacing, layout } = useAppTheme();
  const { tx } = useI18n();
  const [draft, setDraft] = useState(String(Math.max(1, Math.round(value || 1))));
  const options = useMemo(() => presets ?? (unit === 'ml' ? ML_PRESETS : GRAM_PRESETS), [presets, unit]);

  useEffect(() => {
    setDraft(String(Math.max(1, Math.round(value || 1))));
  }, [value]);

  const commit = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next <= 0) {
      setDraft(String(Math.max(1, Math.round(value || 1))));
      return;
    }
    onChange(next);
  };

  const adjust = (delta: number) => {
    onChange(Math.max(1, Math.round((value || 1) + delta)));
  };

  return (
    <View style={[styles.root, { gap: spacing.xs }, style]} testID={`${testID}-root`}>
      <Text style={[styles.label, { color: colors.textSoft }]}>{label}</Text>

      <View style={[styles.controlRow, { gap: spacing.xs }]}>
        <TouchableOpacity
          style={[styles.stepper, { minWidth: layout.minTouchTarget, minHeight: layout.minTouchTarget, borderRadius: radii.lg, borderColor: colors.borderStrong, backgroundColor: colors.neutralBackground }]}
          onPress={() => adjust(-10)}
          accessibilityRole="button"
          accessibilityLabel={tx('screen.components.portionInput.decrease')}
          testID={`${testID}-decrease`}
        >
          <Ionicons name="remove" size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={[styles.inputWrap, { minHeight: layout.minTouchTarget, borderRadius: radii.lg, borderColor: colors.borderStrong, backgroundColor: colors.surfaceLifted }]}>
          <TextInput
            value={draft}
            onChangeText={(text) => {
              const next = sanitizePositiveNumber(text);
              setDraft(next);
              const parsed = Number(next);
              if (Number.isFinite(parsed) && parsed > 0) onChange(parsed);
            }}
            onBlur={() => commit(draft)}
            keyboardType="decimal-pad"
            inputMode="decimal"
            style={[styles.input, { color: colors.text }]}
            accessibilityLabel={`${tx(label)} (${unit})`}
            testID={`${testID}-field`}
          />
          <Text style={[styles.unit, { color: colors.textMuted }]}>{unit}</Text>
        </View>

        <TouchableOpacity
          style={[styles.stepper, { minWidth: layout.minTouchTarget, minHeight: layout.minTouchTarget, borderRadius: radii.lg, borderColor: colors.borderStrong, backgroundColor: colors.neutralBackground }]}
          onPress={() => adjust(10)}
          accessibilityRole="button"
          accessibilityLabel={tx('screen.components.portionInput.increase')}
          testID={`${testID}-increase`}
        >
          <Ionicons name="add" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {!compact ? (
        <View style={[styles.presets, { gap: spacing.xs }]}>
          {options.map((option) => {
            const selected = Math.round(value) === option.value;
            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.preset,
                  {
                    minHeight: 44,
                    borderRadius: radii.lg,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.surfaceSuccess : colors.neutralBackground,
                  },
                ]}
                onPress={() => onChange(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`${testID}-preset-${option.id}`}
              >
                <Text style={[styles.presetText, { color: selected ? colors.text : colors.textSoft }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepper: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  inputWrap: {
    flex: 1,
    minWidth: 112,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    paddingRight: 16,
    fontSize: 13,
    fontWeight: '800',
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  preset: {
    flexGrow: 1,
    minWidth: 72,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
