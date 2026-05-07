import React, { useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { theme } from './theme';

interface UiInputProps extends TextInputProps {
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
  error?: string;
}

export function UiInput({ label, containerStyle, error, style, ...rest }: UiInputProps) {
  const [focused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;

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
    outputRange: [theme.colors.border, theme.colors.accentMint],
  });

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Animated.View style={[styles.inputWrap, { borderColor }, error && styles.inputWrapError]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />
      </Animated.View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  label: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  inputWrap: {
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#121d3f',
    overflow: 'hidden',
  },
  inputWrapError: {
    borderColor: theme.colors.danger,
  },
  input: {
    color: theme.colors.text,
    fontSize: 15,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  error: {
    color: theme.colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
});
