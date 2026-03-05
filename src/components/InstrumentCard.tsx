import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, channelColors, type ChannelIndex } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { spacing } from '../theme/layout';
import { WaveformPreview } from './WaveformPreview';

const SHAPE_NAMES: Record<number, string> = {
  0: 'SIN',
  1: 'TRI',
  2: 'SAW',
  3: 'TAN',
  4: 'NSE',
  5: 'SQR',
};

const CHANNEL_LABELS = ['LEAD', 'HARM', 'BASS', 'DRUM'];

interface InstrumentCardProps {
  channelIndex: ChannelIndex;
  params: number[];
  onPreview: () => void;
  onRegenerate: () => void;
}

export function InstrumentCard({
  channelIndex,
  params,
  onPreview,
  onRegenerate,
}: InstrumentCardProps) {
  const chColor = channelColors[channelIndex].primary;
  const shape = params[6] ?? 0;
  const attack = params[3] ?? 0;
  const decay = params[18] ?? 0;
  const sustain = params[4] ?? 0;
  const release = params[5] ?? 0;

  return (
    <View style={styles.card}>
      {/* Color bar */}
      <View style={[styles.colorBar, { backgroundColor: chColor }]} />

      <View style={styles.content}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={[styles.channelLabel, { color: chColor }]}>
            {CHANNEL_LABELS[channelIndex]}
          </Text>
          <Text style={styles.shapeLabel}>{SHAPE_NAMES[shape] ?? '???'}</Text>
        </View>

        {/* ADSR preview */}
        <WaveformPreview
          height={28}
          attack={attack}
          decay={decay}
          sustain={sustain}
          release={release}
          color={chColor}
        />

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <Pressable
            onPress={onPreview}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          >
            <Text style={[styles.btnText, { color: chColor }]}>PLAY</Text>
          </Pressable>
          <Pressable
            onPress={onRegenerate}
            style={({ pressed }) => [styles.btnRegen, pressed && styles.btnPressed]}
          >
            <Text style={styles.btnRegenText}>R</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  colorBar: {
    height: 3,
  },
  content: {
    padding: spacing.sm,
    gap: spacing.xs,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    justifyContent: 'space-between',
  },
  channelLabel: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  shapeLabel: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textDim,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    width: '100%',
    alignItems: 'center',
  },
  btn: {
    flex: 1,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  btnPressed: {
    opacity: 0.6,
  },
  btnText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '600',
  },
  btnRegen: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.accentGenerate,
  },
  btnRegenText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    color: colors.accentGenerate,
  },
});
