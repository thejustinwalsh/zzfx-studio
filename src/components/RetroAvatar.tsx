import React, { useMemo } from 'react';
import { View } from 'react-native';

interface RetroAvatarProps {
  name: string;
  size: number;
  color?: string;
}

// Simple deterministic hash from string → array of numbers
function hashString(str: string): number[] {
  const out: number[] = [];
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  for (let i = 0; i < 20; i++) {
    h ^= (i + 1);
    h = Math.imul(h, 0x01000193);
    out.push(Math.abs(h));
  }
  return out;
}

const PALETTE = ['#4ADE80', '#38BDF8', '#FACC15', '#F87171'];

function generateGrid(name: string): boolean[][] {
  const safeName = name || 'ZZFX';
  const tiles = 5;
  const mid = Math.ceil(tiles / 2);
  const hash = hashString(safeName);

  const pixels: boolean[][] = [];
  let bitIdx = 1;
  let filled = 0;
  const total = tiles * mid;

  for (let row = 0; row < tiles; row++) {
    pixels[row] = [];
    for (let col = 0; col < mid; col++) {
      const val = hash[bitIdx % hash.length];
      const bit = ((val >> ((bitIdx * 3) % 28)) & 1) === 1;
      pixels[row][col] = bit;
      if (bit) filled++;
      bitIdx++;
    }
  }

  const fillRatio = filled / total;
  if (fillRatio < 0.3) {
    for (let row = 0; row < tiles && filled / total < 0.3; row++) {
      for (let col = 0; col < mid && filled / total < 0.3; col++) {
        if (!pixels[row][col]) { pixels[row][col] = true; filled++; }
      }
    }
  } else if (fillRatio > 0.9) {
    for (let row = tiles - 1; row >= 0 && filled / total > 0.9; row--) {
      for (let col = mid - 1; col >= 0 && filled / total > 0.9; col--) {
        if (pixels[row][col]) { pixels[row][col] = false; filled--; }
      }
    }
  }

  // Mirror horizontally
  const fullGrid: boolean[][] = [];
  for (let row = 0; row < tiles; row++) {
    fullGrid[row] = [];
    for (let col = 0; col < tiles; col++) {
      const srcCol = col < mid ? col : tiles - 1 - col;
      fullGrid[row][col] = pixels[row][srcCol];
    }
  }
  return fullGrid;
}

export const RetroAvatar = React.memo(function RetroAvatar({ name, size, color }: RetroAvatarProps) {
  const safeName = name || 'ZZFX';
  const grid = useMemo(() => generateGrid(safeName), [safeName]);
  const hash = useMemo(() => hashString(safeName), [safeName]);
  const pixelColor = color ?? PALETTE[hash[0] % PALETTE.length];

  const tiles = 5;
  const cellSize = size / tiles;

  return (
    <View style={{ width: size, height: size, flexDirection: 'column' }}>
      {grid.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', height: cellSize }}>
          {row.map((cell, ci) => (
            <View
              key={ci}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: cell ? pixelColor : 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
});
