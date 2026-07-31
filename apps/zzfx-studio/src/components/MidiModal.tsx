import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, fonts, fontSize, spacing } from '../theme';
import type { MidiDevice } from '../engine/midi';
import type { LaunchpadControls } from '../hooks/useLaunchpad';

const CHANNEL_NAMES = ['LEAD', 'HARM', 'BASS', 'DRUM'];
const CHANNEL_COLORS = [colors.ch0Primary, colors.ch1Primary, colors.ch2Primary, colors.ch3Primary];

/** What each layout is for, shown under its name so the choice needs no manual. */
const LAYOUTS = [
  { id: 'SESSION', hint: 'patterns' },
  { id: 'KEYS', hint: 'play' },
  { id: 'DRUMS', hint: 'kit' },
] as const;

/** Mirrors CHANNEL_TO_MIDI in the midi module — General MIDI puts drums on 10. */
const MIDI_CHANNELS = [1, 2, 3, 10];

interface MidiModalProps {
  visible: boolean;
  onClose: () => void;
  supported: boolean;
  enabled: boolean;
  devices: MidiDevice[];
  armedChannels: number[];
  error: string | null;
  onEnable: () => void;
  onDisable: () => void;
  onToggleArm: (ch: number) => void;
  launchpad: LaunchpadControls;
}

