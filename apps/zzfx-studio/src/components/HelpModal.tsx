import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSize, spacing } from '../theme';

interface HelpModalProps {
  visible: boolean;
  onClose: () => void;
}

interface Binding {
  /** Rendered as keycaps, left to right. */
  keys: string[];
  /** Chord — draw a + between the caps. Without it the caps read as alternatives. */
  chord?: boolean;
  action: string;
}

interface Section {
  title: string;
  note?: string;
  bindings: Binding[];
}

// Cmd on Apple hardware, Ctrl elsewhere. Shown rather than described, so the
// chart matches the keyboard in front of you.
const MOD =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform ?? '')
    ? '⌘'
    : 'CTRL';

const SECTIONS: Section[] = [
  {
    title: 'MOVING',
    note: 'Click any cell to put the cursor there. Every row has eight stops — a note and an effect for each channel.',
    bindings: [
      { keys: ['↑', '↓'], action: 'Up or down a row' },
      { keys: ['←', '→'], action: 'Between note and effect, wrapping into the next channel' },
      { keys: ['ESC'], action: 'Release the grid' },
    ],
  },
  {
    title: 'NOTES',
    note: 'Entering a note drops the cursor one row, so you can type a line straight down.',
    bindings: [
      { keys: ['A', '…', 'G'], action: 'Enter that note at the current octave' },
      { keys: ['⇧', 'A…G'], chord: true, action: 'Enter it sharp' },
      { keys: ['[', ']'], action: 'Lower or raise the octave register' },
      { keys: ['DEL'], action: 'Clear the note under the cursor' },
    ],
  },
  {
    title: 'DRUMS',
    note: 'The drum channel answers to mnemonics rather than pitches. Other letters do nothing there.',
    bindings: [
      { keys: ['K'], action: 'Kick' },
      { keys: ['S'], action: 'Snare' },
      { keys: ['H'], action: 'Hat' },
    ],
  },
  {
    title: 'EFFECTS',
    note: 'ENTER starts editing the effect under the cursor — the cell fills solid orange while you are in it. Changes apply as you make them, so they are audible on the next pass.',
    bindings: [
      { keys: ['ENTER'], action: 'Start editing, and finish' },
      { keys: ['↑', '↓'], action: 'Cycle the code — down past the first clears it' },
      { keys: ['←', '→'], action: 'Value by one' },
      { keys: ['⇧', '←→'], chord: true, action: 'Value by sixteen' },
      { keys: ['0', '…', 'F'], action: 'Type the value in hex, digits rolling in from the right' },
      { keys: ['DEL'], action: 'Clear the effect' },
    ],
  },
  {
    title: 'DRAGGING',
    note: 'Toggle DRAG above the row numbers. A drag commits to one axis, so it never changes pitch and octave at once — and dragging back where you started restores the original note.',
    bindings: [
      { keys: ['DRAG', '←→'], chord: true, action: 'Step through the scale, staying in key' },
      { keys: ['DRAG', '↑↓'], chord: true, action: 'Raise or lower by an octave' },
      { keys: ['DRAG', 'DRUM'], chord: true, action: 'Sideways cycles the drum, up and down tunes it' },
    ],
  },
  {
    title: 'UNDO',
    note: 'Covers note and effect edits and the R regenerate buttons. A whole drag counts as one step. History lasts the session and clears when you load another song.',
    bindings: [
      { keys: [MOD, 'Z'], chord: true, action: 'Undo' },
      { keys: [MOD, '⇧', 'Z'], chord: true, action: 'Redo' },
    ],
  },
];

