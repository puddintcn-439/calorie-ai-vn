import React, { useRef, useState } from 'react';
import {
  Animated,
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
  const { colors, radii } = useAppTheme();
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
    outputRange: [colors.border, colors.accentMint],
  });

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={[styles.label, { color: colors.textSoft }]}>{label}</Text> : null}
      <Animated.View
        style={[
          styles.inputWrap,
          {
            borderRadius: radii.lg,
            backgroundColor: colors.surfaceAlt,
            borderColor,
          },
          error && { borderColor: colors.danger },
        ]}
      >
        <TextInput
          {...rest}
          style={[styles.input, { color: colors.text }, style]}
          placeholder={typeof rest.placeholder === 'string' ? tx(rest.placeholder) : rest.placeholder}
          placeholderTextColor={colors.textMuted}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </Animated.View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  inputWrap: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    fontSize: 15,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  error: {
    fontSize: 12,
    marginTop: 4,
  },
});
