import React, { useCallback } from 'react';
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends PressableProps {
  animateScale?: boolean;
}

export function AnimatedPressable({
  animateScale = true,
  onPressIn,
  onPressOut,
  style,
  children,
  ...rest
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const handlePressIn = useCallback(
    (e: any) => {
      if (animateScale) {
        scale.set(withTiming(0.96, { duration: 80 }));
      }
      onPressIn?.(e);
    },
    [animateScale, onPressIn],
  );

  const handlePressOut = useCallback(
    (e: any) => {
      if (animateScale) {
        scale.set(withSpring(1, { damping: 15, stiffness: 200 }));
      }
      onPressOut?.(e);
    },
    [animateScale, onPressOut],
  );

  return (
    <AnimatedPressableBase
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style as StyleProp<ViewStyle>, animatedStyle]}
    >
      {children}
    </AnimatedPressableBase>
  );
}
