import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { spacing } from '../theme/layout';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  formatValue?: (value: number) => string;
  compact?: boolean;
}

export function Slider({ label, value, min, max, step = 1, onValueChange, formatValue, compact }: SliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const fraction = (value - min) / (max - min);

  const clampToStep = useCallback((raw: number) => {
    const clamped = Math.max(min, Math.min(max, raw));
    return Math.round(clamped / step) * step;
  }, [min, max, step]);

  /**
   * The responder closes over the props it needs and is rebuilt when they
   * change.
   *
   * It used to be built once inside a ref, which captured the first
   * onValueChange, min and max and kept calling those forever — a slider whose
   * handler or range changed silently went on reporting the old one. Width is
   * state rather than a ref for the same reason it is now correct: nothing here
   * reads a ref while rendering, so the compiler can optimise the component.
   * Width only changes on layout, so rebuilding costs nothing.
   */
  const panResponder = useMemo(() => {
    const commit = (x: number) => {
      onValueChange(clampToStep(min + (x / (trackWidth || 1)) * (max - min)));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => commit(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => commit(evt.nativeEvent.locationX),
    });
  }, [onValueChange, clampToStep, min, max, trackWidth]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const displayValue = formatValue ? formatValue(value) : String(value);

  if (compact) {
    return (
      <View style={styles.wrapperCompact}>
        <Text style={styles.labelCompact}>{label}</Text>
        <View style={styles.trackCompact} onLayout={onLayout} {...panResponder.panHandlers}>
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
          <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
        </View>
        <Text style={styles.valueCompact}>{displayValue}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{displayValue}</Text>
      </View>
      <View
        style={styles.track}
        onLayout={onLayout}
        {...panResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: displayValue }}
      >
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  wrapperCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  labelCompact: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trackCompact: {
    height: 16,
    width: 60,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  valueCompact: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    color: colors.accentPrimary,
    fontWeight: '700',
    minWidth: 28,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    fontFamily: fonts.mono,
    fontSize: fontSize.bpmDisplay,
    color: colors.accentPrimary,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'right',
  },
  track: {
    height: 20,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accentPrimary,
    opacity: 0.3,
  },
  thumb: {
    position: 'absolute',
    width: 3,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accentPrimary,
    marginLeft: -1,
  },
});
