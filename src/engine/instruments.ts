import { VibeName, ZzFXSound } from './types';

// ZzFX params: [volume, randomness, frequency, attack, sustain, release, shape,
//   shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
//   noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo]
//
// Shape: 0=sin, 1=triangle, 2=saw, 3=tan, 4=noise(sin(t^3)), 5=square/pulse
//
// Instrument generation strategy:
//   1. Pick a base archetype for the channel role (lead/harmony/bass/drums)
//   2. Apply 0-2 traits weighted by vibe (vibrato, staccato, crushed, etc.)
//   3. Add micro-randomness so no two regens sound identical
//
// This gives (archetypes × trait combos × randomness) = hundreds of unique sounds
// while staying musically appropriate per vibe.

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// --- BASE ARCHETYPES ---
// Each is a starting point for a channel role. Frequency (idx 2) is always
// 261.63 (C4) — zzfxM transposes via note values at render time.

type Archetype = {
  name: string;
  params: ZzFXSound;
};

//  idx:  0     1      2       3      4      5      6   7     8    9    10   11   12   13   14   15   16   17    18    19
//       vol  rand   freq    atk    sus    rel   shp  crv   sld  dSld pJmp pJT  rpt  nse  mod  bc   dly  sVol  dec   trm

const LEAD_ARCHETYPES: Archetype[] = [
  { name: 'classic-square',
    params: [0.5, 0.01, 261.63, 0.005, 0.2,  0.08, 5, 1.0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9,  0.02, 0] },
  { name: 'thin-pulse',
    params: [0.5, 0.01, 261.63, 0.005, 0.2,  0.08, 5, 0.5,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9,  0.02, 0] },
  { name: 'nasal-pulse',
    params: [0.5, 0.01, 261.63, 0.005, 0.2,  0.08, 5, 0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.85, 0.02, 0] },
  { name: 'bright-saw',
    params: [0.4, 0.01, 261.63, 0.005, 0.18, 0.08, 2, 1.0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.85, 0.02, 0] },
  { name: 'soft-sine',
    params: [0.45,0.01, 261.63, 0.01,  0.22, 0.1,  0, 1.0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8,  0.02, 0] },
];

const HARMONY_ARCHETYPES: Archetype[] = [
  { name: 'thin-pulse',
    params: [0.22, 0.01, 261.63, 0.005, 0.12, 0.08, 5, 0.4,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7,  0.02, 0] },
  { name: 'soft-saw',
    params: [0.2,  0.01, 261.63, 0.01,  0.1,  0.08, 2, 0.8,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6,  0.02, 0] },
  { name: 'triangle-pad',
    params: [0.2,  0.01, 261.63, 0.02,  0.18, 0.12, 1, 1.0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.55, 0.03, 0] },
  { name: 'sine-pad',
    params: [0.18, 0.01, 261.63, 0.02,  0.2,  0.12, 0, 1.0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5,  0.03, 0] },
  { name: 'buzzy-narrow',
    params: [0.25, 0.01, 261.63, 0.005, 0.1,  0.06, 5, 0.2,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7,  0.02, 0] },
];

const BASS_ARCHETYPES: Archetype[] = [
  { name: 'triangle',
    params: [0.6, 0.01, 261.63, 0,     0.15, 0.06, 1, 1.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.85, 0.02, 0] },
  { name: 'square',
    params: [0.5, 0.01, 261.63, 0,     0.14, 0.05, 5, 1.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9,  0.02, 0] },
  { name: 'saw',
    params: [0.45,0.01, 261.63, 0,     0.12, 0.05, 2, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.85, 0.02, 0] },
  { name: 'sub-sine',
    params: [0.65,0.01, 261.63, 0,     0.18, 0.08, 0, 1.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8,  0.02, 0] },
];

