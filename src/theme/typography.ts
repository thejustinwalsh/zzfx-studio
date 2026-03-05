import { Platform } from 'react-native';

export const fonts = {
  mono: Platform.select({
    web: '"Berkeley Mono", "JetBrains Mono", "Fira Code", "SF Mono", monospace',
    default: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  }) as string,
  ui: Platform.select({
    web: '"Inter", "SF Pro", system-ui, sans-serif',
    default: undefined, // system default
  }) as string | undefined,
};

export const fontSize = {
  gridNote: 13,
  gridNoteMobile: 11,
  gridRowNum: 12,
  gridRowNumMobile: 10,
  trackHeader: 13,
  trackHeaderMobile: 11,
  trackSub: 10,
  trackSubMobile: 9,
  panelTitle: 14,
  panelTitleMobile: 12,
  buttonLabel: 12,
  buttonLabelMobile: 11,
  bpmDisplay: 20,
  bpmDisplayMobile: 16,
  transportPosition: 16,
  transportPositionMobile: 14,
} as const;
