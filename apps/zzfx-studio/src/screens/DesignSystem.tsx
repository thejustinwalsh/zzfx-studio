import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, useWindowDimensions } from 'react-native';
import { Button, Dropdown, Slider, SegmentedControl, PatternBlock, WaveformPreview, TrackerGrid } from '../components';
import { colors, channelColors, fonts, fontSize, spacing } from '../theme';

const VIBES = ['Adventure', 'Battle', 'Dungeon', 'Title', 'Boss'] as const;
const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SCALES = ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Pentatonic', 'Harm Minor'] as const;
const GEN_SCOPES = ['Full Song', 'Pattern', 'Channel', 'Instruments'] as const;
const PATTERN_LABELS = ['A', 'B', 'C', 'A', 'B', 'C', 'A'];

type Vibe = (typeof VIBES)[number];
type Key = (typeof KEYS)[number];
type Scale = (typeof SCALES)[number];
type GenScope = (typeof GEN_SCOPES)[number];

interface DesignSystemProps {
  onClose: () => void;
}

export function DesignSystem({ onClose }: DesignSystemProps) {
  const { width } = useWindowDimensions();

  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(true);
  const [bpm, setBpm] = useState(120);
  const [vibe, setVibe] = useState<Vibe>('Adventure');
  const [musKey, setMusKey] = useState<Key>('C');
  const [scale, setScale] = useState<Scale>('Minor');
  const [genScope, setGenScope] = useState<GenScope>('Full Song');
  const [activePattern, setActivePattern] = useState(0);
  const [cursorRow] = useState<number | null>(4);

  const gridWidth = Math.min(width - spacing.xl * 2, 700);

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>ZZFX GEN STUDIO</Text>
            <Text style={styles.subtitle}>Design System</Text>
          </View>
          <Button label="CLOSE" variant="action" onPress={onClose} />
        </View>

        <Text style={styles.sectionLabel}>TRANSPORT</Text>
        <View style={styles.row}>
          <Button label="▶ PLAY" variant="transport" active={playing} onPress={() => setPlaying(!playing)} />
          <Button label="■ STOP" variant="transport" onPress={() => setPlaying(false)} />
          <Button label="⟳ LOOP" variant="transport" active={looping} onPress={() => setLooping(!looping)} />
        </View>

        <Text style={styles.sectionLabel}>ACTION BUTTONS</Text>
        <View style={styles.row}>
          <Button label="GENERATE" variant="generate" />
          <Button label="REGEN" variant="action" />
          <Button label="EXPORT" variant="action" disabled />
        </View>

        <Text style={styles.sectionLabel}>CHANNEL CONTROLS</Text>
        <View style={styles.row}>
          {([0, 1, 2, 3] as const).map((ch) => (
            <View key={ch} style={[styles.channelGroup, { borderTopColor: channelColors[ch].primary, borderTopWidth: 2 }]}>
              <Text style={[styles.channelLabel, { color: channelColors[ch].primary }]}>
                {['LEAD', 'HARM', 'BASS', 'DRUM'][ch]}
              </Text>
              <View style={styles.iconRow}>
                <Button label="S" variant="icon" />
                <Button label="M" variant="icon" />
                <Button label="R" variant="icon" style={{ borderColor: colors.accentGenerate }} />
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>DROPDOWNS</Text>
        <View style={styles.row}>
          <Dropdown label="Vibe" value={vibe} options={VIBES} onSelect={setVibe} />
          <Dropdown label="Key" value={musKey} options={KEYS} onSelect={setMusKey} />
          <Dropdown label="Scale" value={scale} options={SCALES} onSelect={setScale} />
        </View>

        <Text style={styles.sectionLabel}>BPM SLIDER</Text>
        <Slider label="BPM" value={bpm} min={80} max={180} step={1} onValueChange={setBpm} />

        <Text style={styles.sectionLabel}>GENERATION SCOPE</Text>
        <SegmentedControl options={GEN_SCOPES} value={genScope} onSelect={setGenScope} />

        <Text style={styles.sectionLabel}>PATTERN SEQUENCE</Text>
        <View style={styles.row}>
          {PATTERN_LABELS.map((label, i) => (
            <PatternBlock
              key={i}
              label={label}
              active={i === activePattern}
              playing={playing && i === activePattern}
              onPress={() => setActivePattern(i)}
            />
          ))}
        </View>

        <Text style={styles.sectionLabel}>WAVEFORM ADSR</Text>
        <View style={styles.row}>
          {[
            { a: 0.02, d: 0.1, s: 0.3, r: 0.1, color: channelColors[0].primary, label: 'LEAD' },
            { a: 0.01, d: 0.05, s: 0.15, r: 0.05, color: channelColors[1].primary, label: 'HARM' },
            { a: 0.0, d: 0.0, s: 0.4, r: 0.15, color: channelColors[2].primary, label: 'BASS' },
            { a: 0.0, d: 0.03, s: 0.0, r: 0.01, color: channelColors[3].primary, label: 'KICK' },
          ].map(({ a, d, s, r, color, label }) => (
            <View key={label} style={styles.waveCard}>
              <Text style={[styles.waveLabel, { color }]}>{label}</Text>
              <WaveformPreview height={50} attack={a} decay={d} sustain={s} release={r} color={color} />
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>TRACKER GRID</Text>
        <View style={styles.gridContainer}>
          <TrackerGrid
            width={gridWidth}
            height={32 * 20}
            rows={32}
            channels={4}
            cursorRow={cursorRow}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingTop: 60,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: 24,
    fontWeight: '700',
    color: colors.accentPrimary,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: fonts.mono,
    fontSize: fontSize.panelTitle,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textDim,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  channelGroup: {
    backgroundColor: colors.bgSurface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  channelLabel: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackHeader,
    fontWeight: '700',
  },
  iconRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  waveCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  waveLabel: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    fontWeight: '700',
    letterSpacing: 1,
  },
  gridContainer: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
});
