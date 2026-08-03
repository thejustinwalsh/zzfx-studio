import { VibeName, ZzFXSound } from './types';
import { FREQ_C3, FREQ_C4 } from './scales';

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
// Each is a starting point for a channel role. Frequency (idx 2) sets the
// channel's register; zzfxM transposes above it via note values at render
// time, where note 12 sounds the frequency itself.
//
// Pitched channels are tuned to the octave they actually play in. Bass sits at
// 130.81 (C3): tuning it to C4 like the others forced its notes into values
// 0-11, where C collides with the rest sentinel and plays as silence.

type Archetype = {
  name: string;
  params: ZzFXSound;
};

//  idx:  0     1      2       3      4      5      6   7     8    9    10   11   12   13   14   15   16   17    18    19
//       vol  rand   freq    atk    sus    rel   shp  crv   sld  dSld pJmp pJT  rpt  nse  mod  bc   dly  sVol  dec   trm

const LEAD_ARCHETYPES: Archetype[] = [
  { name: 'classic-square',
    params: [0.5, 0.01, FREQ_C4, 0.005, 0.2,  0.08, 5, 1.0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9,  0.02, 0] },
  { name: 'thin-pulse',
    params: [0.5, 0.01, FREQ_C4, 0.005, 0.2,  0.08, 5, 0.5,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9,  0.02, 0] },
  { name: 'nasal-pulse',
    params: [0.5, 0.01, FREQ_C4, 0.005, 0.2,  0.08, 5, 0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.85, 0.02, 0] },
  { name: 'bright-saw',
    params: [0.4, 0.01, FREQ_C4, 0.005, 0.18, 0.08, 2, 1.0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.85, 0.02, 0] },
  { name: 'soft-sine',
    params: [0.45,0.01, FREQ_C4, 0.01,  0.22, 0.1,  0, 1.0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8,  0.02, 0] },
];

const HARMONY_ARCHETYPES: Archetype[] = [
  { name: 'thin-pulse',
    params: [0.22, 0.01, FREQ_C4, 0.005, 0.12, 0.08, 5, 0.4,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7,  0.02, 0] },
  { name: 'soft-saw',
    params: [0.2,  0.01, FREQ_C4, 0.01,  0.1,  0.08, 2, 0.8,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6,  0.02, 0] },
  { name: 'triangle-pad',
    params: [0.2,  0.01, FREQ_C4, 0.02,  0.18, 0.12, 1, 1.0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.55, 0.03, 0] },
  { name: 'sine-pad',
    params: [0.18, 0.01, FREQ_C4, 0.02,  0.2,  0.12, 0, 1.0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5,  0.03, 0] },
  { name: 'buzzy-narrow',
    params: [0.25, 0.01, FREQ_C4, 0.005, 0.1,  0.06, 5, 0.2,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7,  0.02, 0] },
];

