import { NoteName, ScaleName, ChannelData } from './types';
import { ChordProgression } from './chords';

const ROWS = 32;
const ROWS_PER_CHORD = 8;

// Harmony patterns for one chord segment
// These define how chord tones are arpeggiated
// r=root, t=third, f=fifth, 0=rest
type ArpNote = 'r' | 't' | 'f' | '0';

const ARP_PATTERNS: ArpNote[][] = [
  // Classic arpeggios
  ['r', 't', 'f', 't', 'r', 't', 'f', 't'],    // up-down
  ['r', 'f', 't', '0', 'r', 'f', 't', '0'],    // wide bounce
  ['r', '0', 't', '0', 'f', '0', 't', '0'],    // spaced arp
  ['r', 't', 'f', '0', 'f', 't', 'r', '0'],    // full cycle

  // Pad-like (sustained chord tones)
  ['r', '0', '0', '0', 't', '0', '0', '0'],    // sparse pad
  ['f', '0', '0', 'r', '0', '0', 't', '0'],    // wide pad

  // Rhythmic
  ['r', 'r', 't', 't', 'f', 'f', 't', 't'],    // doubled
  ['r', '0', 'r', 't', '0', 't', 'f', '0'],    // stutter arp
];

const SPARSE_ARP_PATTERNS: ArpNote[][] = [
  ['r', '0', '0', '0', 't', '0', '0', '0'],
  ['r', '0', '0', '0', '0', '0', 'f', '0'],
  ['t', '0', '0', '0', '0', '0', '0', '0'],
  ['r', '0', '0', 'f', '0', '0', '0', '0'],
];

const DENSE_ARP_PATTERNS: ArpNote[][] = [
  ['r', 't', 'f', 'r', 't', 'f', 'r', 't'],    // continuous up
  ['r', 'r', 't', 'f', 'f', 't', 'r', 'r'],    // pulsing
  ['r', 't', 'f', 't', 'f', 'r', 't', 'f'],    // rolling
];

function pickArpPattern(melodyNotes: number[]): ArpNote[] {
  // Count how many melody notes are active to gauge density
  const melodyDensity = melodyNotes.filter(n => n > 0).length / melodyNotes.length;

  if (melodyDensity > 0.5) {
    // Dense melody: use sparse harmony to avoid clutter
    return SPARSE_ARP_PATTERNS[Math.floor(Math.random() * SPARSE_ARP_PATTERNS.length)];
  }
  if (melodyDensity < 0.2) {
    // Sparse melody: harmony can be denser to fill space
    return DENSE_ARP_PATTERNS[Math.floor(Math.random() * DENSE_ARP_PATTERNS.length)];
  }
  return ARP_PATTERNS[Math.floor(Math.random() * ARP_PATTERNS.length)];
}

function resolveArpNote(
  arpNote: ArpNote,
  root: number,
  third: number,
  fifth: number,
): number {
  switch (arpNote) {
    case 'r': return root;
    case 't': return third;
    case 'f': return fifth;
    case '0': return 0;
  }
}

export function generateHarmonyPattern(
  key: NoteName,
  scale: ScaleName,
  melodyNotes: number[],
  progression: ChordProgression
): ChannelData {
  const notes: number[] = [];

  // Pick one arp pattern for the whole pattern (consistency)
  // But allow a second pattern for contrast in chords 2&4
  const arpA = pickArpPattern(melodyNotes);
  const arpB = Math.random() < 0.4
    ? pickArpPattern(melodyNotes)  // 40% chance of contrasting pattern
    : arpA;                         // 60% same pattern throughout

  for (let chordIdx = 0; chordIdx < 4; chordIdx++) {
    const chord = progression.chords[chordIdx];
    const arp = (chordIdx % 2 === 0) ? arpA : arpB;

    for (let i = 0; i < ROWS_PER_CHORD; i++) {
      const globalRow = chordIdx * ROWS_PER_CHORD + i;
      const melodyActive = melodyNotes[globalRow] > 0;

      // If melody is playing on this row, 70% chance harmony rests
      // to avoid harmonic clutter
      if (melodyActive && Math.random() < 0.7) {
        notes.push(0);
        continue;
      }

      notes.push(resolveArpNote(
        arp[i],
        chord.rootMelody,
        chord.thirdMelody,
        chord.fifthMelody,
      ));
    }
  }

  return [1, 0, ...notes];
}