const DRUM_ARCHETYPES: Archetype[] = [
  { name: 'standard',
    params: [0.8, 0, 350, 0, 0.01,  0.08, 4, 1.0, -8,  0, 0, 0, 0, 0.5,  0, 0,   0, 0.05, 0.04, 0] },
  { name: 'tight',
    params: [0.85,0, 380, 0, 0.005, 0.05, 4, 1.0, -10, 0, 0, 0, 0, 0.45, 0, 0,   0, 0.03, 0.03, 0] },
  { name: 'boomy',
    params: [0.9, 0, 300, 0, 0.02,  0.12, 4, 1.0, -6,  0, 0, 0, 0, 0.55, 0, 0,   0, 0.08, 0.05, 0] },
  { name: 'crushed',
    params: [0.85,0, 400, 0, 0.012, 0.09, 4, 1.0, -12, 0, 0, 0, 0, 0.6,  0, 1.5, 0, 0.05, 0.04, 0] },
  { name: 'metallic',
    params: [0.7, 0, 420, 0, 0.008, 0.07, 4, 1.0, -4,  0, 0, 0, 0, 0.3,  0, 0,   0, 0.04, 0.03, 0] },
];

// --- TRAITS ---
// Each trait mutates a ZzFXSound in-place. Designed to be composable —
// applying 2 traits produces a sensible sound, not garbage.

type TraitName =
  | 'vibrato' | 'fastVibrato' | 'staccato' | 'legato'
  | 'pitchBend' | 'pitchDrop' | 'crushed' | 'echoed'
  | 'wobbly' | 'tremolo' | 'clean' | 'aggressive' | 'soft';

type TraitFn = (p: ZzFXSound) => void;

const TRAITS: Record<TraitName, TraitFn> = {
  // Vibrato — slow pitch wobble, classic chiptune life
  vibrato: (p) => {
    p[12] = pick([500, 700, 900]);  // repeatTime
    p[19] = randRange(0.15, 0.35);  // tremolo amount
  },
  // Faster vibrato — more intense, nervous
  fastVibrato: (p) => {
    p[12] = pick([250, 350, 450]);
    p[19] = randRange(0.2, 0.45);
  },
  // Staccato — short, punchy notes
  staccato: (p) => {
    p[4] *= randRange(0.3, 0.5);    // sustain
    p[5] *= randRange(0.4, 0.6);    // release
    p[17] = Math.min(1, (p[17] ?? 1) + 0.1); // sustainVolume up (louder during short time)
  },
  // Legato — long, flowing notes
  legato: (p) => {
    p[3] = Math.max(p[3], 0.01);    // gentle attack
    p[4] *= randRange(1.5, 2.2);    // long sustain
    p[5] *= randRange(1.3, 1.8);    // long release
  },
  // Pitch bend up on attack — notes "scoop" into pitch
  pitchBend: (p) => {
    p[8] = randRange(1, 4);          // slide up
  },
  // Pitch drop — notes start high, fall into pitch (percussive feel)
  pitchDrop: (p) => {
    p[10] = randRange(-5, -15);      // pitchJump down
    p[11] = randRange(0.01, 0.03);   // pitchJumpTime (quick)
  },
  // Bit crush — lo-fi crunch (keep values mild, high values sound broken)
  crushed: (p) => {
    p[15] = pick([0.3, 0.5, 0.7, 1]);  // bitCrush
  },
  // Echo/delay — adds depth and space
  echoed: (p) => {
    p[16] = randRange(0.02, 0.06);   // delay
  },
  // Wobbly — frequency modulation, eerie/alien texture
  wobbly: (p) => {
    p[14] = randRange(0.3, 1.5);     // modulation
  },
  // Tremolo — volume wobble, rhythmic texture
  tremolo: (p) => {
    p[12] = pick([300, 500, 800]);
    p[19] = randRange(0.3, 0.6);
  },
  // Clean — no effects, pure tone. Explicitly zeroes FX params.
  clean: (p) => {
    p[8] = 0; p[9] = 0; p[10] = 0; p[11] = 0;
    p[14] = 0; p[15] = 0; p[16] = 0; p[19] = 0;
  },
  // Aggressive — louder, tighter, harder
  aggressive: (p) => {
    p[0] *= randRange(1.1, 1.35);    // volume boost
    p[3] = 0;                        // instant attack
    p[18] *= randRange(0.5, 0.8);    // shorter decay
  },
  // Soft — quieter, gentler, more air
  soft: (p) => {
    p[0] *= randRange(0.65, 0.8);
    p[3] = Math.max(p[3], randRange(0.01, 0.025));
    p[17] = Math.max(0, (p[17] ?? 1) - randRange(0.1, 0.2));
  },
};

