import type { PatternLabel } from '../engine/types';

// Fixed saturated colors per section label — midpoints between channel colors
// to stay distinct from CH0=green, CH1=cyan, CH2=yellow, CH3=red
const SECTION_COLORS: Record<string, [number, number, number]> = {
  A: [20, 184, 166],   // teal       — between green & cyan
  B: [132, 204, 22],   // chartreuse — between cyan & yellow
  C: [251, 146, 60],   // orange     — between yellow & red
  D: [232, 121, 249],  // magenta    — between red & green (via purple)
  E: [99, 202, 210],   // sky-teal
  F: [190, 180, 50],   // olive-gold
  G: [245, 130, 100],  // salmon
  H: [160, 140, 230],  // lavender
};

function getSectionRGB(label: string): [number, number, number] {
  const letter = label.charAt(0).toUpperCase();
  return SECTION_COLORS[letter] ?? [120, 120, 126];
}

/**
 * Background color for a pattern block — low opacity tint of the section color.
 */
export function getPatternColor(_pattern: any, label?: PatternLabel): string {
  if (!label) return 'rgba(28, 28, 34, 1)';
  const [r, g, b] = getSectionRGB(label);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

/**
 * Label text color — moderately bright section color.
 */
export function getPatternLabelColor(_pattern: any, label?: PatternLabel): string {
  if (!label) return 'rgb(120, 120, 126)';
  const [r, g, b] = getSectionRGB(label);
  return `rgb(${Math.round(r * 0.7)}, ${Math.round(g * 0.7)}, ${Math.round(b * 0.7)})`;
}

/**
 * Active/selected background — brighter, more saturated version.
 */
export function getPatternActiveColor(label?: PatternLabel): string {
  if (!label) return 'rgba(42, 26, 10, 1)';
  const [r, g, b] = getSectionRGB(label);
  return `rgba(${r}, ${g}, ${b}, 0.25)`;
}

/**
 * Active/selected label text — full brightness section color.
 */
export function getPatternActiveLabelColor(label?: PatternLabel): string {
  if (!label) return 'rgb(232, 116, 14)';
  const [r, g, b] = getSectionRGB(label);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Active/selected border color — full brightness section color.
 */
export function getPatternActiveBorderColor(label?: PatternLabel): string {
  if (!label) return 'rgb(232, 116, 14)';
  const [r, g, b] = getSectionRGB(label);
  return `rgb(${r}, ${g}, ${b})`;
}
