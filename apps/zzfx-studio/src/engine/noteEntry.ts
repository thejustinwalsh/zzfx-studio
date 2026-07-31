import { CHROMATIC, SCALES, noteToZzfxm, octaveRangeFor, DEFAULT_BASE_OCTAVE } from './scales';
import type { NoteName, ScaleName } from './types';

// ZzFXM note bounds. 0 is the rest sentinel, so the lowest playable pitch is
// 1 (C#3); 48 is C7, the top of the range the generators target.
export const MIN_NOTE = 1;
export const MAX_NOTE = 48;

// Octave bounds depend on how the channel is tuned — see octaveRangeFor.
export const MIN_OCTAVE = octaveRangeFor(DEFAULT_BASE_OCTAVE).min;
export const MAX_OCTAVE = octaveRangeFor(DEFAULT_BASE_OCTAVE).max;

export const REST = 0;

/** Letter keys to chromatic index. */
const LETTER_CHROMATIC: Record<string, number> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
};

export function isNoteLetter(key: string): boolean {
  return key.toLowerCase() in LETTER_CHROMATIC;
}

export function clampNote(note: number): number {
  return Math.min(MAX_NOTE, Math.max(MIN_NOTE, note));
}

export function clampOctave(
  octave: number,
  baseOctave: number = DEFAULT_BASE_OCTAVE
): number {
  const { min, max } = octaveRangeFor(baseOctave);
  return Math.min(max, Math.max(min, octave));
}

/**
 * Translate a letter key into a note value.
 *
 * `sharp` raises by one semitone with no special casing, so Shift+E is F and
 * Shift+B is C of the next octave.
 *
 * Returns null when the result is not representable: the C of octave
 * `baseOctave - 1` collides with the rest sentinel, and anything past value 48
 * is out of range. Callers should reject the keystroke rather than substitute a
 * different pitch.
 */
export function letterToNote(
  letter: string,
  sharp: boolean,
  octave: number,
  baseOctave: number = DEFAULT_BASE_OCTAVE
): number | null {
  const chromatic = LETTER_CHROMATIC[letter.toLowerCase()];
  if (chromatic === undefined) return null;

  const note = noteToZzfxm(chromatic + (sharp ? 1 : 0), octave, baseOctave);
  if (note < MIN_NOTE || note > MAX_NOTE) return null;
  return note;
}

/** Note values of the scale across the full playable range, ascending. */
function scalePitches(key: NoteName, scale: ScaleName): number[] {
  const rootIdx = CHROMATIC.indexOf(key);
  const intervals = SCALES[scale];
  const pitchClasses = new Set(intervals.map(i => (rootIdx + i) % 12));

  const notes: number[] = [];
  for (let n = MIN_NOTE; n <= MAX_NOTE; n++) {
    if (pitchClasses.has(n % 12)) notes.push(n);
  }
  return notes;
}

/**
 * Step a note by one scale degree.
 *
 * A note already in the scale moves to the adjacent degree. A note off the
 * scale — which keyboard entry can produce — snaps to the nearest scale note in
 * the direction of travel, so one step pulls it back into key.
 *
 * Clamps at the ends of the range rather than wrapping.
 */
export function scaleStep(
  note: number,
  dir: 1 | -1,
  key: NoteName,
  scale: ScaleName
): number {
  const pitches = scalePitches(key, scale);
  if (pitches.length === 0) return note;

  if (note <= REST) {
    // Entering from a rest starts at the tonic nearest the middle of the range.
    return pitches[Math.floor(pitches.length / 2)];
  }

  if (dir === 1) {
    const next = pitches.find(p => p > note);
    return next ?? pitches[pitches.length - 1];
  }
  const prevs = pitches.filter(p => p < note);
  return prevs.length > 0 ? prevs[prevs.length - 1] : pitches[0];
}

/** Step a note by a full octave, clamped to the playable range. */
export function octaveStep(note: number, dir: 1 | -1): number {
  if (note <= REST) return note;
  const shifted = note + dir * 12;
  if (shifted < MIN_NOTE || shifted > MAX_NOTE) return note;
  return shifted;
}

// Drum ranges mirror drumNoteToName's thresholds in types.ts.
export const DRUM_RANGES = [
  { name: 'KCK', min: 1, max: 6 },
  { name: 'SNR', min: 7, max: 22 },
  { name: 'HAT', min: 23, max: MAX_NOTE },
] as const;

const DRUM_LETTERS: Record<string, number> = { k: 0, s: 1, h: 2 };

export function isDrumLetter(key: string): boolean {
  return key.toLowerCase() in DRUM_LETTERS;
}

/** Canonical note value for a drum mnemonic key, or null if unmapped. */
export function drumFromLetter(letter: string): number | null {
  const idx = DRUM_LETTERS[letter.toLowerCase()];
  if (idx === undefined) return null;
  // Canonical values from DRUM_NOTES: kick 1, snare 14, hat 32.
  return [1, 14, 32][idx];
}

function drumRangeIndex(note: number): number {
  const idx = DRUM_RANGES.findIndex(r => note >= r.min && note <= r.max);
  return idx < 0 ? 0 : idx;
}

/** Cycle to the next drum type, clamped at the ends. */
export function cycleDrum(note: number, dir: 1 | -1): number {
  if (note <= REST) return dir === 1 ? 1 : 1;
  const idx = drumRangeIndex(note);
  const nextIdx = Math.min(DRUM_RANGES.length - 1, Math.max(0, idx + dir));
  return [1, 14, 32][nextIdx];
}

/** Nudge pitch within the current drum's range, so the drum type is stable. */
export function nudgeDrum(note: number, dir: 1 | -1): number {
  if (note <= REST) return note;
  const range = DRUM_RANGES[drumRangeIndex(note)];
  return Math.min(range.max, Math.max(range.min, note + dir));
}
