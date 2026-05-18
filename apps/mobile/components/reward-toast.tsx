import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from './theme';
import { Text } from './i18n-text';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type RewardToastData = {
  title: string;
  body?: string;
  icon?: IoniconName;
};

export function RewardToast({
  reward,
  onHide,
}: {
  reward: RewardToastData | null;
  onHide: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const useNativeDriver = Platform.OS !== 'web';
  const { colors, radii } = useAppTheme();

  useEffect(() => {
    if (!reward) return;

    setVisible(true);
    opacity.setValue(0);
    translateY.setValue(18);
    scale.setValue(0.96);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 110,
        useNativeDriver,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver,
        }),
        Animated.timing(translateY, {
          toValue: 10,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver,
        }),
      ]).start(() => {
        setVisible(false);
        onHide();
      });
    }, 1450);

    return () => clearTimeout(timer);
  }, [onHide, opacity, reward, scale, translateY, useNativeDriver]);

  if (!reward) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View pointerEvents="none" style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceSuccess,
              borderColor: colors.accentMint,
              borderRadius: radii.lg,
              opacity,
              transform: [{ translateY }, { scale }],
              ...(Platform.OS === 'web'
                ? { boxShadow: `0px 18px 34px ${colors.shadow}33` }
                : {
                    shadowColor: colors.shadow,
                    shadowOpacity: 0.2,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 10 },
                  }),
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.accentMint }]}>
            <Ionicons name={reward.icon ?? 'checkmark-circle'} size={26} color={colors.textOnAccent} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: colors.text }]}>{reward.title}</Text>
            {!!reward.body && <Text style={[styles.body, { color: colors.textSoft }]}>{reward.body}</Text>}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 102,
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 430,
    minHeight: 72,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
  },
  body: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
});
