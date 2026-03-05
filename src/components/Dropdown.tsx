import React, { useState, useCallback } from 'react';
import { Pressable, Text, View, StyleSheet, Modal, FlatList } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { spacing } from '../theme/layout';

interface DropdownProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onSelect: (value: T) => void;
}

export function Dropdown<T extends string>({ label, value, options, onSelect }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback((item: T) => {
    onSelect(item);
    setOpen(false);
  }, [onSelect]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.arrow}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuLabel}>{label}</Text>
            {options.map((opt) => (
              <Pressable
                key={opt}
                style={({ pressed }) => [
                  styles.option,
                  opt === value && styles.optionActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => handleSelect(opt)}
              >
                <Text style={[styles.optionText, opt === value && styles.optionTextActive]}>
                  {opt}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  value: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
    textTransform: 'uppercase',
  },
  arrow: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    minWidth: 200,
    maxWidth: 300,
    padding: spacing.sm,
  },
  menuLabel: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  option: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  optionActive: {
    backgroundColor: colors.bgElevated,
    borderLeftWidth: 2,
    borderLeftColor: colors.accentPrimary,
  },
  optionText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  optionTextActive: {
    color: colors.accentPrimary,
  },
});
