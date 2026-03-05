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
// Note 0 = rest (silence)
// Note N = semitone offset where 12 = instrument base frequency
// We set instrument freq to 261.63 (C4), so note 12 = C4 (middle C)
// C3 = 0 (rest, not playable), C#3 = 1, D3 = 2, ...
// C4 = 12, C5 = 24, C6 = 36, C7 = 48

const BASE_OCTAVE_OFFSET = 4; // note 12 = C4

export function noteToZzfxm(chromaticIndex: number, octave: number): number {
  return chromaticIndex + (octave - BASE_OCTAVE_OFFSET) * 12 + 12;
}

export function zzfxmToNoteName(note: number): string {
  if (note <= 0) return '---';
  const semitone = note % 12;
  const octave = Math.floor(note / 12) + 3;
  return `${CHROMATIC[semitone]}${octave}`;
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
        notes.push({
          name: `${CHROMATIC[noteIdx]}${noteOct}`,
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
