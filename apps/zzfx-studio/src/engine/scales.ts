import { NoteName, ScaleName, ScaleNote } from './types';

export const CHROMATIC: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

// ZzFXM note encoding:
// Note 0 = rest (silence) — reserved by the renderer, never a pitch
// Note N = semitone offset where 12 = the instrument's own frequency
//
// So the octave that note 12 lands on is a property of the INSTRUMENT, not of
// the format. An instrument tuned to 261.63 (C4) puts note 12 at C4; one tuned
// to 130.81 (C3) puts note 12 at C3. Channels tune to their own register, which
// is what the frequency parameter is for.
//
// Every octave has one unreachable note: the C of octave `base - 1` encodes to
// exactly 0 and collides with the rest sentinel. Tuning a channel to its own
// register moves that hole below the notes the channel actually uses.

/** Tuning references. Note 12 sounds exactly the instrument's frequency.
 *  C3 is derived rather than written as 130.81 so that it is exactly an octave
 *  below C4 — the rounded literal is off by 0.07 cents, and deriving it makes
 *  retuning a channel provably pitch-preserving instead of merely close. */
export const FREQ_C4 = 261.63;
export const FREQ_C3 = FREQ_C4 / 2;

export const DEFAULT_BASE_OCTAVE = 4;

/**
 * The octave a channel's note values are measured from, read back from how its
 * instrument is tuned. Keeps note names honest for songs saved under any
 * tuning, so no stored song needs migrating.
 */
export function baseOctaveFromFreq(freq: number): number {
  if (!freq || freq <= 0) return DEFAULT_BASE_OCTAVE;
  return Math.round(Math.log2(freq / FREQ_C4)) + DEFAULT_BASE_OCTAVE;
}

/** Octaves a channel can address: below `base - 1` and above `base + 3` the
 *  values fall outside 1..48. */
export function octaveRangeFor(baseOctave: number): { min: number; max: number } {
  return { min: baseOctave - 1, max: baseOctave + 3 };
}

export function noteToZzfxm(
  chromaticIndex: number,
  octave: number,
  baseOctave: number = DEFAULT_BASE_OCTAVE
): number {
  return chromaticIndex + (octave - baseOctave) * 12 + 12;
}

export function zzfxmToNoteName(
  note: number,
  baseOctave: number = DEFAULT_BASE_OCTAVE
): string {
  if (note <= 0) return '---';
  const semitone = ((note % 12) + 12) % 12;
  const octave = Math.floor(note / 12) + baseOctave - 1;
  const name = CHROMATIC[semitone];
  return `${name}${name.length === 1 ? '-' : ''}${octave}`;
}

export function getScaleNotes(
  root: NoteName,
  scale: ScaleName,
  octaveLow: number,
  octaveHigh: number
): ScaleNote[] {
  const rootIdx = CHROMATIC.indexOf(root);
  const intervals = SCALES[scale];
  const notes: ScaleNote[] = [];

  for (let oct = octaveLow; oct <= octaveHigh; oct++) {
    for (const interval of intervals) {
      const noteIdx = (rootIdx + interval) % 12;
      const noteOct = oct + Math.floor((rootIdx + interval) / 12);
      const zzfxmNote = noteToZzfxm(noteIdx, noteOct);
      if (zzfxmNote > 0 && zzfxmNote <= 48) {
        const noteName = CHROMATIC[noteIdx];
        notes.push({
          name: `${noteName}${noteName.length === 1 ? '-' : ''}${noteOct}`,
          note: zzfxmNote,
        });
      }
    }
  }

  return notes;
}

export function findScaleDegreeAbove(
  baseNote: number,
  degreesUp: number,
  scaleNotes: ScaleNote[]
): number {
  const idx = scaleNotes.findIndex(n => n.note >= baseNote);
  if (idx < 0) return baseNote;
  const targetIdx = Math.min(idx + degreesUp, scaleNotes.length - 1);
  return scaleNotes[targetIdx].note;
}
