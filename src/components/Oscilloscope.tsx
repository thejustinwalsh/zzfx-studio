import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

// Channel colors as RGB
const CH_COLORS = [
  [74, 222, 128],   // CH0: LEAD (green)
  [56, 189, 248],   // CH1: HARMONY (cyan)
  [250, 204, 21],   // CH2: BASS (yellow)
  [248, 113, 113],  // CH3: DRUMS (red)
];

const NEUTRAL_RGB: RGB = [68, 68, 74];

// Defaults match zzfx.ts: zzfxR=44100, analyser.fftSize=256
const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_FFT_SIZE = 256;

// Lerp speed: how fast display colors chase the target (0-1 per frame)
const LERP_ATTACK = 0.45;  // fast snap to new color
const LERP_DECAY = 0.08;   // slow fade to grey
const BAR_LERP_SPEED = 0.12; // how fast bars lerp to target height

export type RGB = [number, number, number];

// Number of harmonics to consider per waveform shape
function getHarmonics(shape: number): number[] {
  switch (shape) {
    case 5: return [1, 3, 5, 7];         // square — odd harmonics
    case 1: return [1, 3];                // triangle — odd, fall off fast
    case 2: return [1, 2, 3, 4, 5];      // saw — all harmonics
    case 0: return [1];                   // sin — fundamental only
    case 4: return [1, 2, 3, 4, 5, 6, 7, 8]; // noise — spread wide
    default: return [1, 2, 3];
  }
}

// Harmonic amplitude falloff
function harmonicAmplitude(n: number, shape: number): number {
  switch (shape) {
    case 5: return 1 / n;           // square: 1/n for odd
    case 1: return 1 / (n * n);     // triangle: 1/n^2
    case 2: return 1 / n;           // saw: 1/n
    case 4: return 0.5;             // noise: flat-ish
    default: return 1 / n;
  }
}

// Quantize a 0-255 color component for the stepped look
function quantize(val: number, steps: number): number {
  return Math.round(val / (255 / steps)) * (255 / steps);
}

export interface ChannelNote {
  frequency: number;  // fundamental Hz
  shape: number;      // waveform shape
  weight: number;     // drum channel gets lower weight
}

/**
 * Precompute bar colors as RGB tuples for a set of active notes.
 * Returns tuples so the component can lerp between them per frame.
 */
export function computeBarColors(
  activeNotes: (ChannelNote | null)[],
  barCount: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  fftSize: number = DEFAULT_FFT_SIZE,
): RGB[] {
  const binHz = sampleRate / fftSize;
  const binsPerBar = Math.floor((fftSize / 2) / barCount);

  const contributions: [number, number, number, number][] = Array.from(
    { length: barCount },
    () => [0, 0, 0, 0]
  );

  for (let ch = 0; ch < 4; ch++) {
    const note = activeNotes[ch];
    if (!note) continue;

    const harmonics = getHarmonics(note.shape);

    for (const h of harmonics) {
      const freq = note.frequency * h;
      const amp = harmonicAmplitude(h, note.shape) * note.weight;

      const bin = freq / binHz;
      const barIdx = Math.floor(bin / binsPerBar);

      for (let offset = -2; offset <= 2; offset++) {
        const idx = barIdx + offset;
        if (idx < 0 || idx >= barCount) continue;
        const spread = Math.exp(-offset * offset * 0.5);
        contributions[idx][ch] += amp * spread;
      }
    }
  }

  return contributions.map(weights => {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total < 0.01) return NEUTRAL_RGB;

    let r = 0, g = 0, b = 0;
    for (let ch = 0; ch < 4; ch++) {
      const w = weights[ch] / total;
      r += CH_COLORS[ch][0] * w;
      g += CH_COLORS[ch][1] * w;
      b += CH_COLORS[ch][2] * w;
    }

    return [
      quantize(Math.round(r), 6),
      quantize(Math.round(g), 6),
      quantize(Math.round(b), 6),
    ] as RGB;
  });
}

function isNeutral(rgb: RGB): boolean {
  return rgb[0] === NEUTRAL_RGB[0] && rgb[1] === NEUTRAL_RGB[1] && rgb[2] === NEUTRAL_RGB[2];
}

