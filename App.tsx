import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  computeBarColors,
} from './src/components';
import type { ChannelNote, RGB } from './src/components';
import {
  generateSong,
  regeneratePattern,
  regenerateChannel,
  songToZzfxm,
  generateInstruments,
  zzfxMChannels,
  zzfxP,
  zzfxG,
  unlockAudio,
  AudioGraph,
  zzfxmToNoteName,
  drumNoteToName,
  CHROMATIC,
  SCALES,
  VIBE_CONFIG,
} from './src/engine';
import type { Song, SongLength, VibeName, NoteName, ScaleName, PatternLabel } from './src/engine';
import type { ChannelIndex } from './src/theme/colors';

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const VIBE_OPTIONS: VibeName[] = ['adventure', 'battle', 'dungeon', 'titleScreen', 'boss'];
const KEY_OPTIONS: NoteName[] = [...CHROMATIC];
const SCALE_OPTIONS: ScaleName[] = Object.keys(SCALES) as ScaleName[];
const LENGTH_OPTIONS: SongLength[] = ['short', 'long', 'epic'];
const CHANNEL_NAMES = ['LEAD', 'HARM', 'BASS', 'DRUM'];
const CHANNEL_COLORS = [colors.ch0Primary, colors.ch1Primary, colors.ch2Primary, colors.ch3Primary];

// Pick a random initial config
const INITIAL_VIBE = VIBE_OPTIONS[Math.floor(Math.random() * VIBE_OPTIONS.length)];
const INITIAL_KEY = KEY_OPTIONS[Math.floor(Math.random() * KEY_OPTIONS.length)];
const INITIAL_VIBE_CONFIG = VIBE_CONFIG[INITIAL_VIBE];
const INITIAL_SCALE = INITIAL_VIBE_CONFIG.preferredScales[
  Math.floor(Math.random() * INITIAL_VIBE_CONFIG.preferredScales.length)
];

const INITIAL_LENGTH: SongLength = 'long';
const INITIAL_SONG = generateSong({ vibe: INITIAL_VIBE, key: INITIAL_KEY, scale: INITIAL_SCALE, length: INITIAL_LENGTH });

