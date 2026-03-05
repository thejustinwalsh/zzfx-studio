import { VibeName, VibeConfig } from './types';

export const VIBE_CONFIG: Record<VibeName, VibeConfig> = {
  adventure: {
    bpmRange: [110, 135],
    preferredScales: ['major', 'mixolydian', 'pentatonic'],
    melodyDensity: 0.5,
    bassDensity: [4, 7],
    drumIntensity: 'medium',
    structures: [
      [0, 0, 1, 0, 0, 2, 0],    // A A B A A C A
    ],
    fxChance: 0.2,
  },
  battle: {
    bpmRange: [140, 170],
    preferredScales: ['minor', 'harmonicMinor', 'dorian'],
    melodyDensity: 0.7,
    bassDensity: [6, 9],
    drumIntensity: 'high',
    structures: [
      [0, 1, 0, 1, 2, 1],       // A B A B C B
    ],
    fxChance: 0.4,
  },
  dungeon: {
    bpmRange: [80, 105],
    preferredScales: ['minor', 'dorian'],
    melodyDensity: 0.3,
    bassDensity: [3, 5],
    drumIntensity: 'sparse',
    structures: [
      [0, 0, 1, 1, 0, 2],       // A A B B A C
    ],
    fxChance: 0.15,
  },
  titleScreen: {
    bpmRange: [95, 120],
    preferredScales: ['major', 'pentatonic'],
    melodyDensity: 0.4,
    bassDensity: [3, 6],
    drumIntensity: 'light',
    structures: [
      [0, 0, 1, 0],             // A A B A (shorter for title)
    ],
    fxChance: 0.1,
  },
  boss: {
    bpmRange: [150, 180],
    preferredScales: ['harmonicMinor', 'minor', 'dorian'],
    melodyDensity: 0.8,
    bassDensity: [7, 10],
    drumIntensity: 'intense',
    structures: [
      [0, 1, 2, 0, 1, 3],       // A B C A B D
    ],
    fxChance: 0.5,
  },
};

export function getRandomBpm(vibe: VibeName): number {
  const [min, max] = VIBE_CONFIG[vibe].bpmRange;
  return Math.floor(min + Math.random() * (max - min + 1));
}
