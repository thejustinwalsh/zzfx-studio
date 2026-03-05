import { VibeName, ZzFXSound } from './types';

// ZzFX params: [volume, randomness, frequency, attack, sustain, release, shape,
//   shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
//   noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo]
//
// Shape reference: 0=sin, 1=triangle, 2=saw, 3=tan(square-ish), 4=noise(sin(t^3)), 5=square/pulse
//
// At 120 BPM, each row = ~125ms. Notes should sustain through at least 1 row.
// Total sound length = attack + decay + sustain + release + delay.
//
// GameBoy-style channel plan:
//   CH1 (Lead):    Square/pulse wave — bright, melodic, distinct duty cycle
//   CH2 (Harmony): Thinner pulse or saw — supports lead without masking it
//   CH3 (Bass):    Triangle wave — warm, clean low end
//   CH4 (Drums):   Noise with pitch/slide — kick/snare/hat via note value

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Pick a preset, but mutate it slightly so regeneration always sounds different
function pickAndMutate(presets: InstrumentPreset[]): ZzFXSound {
  const base = [...pick(presets)] as ZzFXSound;
  // Slight random variations to key timbral params
  base[0] *= randRange(0.85, 1.15);   // volume
  base[4] *= randRange(0.7, 1.3);     // sustain
  base[5] *= randRange(0.7, 1.3);     // release
  if (base[7] !== undefined) base[7] *= randRange(0.8, 1.2);  // shapeCurve
  base[17] = Math.max(0, Math.min(1, (base[17] ?? 1) + randRange(-0.15, 0.15))); // sustainVolume
  base[18] *= randRange(0.5, 1.5);    // decay
  return base;
}

// Direct instrument definitions — no random ranges, just curated presets
// Each vibe has multiple possible presets to pick from
type InstrumentPreset = ZzFXSound;

// --- LEAD PRESETS ---
// Shape 5 (square/pulse), duty cycle = shapeCurve/2
// Classic square (50% duty) = shapeCurve 1.0
// Thinner pulse (25% duty) = shapeCurve 0.5

const LEAD_PRESETS: Record<VibeName, InstrumentPreset[]> = {
  adventure: [
    // Bright square lead — classic NES/GB feel
    //  vol  rand  freq    atk    sus    rel   shp  curve  sld  dSld  pJmp  pJT   rpt   nse   mod   bc    dly   sVol  dec   trm
    [0.5, 0.01, 261.63, 0.005, 0.2,   0.08,  5,   1.0,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.9,  0.02, 0],
    // Slightly nasal pulse lead (narrower duty)
    [0.5, 0.01, 261.63, 0.005, 0.2,   0.08,  5,   0.7,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.9,  0.02, 0],
  ],
  battle: [
    // Aggressive square — short attack, full volume, slight vibrato feel
    [0.6, 0.01, 261.63, 0,     0.15,  0.06,  5,   1.0,   0,   0,    0,    0,    0,    0,    0,    0,    0,    1.0,  0.01, 0],
    // Bright saw-ish pulse (thin duty)
    [0.6, 0.01, 261.63, 0,     0.15,  0.06,  5,   0.5,   0,   0,    0,    0,    0,    0,    0,    1,    0,    1.0,  0.01, 0],
  ],
  dungeon: [
    // Muted, slightly dark lead — longer attack, lower volume
    [0.35, 0.01, 261.63, 0.02, 0.25,  0.12,  5,   0.8,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.7,  0.03, 0],
    // Hollow square with gentle tremolo
    [0.35, 0.02, 261.63, 0.02, 0.3,   0.1,   5,   1.0,   0,   0,    0,    0,    800,  0,    0,    0,    0,    0.7,  0.03, 0.3],
  ],
  titleScreen: [
    // Clean, warm square — welcoming, bright
    [0.45, 0.01, 261.63, 0.005, 0.22, 0.1,   5,   1.0,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.85, 0.02, 0],
    // Gentle pulse
    [0.45, 0.01, 261.63, 0.005, 0.22, 0.1,   5,   0.8,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.85, 0.02, 0],
  ],
  boss: [
    // Hard, aggressive square — maximum presence
    [0.65, 0.01, 261.63, 0,     0.12,  0.05,  5,   1.0,   0,   0,    0,    0,    0,    0,    0,    1,    0,    1.0,  0.01, 0],
    // Gritty crushed pulse
    [0.6, 0.02, 261.63, 0,     0.12,  0.05,  5,   0.6,   0,   0,    0,    0,    0,    0,    0,    2,    0,    1.0,  0.01, 0],
  ],
};

// --- HARMONY PRESETS ---
// Lower volume, different waveform/duty from lead for timbral separation

