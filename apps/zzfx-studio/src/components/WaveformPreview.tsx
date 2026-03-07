import React, { useMemo, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import { Canvas, Path, Line, vec, Fill } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { colors } from '../theme/colors';

interface WaveformPreviewProps {
  height: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  color?: string;
  progress?: SharedValue<number | null>;
}

const OFFSCREEN = -100;

export const WaveformPreview = React.memo(function WaveformPreview({
  height,
  attack,
  decay,
  sustain,
  release,
  color = colors.accentPrimary,
  progress,
}: WaveformPreviewProps) {
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };
  const padding = 4;
  const w = width - padding * 2;
  const h = height - padding * 2;

  // Fallback shared value when no progress is provided
  const nullProgress = useSharedValue<number | null>(null);
  const activeProgress = progress ?? nullProgress;

  const pathStr = useMemo(() => {
    const total = attack + decay + sustain + release;
    if (total <= 0) return '';

    const ax = padding + (attack / total) * w;
    const dx = ax + (decay / total) * w;
    const sx = dx + (sustain / total) * w;
    const rx = sx + (release / total) * w;

    const sustainY = padding + h * 0.4;
    const bottom = padding + h;
    const top = padding;

    return `M ${padding} ${bottom} L ${ax} ${top} L ${dx} ${sustainY} L ${sx} ${sustainY} L ${rx} ${bottom}`;
  }, [attack, decay, sustain, release, w, h, padding]);

  const fillPathStr = pathStr ? `${pathStr} L ${padding} ${padding + h} Z` : '';

  // Derive cursor X from shared value — animates on UI thread without React re-renders
  const cursorX = useDerivedValue(() => {
    const p = activeProgress.value;
    if (p == null || w <= 0) return OFFSCREEN;
    return padding + Math.max(0, Math.min(1, p)) * w;
  }, [w, padding]);

  const cursorP1 = useDerivedValue(() => vec(cursorX.value, padding), [padding]);
  const cursorP2 = useDerivedValue(() => vec(cursorX.value, padding + h), [h, padding]);

  if (!pathStr) return <View onLayout={onLayout} style={{ width: '100%', height }} />;

  return (
    <View onLayout={onLayout} style={{ width: '100%', height }}>
      {width > 0 && (
        <Canvas style={{ width, height }}>
          <Fill color={colors.bgSurface} />
          <Path path={fillPathStr} color={color} opacity={0.15} />
          <Path path={pathStr} color={color} style="stroke" strokeWidth={1.5} />
          <Line
            p1={vec(padding, padding + h)}
            p2={vec(padding + w, padding + h)}
            color={colors.borderSubtle}
            strokeWidth={1}
          />
          <Line
            p1={cursorP1}
            p2={cursorP2}
            color={color}
            strokeWidth={1}
          />
        </Canvas>
      )}
    </View>
  );
});
