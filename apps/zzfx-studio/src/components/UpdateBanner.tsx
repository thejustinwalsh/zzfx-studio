import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, fonts, fontSize, spacing } from '../theme';
import { isNeu } from '../platform';
import { useServiceWorkerUpdate, applyUpdate, dismissUpdate } from '../sw-register';

export function UpdateBanner() {
  const { hasUpdate, version } = useServiceWorkerUpdate();

  if (isNeu()) return null;
  const translateY = useSharedValue(60);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (hasUpdate) {
      // Slide up after a short delay so it doesn't fight the initial render
      translateY.value = withDelay(400, withTiming(0, { duration: 250 }));
      opacity.value = withDelay(400, withTiming(1, { duration: 250 }));
    } else {
      translateY.value = 60;
      opacity.value = 0;
    }
  }, [hasUpdate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!hasUpdate) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.indicator} />
      <Text style={styles.text}>{version ? `v${version} READY` : 'UPDATE READY'}</Text>
      <View style={styles.actions}>
        <AnimatedPressable
          onPress={applyUpdate}
          style={styles.updateBtn}
          accessibilityRole="button"
          accessibilityLabel="Update to new version"
        >
          <Text style={styles.updateText}>RELOAD</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={dismissUpdate}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update notification"
        >
          <Text style={styles.dismissText}>×</Text>
        </AnimatedPressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPlay,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    zIndex: 9999,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentPlay,
  },
  text: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  updateBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.accentPlay,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  updateText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.accentPlay,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dismissBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.textDim,
    lineHeight: 14,
  },
});
