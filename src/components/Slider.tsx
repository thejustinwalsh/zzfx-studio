import React, { useState, useCallback, useRef } from 'react';
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
}

export function Slider({ label, value, min, max, step = 1, onValueChange, formatValue }: SliderProps) {
  const trackWidth = useRef(0);
  const fraction = (value - min) / (max - min);

  const clampToStep = useCallback((raw: number) => {
    const clamped = Math.max(min, Math.min(max, raw));
    return Math.round(clamped / step) * step;
  }, [min, max, step]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        const frac = x / trackWidth.current;
        onValueChange(clampToStep(min + frac * (max - min)));
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        const frac = x / trackWidth.current;
        onValueChange(clampToStep(min + frac * (max - min)));
      },
    })
  ).current;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  }, []);

  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{displayValue}</Text>
      </View>
      <View style={styles.track} onLayout={onLayout} {...panResponder.panHandlers}>
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
