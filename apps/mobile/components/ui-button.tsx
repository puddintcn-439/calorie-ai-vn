import React, { useRef } from 'react';
import {
  Animated,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useAppTheme } from './theme';
import { useI18n } from './i18n';
import { Text } from './i18n-text';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface UiButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function UiButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: UiButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const useNativeDriver = Platform.OS !== 'web';
  const { colors, radii } = useAppTheme();
  const { tx } = useI18n();

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const variantStyle = {
    primary: {
      backgroundColor: colors.accentMint,
      borderWidth: 1,
      borderColor: colors.borderSuccess,
    },
    secondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accentMint,
    },
    danger: {
      backgroundColor: colors.surfaceDanger,
      borderWidth: 1,
      borderColor: colors.borderDanger,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
  } satisfies Record<Variant, ViewStyle>;

  const variantTextStyle = {
    primary: { color: colors.textOnAccent },
    secondary: { color: colors.accentMint },
    danger: { color: colors.danger },
    ghost: { color: colors.accentCyan, fontWeight: '600' as const, fontSize: 14 },
  } satisfies Record<Variant, object>;

  const containerStyle = [
    styles.base,
    { borderRadius: radii.lg },
    variantStyle[variant],
    (disabled || loading) && styles.disabled,
    style,
  ];

  const textStyle = [styles.baseText, variantTextStyle[variant]];

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={containerStyle}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? colors.textOnAccent : colors.accentMint} />
        ) : (
          <Text style={textStyle}>{tx(label)}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  baseText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
