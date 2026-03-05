import {
  Song,
  SongConfig,
  Pattern,
  PatternLabel,
  VibeName,
} from './types';
import { VIBE_CONFIG, getRandomBpm } from './vibes';
import { generateInstruments } from './instruments';
import { generateDrumPattern } from './drums';
import { generateBassPattern } from './bass';
import { generateMelodyPattern } from './melody';
import { generateHarmonyPattern } from './harmony';
import { generateChordProgression } from './chords';

const PATTERN_LABELS: PatternLabel[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function generateSinglePattern(config: SongConfig): Pattern {
  const vibeConfig = VIBE_CONFIG[config.vibe];

  // 0. Chord progression first — everything else reacts to this
  const progression = generateChordProgression(config.vibe, config.key, config.scale);

  // 1. Drums (structural backbone)
  const { channelData: drumChannel, kickPattern } = generateDrumPattern(config.vibe);

  // 2. Melody built around chord tones
  const melodyChannel = generateMelodyPattern(
    config.key,
    config.scale,
    vibeConfig.melodyDensity,
    progression
  );

  // 3. Bass follows chord roots + kick
  const bassChannel = generateBassPattern(
    config.key,
    config.scale,
    kickPattern,
    vibeConfig.bassDensity,
    config.vibe,
    progression
  );

  // 4. Harmony arpeggates chord tones, reacts to melody
  const melodyNotes = melodyChannel.slice(2); // skip instrument + pan
  const harmonyChannel = generateHarmonyPattern(
    config.key,
    config.scale,
    melodyNotes,
    progression
  );

  // 4-channel pattern: melody, harmony, bass, drums
  return [melodyChannel, harmonyChannel, bassChannel, drumChannel] as Pattern;
}

// Generate a pattern variant by regenerating with slight modifications
function generateVariantPattern(
  config: SongConfig,
  _basePattern: Pattern
): Pattern {
  // For now, just generate a fresh pattern
  // Future: could mutate the base pattern slightly
  return generateSinglePattern(config);
}

export function generateSong(config?: Partial<SongConfig>): Song {
  const vibe: VibeName = config?.vibe ?? 'adventure';
  const vibeConfig = VIBE_CONFIG[vibe];

  const fullConfig: SongConfig = {
    vibe,
    key: config?.key ?? 'C',
    scale: config?.scale ?? vibeConfig.preferredScales[
      Math.floor(Math.random() * vibeConfig.preferredScales.length)
    ],
    bpm: config?.bpm ?? getRandomBpm(vibe),
  };

  const instruments = generateInstruments(vibe);
  const structure = vibeConfig.structures[
    Math.floor(Math.random() * vibeConfig.structures.length)
  ];

  // Determine unique pattern count needed
  const uniquePatternIndices = [...new Set(structure)].sort();
  const patternCount = uniquePatternIndices.length;

  // Generate unique patterns
  const patterns: Record<PatternLabel, Pattern> = {} as Record<PatternLabel, Pattern>;
  const patternOrder: PatternLabel[] = [];

  // Generate first pattern as base
  const basePattern = generateSinglePattern(fullConfig);
  patterns[PATTERN_LABELS[0]] = basePattern;
  patternOrder.push(PATTERN_LABELS[0]);

  // Generate variant patterns for each additional unique index
  for (let i = 1; i < patternCount; i++) {
    const label = PATTERN_LABELS[i];
    patterns[label] = generateVariantPattern(fullConfig, basePattern);
    patternOrder.push(label);
  }

  // Build sequence from structure
  const sequence = structure.map(idx => idx);

  return {
    config: fullConfig,
    instruments,
    patterns,
    sequence,
    patternOrder,
  };
}

export function regeneratePattern(
  song: Song,
  patternLabel: PatternLabel
): Pattern {
  return generateSinglePattern(song.config);
}

export function regenerateChannel(
  song: Song,
  patternLabel: PatternLabel,
  channelIndex: number
): Pattern {
  const pattern = [...song.patterns[patternLabel]] as Pattern;
  const vibeConfig = VIBE_CONFIG[song.config.vibe];

  // Need a chord progression for regeneration
  const progression = generateChordProgression(
    song.config.vibe,
    song.config.key,
    song.config.scale
  );

  switch (channelIndex) {
    case 0: {
      pattern[0] = generateMelodyPattern(
        song.config.key,
        song.config.scale,
        vibeConfig.melodyDensity,
        progression
      );
      break;
    }
    case 1: {
      const melodyNotes = pattern[0].slice(2);
      pattern[1] = generateHarmonyPattern(
        song.config.key,
        song.config.scale,
        melodyNotes,
        progression
      );
      break;
    }
    case 2: {
      const kickPattern = pattern[3].slice(2).map(n => n > 0 ? 1 : 0);
      pattern[2] = generateBassPattern(
        song.config.key,
        song.config.scale,
        kickPattern,
        vibeConfig.bassDensity,
        song.config.vibe,
        progression
      );
      break;
    }
    case 3: {
      const { channelData } = generateDrumPattern(song.config.vibe);
      pattern[3] = channelData;
      break;
    }
  }

  return pattern;
}

// Convert our Song format to ZzFXM-compatible arrays
export function songToZzfxm(song: Song): {
  instruments: number[][];
  patterns: number[][][];
  sequence: number[];
  bpm: number;
} {
  const patternArrays: number[][][] = [];

  for (const label of song.patternOrder) {
    patternArrays.push(song.patterns[label]);
  }

  return {
    instruments: song.instruments,
    patterns: patternArrays,
    sequence: song.sequence,
    bpm: song.config.bpm,
  };
}
