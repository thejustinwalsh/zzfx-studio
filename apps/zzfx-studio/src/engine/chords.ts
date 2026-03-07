import { VibeName, NoteName, ScaleName } from './types';
import { CHROMATIC, SCALES, noteToZzfxm } from './scales';

const ROWS = 32;
const ROWS_PER_CHORD = 8; // 4 chords per 32-row pattern

// Chord quality: which scale degrees make up the chord (0-indexed from chord root)
// In a 7-note scale, triad = root + 2 degrees up + 4 degrees up
type ChordDegree = number; // scale degree index (0 = root of key)

// Progressions as arrays of scale degree roots (0-indexed)
// e.g., [0, 4, 5, 3] = I-V-vi-IV in major
interface Progression {
  degrees: number[];
  weight: number; // selection probability weight
}

const PROGRESSIONS: Record<VibeName, Progression[]> = {
  adventure: [
    { degrees: [0, 4, 5, 3], weight: 3 },  // I-V-vi-IV (pop/adventure classic)
    { degrees: [0, 3, 4, 0], weight: 2 },  // I-IV-V-I (strong resolution)
    { degrees: [0, 5, 3, 4], weight: 2 },  // I-vi-IV-V (50s progression)
    { degrees: [0, 3, 0, 4], weight: 1 },  // I-IV-I-V
  ],
  battle: [
    { degrees: [0, 2, 6, 5], weight: 3 },  // i-III-VII-VI (epic minor)
    { degrees: [0, 3, 4, 0], weight: 2 },  // i-iv-V-i
    { degrees: [0, 6, 5, 4], weight: 2 },  // i-VII-VI-V (descending)
    { degrees: [0, 4, 3, 6], weight: 1 },  // i-v-iv-VII
  ],
  dungeon: [
    { degrees: [0, 3, 0, 4], weight: 3 },  // i-iv-i-v (brooding)
    { degrees: [0, 6, 0, 5], weight: 2 },  // i-VII-i-VI (dark)
    { degrees: [0, 5, 3, 4], weight: 2 },  // i-VI-iv-v
    { degrees: [0, 3, 5, 6], weight: 1 },  // i-iv-VI-VII
  ],
  titleScreen: [
    { degrees: [0, 4, 5, 3], weight: 3 },  // I-V-vi-IV
    { degrees: [0, 3, 4, 0], weight: 3 },  // I-IV-V-I
    { degrees: [0, 5, 3, 4], weight: 2 },  // I-vi-IV-V
    { degrees: [0, 2, 3, 4], weight: 1 },  // I-iii-IV-V
  ],
  boss: [
    { degrees: [0, 6, 5, 6], weight: 3 },  // i-VII-VI-VII (driving)
    { degrees: [0, 2, 5, 4], weight: 2 },  // i-III-VI-V (dramatic)
    { degrees: [0, 4, 3, 6], weight: 2 },  // i-v-iv-VII
    { degrees: [0, 3, 6, 4], weight: 1 },  // i-iv-VII-v
  ],
};

export interface ChordInfo {
  root: number;        // ZzFXM note value for chord root (bass octave)
  third: number;       // ZzFXM note value for chord 3rd
  fifth: number;       // ZzFXM note value for chord 5th
  rootMelody: number;  // chord root in melody octave
  thirdMelody: number; // chord 3rd in melody octave
  fifthMelody: number; // chord 5th in melody octave
}

export interface ChordProgression {
  chords: ChordInfo[];       // 4 chords
  chordAtRow: ChordInfo[];   // 32 entries, one per row
}

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// Build a triad from a scale degree
function buildChord(
  degree: number,
  rootName: NoteName,
  scale: ScaleName,
  bassOctave: number,
  melodyOctave: number
): ChordInfo {
  const rootIdx = CHROMATIC.indexOf(rootName);
  const intervals = SCALES[scale];

  // Get the chromatic index of the chord root
  const chordRootInterval = intervals[degree % intervals.length];
  const chordRootChromatic = (rootIdx + chordRootInterval) % 12;

  // 3rd = 2 scale degrees above chord root
  const thirdDegree = (degree + 2) % intervals.length;
  const thirdInterval = intervals[thirdDegree];
  const thirdChromatic = (rootIdx + thirdInterval) % 12;

  // 5th = 4 scale degrees above chord root
  const fifthDegree = (degree + 4) % intervals.length;
  const fifthInterval = intervals[fifthDegree];
  const fifthChromatic = (rootIdx + fifthInterval) % 12;

  // Calculate octave adjustments (3rd/5th may wrap around)
  const thirdOctaveAdj = thirdChromatic < chordRootChromatic ? 1 : 0;
  const fifthOctaveAdj = fifthChromatic < chordRootChromatic ? 1 : 0;

  return {
    root: noteToZzfxm(chordRootChromatic, bassOctave),
    third: noteToZzfxm(thirdChromatic, bassOctave + thirdOctaveAdj),
    fifth: noteToZzfxm(fifthChromatic, bassOctave + fifthOctaveAdj),
    rootMelody: noteToZzfxm(chordRootChromatic, melodyOctave),
    thirdMelody: noteToZzfxm(thirdChromatic, melodyOctave + thirdOctaveAdj),
    fifthMelody: noteToZzfxm(fifthChromatic, melodyOctave + fifthOctaveAdj),
  };
}

export function generateChordProgression(
  vibe: VibeName,
  key: NoteName,
  scale: ScaleName
): ChordProgression {
  const progression = pickWeighted(PROGRESSIONS[vibe]);

  const chords = progression.degrees.map(degree =>
    buildChord(degree, key, scale, 3, 4)
  );

  // Map each row to its chord (8 rows per chord)
  const chordAtRow: ChordInfo[] = [];
  for (let i = 0; i < ROWS; i++) {
    const chordIdx = Math.floor(i / ROWS_PER_CHORD);
    chordAtRow.push(chords[chordIdx]);
  }

  return { chords, chordAtRow };
}
