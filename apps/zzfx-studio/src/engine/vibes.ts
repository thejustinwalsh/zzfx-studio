import { VibeName, VibeConfig } from './types';

// Structure templates follow retro conventions:
//
// Short (4-6 patterns, ~15-25s): A/B only. Simple alternation.
//   Authentic for: jingles, short battle themes, victory fanfares
//
// Long (7-10 patterns, ~30-50s): A/B/C. Bridges and breakdowns.
//   Authentic for: overworld themes, dungeon music, standard stage music
//
// Epic (10-14 patterns, ~45-70s): A/B/C/D. Full arc with climax.
//   Authentic for: final boss, title screen medleys, fortress themes
//
// Section roles:
//   verse     — main theme, full arrangement
//   contrast  — different melody/chords, tension
//   bridge    — transitional, sparser, breathing room
//   breakdown — drums+bass only, lead/harmony drop out
//   climax    — highest energy, densest arrangement

export const VIBE_CONFIG: Record<VibeName, VibeConfig> = {
  adventure: {
    bpmRange: [110, 135],
    preferredScales: ['major', 'mixolydian', 'pentatonic'],
    melodyDensity: 0.5,
    bassDensity: [4, 7],
    drumIntensity: 'medium',
    structures: {
      short: [
        { roles: ['verse', 'contrast'], sequence: [0, 0, 1, 0] },
        { roles: ['verse', 'contrast'], sequence: [0, 1, 0, 1, 0] },
      ],
      long: [
        // A A B A A C B A — classic Zelda-style overworld
        { roles: ['verse', 'contrast', 'bridge'], sequence: [0, 0, 1, 0, 0, 2, 1, 0] },
        // A A B A C A B A — bridge before final repeat
        { roles: ['verse', 'contrast', 'bridge'], sequence: [0, 0, 1, 0, 2, 0, 1, 0] },
        // A B A B C A — shorter long
        { roles: ['verse', 'contrast', 'breakdown'], sequence: [0, 1, 0, 1, 2, 0, 1] },
      ],
      epic: [
        // A A B A C A B D B A — full arc
        { roles: ['verse', 'contrast', 'breakdown', 'climax'], sequence: [0, 0, 1, 0, 2, 0, 1, 3, 1, 0] },
        // A A B A A C B D C A B A
        { roles: ['verse', 'contrast', 'bridge', 'climax'], sequence: [0, 0, 1, 0, 0, 2, 1, 3, 2, 0, 1, 0] },
      ],
    },
    fxChance: 0.2,
  },

  battle: {
    bpmRange: [125, 150],
    preferredScales: ['minor', 'harmonicMinor', 'dorian'],
    melodyDensity: 0.7,
    bassDensity: [6, 9],
    drumIntensity: 'high',
    structures: {
      short: [
        // A B A B — tight alternation, Pokemon trainer battle style
        { roles: ['verse', 'contrast'], sequence: [0, 1, 0, 1] },
        { roles: ['verse', 'contrast'], sequence: [0, 0, 1, 1, 0] },
      ],
      long: [
        // A B A B C B — classic battle with bridge
        { roles: ['verse', 'contrast', 'climax'], sequence: [0, 1, 0, 1, 2, 1] },
        // A B A B C A B — Mega Man style
        { roles: ['verse', 'contrast', 'bridge'], sequence: [0, 1, 0, 1, 2, 0, 1] },
        // A A B B C B A — buildup to bridge
        { roles: ['verse', 'contrast', 'breakdown'], sequence: [0, 0, 1, 1, 2, 1, 0, 1] },
      ],
      epic: [
        // A B A B C C A B D B — full battle arc
        { roles: ['verse', 'contrast', 'breakdown', 'climax'], sequence: [0, 1, 0, 1, 2, 2, 0, 1, 3, 1] },
        // A B C A B C D A B D
        { roles: ['verse', 'contrast', 'bridge', 'climax'], sequence: [0, 1, 2, 0, 1, 2, 3, 0, 1, 3] },
      ],
    },
    fxChance: 0.4,
  },

  dungeon: {
    bpmRange: [80, 105],
    preferredScales: ['minor', 'dorian'],
    melodyDensity: 0.3,
    bassDensity: [3, 5],
    drumIntensity: 'sparse',
    structures: {
      short: [
        // A A B A — repetitive, hypnotic
        { roles: ['verse', 'contrast'], sequence: [0, 0, 1, 0] },
        { roles: ['verse', 'breakdown'], sequence: [0, 0, 1, 0, 0] },
      ],
      long: [
        // A A B B A C A — Metroid Brinstar style
        { roles: ['verse', 'contrast', 'breakdown'], sequence: [0, 0, 1, 1, 0, 2, 0] },
        // A B A A C A B A — atmospheric loop
        { roles: ['verse', 'contrast', 'bridge'], sequence: [0, 1, 0, 0, 2, 0, 1, 0] },
      ],
      epic: [
        // A A B A C A B D A B A — deep dungeon
        { roles: ['verse', 'contrast', 'breakdown', 'bridge'], sequence: [0, 0, 1, 0, 2, 0, 1, 3, 0, 1, 0] },
        // A B A C A B D C A B A
        { roles: ['verse', 'contrast', 'breakdown', 'climax'], sequence: [0, 1, 0, 2, 0, 1, 3, 2, 0, 1, 0] },
      ],
    },
    fxChance: 0.15,
  },

  titleScreen: {
    bpmRange: [95, 120],
    preferredScales: ['major', 'pentatonic'],
    melodyDensity: 0.4,
    bassDensity: [3, 6],
    drumIntensity: 'light',
    structures: {
      short: [
        // A A B A — simple, welcoming
        { roles: ['verse', 'contrast'], sequence: [0, 0, 1, 0] },
      ],
      long: [
        // A A B A B C A — gentle arc
        { roles: ['verse', 'contrast', 'bridge'], sequence: [0, 0, 1, 0, 1, 2, 0] },
        // A A B A C A B A — extended theme
        { roles: ['verse', 'contrast', 'bridge'], sequence: [0, 0, 1, 0, 2, 0, 1, 0] },
      ],
      epic: [
        // A A B A C B D A B C A — title medley
        { roles: ['verse', 'contrast', 'bridge', 'climax'], sequence: [0, 0, 1, 0, 2, 1, 3, 0, 1, 2, 0] },
        // A A B A A C B D C B A
        { roles: ['verse', 'contrast', 'breakdown', 'climax'], sequence: [0, 0, 1, 0, 0, 2, 1, 3, 2, 1, 0] },
      ],
    },
    fxChance: 0.1,
  },

  boss: {
    bpmRange: [135, 160],
    preferredScales: ['harmonicMinor', 'minor', 'dorian'],
    melodyDensity: 0.8,
    bassDensity: [7, 10],
    drumIntensity: 'intense',
    structures: {
      short: [
        // A B A B C — short boss with climax hit
        { roles: ['verse', 'contrast', 'climax'], sequence: [0, 1, 0, 1, 2] },
        { roles: ['verse', 'contrast'], sequence: [0, 1, 0, 1, 0, 1] },
      ],
      long: [
        // A B C A B D — Castlevania style
        { roles: ['verse', 'contrast', 'bridge', 'climax'], sequence: [0, 1, 2, 0, 1, 3] },
        // A B A B C B D B — relentless
        { roles: ['verse', 'contrast', 'breakdown', 'climax'], sequence: [0, 1, 0, 1, 2, 1, 3, 1] },
      ],
      epic: [
        // A B C A B C D A B D C B — final boss epic
        { roles: ['verse', 'contrast', 'bridge', 'climax'], sequence: [0, 1, 2, 0, 1, 2, 3, 0, 1, 3, 2, 1] },
        // A A B A C B D B C D A B
        { roles: ['verse', 'contrast', 'breakdown', 'climax'], sequence: [0, 0, 1, 0, 2, 1, 3, 1, 2, 3, 0, 1] },
      ],
    },
    fxChance: 0.5,
  },
};

export function getRandomBpm(vibe: VibeName): number {
  const [min, max] = VIBE_CONFIG[vibe].bpmRange;
  return Math.floor(min + Math.random() * (max - min + 1));
}
