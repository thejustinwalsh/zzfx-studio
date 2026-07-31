import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, fonts, fontSize, spacing } from '../theme';
import type { MidiDevice } from '../engine/midi';

const CHANNEL_NAMES = ['LEAD', 'HARM', 'BASS', 'DRUM'];
const CHANNEL_COLORS = [colors.ch0Primary, colors.ch1Primary, colors.ch2Primary, colors.ch3Primary];

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

                {enabled && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>INPUTS</Text>
                    {devices.length === 0 ? (
                      <Text style={styles.note}>
                        Nothing connected. Plug a controller in — the list updates without a reload.
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
                )}

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>ARMED CHANNELS</Text>
                  <Text style={styles.note}>
                    One armed channel takes every note, whatever channel it arrives on — which is
                    what most keyboards send. Arm several and the incoming channel picks between
                    them.
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
                  <Text style={styles.sectionTitle}>RECORDING</Text>
                  <Text style={styles.note}>
                    Stopped, played notes just sound. While the song plays they are written into the
                    grid at the nearest row, so there is no separate record button. Undo covers a
                    wrong take.
                  </Text>
                </View>
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
    flex: 1,
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
  body: { flex: 1 },
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
