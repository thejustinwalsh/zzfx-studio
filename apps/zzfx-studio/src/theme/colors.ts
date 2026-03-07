export const colors = {
  // Background & Surfaces
  bgPrimary: '#0C0C0E',
  bgSurface: '#141418',
  bgElevated: '#1C1C22',
  bgGridRow: '#111115',
  bgGridRowAlt: '#0E0E12',
  bgGridBeat: '#18181E',
  bgCursor: '#2A1A0A',

  // Borders & Dividers
  borderSubtle: '#222228',
  borderTrack: '#2A2A32',
  borderFocus: '#E8740E',

  // Text
  textPrimary: '#D4D4D8',
  textSecondary: '#78787E',
  textDim: '#44444A',

  // Channel Colors
  ch0Primary: '#4ADE80',
  ch0Header: '#166534',
  ch0Dim: '#22543D',

  ch1Primary: '#38BDF8',
  ch1Header: '#0C4A6E',
  ch1Dim: '#164E63',

  ch2Primary: '#FACC15',
  ch2Header: '#713F12',
  ch2Dim: '#654318',

  ch3Primary: '#F87171',
  ch3Header: '#7F1D1D',
  ch3Dim: '#5C2020',

  // Accents
  accentPrimary: '#E8740E',
  accentHover: '#F59E0B',
  accentGenerate: '#A855F7',
  accentPlay: '#22C55E',
  accentStop: '#EF4444',
  accentMute: '#6B7280',
} as const;

export type ChannelIndex = 0 | 1 | 2 | 3;

export const channelColors: Record<ChannelIndex, { primary: string; header: string; dim: string }> = {
  0: { primary: colors.ch0Primary, header: colors.ch0Header, dim: colors.ch0Dim },
  1: { primary: colors.ch1Primary, header: colors.ch1Header, dim: colors.ch1Dim },
  2: { primary: colors.ch2Primary, header: colors.ch2Header, dim: colors.ch2Dim },
  3: { primary: colors.ch3Primary, header: colors.ch3Header, dim: colors.ch3Dim },
};
