import React, { useMemo } from 'react';
import { Canvas, Text as SkiaText, Rect, Line, vec, Fill, useFont } from '@shopify/react-native-skia';
import { Text, View, StyleSheet } from 'react-native';
import { colors, channelColors, type ChannelIndex } from '../theme/colors';

 
const monoFont = require('../../assets/JetBrainsMono-Regular.ttf');

interface TrackerGridProps {
  width: number;
  height: number;
  rows?: number;
  channels?: number;
  cursorRow?: number | null;
  data?: (string | null)[][];
}

const ROW_HEIGHT = 20;
const ROW_NUM_WIDTH = 32;
const COL_CHARS = 14;
const CHAR_WIDTH = 8.5;

/**
 * Placeholder content for the design-system preview.
 *
 * Deterministic, and built outside render. Math.random() during render is
 * impure -- the compiler refuses it, and two renders would disagree about what
 * the grid contains. A fixed pattern is also a better reference: the showcase
 * looks the same every time you open it.
 */
function buildDemoData(rows: number, channels: number): (string | null)[][] {
  const notes = ['C-4', 'D-4', 'E-4', 'F-4', 'G-4', 'A-4', 'B-4'];
  const result: (string | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: (string | null)[] = [];
    for (let ch = 0; ch < channels; ch++) {
      if (ch === 3) {
        const hit = r % 4 === 0 ? 'KCK' : r % 4 === 2 ? 'HAT' : r % 8 === 4 ? 'SNR' : null;
        row.push(hit ? `${hit} 0${ch} 80` : null);
      } else {
        // A repeating figure rather than a coin flip, so it is reproducible.
        const hasNote = (r * 3 + ch * 5) % 7 < 3;
        row.push(hasNote ? `${notes[(r + ch * 2) % notes.length]} 0${ch} --` : null);
      }
    }
    result.push(row);
  }
  return result;
}

export function TrackerGrid({
  width,
  height,
  rows = 32,
  channels = 4,
  cursorRow = null,
  data,
}: TrackerGridProps) {
  const font = useFont(monoFont, 13);
  const smallFont = useFont(monoFont, 12);

  const colWidth = Math.max((width - ROW_NUM_WIDTH) / channels, COL_CHARS * CHAR_WIDTH);
  const visibleRows = Math.min(rows, Math.floor(height / ROW_HEIGHT));

  const demoData = useMemo(() => data ?? buildDemoData(rows, channels), [data, rows, channels]);

  if (!font || !smallFont) {
    return (
      <View style={[styles.loading, { width, height }]}>
        <Text style={styles.loadingText}>Loading fonts...</Text>
      </View>
    );
  }

  return (
    <Canvas style={{ width, height }}>
      <Fill color={colors.bgGridRow} />
      {/* Row backgrounds */}
      {Array.from({ length: visibleRows }, (_, r) => {
        const y = r * ROW_HEIGHT;
        const isBeat = r % 8 === 0;
        const isCursor = r === cursorRow;
        const isAlt = r % 2 === 1;

        let bg: string = isAlt ? colors.bgGridRowAlt : colors.bgGridRow;
        if (isBeat) bg = colors.bgGridBeat;
        if (isCursor) bg = colors.bgCursor;

        return <Rect key={`bg-${r}`} x={0} y={y} width={width} height={ROW_HEIGHT} color={bg} />;
      })}

      {/* Column dividers */}
      {Array.from({ length: channels + 1 }, (_, ch) => {
        const x = ROW_NUM_WIDTH + ch * colWidth;
        return (
          <Line
            key={`div-${ch}`}
            p1={vec(x, 0)}
            p2={vec(x, visibleRows * ROW_HEIGHT)}
            color={colors.borderTrack}
            strokeWidth={1}
          />
        );
      })}

      {/* Row numbers + cell data */}
      {Array.from({ length: visibleRows }, (_, r) => {
        const y = r * ROW_HEIGHT + 14;
        const isBeat = r % 8 === 0;

        const cells = [
          <SkiaText
            key={`row-${r}`}
            x={4}
            y={y}
            text={r.toString(16).toUpperCase().padStart(2, '0')}
            font={smallFont}
            color={isBeat ? colors.textPrimary : colors.textSecondary}
          />,
        ];

        for (let ch = 0; ch < channels; ch++) {
          const x = ROW_NUM_WIDTH + ch * colWidth + 6;
          const cell = demoData[r]?.[ch];
          const chColors = channelColors[ch as ChannelIndex];

          cells.push(
            <SkiaText
              key={`cell-${r}-${ch}`}
              x={x}
              y={y}
              text={cell ?? '--- -- --'}
              font={font}
              color={cell ? chColors.primary : colors.textDim}
            />,
          );
        }

        return cells;
      }).flat()}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  loading: {
    backgroundColor: colors.bgGridRow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textDim,
    fontFamily: 'monospace',
    fontSize: 12,
  },
});
