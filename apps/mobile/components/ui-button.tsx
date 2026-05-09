import React, { useRef } from 'react';
import {
  Animated,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { theme } from './theme';

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

  const containerStyle = [
    styles.base,
    styles[variant],
    (disabled || loading) && styles.disabled,
    style,
  ];

  const textStyle = [styles.baseText, styles[`${variant}Text` as keyof typeof styles]];

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
          <ActivityIndicator color={variant === 'primary' ? '#07111f' : theme.colors.accentMint} />
        ) : (
          <Text style={textStyle}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: theme.colors.accentMint,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: theme.colors.accentMint,
  },
  danger: {
    backgroundColor: '#1a0a0a',
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },
  baseText: {
    fontSize: 16,
    fontWeight: '800',
  },
  primaryText: {
    color: '#07111f',
  },
  secondaryText: {
    color: theme.colors.accentMint,
  },
  dangerText: {
    color: theme.colors.danger,
  },
  ghostText: {
    color: theme.colors.accentCyan,
    fontWeight: '600',
    fontSize: 14,
  },
});
