import React, { ComponentProps, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleProp, ViewStyle } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

export type IconMotion = 'none' | 'pulse' | 'float' | 'wiggle' | 'spin';

type AnimatedIconBaseProps = {
  size: number;
  color: string;
  motion?: IconMotion;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

function useMotionStyle(motion: IconMotion, active: boolean) {
  const progress = useRef(new Animated.Value(0)).current;
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);

    if (!active || motion === 'none') return;

    const duration = motion === 'spin' ? 1500 : 880;
    const animation = motion === 'spin'
      ? Animated.loop(
          Animated.timing(progress, {
            toValue: 1,
            duration,
            easing: Easing.linear,
            useNativeDriver,
          }),
        )
      : Animated.loop(
          Animated.sequence([
            Animated.timing(progress, {
              toValue: 1,
              duration,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver,
            }),
            Animated.timing(progress, {
              toValue: 0,
              duration,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver,
            }),
          ]),
        );

    animation.start();
    return () => animation.stop();
  }, [active, motion, progress, useNativeDriver]);

  if (!active || motion === 'none') return undefined;

  if (motion === 'pulse') {
    return {
      transform: [
        {
          scale: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.14],
          }),
        },
      ],
    };
  }

  if (motion === 'float') {
    return {
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -4],
          }),
        },
      ],
    };
  }

  if (motion === 'wiggle') {
    return {
      transform: [
        {
          rotate: progress.interpolate({
            inputRange: [0, 1],
            outputRange: ['-5deg', '5deg'],
          }),
        },
      ],
    };
  }

  return {
    transform: [
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        }),
      },
    ],
  };
}

export function AnimatedIonicon({
  name,
  size,
  color,
  motion = 'pulse',
  active = true,
  style,
}: AnimatedIconBaseProps & { name: IoniconName }) {
  const motionStyle = useMotionStyle(motion, active);
  return (
    <Animated.View style={[style, motionStyle]}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

export function AnimatedMaterialIcon({
  name,
  size,
  color,
  motion = 'pulse',
  active = true,
  style,
}: AnimatedIconBaseProps & { name: MaterialIconName }) {
  const motionStyle = useMotionStyle(motion, active);
  return (
    <Animated.View style={[style, motionStyle]}>
      <MaterialIcons name={name} size={size} color={color} />
    </Animated.View>
  );
}
