import { useRef, useCallback, useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { colors, fonts, fontSize, spacing } from './src/theme';
import {
  Dropdown,
  Slider,
  PatternBlock,
  Oscilloscope,
  InstrumentCard,
  SequenceMatrix,
  ExportModal,
  computeBarColors,
} from './src/components';
import type { ChannelNote, RGB } from './src/components';
import {
  generateSong,
  regeneratePattern,
  regenerateChannel,
  renderSongBuffers,
  generateInstruments,
  zzfxP,
  zzfxG,
  unlockAudio,
  AudioGraph,
  zzfxmToNoteName,
  drumNoteToName,
  effectToDisplayString,
  CHROMATIC,
  SCALES,
  VIBE_CONFIG,
  codeToSong,
} from './src/engine';
import type { Song, SongLength, VibeName, NoteName, ScaleName, PatternLabel } from './src/engine';
import type { ChannelIndex } from './src/theme/colors';
import { useSongStore, initializeStore } from './src/store';
import { useState } from 'react';

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const VIBE_OPTIONS: VibeName[] = ['adventure', 'battle', 'dungeon', 'titleScreen', 'boss'];
const KEY_OPTIONS: NoteName[] = [...CHROMATIC];
const SCALE_OPTIONS: ScaleName[] = Object.keys(SCALES) as ScaleName[];
const LENGTH_OPTIONS: SongLength[] = ['short', 'long', 'epic'];
const CHANNEL_NAMES = ['LEAD', 'HARM', 'BASS', 'DRUM'];
const CHANNEL_COLORS = [colors.ch0Primary, colors.ch1Primary, colors.ch2Primary, colors.ch3Primary];

// Initialize store on app load (generates random song if none persisted)
initializeStore();

export default function App() {
  // Persisted state from store
  const song = useSongStore(s => s.song);
  const vibe = useSongStore(s => s.vibe);
  const key = useSongStore(s => s.key);
  const scale = useSongStore(s => s.scale);
  const bpm = useSongStore(s => s.bpm);
  const songLength = useSongStore(s => s.songLength);
  const channelVolumes = useSongStore(s => s.channelVolumes);
  const activePattern = useSongStore(s => s.activePattern);
  const mutedChannels = useSongStore(s => s.mutedChannels);
  const soloChannel = useSongStore(s => s.soloChannel);

  const {
    setSong, setVibe, setKey, setScale, setBpm, setSongLength,
    setActivePattern, toggleMute, toggleSolo, updateVolume,
    generate, loadSong,
  } = useSongStore.getState();

  // Ephemeral state (not persisted)
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRow, setPlaybackRow] = useState<number | null>(null);
  const [playbackPatternIdx, setPlaybackPatternIdx] = useState(0);
  const [flashChannels, setFlashChannels] = useState<Set<number>>(new Set());
  const [showExport, setShowExport] = useState(false);

  // Refs
  const audioGraphRef = useRef<AudioGraph | null>(null);
  const channelBuffersRef = useRef<[number[], number[]][]>([]);
  const rafRef = useRef<number>(0);
  const bpmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy-init AudioGraph
  const getAudioGraph = useCallback(() => {
    if (!audioGraphRef.current) {
      audioGraphRef.current = new AudioGraph();
    }
    return audioGraphRef.current;
  }, []);

  // Compute effective gain per channel
  const getEffectiveGain = useCallback((ch: number) => {
    if (soloChannel !== null) {
      return ch === soloChannel ? 1 : 0;
    }
    return mutedChannels.includes(ch) ? 0 : 1;
  }, [soloChannel, mutedChannels]);

  // Compute which channels are effectively muted (for UI display)
  const effectiveMutes = useMemo(() => {
    const muted = new Set<number>();
    for (let i = 0; i < 4; i++) {
      if (getEffectiveGain(i) === 0) muted.add(i);
    }
    return muted;
  }, [getEffectiveGain]);

  // Apply gains to audio graph whenever mute/solo changes
  useEffect(() => {
    const ag = audioGraphRef.current;
    if (!ag) return;
    for (let ch = 0; ch < 4; ch++) {
      ag.setChannelGain(ch, getEffectiveGain(ch));
    }
  }, [getEffectiveGain]);

  // Playback position tracking via RAF using AudioGraph's audio clock
  const updatePlaybackPosition = useCallback(() => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong || !audioGraphRef.current) return;
    const ag = audioGraphRef.current;
    const elapsed = ag.getPosition();
    const rowDuration = 60 / currentSong.config.bpm / 4;
    const patternDuration = 32 * rowDuration;

    const patIdx = Math.floor(elapsed / patternDuration) % currentSong.sequence.length;
    const row = Math.floor((elapsed % patternDuration) / rowDuration);
    setPlaybackRow(row);
    setPlaybackPatternIdx(patIdx);
    const label = currentSong.patternOrder[currentSong.sequence[patIdx]];
    if (label) setActivePattern(label);

    rafRef.current = requestAnimationFrame(updatePlaybackPosition);
  }, []);

  // Generation flash effect
  const flashChannel = useCallback((channels: number[]) => {
    setFlashChannels(new Set(channels));
    setTimeout(() => setFlashChannels(new Set()), 150);
  }, []);

  // Auto-regen when vibe/key/scale/length changes
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    generate(vibe, key, scale, bpm, songLength);
    flashChannel([0, 1, 2, 3]);
    // Stop playback
    if (audioGraphRef.current?.isPlaying) {
      audioGraphRef.current.stop();
      setIsPlaying(false);
      setPlaybackRow(null);
      cancelAnimationFrame(rafRef.current);
    }
  }, [vibe, key, scale, songLength]);

  // Live BPM change — debounced re-render + hot-swap while playing
  useEffect(() => {
    if (!song || !audioGraphRef.current?.isPlaying) {
      // Not playing — just update the song config for next play
      if (song && bpm !== song.config.bpm) {
        setSong({ ...song, config: { ...song.config, bpm } });
      }
      return;
    }

    if (bpmTimerRef.current) clearTimeout(bpmTimerRef.current);
    bpmTimerRef.current = setTimeout(() => {
      const currentSong = useSongStore.getState().song;
      if (!currentSong) return;
      const newSong = { ...currentSong, config: { ...currentSong.config, bpm } };
      setSong(newSong);

      const buffers = renderSongBuffers(newSong);
      if (buffers.length === 0 || buffers[0][0].length === 0) return;

      channelBuffersRef.current = buffers;
      const songDuration = buffers[0][0].length / 44100;
      audioGraphRef.current?.replaceAllChannels(buffers, songDuration, bpm);
    }, 80);

    return () => {
      if (bpmTimerRef.current) clearTimeout(bpmTimerRef.current);
    };
  }, [bpm]);

  // Re-roll everything: random vibe, key, scale
  const handleReroll = useCallback(() => {
    unlockAudio();
    const newVibe = pick(VIBE_OPTIONS);
    const vibeConf = VIBE_CONFIG[newVibe];
    const newKey = pick(KEY_OPTIONS);
    const newScale = pick(vibeConf.preferredScales);
    const newBpm = vibeConf.bpmRange[0] + Math.floor(Math.random() * (vibeConf.bpmRange[1] - vibeConf.bpmRange[0] + 1));
    generate(newVibe, newKey, newScale, newBpm, useSongStore.getState().songLength);
    flashChannel([0, 1, 2, 3]);
    // Stop playback
    if (audioGraphRef.current?.isPlaying) {
      audioGraphRef.current.stop();
      setIsPlaying(false);
      setPlaybackRow(null);
      cancelAnimationFrame(rafRef.current);
    }
  }, [flashChannel]);

  const handlePlay = useCallback(() => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    unlockAudio();

    const ag = getAudioGraph();

    if (ag.isPlaying) {
      ag.stop();
      cancelAnimationFrame(rafRef.current);
    }

    const buffers = renderSongBuffers(currentSong);
    if (buffers.length === 0 || buffers[0][0].length === 0) return;

    channelBuffersRef.current = buffers;
    const songDuration = buffers[0][0].length / 44100;
    ag.play(buffers, songDuration, currentSong.config.bpm);

    // Apply current mute/solo state
    for (let ch = 0; ch < 4; ch++) {
      ag.setChannelGain(ch, getEffectiveGain(ch));
    }

    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(updatePlaybackPosition);
  }, [updatePlaybackPosition, getEffectiveGain, getAudioGraph]);

  const handleStop = useCallback(() => {
    audioGraphRef.current?.stop();
    setIsPlaying(false);
    setPlaybackRow(null);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const handleRegenPattern = useCallback((label: PatternLabel) => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    const { pattern, effects } = regeneratePattern(currentSong, label);
    setSong({
      ...currentSong,
      patterns: { ...currentSong.patterns, [label]: pattern },
      patternEffects: { ...currentSong.patternEffects, [label]: effects },
    });
    flashChannel([0, 1, 2, 3]);
  }, [flashChannel]);

  const handleRegenChannel = useCallback((channelIndex: number) => {
    const { song: currentSong, activePattern: ap } = useSongStore.getState();
    if (!currentSong) return;
    const { pattern, effects } = regenerateChannel(currentSong, ap, channelIndex);
    const newSong = {
      ...currentSong,
      patterns: { ...currentSong.patterns, [ap]: pattern },
      patternEffects: { ...currentSong.patternEffects, [ap]: effects },
    };
    setSong(newSong);
    flashChannel([channelIndex]);

    // Hot-swap while playing
    if (audioGraphRef.current?.isPlaying) {
      const buffers = renderSongBuffers(newSong);
      channelBuffersRef.current[channelIndex] = buffers[channelIndex];
      audioGraphRef.current.replaceChannel(channelIndex, buffers[channelIndex]);
    }
  }, [flashChannel]);

  const handleRegenSingleInstrument = useCallback((channelIndex: number) => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    const newInstruments = [...currentSong.instruments];
    const newAll = generateInstruments(currentSong.config.vibe);
    newInstruments[channelIndex] = newAll[channelIndex];
    const newSong = { ...currentSong, instruments: newInstruments };
    setSong(newSong);
    const newVol = newInstruments[channelIndex][0] ?? 1;
    useSongStore.getState().setChannelVolumes(prev => {
      const next = [...prev];
      next[channelIndex] = newVol;
      return next;
    });

    // Hot-swap while playing
    if (audioGraphRef.current?.isPlaying) {
      const buffers = renderSongBuffers(newSong);
      channelBuffersRef.current[channelIndex] = buffers[channelIndex];
      audioGraphRef.current.replaceChannel(channelIndex, buffers[channelIndex]);
    }
  }, []);

  const handleVolumeChange = useCallback((channelIndex: number, newVol: number) => {
    updateVolume(channelIndex, newVol);

    // Debounced re-render + hot-swap while playing
    if (audioGraphRef.current?.isPlaying) {
      if (volTimerRef.current) clearTimeout(volTimerRef.current);
      volTimerRef.current = setTimeout(() => {
        const currentSong = useSongStore.getState().song;
        if (!currentSong) return;
        const buffers = renderSongBuffers(currentSong);
        channelBuffersRef.current[channelIndex] = buffers[channelIndex];
        audioGraphRef.current?.replaceChannel(channelIndex, buffers[channelIndex]);
      }, 100);
    }
  }, []);

  const handlePreviewInstrument = useCallback((channelIndex: number) => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    unlockAudio();
    const params = [...currentSong.instruments[channelIndex]];
    if (channelIndex === 3) {
      params[2] *= 2 ** ((12 - 12) / 12);
    }
    const samples = zzfxG(...params);
    if (samples.length > 0) {
      zzfxP([samples]);
    }
  }, []);

  // Export / Import
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,.txt';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const imported = codeToSong(text);
      if (!imported) return;
      loadSong(imported);
      if (audioGraphRef.current?.isPlaying) {
        audioGraphRef.current.stop();
        setIsPlaying(false);
        setPlaybackRow(null);
      }
    };
    input.click();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioGraphRef.current?.stop();
      if (volTimerRef.current) clearTimeout(volTimerRef.current);
    };
  }, []);

  const currentPattern = song && song.patterns[activePattern];
  const currentEffects = song?.patternEffects?.[activePattern];

  // Precompute per-row bar colors for the playing pattern's oscilloscope
  const BAR_COUNT = 64;
  const oscColorTable = useMemo(() => {
    if (!song || !currentPattern) return null;

    const rowDuration = 60 / song.config.bpm / 4;
    const analyser = audioGraphRef.current?.getAnalyser();
    const sampleRate = analyser?.context?.sampleRate;
    const fftSize = analyser?.fftSize;

    const ctx = analyser?.context as AudioContext | undefined;
    const audioLatency = (ctx?.baseLatency ?? 0) + (ctx?.outputLatency ?? 0);

    const envelopes = song.instruments.map(params => ({
      attack: params[3] ?? 0,
      sustain: params[4] ?? 0,
      release: params[5] ?? 0,
      decay: params[18] ?? 0,
    }));

    const channelNoteMap: (ChannelNote | null)[][] = Array.from({ length: 32 }, () => []);

    for (let row = 0; row < 32; row++) {
      for (let ch = 0; ch < 4; ch++) {
        let foundNote = 0;
        let noteRow = -1;
        for (let r = row; r >= 0; r--) {
          const val = currentPattern[ch][r + 2];
          if (val > 0) {
            foundNote = val;
            noteRow = r;
            break;
          }
        }

        if (foundNote <= 0 || noteRow < 0) {
          channelNoteMap[row].push(null);
          continue;
        }

        const elapsed = (row - noteRow) * rowDuration + audioLatency;
        const env = envelopes[ch];
        const adsrDuration = env.attack + env.decay + env.sustain + env.release;

        const visualTail = 0.3;
        const minVisualDuration = 0.4;
        const totalVisualDuration = Math.max(adsrDuration + visualTail, minVisualDuration);

        if (elapsed > totalVisualDuration) {
          channelNoteMap[row].push(null);
          continue;
        }

        let amp = 1.0;
        if (elapsed < env.attack) {
          amp = elapsed / Math.max(env.attack, 0.001);
        } else if (elapsed < env.attack + env.decay) {
          amp = 1.0;
        } else if (elapsed < env.attack + env.decay + env.sustain) {
          amp = 0.8;
        } else if (elapsed < adsrDuration) {
          const releaseElapsed = elapsed - (env.attack + env.decay + env.sustain);
          amp = Math.max(0, 0.8 * (1 - releaseElapsed / Math.max(env.release, 0.001)));
        } else {
          const tailElapsed = elapsed - adsrDuration;
          const tailProgress = tailElapsed / visualTail;
          amp = 0.3 * (1 - tailProgress * tailProgress);
        }

        const baseFreq = song.instruments[ch][2] ?? 261.63;
        const frequency = baseFreq * Math.pow(2, (foundNote - 12) / 12);
        const shape = song.instruments[ch][6] ?? 0;
        const baseWeight = ch === 3 ? 0.35 : 1.0;
        channelNoteMap[row].push({ frequency, shape, weight: baseWeight * amp });
      }
    }

    return channelNoteMap.map(notes =>
      computeBarColors(notes, BAR_COUNT, sampleRate, fftSize)
    );
  }, [song, currentPattern]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header / Controls */}
      <View style={styles.header}>
        <Text style={styles.title}>ZZFX STUDIO</Text>
        <View style={styles.controls}>
          <View style={styles.transportWrapper}>
            <View style={styles.transportSpacer} />
            <View style={styles.transport}>
              <Pressable onPress={handleReroll} style={({ pressed }) => [styles.transportBtn, styles.transportBtnRegen, pressed && { opacity: 0.6 }]}>
                <Text style={[styles.transportIcon, styles.transportIconRegen, { color: colors.accentGenerate }]}>⟳</Text>
              </Pressable>
              <Pressable onPress={handlePlay} disabled={!song} style={({ pressed }) => [styles.transportBtn, isPlaying && styles.transportBtnActive, pressed && { opacity: 0.6 }, !song && { opacity: 0.4 }]}>
                <Text style={[styles.transportIcon, isPlaying && styles.transportIconActive]}>▶</Text>
              </Pressable>
              <Pressable onPress={handleStop} disabled={!isPlaying} style={({ pressed }) => [styles.transportBtn, pressed && { opacity: 0.6 }, !isPlaying && { opacity: 0.4 }]}>
                <Text style={[styles.transportIcon, { color: colors.accentStop }]}>■</Text>
              </Pressable>
            </View>
          </View>
          <Dropdown label="VIBE" value={vibe} options={VIBE_OPTIONS} onSelect={(v) => setVibe(v as VibeName)} />
          <Dropdown label="KEY" value={key} options={KEY_OPTIONS} onSelect={(v) => setKey(v as NoteName)} />
          <Dropdown label="SCALE" value={scale} options={SCALE_OPTIONS} onSelect={(v) => setScale(v as ScaleName)} />
          <Dropdown label="LENGTH" value={songLength} options={LENGTH_OPTIONS} onSelect={(v) => setSongLength(v as SongLength)} />
          <Slider label="BPM" value={bpm} min={80} max={180} step={1} onValueChange={setBpm} />
        </View>
      </View>

      {/* Pattern Sequence Strip */}
      {song && (
        <View style={styles.sequenceStrip}>
          <View style={styles.sequenceHeader}>
            <Text style={styles.sectionLabel}>SEQUENCE</Text>
            <View style={styles.sequenceActions}>
              <Pressable
                onPress={() => setShowExport(true)}
                style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.actionBtnText}>EXPORT</Text>
              </Pressable>
              <Pressable
                onPress={handleImport}
                style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.actionBtnText}>IMPORT</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.sequenceRow}>
              {song.sequence.map((patIdx, i) => {
                const label = song.patternOrder[patIdx];
                const isPlayingThis = isPlaying && i === playbackPatternIdx;
                return (
                  <Pressable
                    key={`${i}-${label}`}
                    onLongPress={() => handleRegenPattern(label)}
                  >
                    <PatternBlock
                      label={label}
                      active={activePattern === label}
                      playing={isPlayingThis}
                      onPress={() => setActivePattern(label)}
                    />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Oscilloscope */}
      {song && (
        <Oscilloscope
          analyser={audioGraphRef.current?.getAnalyser() ?? null}
          isPlaying={isPlaying}
          height={48}
          barCount={BAR_COUNT}
          barColors={playbackRow !== null && oscColorTable ? oscColorTable[playbackRow] : undefined}
        />
      )}

      {/* Instrument Cards */}
      {song && (
        <View style={styles.instrumentStrip}>
          <SequenceMatrix
            sequence={song.sequence}
            patternOrder={song.patternOrder}
            playbackPatternIdx={playbackPatternIdx}
            playbackRow={playbackRow}
            isPlaying={isPlaying}
          />
          {song.instruments.map((params, ci) => (
            <InstrumentCard
              key={ci}
              channelIndex={ci as ChannelIndex}
              params={params}
              volume={channelVolumes[ci] ?? params[0] ?? 1}
              onVolumeChange={(v) => handleVolumeChange(ci, v)}
              onPreview={() => handlePreviewInstrument(ci)}
              onRegenerate={() => handleRegenSingleInstrument(ci)}
            />
          ))}
        </View>
      )}

      {/* Pattern Data Grid */}
      {currentPattern ? (
        <ScrollView style={styles.gridContainer}>
          {/* Channel Headers with Regen */}
          <View style={styles.gridHeader}>
            <View style={styles.rowNumCol}>
              <Text style={styles.headerText}>ROW</Text>
            </View>
            {CHANNEL_NAMES.map((name, ci) => {
              const isMuted = effectiveMutes.has(ci);
              const isSoloed = soloChannel === ci;
              const isExplicitMuted = mutedChannels.includes(ci);
              return (
                <View key={name} style={styles.channelCol}>
                  <View style={styles.channelHeaderRow}>
                    <Text style={[
                      styles.headerText,
                      { color: isMuted ? colors.textDim : CHANNEL_COLORS[ci] },
                    ]}>
                      {name}
                    </Text>
                    <View style={styles.headerBtnGroup}>
                      <Pressable
                        onPress={() => toggleMute(ci)}
                        style={[
                          styles.toggleBtn,
                          isExplicitMuted && styles.toggleBtnMuted,
                        ]}
                      >
                        <Text style={[
                          styles.toggleText,
                          isExplicitMuted && styles.toggleTextActive,
                        ]}>M</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => toggleSolo(ci)}
                        style={[
                          styles.toggleBtn,
                          isSoloed && styles.toggleBtnSoloed,
                        ]}
                      >
                        <Text style={[
                          styles.toggleText,
                          isSoloed && styles.toggleTextSoloed,
                        ]}>S</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleRegenChannel(ci)}
                        style={({ pressed }) => [
                          styles.regenBtn,
                          pressed && { opacity: 0.6 },
                          flashChannels.has(ci) && styles.regenFlash,
                        ]}
                      >
                        <Text style={styles.regenText}>R</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Grid Rows */}
          {Array.from({ length: 32 }, (_, row) => {
            const isBeat = row % 8 === 0;
            const isCursor = row === playbackRow;
            return (
              <View
                key={row}
                style={[
                  styles.gridRow,
                  isBeat && styles.gridRowBeat,
                  row % 2 === 0 && styles.gridRowAlt,
                  isCursor && styles.gridRowCursor,
                ]}
              >
                <View style={styles.rowNumCol}>
                  <Text style={[
                    styles.rowNum,
                    isBeat && styles.rowNumBeat,
                    isCursor && styles.rowNumCursor,
                  ]}>
                    {row.toString(16).toUpperCase().padStart(2, '0')}
                  </Text>
                </View>
                {currentPattern.map((channel, ci) => {
                  const noteVal = channel[row + 2];
                  const noteName = ci === 3
                    ? drumNoteToName(noteVal)
                    : zzfxmToNoteName(noteVal);
                  const fx = currentEffects?.[ci]?.[row];
                  const fxStr = effectToDisplayString(fx);
                  const isFlashing = flashChannels.has(ci);
                  const noteColor = noteVal > 0
                    ? (effectiveMutes.has(ci) ? colors.textDim : CHANNEL_COLORS[ci])
                    : colors.textDim;
                  return (
                    <View
                      key={ci}
                      style={[
                        styles.channelCol,
                        isFlashing && styles.channelFlash,
                      ]}
                    >
                      <Text
                        style={[
                          styles.noteText,
                          isCursor && noteVal > 0 && styles.noteTextCursor,
                        ]}
                      >
                        <Text style={{ color: noteColor }}>{noteName}</Text>
                        <Text style={{ color: fx ? noteColor : colors.textDim }}>{` ${fxStr}`}</Text>
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Export Modal */}
      {song && (
        <ExportModal
          visible={showExport}
          song={song}
          onClose={() => setShowExport(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '700',
    color: colors.accentPrimary,
    letterSpacing: 2,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'flex-end',
  },
  transportWrapper: {
    gap: spacing.xs,
  },
  transportSpacer: {
    height: fontSize.trackSub,  // match dropdown label height
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  transportBtn: {
    width: 36,
    height: fontSize.buttonLabel + spacing.md * 2 + 2, // text + padding + border, matches dropdown trigger
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgElevated,
  },
  transportBtnRegen: {
    borderColor: colors.accentGenerate,
  },
  transportBtnActive: {
    borderColor: colors.accentPlay,
    backgroundColor: colors.accentPlay,
  },
  transportIcon: {
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'center' as const,
  },
  transportIconRegen: {
    fontSize: 20,
  },
  transportIconActive: {
    color: colors.bgPrimary,
  },
  sequenceStrip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  sequenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  sequenceActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  actionBtnText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sequenceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  instrumentStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  gridContainer: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  gridHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderTrack,
    paddingVertical: spacing.sm,
  },
  rowNumCol: {
    width: 36,
    paddingHorizontal: spacing.xs,
  },
  channelCol: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  channelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 3,
  },
  headerText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackHeader,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  headerBtnGroup: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
  },
  toggleBtn: {
    width: 18,
    height: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  toggleBtnMuted: {
    borderColor: colors.accentStop,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  toggleBtnSoloed: {
    borderColor: colors.accentPlay,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  toggleText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    color: colors.textDim,
  },
  toggleTextActive: {
    color: colors.accentStop,
  },
  toggleTextSoloed: {
    color: colors.accentPlay,
  },
  regenBtn: {
    width: 18,
    height: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: colors.accentGenerate,
  },
  regenText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.accentGenerate,
    fontWeight: '700',
  },
  regenFlash: {
    backgroundColor: colors.accentGenerate,
    borderColor: colors.accentGenerate,
  },
  gridRow: {
    flexDirection: 'row',
    paddingVertical: 1,
    backgroundColor: colors.bgGridRow,
  },
  gridRowAlt: {
    backgroundColor: colors.bgGridRowAlt,
  },
  gridRowBeat: {
    backgroundColor: colors.bgGridBeat,
  },
  gridRowCursor: {
    backgroundColor: colors.bgCursor,
    borderLeftWidth: 2,
    borderLeftColor: colors.accentPrimary,
  },
  rowNum: {
    fontFamily: fonts.mono,
    fontSize: fontSize.gridRowNum,
    color: colors.textDim,
  },
  rowNumBeat: {
    color: colors.textSecondary,
  },
  rowNumCursor: {
    color: colors.accentPrimary,
    fontWeight: '700',
  },
  noteText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.gridNote,
  },
  noteTextCursor: {
    fontWeight: '700',
  },
  channelFlash: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
  },
});
