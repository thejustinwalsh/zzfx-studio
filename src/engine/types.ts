export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type ScaleName = 'major' | 'minor' | 'pentatonic' | 'dorian' | 'mixolydian' | 'harmonicMinor';

export type VibeName = 'adventure' | 'battle' | 'dungeon' | 'titleScreen' | 'boss';

export type PatternLabel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

// Effect codes — retro-authentic per-note effects
export type EffectCode = 'SU' | 'SD' | 'VB' | 'DT' | 'ST' | 'PD' | 'BC' | 'TR';

export const EFFECT_CODES: EffectCode[] = ['SU', 'SD', 'VB', 'DT', 'ST', 'PD', 'BC', 'TR'];

export interface NoteEffect {
  code: EffectCode;
  value: number; // 0x00-0xFF
}

// Per-channel effects for one pattern (parallel to 32 notes in ChannelData)
export type ChannelEffects = (NoteEffect | null)[];

// Effects for all 4 channels in one pattern
export type PatternEffects = [ChannelEffects, ChannelEffects, ChannelEffects, ChannelEffects];

export function effectToDisplayString(effect: NoteEffect | null | undefined): string {
  if (!effect) return '----';
  return `${effect.code}${effect.value.toString(16).toUpperCase().padStart(2, '0')}`;
}

// ZzFX 20-parameter sound array
export type ZzFXSound = number[];

// Channel data for one channel in one pattern: [instrumentIndex, pan, ...32 notes]
export type ChannelData = number[];

// A pattern contains 4 channels: melody, harmony, bass, drums
export type Pattern = [ChannelData, ChannelData, ChannelData, ChannelData];

// Drum note encoding — different note values produce different drum sounds
// via pitch variation on the noise instrument
export const DRUM_NOTES = {
  KICK: 1,   // very low pitch = deep kick thump
  SNARE: 14, // mid-high pitch = snare crack
  HAT: 32,   // high pitch = hi-hat sizzle
} as const;

export type DrumType = keyof typeof DRUM_NOTES;

export function drumNoteToName(note: number): string {
  if (note <= 0) return '---';
  if (note <= 6) return 'KCK';
  if (note <= 22) return 'SNR';
  return 'HAT';
}

export type SongLength = 'short' | 'long' | 'epic';

// Section roles define HOW a unique pattern is generated
export type SectionRole = 'verse' | 'contrast' | 'bridge' | 'breakdown' | 'climax';

// A structure template: roles for each unique pattern + the playback sequence
export interface StructureTemplate {
  roles: SectionRole[];   // role per unique pattern (A=roles[0], B=roles[1], etc.)
  sequence: number[];     // playback order referencing pattern indices
}

export interface SongConfig {
  name: string;
  vibe: VibeName;
  key: NoteName;
  scale: ScaleName;
  bpm: number;
  length: SongLength;
}

export interface Song {
  config: SongConfig;
  instruments: ZzFXSound[];
  patterns: Record<PatternLabel, Pattern>;
  patternRoles: Record<PatternLabel, SectionRole>;
  patternEffects: Record<PatternLabel, PatternEffects>;
  sequence: number[];
  patternOrder: PatternLabel[];
}

export interface ScaleNote {
  name: string;
  note: number; // ZzFXM note value (0 = rest, 12 = instrument base freq)
}

export interface VibeConfig {
  bpmRange: [number, number];
  preferredScales: ScaleName[];
  melodyDensity: number;
  bassDensity: [number, number];
  drumIntensity: 'sparse' | 'light' | 'medium' | 'high' | 'intense';
  structures: Record<SongLength, StructureTemplate[]>;
  fxChance: number;
}
