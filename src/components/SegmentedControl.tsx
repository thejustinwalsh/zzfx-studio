import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { spacing } from '../theme/layout';

interface SegmentedControlProps<T extends string> {
  options: readonly T[];
  value: T;
  onSelect: (value: T) => void;
  accentColor?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onSelect,
  accentColor = colors.accentGenerate,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.container}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            style={({ pressed }) => [
              styles.segment,
              active && { backgroundColor: accentColor },
              pressed && styles.pressed,
            ]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelActive: {
    color: '#FFFFFF',
  },
});
