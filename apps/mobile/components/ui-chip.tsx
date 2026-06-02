import React, { useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp
} from 'react-native';
import { useAppTheme } from './theme';
import { Text } from './i18n-text';

interface UiChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export function UiChip({ label, selected, onPress, style }: UiChipProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const useNativeDriver = Platform.OS !== 'web';
  const { colors, radii } = useAppTheme();

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.94,
      useNativeDriver,
      speed: 60,
      bounciness: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver,
      speed: 60,
      bounciness: 6,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        style={[
          styles.chip,
          {
            borderRadius: radii.lg,
            backgroundColor: selected ? colors.accentMint : colors.surfaceMuted,
            borderColor: selected ? colors.accentMint : colors.borderSubtle,
          },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Text style={[styles.label, { color: selected ? colors.textOnAccent : colors.textSoft }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
  },
});
