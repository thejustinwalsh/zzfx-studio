import { NoteName, ScaleName, ChannelData } from './types';
import { ChordProgression } from './chords';

const ROWS = 32;
const ROWS_PER_CHORD = 8;

// Bass rhythm templates for one chord segment (8 rows)
// Bass is simple and supportive — anchors the harmony
const BASS_TEMPLATES = {
  // Steady: root on every other step
  steady: [
    [1, 0, 1, 0, 1, 0, 1, 0],
    [1, 0, 0, 1, 1, 0, 0, 1],
  ],
  // Sparse: root on downbeats only
  sparse: [
    [1, 0, 0, 0, 1, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, 0, 0, 0],
  ],
  // Driving: heavy eighth notes
  driving: [
    [1, 1, 1, 0, 1, 1, 1, 0],
    [1, 0, 1, 1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1, 1, 0, 1],
  ],
  // Walking: fills between beats
  walking: [
    [1, 0, 1, 0, 1, 0, 1, 1],
    [1, 0, 0, 1, 0, 1, 0, 1],
  ],
};

type BassStyle = keyof typeof BASS_TEMPLATES;

// What note to play on each hit:
// 'root' = chord root only (simple)
// 'root-fifth' = alternates root and 5th
// 'root-walk' = root on strong beats, passing tones on weak
type BassVoicing = 'root' | 'root-fifth' | 'root-walk';

interface BassConfig {
  styles: BassStyle[];
  voicing: BassVoicing;
}

const VIBE_BASS: Record<string, BassConfig> = {
  adventure: { styles: ['steady', 'walking'], voicing: 'root-fifth' },
  battle:    { styles: ['driving', 'steady'], voicing: 'root-fifth' },
  dungeon:   { styles: ['sparse'], voicing: 'root' },
  titleScreen: { styles: ['steady', 'sparse'], voicing: 'root-fifth' },
  boss:      { styles: ['driving'], voicing: 'root-walk' },
};

function generateBassSegment(
  rhythm: number[],
  root: number,
  fifth: number,
  third: number,
  voicing: BassVoicing,
): number[] {
  const segment: number[] = Array(ROWS_PER_CHORD).fill(0);
  let hitIndex = 0;

  for (let i = 0; i < ROWS_PER_CHORD; i++) {
    if (!rhythm[i]) continue;

    switch (voicing) {
      case 'root':
        segment[i] = root;
        break;
      case 'root-fifth':
        // Root on strong beats (0, 4), fifth on others
        segment[i] = (i === 0 || i === 4) ? root : fifth;
        break;
      case 'root-walk':
        // Root first, then walk through chord tones
        if (hitIndex === 0) segment[i] = root;
        else if (hitIndex % 3 === 1) segment[i] = third;
        else if (hitIndex % 3 === 2) segment[i] = fifth;
        else segment[i] = root;
        break;
    }
    hitIndex++;
  }

  return segment;
}

export function generateBassPattern(
  key: NoteName,
  scale: ScaleName,
  kickPattern: number[],
  densityRange: [number, number],
  vibe: string,
  progression: ChordProgression,
): ChannelData {
  const config = VIBE_BASS[vibe] || VIBE_BASS.adventure;
  const style = config.styles[Math.floor(Math.random() * config.styles.length)];
  const templates = BASS_TEMPLATES[style];
  const rhythm = templates[Math.floor(Math.random() * templates.length)];

  const notes: number[] = [];

  for (let chordIdx = 0; chordIdx < 4; chordIdx++) {
    const chord = progression.chords[chordIdx];
    const segment = generateBassSegment(
      rhythm,
      chord.root,
      chord.fifth,
      chord.third,
      config.voicing,
    );

    // Sync with kick: if kick hits and bass doesn't, 40% chance to add root
    for (let i = 0; i < ROWS_PER_CHORD; i++) {
      const globalRow = chordIdx * ROWS_PER_CHORD + i;
      if (kickPattern[globalRow] && segment[i] === 0 && Math.random() < 0.4) {
        segment[i] = chord.root;
      }
    }

    notes.push(...segment);
  }

  return [2, 0, ...notes];
}
