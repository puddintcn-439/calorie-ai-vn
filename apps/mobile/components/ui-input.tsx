import React, { useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  TextInputProps,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useAppTheme } from './theme';
import { useI18n } from './i18n';
import { Text } from './i18n-text';
import { TextInput } from './i18n-text-input';

interface UiInputProps extends TextInputProps {
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
  error?: string;
}

export function UiInput({ label, containerStyle, error, style, ...rest }: UiInputProps) {
  const [focused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;
  const { colors, radii, spacing } = useAppTheme();
  const { tx } = useI18n();

  const handleFocus = () => {
    setFocused(true);
    Animated.timing(borderAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false,
    }).start();
    rest.onFocus?.({} as any);
  };

  const handleBlur = () => {
    setFocused(false);
    Animated.timing(borderAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
    rest.onBlur?.({} as any);
  };

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.borderSubtle, colors.accentPrimary],
  });

  return (
    <View style={[styles.wrapper, { marginBottom: spacing.md }, containerStyle]}>
      {label ? <Text style={[styles.label, { color: colors.textSoft, marginBottom: 10 }]}>{label}</Text> : null}
      <Animated.View
        style={[
          styles.inputWrap,
          {
            borderRadius: radii.lg,
            backgroundColor: focused ? colors.surfaceLifted : colors.surfaceMuted,
            borderColor,
          },
          error && { borderColor: colors.danger },
        ]}
      >
        <TextInput
          {...rest}
          style={[styles.input, { color: colors.text }, Platform.OS === 'web' && ({ outlineWidth: 0 } as any), style]}
          placeholder={typeof rest.placeholder === 'string' ? tx(rest.placeholder) : rest.placeholder}
          placeholderTextColor={colors.textMuted}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </Animated.View>
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger, marginTop: spacing.xxs }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  inputWrap: {
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 54,
    justifyContent: 'center',
  },
  input: {
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 14,
    paddingHorizontal: 17,
    textAlignVertical: 'center',
  },
  error: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
});
