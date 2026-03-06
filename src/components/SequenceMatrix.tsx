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
  patternColors?: Record<string, string>;
  labelColors?: Record<string, string>;
  activeBorderColors?: Record<string, string>;
  activeLabelColors?: Record<string, string>;
}

export function SequenceMatrix({
  sequence,
  patternOrder,
  playbackPatternIdx,
  playbackRow,
  isPlaying,
  patternColors,
  labelColors,
  activeBorderColors,
  activeLabelColors,
}: SequenceMatrixProps) {
  const gap = 1;

  return (
    <View style={styles.container}>
      {sequence.map((patIdx, i) => {
        const label = patternOrder[patIdx];
        const isCurrent = isPlaying && i === playbackPatternIdx;
        const progress = isCurrent && playbackRow !== null ? playbackRow / 31 : 0;
        const borderColor = isCurrent ? (activeBorderColors?.[label] ?? colors.borderTrack) : colors.borderSubtle;
        const textColor = isCurrent ? (activeLabelColors?.[label] ?? colors.accentPrimary) : (labelColors?.[label] ?? colors.textDim);

        return (
          <View
            key={i}
            style={[
              styles.block,
              { flex: 1, marginBottom: i < sequence.length - 1 ? gap : 0 },
              patternColors?.[label] ? { backgroundColor: patternColors[label] } : undefined,
              isCurrent && { borderColor, backgroundColor: colors.bgCursor },
            ]}
          >
            <Text
              style={[styles.label, { color: textColor }]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {isCurrent && (
              <View
                style={[
                  styles.cursor,
                  {
                    top: `${progress * 100}%` as any,
                    backgroundColor: borderColor,
                  },
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
  label: {
    fontFamily: fonts.mono,
    fontSize: 5,
    fontWeight: '700',
  },
  cursor: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.45,
  },
});
