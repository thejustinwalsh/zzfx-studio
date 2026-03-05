import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import type { PatternLabel } from '../engine/types';

interface SequenceMatrixProps {
  sequence: number[];
  patternOrder: PatternLabel[];
  playbackPatternIdx: number;
  playbackRow: number | null;
  isPlaying: boolean;
}

export function SequenceMatrix({
  sequence,
  patternOrder,
  playbackPatternIdx,
  playbackRow,
  isPlaying,
}: SequenceMatrixProps) {
  const gap = 1;
  const totalGaps = (sequence.length - 1) * gap;

  return (
    <View style={styles.container}>
      {sequence.map((patIdx, i) => {
        const label = patternOrder[patIdx];
        const isCurrent = isPlaying && i === playbackPatternIdx;
        const progress = isCurrent && playbackRow !== null ? playbackRow / 31 : 0;

        return (
          <View
            key={i}
            style={[
              styles.block,
              { flex: 1, marginBottom: i < sequence.length - 1 ? gap : 0 },
              isCurrent && styles.blockActive,
            ]}
          >
            <Text
              style={[
                styles.label,
                isCurrent && styles.labelActive,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {isCurrent && (
              <View
                style={[
                  styles.cursor,
                  { top: `${progress * 100}%` as any },
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 36,
  },
  block: {
    width: 36,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  blockActive: {
    borderColor: colors.borderTrack,
    backgroundColor: colors.bgCursor,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 5,
    color: colors.textDim,
    fontWeight: '700',
  },
  labelActive: {
    color: colors.accentPrimary,
  },
  cursor: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.accentPrimary,
    opacity: 0.45,
  },
});
