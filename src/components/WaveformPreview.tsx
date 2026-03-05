import React, { useMemo, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import { Canvas, Path, Line, vec, Fill } from '@shopify/react-native-skia';
import { colors } from '../theme/colors';

interface WaveformPreviewProps {
  height: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  color?: string;
}

export function WaveformPreview({
  height,
  attack,
  decay,
  sustain,
  release,
  color = colors.accentPrimary,
}: WaveformPreviewProps) {
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };
  const padding = 4;
  const w = width - padding * 2;
  const h = height - padding * 2;

  const pathStr = useMemo(() => {
    const total = attack + decay + sustain + release;
    if (total <= 0) return '';

    const ax = padding + (attack / total) * w;
    const dx = ax + (decay / total) * w;
    const sx = dx + (sustain / total) * w;
    const rx = sx + (release / total) * w;

    const sustainY = padding + h * 0.4; // sustain at 60% level
    const bottom = padding + h;
    const top = padding;

    return `M ${padding} ${bottom} L ${ax} ${top} L ${dx} ${sustainY} L ${sx} ${sustainY} L ${rx} ${bottom}`;
  }, [attack, decay, sustain, release, w, h, padding]);

  const fillPathStr = pathStr ? `${pathStr} L ${padding} ${padding + h} Z` : '';

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
        </Canvas>
      )}
    </View>
  );
}
