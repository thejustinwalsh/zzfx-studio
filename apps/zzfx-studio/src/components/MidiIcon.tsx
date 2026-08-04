import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/**
 * The 5-pin DIN socket, drawn rather than imported.
 *
 * Five pins on an arc inside a ring — the shape on the back of every synth, so
 * it reads as MIDI without a label. Built from Views because the rest of the
 * interface has no icon set and pulling one in for a single glyph would be a
 * heavier dependency than the drawing.
 */
/**
 * The ring's stroke. Absolutely positioned children are laid out from the
 * padding box, inside the border, so every offset below is measured from there
 * rather than from the icon's outer edge — leave it out and the whole arc sits
 * a stroke's width right of and below centre.
 */
const BORDER = 1.5;

export function MidiIcon({ size = 22, color = colors.textSecondary }: { size?: number; color?: string }) {
  const ring = size;
  const pin = Math.max(2, Math.round(size * 0.13));
  // Pins sit on an arc rather than a full circle, which is what distinguishes a
  // DIN socket from a generic dotted circle.
  const radius = size * 0.28;
  const centre = ring / 2 - pin / 2 - BORDER;

  // Left, upper-left, top, upper-right, right.
  const angles = [180, 135, 90, 45, 0];

  return (
    <View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2, borderColor: color }]}>
      {angles.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <View
            key={deg}
            style={[
              styles.pin,
              {
                width: pin,
                height: pin,
                borderRadius: pin / 2,
                backgroundColor: color,
                left: centre + Math.cos(rad) * radius,
                // Screen y grows downward, so the arc is subtracted to dome upward.
                top: centre - Math.sin(rad) * radius,
              },
            ]}
          />
        );
      })}
      {/* The flat key at the bottom of the socket. */}
      <View
        style={[
          styles.key,
          {
            width: size * 0.34,
            height: Math.max(1.5, size * 0.07),
            backgroundColor: color,
            left: ring / 2 - size * 0.17 - BORDER,
            top: ring - size * 0.3 - BORDER,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: BORDER,
    position: 'relative',
  },
  pin: {
    position: 'absolute',
  },
  key: {
    position: 'absolute',
  },
});
