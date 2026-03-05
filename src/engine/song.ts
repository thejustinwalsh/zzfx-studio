import {
  Song,
  SongConfig,
  SongLength,
  SectionRole,
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

function generatePatternForRole(config: SongConfig, role: SectionRole): Pattern {
  const vibeConfig = VIBE_CONFIG[config.vibe];

  // Generate chord progression — contrast/bridge/climax get fresh progressions
  const progression = generateChordProgression(config.vibe, config.key, config.scale);

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
    return [silentChannel, silentChannel, bassChannel, drumChannel] as Pattern;
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

  return [melodyChannel, harmonyChannel, bassChannel, drumChannel] as Pattern;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateSong(config?: Partial<SongConfig>): Song {
  const vibe: VibeName = config?.vibe ?? 'adventure';
  const vibeConfig = VIBE_CONFIG[vibe];
  const length: SongLength = config?.length ?? 'long';

  const fullConfig: SongConfig = {
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
  const patternOrder: PatternLabel[] = [];

  for (let i = 0; i < template.roles.length; i++) {
    const label = PATTERN_LABELS[i];
    const role = template.roles[i];
    patterns[label] = generatePatternForRole(fullConfig, role);
    patternRoles[label] = role;
    patternOrder.push(label);
  }

  return {
    config: fullConfig,
    instruments,
    patterns,
    patternRoles,
    sequence: [...template.sequence],
    patternOrder,
  };
}

export function regeneratePattern(
  song: Song,
  patternLabel: PatternLabel
): Pattern {
  const role = song.patternRoles[patternLabel] ?? 'verse';
  return generatePatternForRole(song.config, role);
}

export function regenerateChannel(
  song: Song,
  patternLabel: PatternLabel,
  channelIndex: number
): Pattern {
  const pattern = [...song.patterns[patternLabel]] as Pattern;
  const vibeConfig = VIBE_CONFIG[song.config.vibe];
  const role = song.patternRoles[patternLabel] ?? 'verse';

  const progression = generateChordProgression(
    song.config.vibe, song.config.key, song.config.scale
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
