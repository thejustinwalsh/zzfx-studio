import { VibeName, ChannelData, DRUM_NOTES } from './types';
import { euclidean } from './euclidean';

const ROWS = 32;

// Key insight from SynthyCraft: drums should be TEMPLATE-DRIVEN with minimal randomness.
// The kick is the backbone and should be predictable. Snare has weighted options.
// Hats fill gaps. This creates reliable, musical patterns.

// Kick templates — the structural backbone. Always predictable.
const KICK_TEMPLATES: Record<VibeName, { base: number[]; ghostChance: number; ghostPositions: number[] }> = {
  adventure: {
    // Standard four-on-floor (every 8 rows = every beat in 32-row pattern)
    base: [0, 8, 16, 24],
    ghostChance: 0.15,
    ghostPositions: [6, 14, 22, 30],
  },
  battle: {
    // Driving eighth-note kicks
    base: [0, 4, 8, 12, 16, 20, 24, 28],
    ghostChance: 0.1,
    ghostPositions: [2, 6, 10, 14],
  },
  dungeon: {
    // Half-time feel
    base: [0, 16],
    ghostChance: 0.2,
    ghostPositions: [12, 28],
  },
  titleScreen: {
    // Standard four-on-floor
    base: [0, 8, 16, 24],
    ghostChance: 0.1,
    ghostPositions: [6, 22],
  },
  boss: {
    // Syncopated driving pattern
    base: [0, 6, 8, 14, 16, 22, 24, 30],
    ghostChance: 0.15,
    ghostPositions: [4, 12, 20, 28],
  },
};

// Snare: probability-weighted template selection (SynthyCraft technique)
function generateSnareHits(vibe: VibeName): number[] {
  const hits: number[] = [];
  const p = Math.random();

  switch (vibe) {
    case 'adventure':
    case 'titleScreen':
      // Standard backbeat on beats 2 and 4
      if (p < 0.7) { hits.push(8, 24); }
      else if (p < 0.85) { hits.push(8, 20, 24); } // extra hit
      else { hits.push(4, 12, 20, 28); } // offbeat
      break;
    case 'battle':
      if (p < 0.5) { hits.push(4, 12, 20, 28); } // driving
      else if (p < 0.8) { hits.push(8, 24); } // backbeat
      else { hits.push(4, 8, 12, 20, 24, 28); } // double-time
      break;
    case 'dungeon':
      if (p < 0.6) { hits.push(8, 24); } // sparse backbeat
      else if (p < 0.9) { hits.push(12); } // single hit
      else { hits.push(8); } // minimal
      break;
    case 'boss':
      if (p < 0.5) { hits.push(4, 12, 20, 28); } // driving offbeat
      else if (p < 0.75) { hits.push(6, 14, 22, 30); } // syncopated
      else { // euclidean
        const euc = euclidean(3, 32, Math.floor(Math.random() * 8));
        for (let i = 0; i < ROWS; i++) { if (euc[i]) hits.push(i); }
      }
      break;
  }
  return hits;
}

// Hats: gap-filling reactive logic (SynthyCraft technique)
// Only play where kick AND snare are silent. Prefer even-numbered steps.
function generateHatHits(
  kickHits: Set<number>,
  snareHits: Set<number>,
  density: number
): number[] {
  const hits: number[] = [];
  for (let i = 0; i < ROWS; i++) {
    if (kickHits.has(i) || snareHits.has(i)) continue;
    // Prefer every-other-step pattern (even steps), with density controlling probability
    if (i % 2 === 0 && Math.random() < density) {
      hits.push(i);
    }
  }
  return hits;
}

const HAT_DENSITY: Record<VibeName, number> = {
  adventure: 0.6,
  battle: 0.8,
  dungeon: 0.3,
  titleScreen: 0.5,
  boss: 0.7,
};

export function generateDrumPattern(vibe: VibeName): {
  channelData: ChannelData;
  kickPattern: number[];
} {
  const kickTemplate = KICK_TEMPLATES[vibe];

  // Build kick hits from template + optional ghosts
  const kickHits = new Set(kickTemplate.base);
  for (const pos of kickTemplate.ghostPositions) {
    if (Math.random() < kickTemplate.ghostChance) {
      kickHits.add(pos);
    }
  }

  // Build snare hits from weighted templates
  const snarePositions = generateSnareHits(vibe);
  const snareHits = new Set(snarePositions);

  // Build hat hits (gap-filling)
  const hatPositions = generateHatHits(kickHits, snareHits, HAT_DENSITY[vibe]);

  // Merge into single channel: kick > snare > hat priority
  const notes: number[] = Array(ROWS).fill(0);
  const kickArray: number[] = Array(ROWS).fill(0);

  for (let i = 0; i < ROWS; i++) {
    if (kickHits.has(i)) {
      notes[i] = DRUM_NOTES.KICK;
      kickArray[i] = 1;
    } else if (snareHits.has(i)) {
      notes[i] = DRUM_NOTES.SNARE;
    } else if (hatPositions.includes(i)) {
      notes[i] = DRUM_NOTES.HAT;
    }
  }

  return {
    channelData: [3, 0, ...notes],
    kickPattern: kickArray,
  };
}