/** Generate idle bar heights — uniform low bars */
function generateIdleBars(count: number): number[] {
  return Array(count).fill(0.12);
}

interface OscilloscopeProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  height?: number;
  barCount?: number;
  /** Precomputed target bar colors as RGB tuples — one per bar. */
  barColors?: RGB[];
}

export function Oscilloscope({
  analyser,
  isPlaying,
  height = 48,
  barCount = 64,
  barColors,
}: OscilloscopeProps) {
  const idleBarsRef = useRef<number[]>(generateIdleBars(barCount));
  const [bars, setBars] = useState<number[]>(() => generateIdleBars(barCount));
  const [displayColors, setDisplayColors] = useState<string[]>(
    () => Array(barCount).fill(`rgb(${NEUTRAL_RGB[0]},${NEUTRAL_RGB[1]},${NEUTRAL_RGB[2]})`)
  );
  const rafRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  // Mutable current bar heights and RGB for lerping
  const currentBarsRef = useRef<number[]>([...generateIdleBars(barCount)]);
  const currentRgbRef = useRef<RGB[]>(
    Array.from({ length: barCount }, () => [...NEUTRAL_RGB] as RGB)
  );
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const tick = useCallback(() => {
    const idle = idleBarsRef.current as number[];
    const currentBars = currentBarsRef.current as number[];
    const currentRgb = currentRgbRef.current;
    const playing = isPlayingRef.current;

    // Determine target bar heights
    let targetBars: number[];
    if (playing && analyser) {
      if (!dataRef.current) {
        dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      }
      analyser.getByteFrequencyData(dataRef.current);
      const binSize = Math.floor(dataRef.current.length / barCount);
      targetBars = [];
      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < binSize; j++) {
          sum += dataRef.current[i * binSize + j];
        }
        targetBars.push(sum / binSize / 255);
      }
    } else {
      targetBars = idle;
    }

    // Lerp bar heights
    let barsChanged = false;
    const nextBars: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const target = targetBars[i];
      const cur = currentBars[i];
      // Use faster lerp when playing (responsive), slower when returning to idle (smooth)
      const speed = playing ? 0.35 : BAR_LERP_SPEED;
      const next = cur + (target - cur) * speed;
      if (Math.abs(next - cur) > 0.001) barsChanged = true;
      currentBars[i] = next;
      nextBars.push(next);
    }

    if (barsChanged) {
      setBars(nextBars);
    }

    // Lerp display colors toward target each frame
    const targets = barColors;
    let colorsChanged = false;
    const strings: string[] = [];

    for (let i = 0; i < barCount; i++) {
      const target = targets?.[i] ?? NEUTRAL_RGB;
      const cur = currentRgb[i];
      const towardNeutral = isNeutral(target);
      const t = towardNeutral ? LERP_DECAY : LERP_ATTACK;

      const nr = cur[0] + (target[0] - cur[0]) * t;
      const ng = cur[1] + (target[1] - cur[1]) * t;
      const nb = cur[2] + (target[2] - cur[2]) * t;

      if (Math.abs(nr - cur[0]) > 0.5 || Math.abs(ng - cur[1]) > 0.5 || Math.abs(nb - cur[2]) > 0.5) {
        colorsChanged = true;
      }

      cur[0] = nr;
      cur[1] = ng;
      cur[2] = nb;
      strings.push(`rgb(${Math.round(nr)},${Math.round(ng)},${Math.round(nb)})`);
    }

    if (colorsChanged) {
      setDisplayColors(strings);
    }

    // Keep running if still lerping toward idle
    if (barsChanged || colorsChanged || playing) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [analyser, barCount, barColors]);

  useEffect(() => {
    // Always start the tick loop — it self-terminates when settled at idle
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, analyser, tick]);

  return (
    <View style={[styles.container, { height }]}>
      {bars.map((val, i) => {
        const barHeight = Math.max(1, val * (height - 4));
        const isActive = val > 0.03;
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: barHeight,
                backgroundColor: isActive ? displayColors[i] : colors.bgElevated,
                opacity: isActive ? 0.3 + val * 0.7 : 0.15,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    backgroundColor: colors.bgSurface,
    paddingHorizontal: 2,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  bar: {
    flex: 1,
    minWidth: 2,
  },
});
