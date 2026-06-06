import React, { useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
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
  accessibilityLabel?: string;
  testID?: string;
}

export function UiButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
  testID,
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
      borderColor: colors.accentMint,
    },
    secondary: {
      backgroundColor: colors.surfaceLifted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    danger: {
      backgroundColor: colors.surfaceDanger,
      borderWidth: 1,
      borderColor: colors.borderDanger,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: 'transparent',
    },
  } satisfies Record<Variant, ViewStyle>;

  const variantTextStyle = {
    primary: { color: colors.textOnAccent },
    secondary: { color: colors.text },
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
  const translatedLabel = tx(label);
  const resolvedTestID = testID ?? `${label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}-button`;
  const webAccessibilityProps = Platform.OS === 'web'
    ? ({
        role: 'button',
        'aria-label': accessibilityLabel ?? translatedLabel,
      } as any)
    : {};

  return (
    <Animated.View
      style={[
        styles.shadowWrap,
        variant === 'primary' && Platform.OS === 'web' ? { boxShadow: `0px 10px 18px ${colors.accentMint}24` } : null,
        { transform: [{ scale }] },
      ]}
    >
      <Pressable
        style={containerStyle}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? translatedLabel}
        accessibilityState={{ disabled: disabled || loading }}
        testID={resolvedTestID}
        {...webAccessibilityProps}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <View style={[styles.loadingDot, { backgroundColor: variant === 'primary' ? colors.textOnAccent : colors.accentMint }]} />
            <View style={[styles.loadingDot, { backgroundColor: variant === 'primary' ? colors.textOnAccent : colors.accentMint, opacity: 0.72 }]} />
            <View style={[styles.loadingDot, { backgroundColor: variant === 'primary' ? colors.textOnAccent : colors.accentMint, opacity: 0.48 }]} />
          </View>
        ) : (
          <Text style={textStyle}>{translatedLabel}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  disabled: {
    opacity: 0.5,
  },
  baseText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  shadowWrap: {
    borderRadius: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 20,
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
