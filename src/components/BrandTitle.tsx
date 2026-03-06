import React from 'react';
import { View } from 'react-native';
import { Canvas, Text, useFont, LinearGradient, vec, Group } from '@shopify/react-native-skia';

const FONT_SIZE = 11;
const TITLE = 'ZZFX STUDIO';
// Approximate width: 11 chars * ~6.6px per char at 11px monospace
const TEXT_WIDTH = 73;
const WIDTH = TEXT_WIDTH + 12;
const HEIGHT = 16;

export const BrandTitle = React.memo(function BrandTitle() {
  const font = useFont(require('../../assets/JetBrainsMono-Regular.ttf'), FONT_SIZE);

  if (!font) return <View style={{ width: WIDTH, height: HEIGHT }} />;

  // Try measureText, fallback to approximation
  let textWidth = TEXT_WIDTH;
  try {
    const measured = font.measureText(TITLE);
    if (measured && measured.width > 0) {
      textWidth = measured.width;
    }
  } catch {
    // measureText not implemented on web — use approximation
  }

  return (
    <Canvas style={{ width: Math.max(WIDTH, textWidth + 12), height: HEIGHT }}>
      <Group>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(textWidth, 0)}
          colors={['#4ADE80', '#38BDF8', '#FACC15', '#F87171']}
        />
        <Text
          x={2}
          y={FONT_SIZE + 1}
          text={TITLE}
          font={font}
        />
      </Group>
    </Canvas>
  );
});
