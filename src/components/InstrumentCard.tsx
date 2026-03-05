import React, { useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, PanResponder } from 'react-native';
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
  volume: number;
  onVolumeChange: (volume: number) => void;
  onPreview: () => void;
  onRegenerate: () => void;
}

export function InstrumentCard({
  channelIndex,
  params,
  volume,
  onVolumeChange,
  onPreview,
  onRegenerate,
}: InstrumentCardProps) {
  const chColor = channelColors[channelIndex].primary;
  const shape = params[6] ?? 0;
  const attack = params[3] ?? 0;
  const decay = params[18] ?? 0;
  const sustain = params[4] ?? 0;
  const release = params[5] ?? 0;

  // Volume slider (0–1 range)
  const trackRef = useRef<View>(null);
  const trackLayout = useRef({ x: 0, width: 0 });
  const fraction = Math.max(0, Math.min(1, volume));

  // Use refs to avoid stale closures in PanResponder
  const onVolumeChangeRef = useRef(onVolumeChange);
  onVolumeChangeRef.current = onVolumeChange;

  const volFromPageX = useCallback((pageX: number) => {
    const { x, width } = trackLayout.current;
    if (width <= 0) return 0;
    const frac = Math.max(0, Math.min(1, (pageX - x) / width));
    return Math.round(frac * 100) / 100;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        // Measure track position for accurate pageX→fraction mapping
        const el = trackRef.current as any;
        if (el?.measureInWindow) {
          el.measureInWindow((x: number, _y: number, w: number) => {
            trackLayout.current = { x, width: w };
            // Re-compute with fresh measurement
            onVolumeChangeRef.current(volFromPageX(evt.nativeEvent.pageX));
          });
        }
        // Also compute with existing layout (may be stale on very first touch)
        onVolumeChangeRef.current(volFromPageX(evt.nativeEvent.pageX));
      },
      onPanResponderMove: (evt) => {
        onVolumeChangeRef.current(volFromPageX(evt.nativeEvent.pageX));
      },
    })
  ).current;

  const onTrackLayout = useCallback(() => {
    (trackRef.current as any)?.measureInWindow?.((x: number, _y: number, w: number) => {
      trackLayout.current = { x, width: w };
    });
  }, []);

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

        {/* Volume slider */}
        <View ref={trackRef} style={styles.volTrack} onLayout={onTrackLayout} {...panResponder.panHandlers}>
          <View style={[styles.volFill, { width: `${fraction * 100}%`, backgroundColor: chColor }]} />
          <View style={[styles.volThumb, { left: `${fraction * 100}%` }]} />
        </View>

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
  volTrack: {
    width: '100%',
    height: 12,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  volFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    opacity: 0.35,
  },
  volThumb: {
    position: 'absolute',
    width: 2,
    top: 0,
    bottom: 0,
    backgroundColor: colors.textPrimary,
    marginLeft: -1,
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
