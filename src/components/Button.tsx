import React, { useCallback, useRef } from 'react';
import { Pressable, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { spacing } from '../theme/layout';

export type ButtonVariant = 'transport' | 'action' | 'generate' | 'icon' | 'destructive';

interface ButtonProps {
  label: string;
  variant?: ButtonVariant;
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

const variantStyles: Record<ButtonVariant, { bg: string; bgActive: string; text: string }> = {
  transport: { bg: colors.bgElevated, bgActive: colors.accentPlay, text: colors.textPrimary },
  action: { bg: colors.bgElevated, bgActive: colors.accentPrimary, text: colors.textPrimary },
  generate: { bg: colors.accentGenerate, bgActive: colors.accentGenerate, text: '#FFFFFF' },
  icon: { bg: 'transparent', bgActive: colors.bgElevated, text: colors.textSecondary },
  destructive: { bg: colors.bgElevated, bgActive: colors.accentStop, text: colors.accentStop },
};

export function Button({ label, variant = 'action', active = false, disabled = false, onPress, style }: ButtonProps) {
  const v = variantStyles[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: active ? v.bgActive : v.bg,
          opacity: pressed ? 0.7 : disabled ? 0.4 : 1,
          borderColor: active ? v.bgActive : colors.borderSubtle,
        },
        variant === 'icon' && styles.iconSize,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: active && variant === 'transport' ? colors.bgPrimary : v.text,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  iconSize: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 28,
    borderWidth: 0,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
