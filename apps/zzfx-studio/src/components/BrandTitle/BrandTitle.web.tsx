import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { fonts } from '../../theme/typography';

export const BrandTitle = React.memo(function BrandTitle() {
  return (
    <Text
      style={styles.title}
      accessibilityRole="header"
    >
      ZZFX STUDIO
    </Text>
  );
});

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    // @ts-expect-error — web-only CSS properties
    backgroundImage: 'linear-gradient(90deg, #4ADE80, #38BDF8, #FACC15, #F87171)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    color: 'transparent',
  },
});
