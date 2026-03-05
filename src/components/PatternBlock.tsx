import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { spacing } from '../theme/layout';

interface PatternBlockProps {
  label: string;
  active?: boolean;
  playing?: boolean;
  onPress?: () => void;
}

export function PatternBlock({ label, active = false, playing = false, onPress }: PatternBlockProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.block,
        active && styles.active,
        playing && styles.playing,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
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
  active: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.bgCursor,
  },
  playing: {},
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackHeader,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  labelActive: {
    color: colors.accentPrimary,
  },
});
