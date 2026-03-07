import React, { useMemo, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { colors } from '../theme/colors';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      svg: React.SVGProps<SVGSVGElement>;
      rect: React.SVGProps<SVGRectElement>;
      path: React.SVGProps<SVGPathElement>;
      line: React.SVGProps<SVGLineElement>;
    }
  }
}

interface WaveformPreviewProps {
  height: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  color?: string;
  progress?: SharedValue<number | null>;
}

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

  const nullProgress = useSharedValue<number | null>(null);
  const activeProgress = progress ?? nullProgress;

  const { pathStr, fillPathStr } = useMemo(() => {
    const total = attack + decay + sustain + release;
    if (total <= 0) return { pathStr: '', fillPathStr: '' };

    const ax = padding + (attack / total) * w;
    const dx = ax + (decay / total) * w;
    const sx = dx + (sustain / total) * w;
    const rx = sx + (release / total) * w;

    const sustainY = padding + h * 0.4;
    const bottom = padding + h;
    const top = padding;

    const p = `M ${padding} ${bottom} L ${ax} ${top} L ${dx} ${sustainY} L ${sx} ${sustainY} L ${rx} ${bottom}`;
    return { pathStr: p, fillPathStr: `${p} Z` };
  }, [attack, decay, sustain, release, w, h, padding]);

  const cursorX = useDerivedValue(() => {
    const p = activeProgress.value;
    if (p == null || w <= 0) return -100;
    return padding + Math.max(0, Math.min(1, p)) * w;
  }, [w, padding]);

  const cursorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cursorX.value }],
  }));

  if (!pathStr) return <View onLayout={onLayout} style={{ width: '100%', height }} />;

  return (
    <View onLayout={onLayout} style={{ width: '100%', height, position: 'relative' }}>
      {width > 0 && (
        <>
          <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
            <rect width={width} height={height} fill={colors.bgSurface} />
            <path d={fillPathStr} fill={color} opacity={0.15} />
            <path d={pathStr} fill="none" stroke={color} strokeWidth={1.5} />
            <line
              x1={padding} y1={padding + h}
              x2={padding + w} y2={padding + h}
              stroke={colors.borderSubtle} strokeWidth={1}
            />
          </svg>
          <Animated.View style={[
            {
              position: 'absolute',
              top: padding,
              left: 0,
              width: 1,
              height: h,
              backgroundColor: color,
            },
            cursorStyle,
          ]} />
        </>
      )}
    </View>
  );
});