export function MidiModal({
  visible,
  onClose,
  supported,
  enabled,
  devices,
  armedChannels,
  error,
  onEnable,
  onDisable,
  onToggleArm,
  launchpad,
}: MidiModalProps) {
  // Escape closes it, matching the rest of the grid interaction. onRequestClose
  // only fires for Android's hardware back button.
  React.useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>MIDI</Text>
            <Text style={styles.subtitle}>
              {enabled ? `${devices.length} input${devices.length === 1 ? '' : 's'}` : 'not connected'}
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close MIDI settings"
            >
              <Text style={styles.closeBtnText}>X</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {!supported ? (
              <Text style={styles.note}>
                This browser has no Web MIDI. Chrome and Edge support it, on desktop and Android;
                Safari and everything on iOS do not.
              </Text>
            ) : (
              <>
                <View style={styles.section}>
                  <AnimatedPressable
                    onPress={enabled ? onDisable : onEnable}
                    style={[styles.enableBtn, enabled && styles.enableBtnOn]}
                    accessibilityRole="button"
                    accessibilityLabel={enabled ? 'Disconnect MIDI' : 'Connect MIDI'}
                  >
                    <Text style={[styles.enableText, enabled && styles.enableTextOn]}>
                      {enabled ? 'DISCONNECT' : 'CONNECT MIDI'}
                    </Text>
                  </AnimatedPressable>
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>INPUTS</Text>
                  {!enabled ? (
                    <Text style={styles.note}>
                      Your devices cannot be listed until the browser grants MIDI access. Connect
                      above and anything plugged in will appear here.
                    </Text>
                  ) : devices.length === 0 ? (
                    <Text style={styles.note}>
                      Access granted, but no inputs are reporting. Plug a controller in — the list
                      updates without a reload.
                    </Text>
                  ) : (
                    devices.map((d) => (
                      <View key={d.id} style={styles.deviceRow}>
                        <View style={styles.deviceDot} />
                        <Text style={styles.deviceName} numberOfLines={1}>{d.name}</Text>
                        {!!d.manufacturer && (
                          <Text style={styles.deviceMaker} numberOfLines={1}>{d.manufacturer}</Text>
                        )}
                      </View>
                    ))
                  )}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>ARMED CHANNELS</Text>
                  <Text style={styles.note}>
                    One armed channel takes every note. Arm several and the incoming MIDI channel
                    picks between them.
                  </Text>
                  {CHANNEL_NAMES.map((name, ci) => {
                    const armed = armedChannels.includes(ci);
                    return (
                      <AnimatedPressable
                        key={name}
                        onPress={() => onToggleArm(ci)}
                        style={[styles.channelRow, armed && styles.channelRowArmed]}
                        accessibilityRole="button"
                        accessibilityLabel={`${armed ? 'Disarm' : 'Arm'} ${name}`}
                        accessibilityState={{ selected: armed }}
                      >
                        <View style={[styles.channelDot, { backgroundColor: CHANNEL_COLORS[ci] }]} />
                        <Text style={[styles.channelName, armed && styles.channelNameArmed]}>
                          {name}
                        </Text>
                        <Text style={styles.channelMidi}>CH {MIDI_CHANNELS[ci]}</Text>
                        <Text style={[styles.armState, armed && styles.armStateOn]}>
                          {armed ? 'ARMED' : '—'}
                        </Text>
                      </AnimatedPressable>
                    );
                  })}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>LAUNCHPAD</Text>
                  <Text style={styles.note}>
                    Lighting the pads needs SysEx, a separate and heavier browser permission than
                    note input — so it is asked for only here.
                  </Text>

                  <AnimatedPressable
                    onPress={launchpad.enabled ? launchpad.disable : launchpad.enable}
                    disabled={launchpad.connecting}
                    style={[styles.enableBtn, launchpad.enabled && styles.enableBtnOn]}
                    accessibilityRole="button"
                    accessibilityLabel={launchpad.enabled ? 'Release the Launchpad' : 'Take control of the Launchpad'}
                  >
                    <Text style={[styles.enableText, launchpad.enabled && styles.enableTextOn]}>
                      {launchpad.connecting
                        ? 'CONNECTING…'
                        : launchpad.enabled
                          ? 'RELEASE'
                          : 'TAKE CONTROL'}
                    </Text>
                  </AnimatedPressable>

                  {launchpad.error ? <Text style={styles.error}>{launchpad.error}</Text> : null}

                  {launchpad.enabled && (
                    <>
                      <View style={styles.deviceRow}>
                        <View style={styles.deviceDot} />
                        <Text style={styles.deviceName} numberOfLines={1}>
                          {launchpad.deviceName ?? 'Launchpad Mini MK3'}
                        </Text>
                        <Text style={styles.deviceMaker}>PROGRAMMER MODE</Text>
                      </View>

                      <Text style={[styles.sectionTitle, styles.layoutTitle]}>LAYOUT</Text>
                      <View style={styles.layoutRow}>
                        {LAYOUTS.map(({ id, hint }) => {
                          const on = launchpad.layout === id;
                          return (
                            <AnimatedPressable
                              key={id}
                              onPress={() => launchpad.setLayout(id)}
                              style={[styles.layoutBtn, on && styles.layoutBtnOn]}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={`${id} layout — ${hint}`}
                            >
                              <Text style={[styles.layoutLabel, on && styles.layoutLabelOn]}>{id}</Text>
                              <Text style={styles.layoutHint}>{hint}</Text>
                            </AnimatedPressable>
                          );
                        })}
                      </View>
                      <Text style={styles.footnote}>
                        The top row of the device switches layouts too. In KEYS each quadrant is one
                        channel, coloured to match its track — every pad sounds, and the brighter
                        quadrants are the armed ones whose notes also get written down.
                      </Text>
                    </>
                  )}
                </View>

                <Text style={styles.footnote}>
                  Stopped, notes just sound. Playing, they are written into the grid at the nearest
                  row — no record button, and undo covers a wrong take.
                </Text>
              </>
            )}
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
    width: '100%',
    maxWidth: 520,
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
  body: { flexShrink: 1 },
  bodyContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackHeader,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  note: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textSecondary,
    lineHeight: 15,
    marginBottom: spacing.sm,
  },
  error: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.accentStop,
    marginTop: spacing.sm,
  },
  enableBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentPlay,
    alignSelf: 'flex-start',
  },
  enableBtnOn: {
    borderColor: colors.accentStop,
  },
  enableText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    fontWeight: '700',
    color: colors.accentPlay,
    letterSpacing: 1,
  },
  enableTextOn: { color: colors.accentStop },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 3,
  },
  deviceDot: {
    width: 6,
    height: 6,
    backgroundColor: colors.accentPlay,
  },
  deviceName: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textPrimary,
  },
  deviceMaker: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textDim,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginTop: 4,
  },
  channelRowArmed: {
    borderColor: colors.accentPrimary,
    backgroundColor: 'rgba(232, 116, 14, 0.10)',
  },
  channelDot: { width: 8, height: 8 },
  channelName: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: fontSize.trackHeader,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  channelNameArmed: { color: colors.textPrimary },
  channelMidi: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textDim,
  },
  layoutTitle: { marginTop: spacing.md },
  layoutRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: spacing.sm,
  },
  layoutBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    gap: 1,
  },
  layoutBtnOn: {
    borderColor: colors.accentPrimary,
    backgroundColor: 'rgba(232, 116, 14, 0.10)',
  },
  layoutLabel: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  layoutLabelOn: { color: colors.accentPrimary },
  layoutHint: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textDim,
  },
  footnote: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textDim,
    lineHeight: 13,
    marginTop: spacing.sm,
  },
  armState: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    color: colors.textDim,
    width: 44,
    textAlign: 'right',
  },
  armStateOn: { color: colors.accentPrimary },
});