const HARMONY_PRESETS: Record<VibeName, InstrumentPreset[]> = {
  adventure: [
    // Thin pulse — sits behind lead, adds shimmer
    [0.25, 0.01, 261.63, 0.005, 0.12,  0.08,  5,   0.4,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.7,  0.02, 0],
    // Soft saw — warmer harmony
    [0.2,  0.01, 261.63, 0.01,  0.1,   0.08,  2,   0.8,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.6,  0.02, 0],
  ],
  battle: [
    // Saw wave harmony — aggressive, cuts through
    [0.3,  0.01, 261.63, 0,     0.08,  0.05,  2,   1.0,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.8,  0.01, 0],
    // Narrow pulse — buzzy, intense
    [0.3,  0.01, 261.63, 0,     0.08,  0.05,  5,   0.3,   0,   0,    0,    0,    0,    0,    0,    1,    0,    0.8,  0.01, 0],
  ],
  dungeon: [
    // Ghostly thin pulse — haunting pad-like
    [0.15, 0.02, 261.63, 0.03,  0.2,   0.15,  5,   0.3,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.5,  0.03, 0],
    // Quiet triangle pad
    [0.15, 0.01, 261.63, 0.03,  0.25,  0.12,  1,   1.0,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.5,  0.03, 0],
  ],
  titleScreen: [
    // Gentle saw pad — warm fill
    [0.2,  0.01, 261.63, 0.01,  0.15,  0.1,   2,   0.8,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.65, 0.02, 0],
    // Soft pulse — airy
    [0.2,  0.01, 261.63, 0.01,  0.15,  0.1,   5,   0.5,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.65, 0.02, 0],
  ],
  boss: [
    // Hard saw — aggressive harmony
    [0.35, 0.01, 261.63, 0,     0.06,  0.04,  2,   1.0,   0,   0,    0,    0,    0,    0,    0,    1,    0,    0.9,  0.01, 0],
    // Distorted thin pulse
    [0.35, 0.02, 261.63, 0,     0.06,  0.04,  5,   0.3,   0,   0,    0,    0,    0,    0,    0,    2,    0,    0.9,  0.01, 0],
  ],
};

// --- BASS PRESETS ---
// Triangle wave (shape 1) — clean, round low end like GameBoy

const BASS_PRESETS: Record<VibeName, InstrumentPreset[]> = {
  adventure: [
    // Clean triangle bass — warm and round
    [0.6, 0.01, 261.63, 0,     0.15,  0.06,  1,   1.0,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.85, 0.02, 0],
  ],
  battle: [
    // Punchy triangle — short, aggressive
    [0.7, 0.01, 261.63, 0,     0.1,   0.04,  1,   1.0,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.95, 0.01, 0],
    // Slightly gritty bass
    [0.7, 0.01, 261.63, 0,     0.1,   0.04,  1,   1.0,   0,   0,    0,    0,    0,    0,    0,    1,    0,    0.95, 0.01, 0],
  ],
  dungeon: [
    // Deep, sustained bass — moody
    [0.5, 0.01, 261.63, 0.005, 0.2,   0.1,   1,   1.0,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.75, 0.03, 0],
  ],
  titleScreen: [
    // Gentle triangle — clean
    [0.5, 0.01, 261.63, 0,     0.18,  0.08,  1,   1.0,   0,   0,    0,    0,    0,    0,    0,    0,    0,    0.8,  0.02, 0],
  ],
  boss: [
    // Hard punchy bass — driving
    [0.75, 0.01, 261.63, 0,    0.08,  0.03,  1,   1.0,   0,   0,    0,    0,    0,    0,    0,    0,    0,    1.0,  0.01, 0],
    // Slight saw-bass for grit
    [0.7, 0.01, 261.63, 0,     0.08,  0.03,  2,   0.6,   0,   0,    0,    0,    0,    0,    0,    1,    0,    1.0,  0.01, 0],
  ],
};

// --- DRUM PRESETS ---
// Single instrument, but note value differentiates:
//   KICK (note 1):  freq * 2^(-11/12) = ~0.53x base → deep thump
//   SNARE (note 14): freq * 2^(2/12) = ~1.12x base → mid crack
//   HAT (note 32):   freq * 2^(20/12) = ~3.17x base → high sizzle
//
// Shape 4 (sin(t³) noise) with strong downward slide gives:
//   Low pitch → boomy thud (kick)
//   Mid pitch → snappy crack (snare)
//   High pitch → bright tick (hat)

const DRUM_PRESETS: Record<VibeName, InstrumentPreset[]> = {
  adventure: [
    // Balanced kit — punchy but clean
    [0.8, 0,    350,    0,     0.01,  0.08,  4,   1.0,  -8,   0,    0,    0,    0,    0.5,  0,    0,    0,    0.05, 0.04, 0],
  ],
  battle: [
    // Hard hitting — loud, aggressive
    [1.0, 0,    400,    0,     0.015, 0.09,  4,   1.0,  -12,  0,    0,    0,    0,    0.6,  0,    0.5,  0,    0.05, 0.03, 0],
  ],
  dungeon: [
    // Muted kit — softer, more subtle
    [0.5, 0,    280,    0,     0.008, 0.06,  4,   1.0,  -5,   0,    0,    0,    0,    0.4,  0,    0,    0,    0.03, 0.05, 0],
  ],
  titleScreen: [
    // Light kit — clean
    [0.6, 0,    320,    0,     0.01,  0.07,  4,   1.0,  -6,   0,    0,    0,    0,    0.45, 0,    0,    0,    0.04, 0.04, 0],
  ],
  boss: [
    // Monster kit — maximum punch, bit crushed
    [1.0, 0,    450,    0,     0.02,  0.1,   4,   1.0,  -15,  0,    0,    0,    0,    0.7,  0,    1,    0,    0.08, 0.03, 0],
  ],
};

export function generateInstruments(vibe: VibeName): ZzFXSound[] {
  return [
    pickAndMutate(LEAD_PRESETS[vibe]),
    pickAndMutate(HARMONY_PRESETS[vibe]),
    pickAndMutate(BASS_PRESETS[vibe]),
    pickAndMutate(DRUM_PRESETS[vibe]),
  ];
}
