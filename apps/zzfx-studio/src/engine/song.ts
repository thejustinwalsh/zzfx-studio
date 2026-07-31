import {
  Song,
  SongConfig,
  SongLength,
  SectionRole,
  Pattern,
  PatternLabel,
  PatternEffects,
  ChannelEffects,
  NoteEffect,
  VibeName,
} from './types';
import { VIBE_CONFIG, getRandomBpm } from './vibes';
import { generateInstruments, drumVoiceInstrument, drumVoiceOf } from './instruments';
import type { DrumVoice } from './instruments';
import { generateDrumPattern } from './drums';
import { generateBassPattern } from './bass';
import { generateMelodyPattern } from './melody';
import { generateHarmonyPattern } from './harmony';
import { generateChordProgression, DEFAULT_BASS_BASE_OCTAVE } from './chords';
import { baseOctaveFromFreq, FREQ_C3 } from './scales';
import { generatePatternEffects, generateChannelEffects, applyEffect } from './effects';
import { generateSongName } from './songNames';
import { zzfxMChannels } from './zzfx';

const PATTERN_LABELS: PatternLabel[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const ROWS = 32;

// Role-based density multipliers — how each section role modifies
// the vibe's base melody/bass density
const ROLE_MELODY_MULTIPLIER: Record<SectionRole, number> = {
  verse: 1.0,
  contrast: 1.0,
  bridge: 0.6,
  breakdown: 0,      // no melody
  climax: 1.4,
};

const ROLE_BASS_MULTIPLIER: Record<SectionRole, number> = {
  verse: 1.0,
  contrast: 1.0,
  bridge: 0.7,
  breakdown: 1.0,    // bass stays in breakdowns
  climax: 1.2,
};

/** The bass channel; the one whose tuning the generator has to respect. */
const BASS_CHANNEL = 2;

/**
 * Where a song's bass notes must be measured from.
 *
 * Read off the instrument the song actually has rather than assumed, because a
 * song saved before the bass was retuned still carries a C4 instrument, and
 * encoding fresh notes against C3 would put them an octave out the moment any
 * bass is regenerated.
 */
function bassBaseOctaveOf(song: Song): number {
  return baseOctaveFromFreq(song.instruments[BASS_CHANNEL]?.[2] ?? FREQ_C3);
}

function generatePatternForRole(
  config: SongConfig,
  role: SectionRole,
  bassBaseOctave: number = DEFAULT_BASS_BASE_OCTAVE,
): { pattern: Pattern; effects: PatternEffects } {
  const vibeConfig = VIBE_CONFIG[config.vibe];

  // Generate chord progression — contrast/bridge/climax get fresh progressions
  const progression = generateChordProgression(config.vibe, config.key, config.scale, bassBaseOctave);

  // Drums always play (backbone of every section)
  const { channelData: drumChannel, kickPattern } = generateDrumPattern(config.vibe);

  // Apply role-based density scaling
  const melodyDensity = Math.min(1, vibeConfig.melodyDensity * ROLE_MELODY_MULTIPLIER[role]);
  const bassDensityScale = ROLE_BASS_MULTIPLIER[role];
  const scaledBassDensity: [number, number] = [
    Math.round(vibeConfig.bassDensity[0] * bassDensityScale),
    Math.round(vibeConfig.bassDensity[1] * bassDensityScale),
  ];

  // Breakdown: silent lead + harmony
  if (role === 'breakdown') {
    const silentChannel = [0, 0, ...Array(ROWS).fill(0)];
    const bassChannel = generateBassPattern(
      config.key, config.scale, kickPattern,
      scaledBassDensity, config.vibe, progression
    );
    const pattern = [silentChannel, silentChannel, bassChannel, drumChannel] as Pattern;
    const effects = generatePatternEffects(pattern, config, role);
    return { pattern, effects };
  }

  // Melody
  const melodyChannel = generateMelodyPattern(
    config.key, config.scale, melodyDensity, progression
  );

  // Bass
  const bassChannel = generateBassPattern(
    config.key, config.scale, kickPattern,
    scaledBassDensity, config.vibe, progression
  );

  // Harmony
  const melodyNotes = melodyChannel.slice(2);
  const harmonyChannel = generateHarmonyPattern(
    config.key, config.scale, melodyNotes, progression
  );

  // Bridge: thin out harmony further (50% chance to silence each hit)
  if (role === 'bridge') {
    for (let i = 2; i < harmonyChannel.length; i++) {
      if (harmonyChannel[i] > 0 && Math.random() < 0.5) {
        harmonyChannel[i] = 0;
      }
    }
  }

  const pattern = [melodyChannel, harmonyChannel, bassChannel, drumChannel] as Pattern;
  const effects = generatePatternEffects(pattern, config, role);
  return { pattern, effects };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateSong(config?: Partial<SongConfig>): Song {
  const vibe: VibeName = config?.vibe ?? 'adventure';
  const vibeConfig = VIBE_CONFIG[vibe];
  const length: SongLength = config?.length ?? 'long';

  const fullConfig: SongConfig = {
    name: config?.name ?? generateSongName(vibe),
    vibe,
    key: config?.key ?? 'C',
    scale: config?.scale ?? pick(vibeConfig.preferredScales),
    bpm: config?.bpm ?? getRandomBpm(vibe),
    length,
  };

  const instruments = generateInstruments(vibe);

  // Pick a structure template for this vibe + length
  const template = pick(vibeConfig.structures[length]);

  // Generate unique patterns, each with its assigned role
  const patterns: Record<PatternLabel, Pattern> = {} as Record<PatternLabel, Pattern>;
  const patternRoles: Record<PatternLabel, SectionRole> = {} as Record<PatternLabel, SectionRole>;
  const patternEffects: Record<PatternLabel, PatternEffects> = {} as Record<PatternLabel, PatternEffects>;
  const patternOrder: PatternLabel[] = [];

  for (let i = 0; i < template.roles.length; i++) {
    const label = PATTERN_LABELS[i];
    const role = template.roles[i];
    const { pattern, effects } = generatePatternForRole(fullConfig, role);
    patterns[label] = pattern;
    patternRoles[label] = role;
    patternEffects[label] = effects;
    patternOrder.push(label);
  }

  return {
    config: fullConfig,
    instruments,
    patterns,
    patternRoles,
    patternEffects,
    sequence: [...template.sequence],
    patternOrder,
  };
}

/**
 * Regenerate for a new vibe: new instruments, structure, patterns, effects, BPM.
 * Keeps name, key, scale, length from the existing song.
 * BPM is re-rolled from the new vibe's preferred range.
 */
export function regenerateForVibe(song: Song, newVibe: VibeName): Song {
  return generateSong({
    name: song.config.name,
    vibe: newVibe,
    key: song.config.key,
    scale: song.config.scale,
    bpm: getRandomBpm(newVibe),
    length: song.config.length,
  });
}

/**
 * Regenerate all patterns in-place for a new config (key/scale change).
 * Keeps instruments, structure (patternOrder, sequence, roles) intact.
 */
export function regenerateAllPatterns(
  song: Song,
  configOverrides: Partial<SongConfig>,
): Song {
  const newConfig: SongConfig = { ...song.config, ...configOverrides };
  const patterns: Record<PatternLabel, Pattern> = {} as Record<PatternLabel, Pattern>;
  const patternEffects: Record<PatternLabel, PatternEffects> = {} as Record<PatternLabel, PatternEffects>;

  for (const label of song.patternOrder) {
    const role = song.patternRoles[label] ?? 'verse';
    const { pattern, effects } = generatePatternForRole(newConfig, role, bassBaseOctaveOf(song));
    patterns[label] = pattern;
    patternEffects[label] = effects;
  }

  return {
    ...song,
    config: newConfig,
    patterns,
    patternEffects,
  };
}

/**
 * Regenerate with a new length: picks a new structure template, generates
 * new patterns for each role. Keeps instruments.
 */
export function regenerateWithNewLength(
  song: Song,
  newLength: SongLength,
): Song {
  const newConfig: SongConfig = { ...song.config, length: newLength };
  const vibeConfig = VIBE_CONFIG[newConfig.vibe];
  const template = pick(vibeConfig.structures[newLength]);

  const patterns: Record<PatternLabel, Pattern> = {} as Record<PatternLabel, Pattern>;
  const patternRoles: Record<PatternLabel, SectionRole> = {} as Record<PatternLabel, SectionRole>;
  const patternEffects: Record<PatternLabel, PatternEffects> = {} as Record<PatternLabel, PatternEffects>;
  const patternOrder: PatternLabel[] = [];

  for (let i = 0; i < template.roles.length; i++) {
    const label = PATTERN_LABELS[i];
    const role = template.roles[i];
    const { pattern, effects } = generatePatternForRole(newConfig, role, bassBaseOctaveOf(song));
    patterns[label] = pattern;
    patternRoles[label] = role;
    patternEffects[label] = effects;
    patternOrder.push(label);
  }

  return {
    ...song,
    config: newConfig,
    patterns,
    patternRoles,
    patternEffects,
    sequence: [...template.sequence],
    patternOrder,
  };
}

export function regeneratePattern(
  song: Song,
  patternLabel: PatternLabel
): { pattern: Pattern; effects: PatternEffects } {
  const role = song.patternRoles[patternLabel] ?? 'verse';
  return generatePatternForRole(song.config, role, bassBaseOctaveOf(song));
}

export function regenerateChannel(
  song: Song,
  patternLabel: PatternLabel,
  channelIndex: number
): { pattern: Pattern; effects: PatternEffects } {
  const pattern = [...song.patterns[patternLabel]] as Pattern;
  const vibeConfig = VIBE_CONFIG[song.config.vibe];
  const role = song.patternRoles[patternLabel] ?? 'verse';

  const progression = generateChordProgression(
    song.config.vibe, song.config.key, song.config.scale, bassBaseOctaveOf(song)
  );

  const melodyMult = ROLE_MELODY_MULTIPLIER[role];
  const bassMult = ROLE_BASS_MULTIPLIER[role];

  switch (channelIndex) {
    case 0: {
      if (role === 'breakdown') {
        pattern[0] = [0, 0, ...Array(ROWS).fill(0)];
      } else {
        pattern[0] = generateMelodyPattern(
          song.config.key, song.config.scale,
          Math.min(1, vibeConfig.melodyDensity * melodyMult),
          progression
        );
      }
      break;
    }
    case 1: {
      if (role === 'breakdown') {
        pattern[1] = [0, 0, ...Array(ROWS).fill(0)];
      } else {
        const melodyNotes = pattern[0].slice(2);
        pattern[1] = generateHarmonyPattern(
          song.config.key, song.config.scale, melodyNotes, progression
        );
      }
      break;
    }
    case 2: {
      const kickPattern = pattern[3].slice(2).map(n => n > 0 ? 1 : 0);
      pattern[2] = generateBassPattern(
        song.config.key, song.config.scale, kickPattern,
        [
          Math.round(vibeConfig.bassDensity[0] * bassMult),
          Math.round(vibeConfig.bassDensity[1] * bassMult),
        ],
        song.config.vibe, progression
      );
      break;
    }
    case 3: {
      const { channelData } = generateDrumPattern(song.config.vibe);
      pattern[3] = channelData;
      break;
    }
  }

  // Preserve effects for unchanged channels, regenerate for the changed one
  const existingEffects = song.patternEffects?.[patternLabel];
  const effects: PatternEffects = [
    existingEffects?.[0] ?? Array(ROWS).fill(null),
    existingEffects?.[1] ?? Array(ROWS).fill(null),
    existingEffects?.[2] ?? Array(ROWS).fill(null),
    existingEffects?.[3] ?? Array(ROWS).fill(null),
  ];
  effects[channelIndex] = generateChannelEffects(
    channelIndex, pattern[channelIndex].slice(2), song.config, role
  );

  return { pattern, effects };
}

// --- CHANNEL EXPANSION ---
// Expands logical 4-channel song to N physical channels for ZzFXM rendering.
// Notes with effects get routed to separate physical channels that use
// instrument variants with the effect baked into ZzFX params.

interface ExpandedSong {
  instruments: number[][];
  patterns: number[][][];
  sequence: number[];
  bpm: number;
  channelMap: number[]; // channelMap[physicalIdx] = logicalIdx (0-3)
}

const DRUM_CHANNEL = 3;

/**
 * Identifies the instrument a note needs.
 *
 * A note wants a variant when it carries an effect, and — on the drum channel —
 * always, because kick, snare and hat are different instruments rather than
 * different pitches of one. Returns null when the channel's base instrument
 * will do.
 */
function variantKeyFor(ch: number, note: number, fx: NoteEffect | null | undefined): string | null {
  const voice = ch === DRUM_CHANNEL ? drumVoiceOf(note) : null;
  if (!voice && !fx) return null;
  return `${ch}_${voice ?? ''}_${fx ? `${fx.code}${fx.value}` : ''}`;
}

function expandSong(song: Song): ExpandedSong {
  // Every note that needs its own instrument, collected across all patterns.
  const variants = new Map<string, { logicalCh: number; voice: DrumVoice | null; effect: NoteEffect | null }>();

  for (const label of song.patternOrder) {
    const pattern = song.patterns[label];
    const effects = song.patternEffects?.[label];
    for (let ch = 0; ch < 4; ch++) {
      const channelData = pattern[ch];
      if (!channelData) continue;
      for (let row = 0; row < ROWS; row++) {
        const note = channelData[row + 2];
        if (note <= 0) continue;
        const fx = effects?.[ch]?.[row] ?? null;
        const key = variantKeyFor(ch, note, fx);
        if (!key || variants.has(key)) continue;
        variants.set(key, {
          logicalCh: ch,
          voice: ch === DRUM_CHANNEL ? drumVoiceOf(note) : null,
          effect: fx,
        });
      }
    }
  }

  // Nothing needs a variant — the four logical channels render as they are.
  if (variants.size === 0) {
    return {
      instruments: [...song.instruments],
      patterns: song.patternOrder.map((label) => [...song.patterns[label]]),
      sequence: song.sequence,
      bpm: song.config.bpm,
      channelMap: [0, 1, 2, 3],
    };
  }

  const effectKeys = variants;

  // Build expanded instruments: base 4 + effect variants
  const expandedInstruments = song.instruments.map(i => [...i]);
  const effectInstMap = new Map<string, number>();

  for (const [key, { logicalCh, voice, effect }] of effectKeys) {
    // Voice first so the effect modifies the drum it is actually attached to.
    let variant = [...song.instruments[logicalCh]];
    if (voice) variant = drumVoiceInstrument(variant, voice);
    if (effect) variant = applyEffect(variant, effect);
    effectInstMap.set(key, expandedInstruments.length);
    expandedInstruments.push(variant);
  }

  // Build physical channel layout: 0-3 = clean, 4+ = effect channels
  const channelMap: number[] = [0, 1, 2, 3];
  const effectPhysMap = new Map<string, number>();

  for (const [key, { logicalCh }] of effectKeys) {
    effectPhysMap.set(key, channelMap.length);
    channelMap.push(logicalCh);
  }

  const physicalChannelCount = channelMap.length;

  // Build expanded patterns
  const expandedPatterns: number[][][] = [];

  for (const label of song.patternOrder) {
    const pattern = song.patterns[label];
    const effects = song.patternEffects?.[label];

    // Initialize physical channels: [instrument, pan, ...32 zeros]
    const physPattern: number[][] = [];
    for (let p = 0; p < physicalChannelCount; p++) {
      const logCh = channelMap[p];
      physPattern.push([
        p < 4 ? pattern[logCh][0] : 0,
        pattern[logCh][1],
        ...Array(ROWS).fill(0),
      ]);
    }

    // Route notes to clean or effect channels
    for (let ch = 0; ch < 4; ch++) {
      const channelData = pattern[ch];
      const channelEffects = effects?.[ch];

      for (let row = 0; row < ROWS; row++) {
        const note = channelData[row + 2];
        if (note <= 0) continue;

        const fx = channelEffects?.[row] ?? null;
        const key = variantKeyFor(ch, note, fx);

        if (key) {
          const physIdx = effectPhysMap.get(key)!;
          const instIdx = effectInstMap.get(key)!;
          physPattern[physIdx][0] = instIdx;
          physPattern[physIdx][row + 2] = note;
        } else {
          physPattern[ch][row + 2] = note;
        }
      }
    }

    expandedPatterns.push(physPattern);
  }

  return {
    instruments: expandedInstruments,
    patterns: expandedPatterns,
    sequence: song.sequence,
    bpm: song.config.bpm,
    channelMap,
  };
}

// Mix N physical stereo buffers back to 4 logical channel buffers
function mixToLogical(
  physicalBuffers: [number[], number[]][],
  channelMap: number[],
): [number[], number[]][] {
  if (physicalBuffers.length === 0) return [];

  const sampleLength = physicalBuffers[0][0].length;
  const logical: [number[], number[]][] = [];
  for (let ch = 0; ch < 4; ch++) {
    logical.push([new Array(sampleLength).fill(0), new Array(sampleLength).fill(0)]);
  }

  for (let p = 0; p < physicalBuffers.length; p++) {
    const logCh = channelMap[p];
    if (logCh === undefined || logCh < 0 || logCh > 3) continue;
    const [pLeft, pRight] = physicalBuffers[p];
    const [lLeft, lRight] = logical[logCh];
    for (let i = 0; i < sampleLength; i++) {
      lLeft[i] += pLeft[i] || 0;
      lRight[i] += pRight[i] || 0;
    }
  }

  return logical;
}

// Convert Song to expanded ZzFXM arrays (for export and rendering)
export function songToZzfxm(song: Song): {
  instruments: number[][];
  patterns: number[][][];
  sequence: number[];
  bpm: number;
} {
  const { channelMap: _, ...rest } = expandSong(song);
  return rest;
}

// Render song to 4 logical stereo channel buffers (for AudioGraph playback)
export function renderSongBuffers(song: Song): [number[], number[]][] {
  const expanded = expandSong(song);
  const physicalBuffers = zzfxMChannels(
    expanded.instruments, expanded.patterns, expanded.sequence, expanded.bpm
  );
  if (physicalBuffers.length === 0) return [];
  return mixToLogical(physicalBuffers, expanded.channelMap);
}
