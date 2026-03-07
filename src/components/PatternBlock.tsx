import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { spacing } from '../theme/layout';

interface PatternBlockProps {
  label: string;
  active?: boolean;
  playing?: boolean;
  onPress?: () => void;
  patternColor?: string;
  labelColor?: string;
  activeColor?: string;
  activeLabelColor?: string;
  activeBorderColor?: string;
}

export function PatternBlock({
  label,
  active = false,
  playing = false,
  onPress,
  patternColor,
  labelColor,
  activeColor,
  activeLabelColor,
  activeBorderColor,
}: PatternBlockProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[
        styles.block,
        patternColor ? { backgroundColor: patternColor } : undefined,
        active && {
          backgroundColor: activeColor ?? colors.bgCursor,
          borderColor: activeBorderColor ?? colors.accentPrimary,
        },
        playing && styles.playing,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Pattern ${label}${active ? ', selected' : ''}${playing ? ', playing' : ''}`}
      accessibilityState={{ selected: active }}
    >
      <Text style={[
        styles.label,
        labelColor ? { color: labelColor } : undefined,
        active && { color: activeLabelColor ?? colors.accentPrimary },
      ]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  block: {
    width: 40,
    height: 32,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playing: {},
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackHeader,
    color: colors.textSecondary,
    fontWeight: '700',
  },
});