// --- VIBE TRAIT WEIGHTS ---
// Per-channel trait pools. Each vibe defines which traits are likely
// and how many to apply (traitCount range).

type ChannelRole = 'lead' | 'harmony' | 'bass' | 'drums';

interface VibeTraitConfig {
  archetypeWeights: number[];    // weights for picking archetype (parallel to archetype array)
  traitPool: TraitName[];        // available traits
  traitWeights: number[];        // parallel weights
  traitCount: [number, number];  // [min, max] traits to apply
}

const VIBE_TRAITS: Record<VibeName, Record<ChannelRole, VibeTraitConfig>> = {
  adventure: {
    lead: {
      archetypeWeights: [4, 2, 1, 1, 1],  // favor classic square
      traitPool:    ['clean', 'vibrato', 'pitchBend', 'staccato', 'echoed'],
      traitWeights: [3,       3,         1,           1,           1],
      traitCount: [0, 2],
    },
    harmony: {
      archetypeWeights: [3, 2, 2, 1, 1],
      traitPool:    ['clean', 'vibrato', 'legato', 'soft'],
      traitWeights: [3,       2,         2,        2],
      traitCount: [0, 1],
    },
    bass: {
      archetypeWeights: [4, 2, 1, 1],  // favor triangle
      traitPool:    ['clean', 'staccato', 'pitchBend'],
      traitWeights: [4,       2,          1],
      traitCount: [0, 1],
    },
    drums: {
      archetypeWeights: [4, 2, 1, 1, 1],
      traitPool:    ['clean', 'aggressive'],
      traitWeights: [3,       1],
      traitCount: [0, 1],
    },
  },

  battle: {
    lead: {
      archetypeWeights: [3, 3, 1, 2, 0],  // square + pulse, some saw, no sine
      traitPool:    ['aggressive', 'staccato', 'crushed', 'fastVibrato', 'pitchDrop', 'clean'],
      traitWeights: [3,            3,          1,         1,             1,           2],
      traitCount: [1, 2],
    },
    harmony: {
      archetypeWeights: [1, 3, 0, 0, 3],  // saw + buzzy
      traitPool:    ['aggressive', 'staccato', 'clean', 'fastVibrato'],
      traitWeights: [3,            2,          3,       1],
      traitCount: [0, 2],
    },
    bass: {
      archetypeWeights: [2, 3, 2, 0],  // punch: square > triangle > saw
      traitPool:    ['aggressive', 'staccato', 'clean'],
      traitWeights: [3,            3,          2],
      traitCount: [1, 2],
    },
    drums: {
      archetypeWeights: [2, 3, 1, 2, 1],  // tight favored, less crushed archetype
      traitPool:    ['aggressive', 'clean'],
      traitWeights: [2,            3],
      traitCount: [0, 1],
    },
  },

  dungeon: {
    lead: {
      archetypeWeights: [1, 1, 0, 0, 4],  // favor sine, some square
      traitPool:    ['legato', 'vibrato', 'wobbly', 'echoed', 'soft', 'tremolo'],
      traitWeights: [3,        2,         2,        2,        2,      1],
      traitCount: [1, 2],
    },
    harmony: {
      archetypeWeights: [1, 0, 3, 3, 0],  // triangle + sine pads
      traitPool:    ['legato', 'echoed', 'wobbly', 'soft', 'tremolo'],
      traitWeights: [3,        2,        2,        2,      1],
      traitCount: [1, 2],
    },
    bass: {
      archetypeWeights: [3, 0, 0, 3],  // triangle + sub-sine
      traitPool:    ['legato', 'soft', 'wobbly', 'echoed'],
      traitWeights: [3,        2,      1,        1],
      traitCount: [0, 2],
    },
    drums: {
      archetypeWeights: [2, 1, 3, 1, 2],  // boomy + standard
      traitPool:    ['soft', 'echoed'],
      traitWeights: [3,      2],
      traitCount: [0, 1],
    },
  },

  titleScreen: {
    lead: {
      archetypeWeights: [3, 1, 0, 1, 3],  // square + sine (warm, welcoming)
      traitPool:    ['clean', 'vibrato', 'legato', 'soft', 'echoed'],
      traitWeights: [3,       2,         2,        1,      1],
      traitCount: [0, 1],
    },
    harmony: {
      archetypeWeights: [2, 2, 2, 2, 0],  // any soft archetype
      traitPool:    ['clean', 'legato', 'soft', 'vibrato'],
      traitWeights: [3,       2,        2,      1],
      traitCount: [0, 1],
    },
    bass: {
      archetypeWeights: [4, 1, 0, 2],  // triangle + sub
      traitPool:    ['clean', 'legato', 'soft'],
      traitWeights: [3,       2,        1],
      traitCount: [0, 1],
    },
    drums: {
      archetypeWeights: [3, 2, 1, 0, 2],  // standard, light
      traitPool:    ['clean', 'soft'],
      traitWeights: [3,       2],
      traitCount: [0, 1],
    },
  },

  boss: {
    lead: {
      archetypeWeights: [2, 3, 2, 3, 0],  // pulse + saw, no sine
      traitPool:    ['aggressive', 'crushed', 'fastVibrato', 'pitchDrop', 'staccato', 'clean'],
      traitWeights: [3,            1,         2,             2,           2,           1],
      traitCount: [1, 2],
    },
    harmony: {
      archetypeWeights: [0, 3, 0, 0, 3],  // saw + buzzy
      traitPool:    ['aggressive', 'fastVibrato', 'staccato', 'clean'],
      traitWeights: [3,            2,             2,          2],
      traitCount: [1, 2],
    },
    bass: {
      archetypeWeights: [1, 3, 3, 0],  // square + saw (gritty)
      traitPool:    ['aggressive', 'staccato', 'pitchDrop', 'clean'],
      traitWeights: [3,            2,          1,           2],
      traitCount: [1, 2],
    },
    drums: {
      archetypeWeights: [1, 3, 1, 2, 1],  // tight favored
      traitPool:    ['aggressive', 'clean'],
      traitWeights: [2,            2],
      traitCount: [0, 1],
    },
  },
};

