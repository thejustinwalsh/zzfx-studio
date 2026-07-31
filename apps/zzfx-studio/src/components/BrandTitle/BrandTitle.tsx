import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Canvas, Text, useFont, LinearGradient, vec, Group } from '@shopify/react-native-skia';

const FONT_SIZE = 11;
const TITLE = 'ZZFX STUDIO';
const TEXT_WIDTH = 73;
const WIDTH = TEXT_WIDTH + 12;
const HEIGHT = 16;

export const BrandTitle = React.memo(function BrandTitle() {
  const font = useFont(require('../../../assets/JetBrainsMono-Regular.ttf'), FONT_SIZE);

  // `font` is null until it loads, so this must not sit behind an early return:
  // the hook count would differ between the two renders.
  const textWidth = useMemo(() => {
    if (!font) return TEXT_WIDTH;
    try {
      const measured = font.measureText(TITLE);
      if (measured && measured.width > 0) {
        return measured.width;
      }
    } catch {}
    return TEXT_WIDTH;
  }, [font]);

  if (!font) return <View style={{ width: WIDTH, height: HEIGHT }} />;
  

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
