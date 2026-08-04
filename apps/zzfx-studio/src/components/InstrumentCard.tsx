import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import { PulsingView } from './PulsingView';
import type { SharedValue } from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
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
  isRendering?: boolean;
  adsrProgress?: SharedValue<number | null>;
}

export function InstrumentCard({
  channelIndex,
  params,
  volume,
  onVolumeChange,
  onPreview,
  onRegenerate,
  isRendering,
  adsrProgress,
}: InstrumentCardProps) {
  const chColor = channelColors[channelIndex].primary;
  const shape = params[6] ?? 0;
  const attack = params[3] ?? 0;
  const decay = params[18] ?? 0;
  const sustain = params[4] ?? 0;
  const release = params[5] ?? 0;

  // Volume slider (0–1 range)
  const trackRef = useRef<View>(null);
  /**
   * The track's position on screen, as state.
   *
   * It was a ref, read by the gesture handlers. The compiler taints anything
   * that reaches a ref transitively, so building the responder during render
   * took the whole component out of compilation however the access was
   * indirected. Nothing on this path touches a ref now, and the value only
   * changes on layout, so the responder is rebuilt about as often as never.
   */
  const [track, setTrack] = useState({ x: 0, width: 0 });
  const fraction = Math.max(0, Math.min(1, volume));

  const volFromPageX = useCallback((pageX: number) => {
    if (track.width <= 0) return 0;
    const frac = Math.max(0, Math.min(1, (pageX - track.x) / track.width));
    return Math.round(frac * 100) / 100;
  }, [track]);

  const panResponder = useMemo(() => {
    const apply = (pageX: number) => onVolumeChange(volFromPageX(pageX));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => apply(evt.nativeEvent.pageX),
      onPanResponderMove: (evt) => apply(evt.nativeEvent.pageX),
    });
  }, [onVolumeChange, volFromPageX]);

  // Measured after layout, which is also the only time it can change.
  const onTrackLayout = useCallback(() => {
    (trackRef.current as any)?.measureInWindow?.((x: number, _y: number, w: number) => {
      setTrack((prev) => (prev.x === x && prev.width === w ? prev : { x, width: w }));
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
          progress={adsrProgress}
        />

        {/* Volume slider */}
        <View ref={trackRef} style={styles.volTrack} onLayout={onTrackLayout} {...panResponder.panHandlers} accessibilityRole="adjustable" accessibilityLabel={`${CHANNEL_LABELS[channelIndex]} volume`} accessibilityValue={{ min: 0, max: 1, now: fraction, text: `${Math.round(fraction * 100)}%` }}>
          <View style={[styles.volFill, { width: `${fraction * 100}%`, backgroundColor: chColor }]} />
          <View style={[styles.volThumb, { left: `${fraction * 100}%` }]} />
        </View>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <AnimatedPressable
            onPress={onPreview}
            style={styles.btn}
            accessibilityRole="button"
            accessibilityLabel={`Preview ${CHANNEL_LABELS[channelIndex]} instrument`}
          >
            <Text style={[styles.btnText, { color: chColor }]}>PLAY</Text>
          </AnimatedPressable>
          <PulsingView active={!!isRendering}>
            <AnimatedPressable
              onPress={onRegenerate}
              disabled={isRendering}
              style={styles.btnRegen}
              accessibilityRole="button"
              accessibilityLabel={`Regenerate ${CHANNEL_LABELS[channelIndex]} instrument`}
            >
              <Text style={styles.btnRegenText}>R</Text>
            </AnimatedPressable>
          </PulsingView>
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
