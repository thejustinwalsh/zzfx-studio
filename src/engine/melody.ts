import { NoteName, ScaleName, ChannelData } from './types';
import { getScaleNotes } from './scales';
import { ChordProgression } from './chords';

const ROWS = 32;
const ROWS_PER_CHORD = 8;

// Melody rhythm templates — where notes land within an 8-row chord segment
// These create recognizable, musical phrase shapes
const RHYTHM_TEMPLATES = [
  [1, 0, 1, 0, 1, 0, 1, 0],  // steady eighth notes
  [1, 0, 0, 1, 1, 0, 0, 1],  // syncopated
  [1, 0, 1, 0, 1, 0, 0, 0],  // front-heavy (rest at end)
  [1, 0, 0, 1, 0, 0, 1, 0],  // dotted feel
  [1, 1, 0, 1, 1, 0, 1, 0],  // driving
  [1, 0, 1, 1, 0, 1, 0, 0],  // triplet-ish
];

// Sparse templates for dungeon/ambient vibes
const SPARSE_RHYTHM_TEMPLATES = [
  [1, 0, 0, 0, 1, 0, 0, 0],  // half notes
  [1, 0, 0, 0, 0, 0, 1, 0],  // wide spacing
  [1, 0, 0, 1, 0, 0, 0, 0],  // two hits
  [1, 0, 0, 0, 0, 1, 0, 0],  // offset pair
];

// Dense templates for battle/boss vibes
const DENSE_RHYTHM_TEMPLATES = [
  [1, 1, 1, 0, 1, 1, 1, 0],  // running notes
  [1, 0, 1, 1, 1, 0, 1, 1],  // driving sixteenths
  [1, 1, 0, 1, 1, 0, 1, 1],  // gallop
  [1, 1, 1, 1, 0, 1, 1, 0],  // burst + rest
];

function pickRhythm(density: number): number[] {
  if (density < 0.35) {
    return SPARSE_RHYTHM_TEMPLATES[Math.floor(Math.random() * SPARSE_RHYTHM_TEMPLATES.length)];
  }
  if (density > 0.65) {
    return DENSE_RHYTHM_TEMPLATES[Math.floor(Math.random() * DENSE_RHYTHM_TEMPLATES.length)];
  }
  return RHYTHM_TEMPLATES[Math.floor(Math.random() * RHYTHM_TEMPLATES.length)];
}

// Generate a melodic phrase for one chord segment (8 rows)
// Phrases are built around chord tones with passing scale notes
function generatePhrase(
  chordRoot: number,
  chordThird: number,
  chordFifth: number,
  rhythm: number[],
  scaleNotes: number[],
): number[] {
  const phrase: number[] = Array(ROWS_PER_CHORD).fill(0);
  const chordTones = [chordRoot, chordThird, chordFifth];

  // Find nearby scale notes for passing tones
  const nearbyNotes = scaleNotes.filter(
    n => n >= chordRoot - 2 && n <= chordFifth + 4
  );

  let hitCount = 0;
  const totalHits = rhythm.filter(r => r).length;

  for (let i = 0; i < ROWS_PER_CHORD; i++) {
    if (!rhythm[i]) continue;

    hitCount++;

    if (hitCount === 1) {
      // First note: always a chord tone (usually root or 3rd)
      phrase[i] = Math.random() < 0.6 ? chordRoot : chordThird;
    } else if (hitCount === totalHits) {
      // Last note: chord tone (creates resolution)
      phrase[i] = chordTones[Math.floor(Math.random() * chordTones.length)];
    } else if (Math.random() < 0.5) {
      // 50% chord tone
      phrase[i] = chordTones[Math.floor(Math.random() * chordTones.length)];
    } else {
      // 50% passing scale tone
      if (nearbyNotes.length > 0) {
        phrase[i] = nearbyNotes[Math.floor(Math.random() * nearbyNotes.length)];
      } else {
        phrase[i] = chordRoot;
      }
    }
  }

  return phrase;
}

export function generateMelodyPattern(
  key: NoteName,
  scale: ScaleName,
  density: number,
  progression: ChordProgression
): ChannelData {
  const scaleNotes = getScaleNotes(key, scale, 4, 5).map(n => n.note);
  if (scaleNotes.length === 0) {
    return [0, 0, ...Array(ROWS).fill(0)];
  }

  const notes: number[] = [];

  // Pick 2 rhythm templates — one for phrases 1&3, one for phrases 2&4
  // This creates ABAB or ABAC phrase structure (repetition = musicality)
  const rhythmA = pickRhythm(density);
  const rhythmB = pickRhythm(density);

  for (let chordIdx = 0; chordIdx < 4; chordIdx++) {
    const chord = progression.chords[chordIdx];
    const rhythm = (chordIdx % 2 === 0) ? rhythmA : rhythmB;

    const phrase = generatePhrase(
      chord.rootMelody,
      chord.thirdMelody,
      chord.fifthMelody,
      rhythm,
      scaleNotes,
    );

    notes.push(...phrase);
  }

  // Repetition pass: 30% chance to copy phrase 1 to phrase 3 exactly
  // This creates the "theme" feel of game music
  if (Math.random() < 0.3) {
    for (let i = 0; i < ROWS_PER_CHORD; i++) {
      notes[16 + i] = notes[i]; // copy chord 1 phrase to chord 3
    }
  }

  return [0, 0, ...notes];
}