const BASS_ARCHETYPES: Archetype[] = [
  { name: 'triangle',
    params: [0.6, 0.01, FREQ_C3, 0,     0.15, 0.06, 1, 1.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.85, 0.02, 0] },
  { name: 'square',
    params: [0.5, 0.01, FREQ_C3, 0,     0.14, 0.05, 5, 1.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9,  0.02, 0] },
  { name: 'saw',
    params: [0.45,0.01, FREQ_C3, 0,     0.12, 0.05, 2, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.85, 0.02, 0] },
  { name: 'sub-sine',
    params: [0.65,0.01, FREQ_C3, 0,     0.18, 0.08, 0, 1.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8,  0.02, 0] },
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
  // Vibrato — slow volume wobble, classic chiptune life
  vibrato: (p) => {
    p[12] = pick([0.2, 0.25, 0.3]);  // repeatTime in seconds (3-5 Hz)
    p[19] = randRange(0.15, 0.35);   // tremolo amount
  },
  // Faster vibrato — more intense, nervous
  fastVibrato: (p) => {
    p[12] = pick([0.08, 0.1, 0.14]); // repeatTime in seconds (7-12 Hz)
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
  // Wobbly — subtle frequency modulation, adds movement without bubble/whistle
  wobbly: (p) => {
    p[14] = randRange(0.1, 0.4);     // modulation (low values = texture, high = bubble)
  },
  // Tremolo — volume wobble, rhythmic texture
  tremolo: (p) => {
    p[12] = pick([0.12, 0.18, 0.25]); // repeatTime in seconds (4-8 Hz)
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
      traitPool:    ['legato', 'vibrato', 'echoed', 'soft', 'tremolo'],
      traitWeights: [3,        2,         2,        2,      1],
      traitCount: [1, 2],
    },
    harmony: {
      archetypeWeights: [1, 0, 3, 3, 0],  // triangle + sine pads
      traitPool:    ['legato', 'echoed', 'soft', 'tremolo'],
      traitWeights: [3,        2,        2,      1],
      traitCount: [1, 2],
    },
    bass: {
      archetypeWeights: [3, 0, 0, 3],  // triangle + sub-sine
      traitPool:    ['legato', 'soft', 'echoed'],
      traitWeights: [3,        2,      1],
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

/**
 * Per-voice drum timbres.
 *
 * ZzFX shape 4 is `Math.sin(t**3)`: t cubed races away, so the waveform is
 * broadband within a few samples and the frequency parameter barely colours it.
 * Kick, snare and hat were one shape-4 instrument differing only in note value
 * — that is, differing only in a parameter their waveform ignores. Measured,
 * their spectral centroids sat within 2% of each other and their envelopes were
 * identical, so all three read as the same short burst.
 *
 * Each voice now gets its own shape and envelope. The note value still sets
 * pitch within the voice's range, so nudging a drum in the tracker still works.
 */
export type DrumVoice = 'KICK' | 'SNARE' | 'HAT';

/**
 * How far the kick's pitch steps down, as a fraction of its own frequency, and
 * how soon.
 *
 * A fraction rather than a fixed number of hertz so the step scales with the
 * archetype and with the note: the drum range shifts the kick between about
 * 0.53x and 0.71x, and a step large enough to matter at the top would drive
 * the bottom through zero. A quarter always leaves it clear.
 */
const KICK_DROP = 0.25;
const KICK_DROP_AT = 0.012;

/**
 * Shortest a voice is allowed to be, in seconds of decay + sustain + release.
 *
 * Set from measurement, not taste. Across 750 generated kits the audible tail
 * ran about 0.78x the allocated envelope, so these are the envelope figures
 * that keep each voice above the roughly 25ms where a percussive hit stops
 * reading as a drum and starts reading as a click.
 *
 * Kick and snare already measured 65ms at their shortest, so their floors are
 * guards that currently change nothing -- they exist so a future archetype or
 * trait cannot quietly reintroduce the problem. The hat floor is live: it is
 * the one voice that scales its envelope down, and it was landing at 18ms.
 */
const MIN_VOICE_SECONDS: Record<DrumVoice, number> = {
  KICK: 0.06,
  SNARE: 0.06,
  HAT: 0.036,
};

export function drumVoiceInstrument(base: ZzFXSound, voice: DrumVoice): ZzFXSound {
  // Assigning past the end of a short array leaves holes, and ZzFX reads those
  // as undefined rather than 0. Pad to the full parameter count first.
  const p = [...base];
  while (p.length < 20) p.push(0);

  const scale = (i: number, by: number, cap = Infinity) =>
    { p[i] = Math.min(cap, (base[i] ?? 0) * by); };

  /**
   * Ceiling on the archetype's own bit crush, per voice.
   *
   * ZzFX's bitCrush is a sample-and-hold: it recomputes one sample in every
   * `bitCrush * 100`, so it is really an effective-sample-rate control, and its
   * damage is entirely relative to pitch -- harmless on a 100Hz kick, fatal to
   * an 11kHz hat. The `crushed` archetype carries 1.5, which holds 150 samples:
   * a 294Hz effective rate that annihilates anything above ~150Hz. Its hat
   * measured a seventh of every other archetype's, with its pitch collapsed.
   *
   * The hold is a whole number of samples, so the steps are coarse: 1 is no
   * crushing, 2 is 22kHz, 3 is 14.7kHz. There is no setting that audibly
   * crushes an 11kHz hat without halving its pitch -- measured, hold 2 already
   * takes it from 11.3kHz to 5.1kHz. So the pitched-noise voices are held at
   * the gentlest step that still does anything, and the crushed archetype
   * keeps its character through its other parameters instead.
   */
  const capCrush = (max: number) => { p[15] = Math.min(p[15] ?? 0, max); };

  /**
   * Floor on how long a voice lasts.
   *
   * A ZzFX note runs attack + decay + sustain + release, and none of that
   * scales with tempo -- so a drum that is too short is too short at every BPM.
   * The hat multiplies three of those down (0.4, 0.35, 0.35), so a short
   * archetype roll lands under 20ms: measured across 750 kits, 31% of battle
   * hats and 28% of boss hats fell below 25ms audible, which reads as a click
   * rather than a drum.
   *
   * Scaling the decaying part up proportionally lifts only the bottom tail and
   * leaves rolls that were already long enough untouched, so kit variation
   * survives instead of every hat collapsing to one length. Attack is excluded
   * -- stretching it would soften the transient, which is the whole point of a
   * hat.
   */
  const floorLength = (minSec: number) => {
    const body = (p[18] ?? 0) + (p[4] ?? 0) + (p[5] ?? 0);
    if (body <= 0 || body >= minSec) return;
    const by = minSec / body;
    p[18] *= by;
    p[4] *= by;
    p[5] *= by;
  };

  switch (voice) {
    case 'KICK':
      // The one voice that cannot be noise, built the only way ZzFX allows.
      //
      // Three facts from the ZzFX source rather than from taste:
      //
      //   shape 4 is sin(t**3), whose phase accelerates without bound. It has
      //   no stable pitch -- that is precisely why it reads as noise, and why
      //   the shipped drums never bubbled: a zero crossing is inaudible when
      //   there is no pitch to hear. It also means shape 4 can never be a low
      //   sound. Lowering it moves the runaway inside the note and it sweeps
      //   upward instead, ending as bright as the hat.
      //
      //   slide is `frequency += slide` on every sample, with no floor. It
      //   always reaches zero and keeps going, and a negative frequency is
      //   heard as rising pitch. Any pitched waveform driven by slide bubbles
      //   eventually; steeper only bubbles sooner. Capping, scaling and
      //   flooring it were all choosing when, never whether.
      //
      //   pitchJump is `frequency += pitchJump` once, at pitchJumpTime. It is
      //   the only bounded pitch move in the parameter set.
      //
      // So: a sine body, no slide at all, and one early downward step -- which
      // is what a kick's pitch envelope is anyway. The step is a fraction of
      // the kick's own frequency, so it cannot reach zero at any note in the
      // drum range or on any archetype.
      p[6] = 0;
      scale(2, 0.55);
      p[8] = 0;
      p[10] = -KICK_DROP * p[2];
      p[11] = KICK_DROP_AT;
      scale(0, 1.1, 1);
      break;
    case 'SNARE':
      // The reference point: the archetype as written, with a touch more
      // rattle. Moving it would only push the other two around.
      scale(13, 1.25, 1);
      capCrush(0.02);    // the gentlest crush that is not simply off
      break;
    case 'HAT':
      scale(2, 2.6);     // well above
      scale(4, 0.4);
      scale(5, 0.35);    // and gone almost immediately
      scale(18, 0.35);
      scale(13, 1.5, 1);
      scale(0, 0.6);     // sits back in the mix
      capCrush(0.02);    // a hat is nothing but high frequencies
      break;
  }

  floorLength(MIN_VOICE_SECONDS[voice]);
  return p;
}