export default function App() {
  const [song, setSong] = useState<Song | null>(INITIAL_SONG);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePattern, setActivePattern] = useState<PatternLabel>(INITIAL_SONG.patternOrder[0]);
  const [vibe, setVibe] = useState<VibeName>(INITIAL_VIBE);
  const [key, setKey] = useState<NoteName>(INITIAL_KEY);
  const [scale, setScale] = useState<ScaleName>(INITIAL_SCALE);
  const [bpm, setBpm] = useState(INITIAL_SONG.config.bpm);
  const [songLength, setSongLength] = useState<SongLength>(INITIAL_LENGTH);
  const [playbackRow, setPlaybackRow] = useState<number | null>(null);
  const [playbackPatternIdx, setPlaybackPatternIdx] = useState(0);
  const [flashChannels, setFlashChannels] = useState<Set<number>>(new Set());
  const [mutedChannels, setMutedChannels] = useState<Set<number>>(new Set());
  const [soloChannel, setSoloChannel] = useState<number | null>(null);
  const [channelVolumes, setChannelVolumes] = useState<number[]>(
    () => INITIAL_SONG.instruments.map(p => p[0] ?? 1)
  );
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
    return mutedChannels.has(ch) ? 0 : 1;
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

  const toggleMute = useCallback((ch: number) => {
    if (soloChannel === ch) setSoloChannel(null);
    setMutedChannels(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  }, [soloChannel]);

  const toggleSolo = useCallback((ch: number) => {
    setSoloChannel(prev => prev === ch ? null : ch);
  }, []);

  // Playback position tracking via RAF using AudioGraph's audio clock
  const updatePlaybackPosition = useCallback(() => {
    if (!song || !audioGraphRef.current) return;
    const ag = audioGraphRef.current;
    const elapsed = ag.getPosition();
    const rowDuration = 60 / song.config.bpm / 4;
    const patternDuration = 32 * rowDuration;

    const patIdx = Math.floor(elapsed / patternDuration) % song.sequence.length;
    const row = Math.floor((elapsed % patternDuration) / rowDuration);
    setPlaybackRow(row);
    setPlaybackPatternIdx(patIdx);
    const label = song.patternOrder[song.sequence[patIdx]];
    if (label) setActivePattern(label);

    rafRef.current = requestAnimationFrame(updatePlaybackPosition);
  }, [song]);

  // Generation flash effect
  const flashChannel = useCallback((channels: number[]) => {
    setFlashChannels(new Set(channels));
    setTimeout(() => setFlashChannels(new Set()), 150);
  }, []);

  // Core generate function — used by auto-regen and manual re-roll
  const doGenerate = useCallback((v: VibeName, k: NoteName, s: ScaleName, b: number, l: SongLength) => {
    const newSong = generateSong({ vibe: v, key: k, scale: s, bpm: b, length: l });
    setSong(newSong);
    setActivePattern(newSong.patternOrder[0]);
    setBpm(newSong.config.bpm);
    const vols = newSong.instruments.map(p => p[0] ?? 1);
    setChannelVolumes(vols);
    flashChannel([0, 1, 2, 3]);
    // Stop playback
    if (audioGraphRef.current?.isPlaying) {
      audioGraphRef.current.stop();
      setIsPlaying(false);
      setPlaybackRow(null);
      cancelAnimationFrame(rafRef.current);
    }
  }, [flashChannel]);

  // Auto-regen when vibe/key/scale/length changes
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    doGenerate(vibe, key, scale, bpm, songLength);
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
      if (!song) return;
      const newSong = { ...song, config: { ...song.config, bpm } };
      setSong(newSong);

      const { instruments, patterns, sequence } = songToZzfxm(newSong);
      const buffers = zzfxMChannels(instruments, patterns, sequence, bpm);
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
    setVibe(newVibe);
    setKey(newKey);
    setScale(newScale as ScaleName);
    setBpm(newBpm);
    doGenerate(newVibe, newKey, newScale, newBpm, songLength);
  }, [songLength, doGenerate]);

  const handlePlay = useCallback(() => {
    if (!song) return;
    unlockAudio();

    const ag = getAudioGraph();

    if (ag.isPlaying) {
      ag.stop();
      cancelAnimationFrame(rafRef.current);
    }

    const { instruments, patterns, sequence, bpm: songBpm } = songToZzfxm(song);
    const buffers = zzfxMChannels(instruments, patterns, sequence, songBpm);
    if (buffers.length === 0 || buffers[0][0].length === 0) return;

    channelBuffersRef.current = buffers;
    const songDuration = buffers[0][0].length / 44100;
    ag.play(buffers, songDuration, songBpm);

    // Apply current mute/solo state
    for (let ch = 0; ch < 4; ch++) {
      ag.setChannelGain(ch, getEffectiveGain(ch));
    }

    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(updatePlaybackPosition);
  }, [song, updatePlaybackPosition, getEffectiveGain, getAudioGraph]);

  const handleStop = useCallback(() => {
    audioGraphRef.current?.stop();
    setIsPlaying(false);
    setPlaybackRow(null);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const handleRegenPattern = useCallback((label: PatternLabel) => {
    if (!song) return;
    const newPattern = regeneratePattern(song, label);
    const newSong = {
      ...song,
      patterns: { ...song.patterns, [label]: newPattern },
    };
    setSong(newSong);
    flashChannel([0, 1, 2, 3]);
  }, [song, flashChannel]);

  const handleRegenChannel = useCallback((channelIndex: number) => {
    if (!song) return;
    const newPattern = regenerateChannel(song, activePattern, channelIndex);
    const newSong = {
      ...song,
      patterns: { ...song.patterns, [activePattern]: newPattern },
    };
    setSong(newSong);
    flashChannel([channelIndex]);

    // Hot-swap while playing
    if (audioGraphRef.current?.isPlaying) {
      const { instruments, patterns, sequence, bpm: songBpm } = songToZzfxm(newSong);
      const newBuffers = zzfxMChannels(instruments, patterns, sequence, songBpm, channelIndex);
      channelBuffersRef.current[channelIndex] = newBuffers[channelIndex];
      audioGraphRef.current.replaceChannel(channelIndex, newBuffers[channelIndex]);
    }
  }, [song, activePattern, flashChannel]);

  const handleRegenInstruments = useCallback(() => {
    if (!song) return;
    const newInstruments = generateInstruments(song.config.vibe);
    const newSong = { ...song, instruments: newInstruments };
    setSong(newSong);
    const vols = newInstruments.map(p => p[0] ?? 1);
    setChannelVolumes(vols);
    flashChannel([0, 1, 2, 3]);

    // Hot-swap all channels while playing
    if (audioGraphRef.current?.isPlaying) {
      const { instruments, patterns, sequence, bpm: songBpm } = songToZzfxm(newSong);
      const newBuffers = zzfxMChannels(instruments, patterns, sequence, songBpm);
      channelBuffersRef.current = newBuffers;
      const songDuration = newBuffers[0][0].length / 44100;
      audioGraphRef.current.replaceAllChannels(newBuffers, songDuration, songBpm);
    }
  }, [song, flashChannel]);

  const handleRegenSingleInstrument = useCallback((channelIndex: number) => {
    if (!song) return;
    const newInstruments = [...song.instruments];
    const newAll = generateInstruments(song.config.vibe);
    newInstruments[channelIndex] = newAll[channelIndex];
    const newSong = { ...song, instruments: newInstruments };
    setSong(newSong);
    const newVol = newInstruments[channelIndex][0] ?? 1;
    setChannelVolumes(prev => {
      const next = [...prev];
      next[channelIndex] = newVol;
      return next;
    });

    // Hot-swap while playing
    if (audioGraphRef.current?.isPlaying) {
      const { instruments, patterns, sequence, bpm: songBpm } = songToZzfxm(newSong);
      const newBuffers = zzfxMChannels(instruments, patterns, sequence, songBpm, channelIndex);
      channelBuffersRef.current[channelIndex] = newBuffers[channelIndex];
      audioGraphRef.current.replaceChannel(channelIndex, newBuffers[channelIndex]);
    }
  }, [song, flashChannel]);

  const handleVolumeChange = useCallback((channelIndex: number, newVol: number) => {
    if (!song) return;

    // Update volume state immediately
    setChannelVolumes(prev => {
      const next = [...prev];
      next[channelIndex] = newVol;
      return next;
    });

    // Update instrument param
    const newInstruments = [...song.instruments];
    newInstruments[channelIndex] = [...newInstruments[channelIndex]];
    newInstruments[channelIndex][0] = newVol;
    const newSong = { ...song, instruments: newInstruments };
    setSong(newSong);

    // Debounced re-render + hot-swap while playing
    if (audioGraphRef.current?.isPlaying) {
      if (volTimerRef.current) clearTimeout(volTimerRef.current);
      volTimerRef.current = setTimeout(() => {
        const { instruments, patterns, sequence, bpm: songBpm } = songToZzfxm(newSong);
        const newBuffers = zzfxMChannels(instruments, patterns, sequence, songBpm, channelIndex);
        channelBuffersRef.current[channelIndex] = newBuffers[channelIndex];
        audioGraphRef.current?.replaceChannel(channelIndex, newBuffers[channelIndex]);
      }, 100);
    }
  }, [song]);

  const handlePreviewInstrument = useCallback((channelIndex: number) => {
    if (!song) return;
    unlockAudio();
    const params = [...song.instruments[channelIndex]];
    // Play a C4 (note 12) for tonal, or the drum note for drums
    if (channelIndex === 3) {
      params[2] *= 2 ** ((12 - 12) / 12); // base pitch
    }
    const samples = zzfxG(...params);
    if (samples.length > 0) {
      zzfxP([samples]);
    }
  }, [song]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioGraphRef.current?.stop();
      if (volTimerRef.current) clearTimeout(volTimerRef.current);
    };
  }, []);

  const currentPattern = song && song.patterns[activePattern];

  // Precompute per-row bar colors for the playing pattern's oscilloscope
  // Uses ADSR envelope from instrument params to decay colors after note-on
  // All 32 rows computed upfront — runtime is just an array index lookup
  const BAR_COUNT = 64;
  const oscColorTable = useMemo(() => {
    if (!song || !currentPattern) return null;

    const rowDuration = 60 / song.config.bpm / 4; // seconds per row (sixteenth note)
    const analyser = audioGraphRef.current?.getAnalyser();
    const sampleRate = analyser?.context?.sampleRate;
    const fftSize = analyser?.fftSize;

    // Compensate for audio pipeline latency — colors should represent
    // what the user HEARS, not what was scheduled. Subtract latency
    // so the visual trails behind the playback cursor appropriately.
    const ctx = analyser?.context as AudioContext | undefined;
    const audioLatency = (ctx?.baseLatency ?? 0) + (ctx?.outputLatency ?? 0);

    // Per-channel envelope info (in seconds)
    const envelopes = song.instruments.map(params => ({
      attack: params[3] ?? 0,
      sustain: params[4] ?? 0,
      release: params[5] ?? 0,
      decay: params[18] ?? 0,
    }));

    // For each channel, find the last note-on at or before each row
    // and compute the envelope weight at that row's time offset
    const channelNoteMap: (ChannelNote | null)[][] = Array.from({ length: 32 }, () => []);

    for (let row = 0; row < 32; row++) {
      for (let ch = 0; ch < 4; ch++) {
        // Scan backwards from this row to find the most recent note-on
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

        // Add audio latency so the visual lags behind the cursor
        // matching when the user actually perceives the sound
        const elapsed = (row - noteRow) * rowDuration + audioLatency;
        const env = envelopes[ch];
        const adsrDuration = env.attack + env.decay + env.sustain + env.release;

        // Visual tail: extend past ADSR with a perceptual fade
        // Minimum visual presence of 0.4s so short notes don't just blink
        const visualTail = 0.3; // seconds of extra fade after ADSR ends
        const minVisualDuration = 0.4;
        const totalVisualDuration = Math.max(adsrDuration + visualTail, minVisualDuration);

        if (elapsed > totalVisualDuration) {
          channelNoteMap[row].push(null);
          continue;
        }

        // Compute envelope amplitude at this time offset
        let amp = 1.0;
        if (elapsed < env.attack) {
          amp = elapsed / Math.max(env.attack, 0.001); // ramp up
        } else if (elapsed < env.attack + env.decay) {
          amp = 1.0; // peak
        } else if (elapsed < env.attack + env.decay + env.sustain) {
          amp = 0.8; // sustain level
        } else if (elapsed < adsrDuration) {
          // Release phase
          const releaseElapsed = elapsed - (env.attack + env.decay + env.sustain);
          amp = Math.max(0, 0.8 * (1 - releaseElapsed / Math.max(env.release, 0.001)));
        } else {
          // Visual tail — perceptual fade from where ADSR ended to 0
          const tailElapsed = elapsed - adsrDuration;
          const tailProgress = tailElapsed / visualTail;
          amp = 0.3 * (1 - tailProgress * tailProgress); // quadratic ease-out
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
        <Text style={styles.title}>ZZFX GEN STUDIO</Text>
        <View style={styles.controls}>
          <View style={styles.transport}>
            <Pressable onPress={handleReroll} style={({ pressed }) => [styles.transportBtn, styles.transportBtnRegen, pressed && { opacity: 0.6 }]}>
              <Text style={[styles.transportIcon, { color: colors.accentGenerate }]}>⟳</Text>
            </Pressable>
            <Pressable onPress={handlePlay} disabled={!song} style={({ pressed }) => [styles.transportBtn, isPlaying && styles.transportBtnActive, pressed && { opacity: 0.6 }, !song && { opacity: 0.4 }]}>
              <Text style={[styles.transportIcon, isPlaying && styles.transportIconActive]}>▶</Text>
            </Pressable>
            <Pressable onPress={handleStop} disabled={!isPlaying} style={({ pressed }) => [styles.transportBtn, pressed && { opacity: 0.6 }, !isPlaying && { opacity: 0.4 }]}>
              <Text style={[styles.transportIcon, { color: colors.accentStop }]}>■</Text>
            </Pressable>
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
            <Pressable
              onPress={handleRegenInstruments}
              style={({ pressed }) => [styles.regenAllBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.regenAllText}>REGEN INSTRUMENTS</Text>
            </Pressable>
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
              const isExplicitMuted = mutedChannels.has(ci);
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
                  const noteVal = channel[row + 2]; // skip instrument + pan
                  const noteName = ci === 3
                    ? drumNoteToName(noteVal)
                    : zzfxmToNoteName(noteVal);
                  const isFlashing = flashChannels.has(ci);
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
                          {
                            color: noteVal > 0
                              ? (effectiveMutes.has(ci) ? colors.textDim : CHANNEL_COLORS[ci])
                              : colors.textDim,
                          },
                          isCursor && noteVal > 0 && styles.noteTextCursor,
                        ]}
                      >
                        {noteName}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      ) : null}
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
  transport: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  transportBtn: {
    width: 36,
    height: 36,
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
    fontSize: 20,
    color: colors.textPrimary,
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
  regenAllBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.accentGenerate,
  },
  regenAllText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.accentGenerate,
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
