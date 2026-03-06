import type { VibeName } from './types';

// Shared word pools
const SHARED_ADJECTIVES = [
  'ANCIENT', 'SILENT', 'LOST', 'HIDDEN', 'ETERNAL',
  'FROZEN', 'BURNING', 'BROKEN', 'FALLEN', 'FINAL',
];

const SHARED_NOUNS = [
  'HORIZON', 'ECHO', 'PATH', 'DAWN', 'DUSK',
  'SIGNAL', 'PULSE', 'REALM', 'EDGE', 'GATES',
];

// Vibe-specific word pools
const VIBE_ADJECTIVES: Record<VibeName, string[]> = {
  adventure: [
    'EMERALD', 'GOLDEN', 'WILD', 'WANDERING', 'DISTANT',
    'SOARING', 'CRIMSON', 'SWIFT', 'BOUNDLESS', 'RADIANT',
    'STARLIT', 'VERDANT', 'BRAVE', 'UNTAMED', 'SAPPHIRE',
  ],
  battle: [
    'IRON', 'CRIMSON', 'SAVAGE', 'BRUTAL', 'RUTHLESS',
    'WRATH', 'STEEL', 'RAGING', 'SCARLET', 'RELENTLESS',
    'FIERCE', 'SHATTERED', 'BLOODIED', 'FURIOUS', 'ARMORED',
  ],
  dungeon: [
    'SHADOW', 'HOLLOW', 'OBSIDIAN', 'CURSED', 'SUNKEN',
    'TWISTED', 'ROTTING', 'SPECTRAL', 'BLIGHTED', 'ASHEN',
    'FORSAKEN', 'WITHERED', 'PALE', 'ABYSSAL', 'HAUNTED',
  ],
  titleScreen: [
    'PIXEL', 'CRYSTAL', 'NEON', 'ELECTRIC', 'COSMIC',
    'CHROME', 'DIGITAL', 'RETRO', 'VIVID', 'PRISMATIC',
    'LUMINOUS', 'SYNTH', 'HYPER', 'GLEAMING', 'INFINITE',
  ],
  boss: [
    'DOOM', 'CHAOS', 'DREAD', 'MALICE', 'TITAN',
    'SOVEREIGN', 'APEX', 'OMEGA', 'RUINOUS', 'INFERNAL',
    'SUPREME', 'COLOSSAL', 'ABYSSAL', 'UNHOLY', 'DIRE',
  ],
};

const VIBE_NOUNS: Record<VibeName, string[]> = {
  adventure: [
    'QUEST', 'VOYAGE', 'SUMMIT', 'TRAIL', 'WIND',
    'COMPASS', 'EXPANSE', 'CREST', 'FRONTIER', 'ODYSSEY',
    'SHORES', 'PASSAGE', 'SKYLINE', 'CROSSING', 'LEGEND',
  ],
  battle: [
    'STORM', 'BLADE', 'FURY', 'STRIKE', 'ASSAULT',
    'ONSLAUGHT', 'SIEGE', 'CLASH', 'BARRAGE', 'CHARGE',
    'CARNAGE', 'HAMMER', 'VALOR', 'RAMPAGE', 'CONFLICT',
  ],
  dungeon: [
    'DEPTHS', 'CRYPT', 'TOMB', 'LABYRINTH', 'VOID',
    'CATACOMB', 'CAVERN', 'CHASM', 'SANCTUM', 'CORRIDOR',
    'DESCENT', 'DARKNESS', 'RUINS', 'PASSAGE', 'UNDERCROFT',
  ],
  titleScreen: [
    'DREAMS', 'ERA', 'GENESIS', 'OVERTURE', 'PRELUDE',
    'ANTHEM', 'SPARK', 'THEME', 'SIGNAL', 'CIRCUIT',
    'GATEWAY', 'LAUNCH', 'ARCADE', 'PRISM', 'SEQUENCE',
  ],
  boss: [
    'ASCENDANT', 'DESCENT', 'ENGINE', 'THRONE', 'COLOSSUS',
    'MONOLITH', 'RECKONING', 'LEVIATHAN', 'DOMINION', 'NEXUS',
    'HARBINGER', 'WARDEN', 'BEHEMOTH', 'ANNIHILATOR', 'TYRANT',
  ],
};

// Simple seedable PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a procedural song name for a given vibe.
 * Format: "ADJECTIVE NOUN" or "THE ADJECTIVE NOUN" (2-3 words, ALL CAPS)
 *
 * @param vibe - The song vibe
 * @param seed - Optional seed for deterministic output
 */
export function generateSongName(vibe: VibeName, seed?: number): string {
  const rand = seed !== undefined ? mulberry32(seed) : Math.random.bind(Math);

  // Merge shared + vibe-specific pools
  const adjectives = [...SHARED_ADJECTIVES, ...VIBE_ADJECTIVES[vibe]];
  const nouns = [...SHARED_NOUNS, ...VIBE_NOUNS[vibe]];

  const adj = adjectives[Math.floor(rand() * adjectives.length)];
  const noun = nouns[Math.floor(rand() * nouns.length)];

  // ~25% chance of "THE" prefix
  const useThe = rand() < 0.25;

  return useThe ? `THE ${adj} ${noun}` : `${adj} ${noun}`;
}