const EFFECTS: { code: string; name: string; value: string }[] = [
  { code: 'SU', name: 'Slide up', value: 'bend amount' },
  { code: 'SD', name: 'Slide down', value: 'bend amount' },
  { code: 'VB', name: 'Vibrato', value: 'XY — speed, depth' },
  { code: 'TR', name: 'Tremolo', value: 'XY — speed, depth' },
  { code: 'DT', name: 'Duty cycle', value: '01, 02 or 03' },
  { code: 'ST', name: 'Staccato', value: 'higher is shorter' },
  { code: 'PD', name: 'Pitch drop', value: 'higher is steeper' },
  { code: 'BC', name: 'Bit crush', value: 'higher is crunchier' },
];

/** A single key, drawn as a keycap. Wide labels get a wider cap. */
function Cap({ label }: { label: string }) {
  // An ellipsis between caps is a range marker, not a key — draw it bare.
  if (label === '…') return <Text style={styles.rangeDash}>…</Text>;
  return (
    <View style={[styles.cap, label.length > 2 && styles.capWide]}>
      <Text style={styles.capText}>{label}</Text>
    </View>
  );
}

function KeyCombo({ keys, chord }: { keys: string[]; chord?: boolean }) {
  return (
    <View style={styles.combo}>
      {keys.map((k, i) => (
        <React.Fragment key={`${k}-${i}`}>
          {chord && i > 0 ? <Text style={styles.plus}>+</Text> : null}
          <Cap label={k} />
        </React.Fragment>
      ))}
    </View>
  );
}

export function HelpModal({ visible, onClose }: HelpModalProps) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>KEYS</Text>
            <Text style={styles.subtitle}>tracker shortcuts</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close help"
            >
              <Text style={styles.closeBtnText}>X</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.note ? <Text style={styles.sectionNote}>{section.note}</Text> : null}
                {section.bindings.map((b, i) => (
                  <View key={`${section.title}-${i}`} style={styles.bindingRow}>
                    <View style={styles.keyCol}>
                      <KeyCombo keys={b.keys} chord={b.chord} />
                    </View>
                    <Text style={styles.actionText}>{b.action}</Text>
                  </View>
                ))}
              </View>
            ))}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>EFFECT CODES</Text>
              <Text style={styles.sectionNote}>
                VB and TR read each hex digit on its own — VB36 is speed 3, depth 6, not the
                number 54.
              </Text>
              {EFFECTS.map((fx) => (
                <View key={fx.code} style={styles.bindingRow}>
                  <View style={styles.keyCol}>
                    <View style={[styles.cap, styles.capFx]}>
                      <Text style={styles.capFxText}>{fx.code}</Text>
                    </View>
                  </View>
                  <Text style={styles.actionText}>
                    <Text>{fx.name}</Text>
                    <Text style={styles.fxValue}>{`   ${fx.value}`}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modal: {
    flex: 1,
    width: '100%',
    maxWidth: 640,
    maxHeight: '85%',
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.lg,
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: fontSize.panelTitle,
    fontWeight: '700',
    color: colors.accentPrimary,
    letterSpacing: 2,
  },
  subtitle: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textDim,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  closeBtnText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackHeader,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  sectionNote: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textSecondary,
    lineHeight: 15,
    marginBottom: spacing.sm,
  },
  bindingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: spacing.md,
  },
  keyCol: {
    width: 132,
    // Without this a View stretches its children, and a lone cap would widen
    // into a bar instead of staying key-shaped.
    alignItems: 'flex-start',
  },
  combo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // A keycap: square-ish, raised off the background by a hard bottom edge.
  // No rounding — this is a tracker, not a product page.
  cap: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderTrack,
    borderBottomWidth: 3,
    borderBottomColor: colors.borderFocus,
  },
  capWide: {
    paddingHorizontal: 7,
  },
  capText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  capFx: {
    borderBottomColor: colors.ch0Primary,
  },
  capFxText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ch0Primary,
    fontWeight: '700',
  },
  plus: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textDim,
    marginHorizontal: 1,
  },
  rangeDash: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textDim,
    paddingHorizontal: 1,
  },
  actionText: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textPrimary,
    lineHeight: 16,
  },
  fxValue: {
    color: colors.textDim,
  },
});