// --- GENERATION ---

function buildInstrument(
  archetypes: Archetype[],
  config: VibeTraitConfig,
): ZzFXSound {
  // 1. Pick archetype
  const archetype = weightedPick(archetypes, config.archetypeWeights);
  const params = [...archetype.params] as ZzFXSound;

  // 2. Pick and apply traits
  const [minTraits, maxTraits] = config.traitCount;
  const numTraits = minTraits + Math.floor(Math.random() * (maxTraits - minTraits + 1));
  const usedTraits = new Set<TraitName>();

  for (let i = 0; i < numTraits; i++) {
    const trait = weightedPick(config.traitPool, config.traitWeights);
    if (usedTraits.has(trait)) continue; // no duplicate traits
    usedTraits.add(trait);
    TRAITS[trait](params);
  }

  // 3. Micro-randomness — subtle per-regen variation
  params[0] *= randRange(0.9, 1.1);    // volume
  params[4] *= randRange(0.85, 1.15);  // sustain
  params[5] *= randRange(0.85, 1.15);  // release

  return params;
}

export function generateInstruments(vibe: VibeName): ZzFXSound[] {
  const vibeTraits = VIBE_TRAITS[vibe];
  return [
    buildInstrument(LEAD_ARCHETYPES, vibeTraits.lead),
    buildInstrument(HARMONY_ARCHETYPES, vibeTraits.harmony),
    buildInstrument(BASS_ARCHETYPES, vibeTraits.bass),
    buildInstrument(DRUM_ARCHETYPES, vibeTraits.drums),
  ];
}
