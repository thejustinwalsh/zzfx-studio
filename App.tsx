import { useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import { AnimatedPressable } from './src/components/AnimatedPressable';
import { colors, fonts, fontSize, spacing } from './src/theme';
import {
  Dropdown,
  Slider,
  PatternBlock,
  Oscilloscope,
  InstrumentCard,
  SequenceMatrix,
  ExportModal,
  LoadModal,
  BrandTitle,
  RetroAvatar,
  PulsingView,
  UpdateBanner,
  computeBarColors,
  prefetchHighlighter,
} from './src/components';
import type { ChannelNote, RGB } from './src/components';
import {
  generateSong,
  regenerateForVibe,
  regenerateAllPatterns,
  regenerateWithNewLength,
  regeneratePattern,
  regenerateChannel,
  createRenderEngine,
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
import { getPatternColor, getPatternLabelColor, getPatternActiveColor, getPatternActiveLabelColor, getPatternActiveBorderColor } from './src/utils/patternColors';
import { useSongStore, initializeStore, useStoreHydrated } from './src/store';
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

// Initialize store after hydration (generates random song if none persisted)
initializeStore();

// Prefetch syntax highlighter for export modal during idle time
prefetchHighlighter();

export default function App() {
  const hydrated = useStoreHydrated();

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
    generate, loadSong, renameSong,
  } = useSongStore.getState();

  // Editable song name — local state for responsive typing, debounced to store
  const [editingName, setEditingName] = useState<string | null>(null);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayName = editingName ?? song?.config.name ?? 'ZZFX STUDIO';

  const handleNameChange = useCallback((text: string) => {
    setEditingName(text);
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(() => {
      renameSong(text);
    }, 400);
  }, []);

  const handleNameBlur = useCallback(() => {
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    if (editingName !== null) {
      renameSong(editingName);
      setEditingName(null);
    }
  }, [editingName]);

  // Sync local name when song changes externally (reroll, load, vibe change)
  const prevSongRef = useRef(song);
  useEffect(() => {
    if (song !== prevSongRef.current) {
      prevSongRef.current = song;
      setEditingName(null);
    }
  }, [song]);

  // Ephemeral state (not persisted)
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRow, setPlaybackRow] = useState<number | null>(null);
  const [playbackPatternIdx, setPlaybackPatternIdx] = useState(0);
  const [flashChannels, setFlashChannels] = useState<Set<number>>(new Set());
  const [renderingChannels, setRenderingChannels] = useState<Set<number>>(new Set());
  const [showExport, setShowExport] = useState(false);
  const exportPromiseRef = useRef<Promise<[Float32Array, Float32Array][]> | null>(null);
  const [showLoad, setShowLoad] = useState(false);

  // ADSR progress shared values — driven from RAF, consumed by WaveformPreview on UI thread
  const adsrProgress0 = useSharedValue<number | null>(null);
  const adsrProgress1 = useSharedValue<number | null>(null);
  const adsrProgress2 = useSharedValue<number | null>(null);
  const adsrProgress3 = useSharedValue<number | null>(null);
  const adsrProgressValues = useMemo(
    () => [adsrProgress0, adsrProgress1, adsrProgress2, adsrProgress3],
    [adsrProgress0, adsrProgress1, adsrProgress2, adsrProgress3]
  );

  // Refs
  const audioGraphRef = useRef<AudioGraph | null>(null);
  const renderEngineRef = useRef(createRenderEngine());
  const channelBuffersRef = useRef<([number[] | Float32Array, number[] | Float32Array])[]>([]);
  const renderSeqRef = useRef(0); // Monotonic counter — only used for BPM debounce
  const rafRef = useRef<number>(0);
  const bpmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridScrollRef = useRef<ScrollView>(null);
  const gridRowHeight = useRef(0);
  const gridHeaderHeight = useRef(0);

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

  // Eagerly pre-render audio buffers when song changes so play is instant.
  // Skip when playing — hot-swap handlers manage their own renders.
  useEffect(() => {
    if (!song || audioGraphRef.current?.isPlaying) return;
    let cancelled = false;
    renderEngineRef.current.renderSongBuffers(song).then(buffers => {
      if (cancelled) return;
      if (buffers.length > 0 && buffers[0][0].length > 0) {
        channelBuffersRef.current = buffers;
      }
    });
    return () => { cancelled = true; };
  }, [song]);

  // Compute fixed section colors per pattern label
  const patternColorMap = useMemo(() => {
    if (!song) return {
      bg: {} as Record<string, string>,
      label: {} as Record<string, string>,
      activeBg: {} as Record<string, string>,
      activeLabel: {} as Record<string, string>,
      activeBorder: {} as Record<string, string>,
    };
    const bgMap: Record<string, string> = {};
    const labelMap: Record<string, string> = {};
    const activeBgMap: Record<string, string> = {};
    const activeLabelMap: Record<string, string> = {};
    const activeBorderMap: Record<string, string> = {};
    for (const lbl of song.patternOrder) {
      bgMap[lbl] = getPatternColor(song.patterns[lbl], lbl);
      labelMap[lbl] = getPatternLabelColor(song.patterns[lbl], lbl);
      activeBgMap[lbl] = getPatternActiveColor(lbl);
      activeLabelMap[lbl] = getPatternActiveLabelColor(lbl);
      activeBorderMap[lbl] = getPatternActiveBorderColor(lbl);
    }
    return { bg: bgMap, label: labelMap, activeBg: activeBgMap, activeLabel: activeLabelMap, activeBorder: activeBorderMap };
  }, [song]);

  // Apply gains to audio graph whenever mute/solo changes
  useEffect(() => {
    const ag = audioGraphRef.current;
    if (!ag) return;
    for (let ch = 0; ch < 4; ch++) {
      ag.setChannelGain(ch, getEffectiveGain(ch));
    }
  }, [getEffectiveGain]);

  const clearAdsrProgress = useCallback(() => {
    for (const sv of adsrProgressValues) sv.value = null;
  }, [adsrProgressValues]);

  const stopPlayback = useCallback(() => {
    audioGraphRef.current?.stop();
    setIsPlaying(false);
    setPlaybackRow(null);
    prevRowRef.current = null;
    prevPatIdxRef.current = null;
    clearAdsrProgress();
    cancelAnimationFrame(rafRef.current);
  }, [clearAdsrProgress]);

  // Playback position tracking via RAF using AudioGraph's audio clock
  // Track previous values to avoid unnecessary React re-renders
  const prevRowRef = useRef<number | null>(null);
  const prevPatIdxRef = useRef<number | null>(null);

  const updatePlaybackPosition = useCallback(() => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong || !audioGraphRef.current) return;
    const ag = audioGraphRef.current;
    const elapsed = ag.getPosition();
    const rowDuration = 60 / currentSong.config.bpm / 4;
    const patternDuration = 32 * rowDuration;

    const patIdx = Math.floor(elapsed / patternDuration) % currentSong.sequence.length;
    const row = Math.floor((elapsed % patternDuration) / rowDuration);

    // Only trigger React re-renders when values actually change
    if (row !== prevRowRef.current) {
      prevRowRef.current = row;
      setPlaybackRow(row);
    }
    if (patIdx !== prevPatIdxRef.current) {
      prevPatIdxRef.current = patIdx;
      setPlaybackPatternIdx(patIdx);
      const label = currentSong.patternOrder[currentSong.sequence[patIdx]];
      if (label) setActivePattern(label);
    }

    // Compute continuous ADSR progress per channel (writes to shared values, no re-render)
    const activePatLabel = currentSong.patternOrder[currentSong.sequence[patIdx]];
    const pat = activePatLabel ? currentSong.patterns[activePatLabel] : null;
    if (pat) {
      const elapsedInPattern = elapsed % patternDuration;
      for (let ci = 0; ci < 4; ci++) {
        const params = currentSong.instruments[ci];
        // Find most recent note at or before current position
        let noteRow = -1;
        for (let r = row; r >= 0; r--) {
          if (pat[ci][r + 2] > 0) {
            noteRow = r;
            break;
          }
        }
        if (noteRow >= 0) {
          // Use continuous time for smooth cursor, not discrete row
          const noteTime = noteRow * rowDuration;
          const timeSinceNote = elapsedInPattern - noteTime;
          const attack = params[3] ?? 0;
          const decay = params[18] ?? 0;
          const sustain = params[4] ?? 0;
          const release = params[5] ?? 0;
          const totalDuration = attack + decay + sustain + release;
          if (totalDuration > 0) {
            const p = timeSinceNote / totalDuration;
            adsrProgressValues[ci].value = p <= 1 ? Math.max(0, Math.min(1, p)) : null;
          } else {
            adsrProgressValues[ci].value = null;
          }
        } else {
          adsrProgressValues[ci].value = null;
        }
      }
    } else {
      for (let ci = 0; ci < 4; ci++) {
        adsrProgressValues[ci].value = null;
      }
    }

    rafRef.current = requestAnimationFrame(updatePlaybackPosition);
  }, [adsrProgressValues]);

  // Generation flash effect
  const flashChannel = useCallback((channels: number[]) => {
    setFlashChannels(new Set(channels));
    setTimeout(() => setFlashChannels(new Set()), 150);
  }, []);

  // Per-control regen handlers with minimal regeneration
  const handleVibeChange = useCallback((newVibe: VibeName) => {
    // Vibe changes instruments, structure, patterns, effects, BPM.
    // Keeps name, key, scale, length. Stays in current project.
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    const updated = regenerateForVibe(currentSong, newVibe);
    setVibe(newVibe);
    setBpm(updated.config.bpm);
    setSong(updated);
    setActivePattern(updated.patternOrder[0]);
    flashChannel([0, 1, 2, 3]);
    if (audioGraphRef.current?.isPlaying) stopPlayback();
  }, [flashChannel, stopPlayback]);

  const handleKeyChange = useCallback((newKey: NoteName) => {
    // Key only affects note content — keep instruments and structure
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    setKey(newKey);
    const updated = regenerateAllPatterns(currentSong, { key: newKey });
    setSong(updated);
    flashChannel([0, 1, 2, 3]);
    if (audioGraphRef.current?.isPlaying) stopPlayback();
  }, [flashChannel, stopPlayback]);

  const handleScaleChange = useCallback((newScale: ScaleName) => {
    // Scale only affects note content — keep instruments and structure
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    setScale(newScale);
    const updated = regenerateAllPatterns(currentSong, { scale: newScale });
    setSong(updated);
    flashChannel([0, 1, 2, 3]);
    if (audioGraphRef.current?.isPlaying) stopPlayback();
  }, [flashChannel, stopPlayback]);

  const handleLengthChange = useCallback((newLength: SongLength) => {
    // Length changes structure template + patterns, but keeps instruments
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    setSongLength(newLength);
    const updated = regenerateWithNewLength(currentSong, newLength);
    setSong(updated);
    setActivePattern(updated.patternOrder[0]);
    flashChannel([0, 1, 2, 3]);
    if (audioGraphRef.current?.isPlaying) stopPlayback();
  }, [flashChannel, stopPlayback]);

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

      const seq = ++renderSeqRef.current;
      renderEngineRef.current.renderSongBuffers(newSong).then(buffers => {
        if (renderSeqRef.current !== seq) return; // Newer BPM change supersedes
        if (buffers.length === 0 || buffers[0][0].length === 0) return;

        channelBuffersRef.current = buffers;
        const songDuration = buffers[0][0].length / 44100;
        audioGraphRef.current?.replaceAllChannels(buffers, songDuration, bpm);
      });
    }, 80);

    return () => {
      if (bpmTimerRef.current) clearTimeout(bpmTimerRef.current);
    };
  }, [bpm]);

  // Re-roll everything: random vibe, key, scale, length, bpm
  const handleReroll = useCallback(() => {
    unlockAudio();
    const newVibe = pick(VIBE_OPTIONS);
    const vibeConf = VIBE_CONFIG[newVibe];
    const newKey = pick(KEY_OPTIONS);
    const newScale = pick(vibeConf.preferredScales);
    const newBpm = vibeConf.bpmRange[0] + Math.floor(Math.random() * (vibeConf.bpmRange[1] - vibeConf.bpmRange[0] + 1));
    const newLength = pick(LENGTH_OPTIONS);
    generate(newVibe, newKey, newScale, newBpm, newLength);
    flashChannel([0, 1, 2, 3]);
    if (audioGraphRef.current?.isPlaying) stopPlayback();
  }, [flashChannel, stopPlayback]);

  const handlePlay = useCallback(async () => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    unlockAudio();

    const ag = getAudioGraph();

    if (ag.isPlaying) {
      ag.stop();
      cancelAnimationFrame(rafRef.current);
    }

    // Use pre-rendered buffers if available, otherwise render now
    let buffers = channelBuffersRef.current;
    if (buffers.length === 0 || buffers[0][0].length === 0) {
      buffers = await renderEngineRef.current.renderSongBuffers(currentSong);
      channelBuffersRef.current = buffers;
    }
    if (buffers.length === 0 || buffers[0][0].length === 0) return;

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
    stopPlayback();
  }, [stopPlayback]);

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

    if (audioGraphRef.current?.isPlaying) {
      setRenderingChannels(prev => new Set(prev).add(channelIndex));
      renderEngineRef.current.renderSongBuffers(newSong).then(buffers => {
        setSong(newSong);
        flashChannel([channelIndex]);
        setRenderingChannels(prev => { const next = new Set(prev); next.delete(channelIndex); return next; });
        channelBuffersRef.current[channelIndex] = buffers[channelIndex];
        audioGraphRef.current?.replaceChannel(channelIndex, buffers[channelIndex]);
      });
    } else {
      setSong(newSong);
      flashChannel([channelIndex]);
    }
  }, [flashChannel]);

  const handleRegenSingleInstrument = useCallback((channelIndex: number) => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    const newInstruments = [...currentSong.instruments];
    const newAll = generateInstruments(currentSong.config.vibe);
    newInstruments[channelIndex] = newAll[channelIndex];
    const newSong = { ...currentSong, instruments: newInstruments };
    const newVol = newInstruments[channelIndex][0] ?? 1;

    if (audioGraphRef.current?.isPlaying) {
      setRenderingChannels(prev => new Set(prev).add(channelIndex));
      renderEngineRef.current.renderSongBuffers(newSong).then(buffers => {
        setSong(newSong);
        useSongStore.getState().setChannelVolumes(prev => {
          const next = [...prev];
          next[channelIndex] = newVol;
          return next;
        });
        setRenderingChannels(prev => { const next = new Set(prev); next.delete(channelIndex); return next; });
        channelBuffersRef.current[channelIndex] = buffers[channelIndex];
        audioGraphRef.current?.replaceChannel(channelIndex, buffers[channelIndex]);
      });
    } else {
      setSong(newSong);
      useSongStore.getState().setChannelVolumes(prev => {
        const next = [...prev];
        next[channelIndex] = newVol;
        return next;
      });
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
        renderEngineRef.current.renderSongBuffers(currentSong).then(buffers => {
          channelBuffersRef.current[channelIndex] = buffers[channelIndex];
          audioGraphRef.current?.replaceChannel(channelIndex, buffers[channelIndex]);
        });
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
      if (audioGraphRef.current?.isPlaying) stopPlayback();
    };
    input.click();
  }, [stopPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioGraphRef.current?.stop();
      if (volTimerRef.current) clearTimeout(volTimerRef.current);
      if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    };
  }, []);

  const currentPattern = song && song.patterns[activePattern];
  const currentEffects = song?.patternEffects?.[activePattern];

  // Grid scroll measurement refs
  const gridScrollHeight = useRef(0);
  const gridContentHeight = useRef(0);

  // Scroll grid after React renders the new cursor position, before browser paints
  useLayoutEffect(() => {
    if (playbackRow == null || !isPlaying || !gridScrollRef.current || gridRowHeight.current <= 0) return;
    const rowH = gridRowHeight.current;
    const headerH = gridHeaderHeight.current;
    const READ_AHEAD = 4;
    const desiredY = headerH + (playbackRow + READ_AHEAD + 1) * rowH - gridScrollHeight.current;
    const y = Math.max(0, desiredY);
    gridScrollRef.current.scrollTo({ y, animated: false });
  }, [playbackRow, isPlaying]);

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

  if (!hydrated) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Brand label — top left, outside header */}
      <View style={styles.brandBar}>
        <BrandTitle />
      </View>

      {/* Header / Controls */}
      <View style={styles.header}>
        <View style={styles.titleLeft}>
          {song && <RetroAvatar name={displayName} size={16} color={colors.accentPrimary} />}
          <TextInput
            style={[styles.title, { outlineStyle: 'none' } as any]}
            value={displayName}
            onChangeText={handleNameChange}
            onBlur={handleNameBlur}
            selectTextOnFocus
            maxLength={40}
            accessibilityLabel="Song name"
            accessibilityHint="Tap to edit the song name"
          />
        </View>
        <View style={styles.controls}>
          <View style={styles.transportWrapper}>
            <View style={styles.transportSpacer} />
            <View style={styles.transport}>
              <AnimatedPressable onPress={handleReroll} style={[styles.transportBtn, styles.transportBtnRegen]} accessibilityRole="button" accessibilityLabel="Generate new random song">
                <Text style={[styles.transportIcon, styles.transportIconRegen, { color: colors.accentGenerate }]}>⟳</Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={handlePlay} disabled={!song} style={[styles.transportBtn, isPlaying && styles.transportBtnActive, !song && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Restart playback' : 'Play song'}>
                <Text style={[styles.transportIcon, isPlaying && styles.transportIconActive]}>▶</Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={handleStop} disabled={!isPlaying} style={[styles.transportBtn, !isPlaying && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Stop playback">
                <Text style={[styles.transportIcon, { color: colors.accentStop }]}>■</Text>
              </AnimatedPressable>
            </View>
          </View>
          <Dropdown label="VIBE" value={vibe} options={VIBE_OPTIONS} onSelect={(v) => handleVibeChange(v as VibeName)} />
          <Dropdown label="KEY" value={key} options={KEY_OPTIONS} onSelect={(v) => handleKeyChange(v as NoteName)} />
          <Dropdown label="SCALE" value={scale} options={SCALE_OPTIONS} onSelect={(v) => handleScaleChange(v as ScaleName)} />
          <Dropdown label="LENGTH" value={songLength} options={LENGTH_OPTIONS} onSelect={(v) => handleLengthChange(v as SongLength)} />
          <Slider label="BPM" value={bpm} min={80} max={180} step={1} onValueChange={setBpm} />
        </View>
      </View>

      {/* Pattern Sequence Strip */}
      {song && (
        <View style={styles.sequenceStrip}>
          <View style={styles.sequenceHeader}>
            <Text style={styles.sectionLabel}>SEQUENCE</Text>
            <View style={styles.sequenceActions}>
              <AnimatedPressable
                onPress={() => setShowLoad(true)}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel="Load saved project"
              >
                <Text style={styles.actionBtnText}>LOAD</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={handleImport}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel="Import song from file"
              >
                <Text style={styles.actionBtnText}>IMPORT</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => {
                  if (song && renderEngineRef.current) {
                    exportPromiseRef.current = renderEngineRef.current.renderSongBuffers(song);
                  }
                  setShowExport(true);
                }}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel="Export song"
              >
                <Text style={styles.actionBtnText}>EXPORT</Text>
              </AnimatedPressable>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.sequenceRow}>
              {song.sequence.map((patIdx, i) => {
                const label = song.patternOrder[patIdx];
                const isPlayingThis = isPlaying && i === playbackPatternIdx;
                return (
                  <AnimatedPressable
                    key={`${i}-${label}`}
                    onLongPress={() => handleRegenPattern(label)}
                    animateScale={false}
                  >
                    <PatternBlock
                      label={label}
                      active={activePattern === label}
                      playing={isPlayingThis}
                      onPress={() => setActivePattern(label)}
                      patternColor={patternColorMap.bg[label]}
                      labelColor={patternColorMap.label[label]}
                      activeColor={patternColorMap.activeBg[label]}
                      activeLabelColor={patternColorMap.activeLabel[label]}
                      activeBorderColor={patternColorMap.activeBorder[label]}
                    />
                  </AnimatedPressable>
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
            patternColors={patternColorMap.bg}
            labelColors={patternColorMap.label}
            activeBorderColors={patternColorMap.activeBorder}
            activeLabelColors={patternColorMap.activeLabel}
          />
          {song.instruments.map((params, ci) => {
            return (
              <InstrumentCard
                key={ci}
                channelIndex={ci as ChannelIndex}
                params={params}
                volume={channelVolumes[ci] ?? params[0] ?? 1}
                onVolumeChange={(v) => handleVolumeChange(ci, v)}
                onPreview={() => handlePreviewInstrument(ci)}
                onRegenerate={() => handleRegenSingleInstrument(ci)}
                isRendering={renderingChannels.has(ci)}
                adsrProgress={adsrProgressValues[ci]}
              />
            );
          })}
        </View>
      )}

      {/* Pattern Data Grid */}
      {currentPattern ? (
        <ScrollView
          ref={gridScrollRef}
          style={styles.gridContainer}
          stickyHeaderIndices={[0]}
          onLayout={(e) => { gridScrollHeight.current = e.nativeEvent.layout.height; }}
          onContentSizeChange={(_w, h) => { gridContentHeight.current = h; }}
        >
          {/* Channel Headers with Regen */}
          <View style={styles.gridHeader} onLayout={(e) => { gridHeaderHeight.current = e.nativeEvent.layout.height; }}>
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
                      <AnimatedPressable
                        onPress={() => toggleMute(ci)}
                        style={[
                          styles.toggleBtn,
                          isExplicitMuted && styles.toggleBtnMuted,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${isExplicitMuted ? 'Unmute' : 'Mute'} ${name} channel`}
                        accessibilityState={{ selected: isExplicitMuted }}
                      >
                        <Text style={[
                          styles.toggleText,
                          isExplicitMuted && styles.toggleTextActive,
                        ]}>M</Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        onPress={() => toggleSolo(ci)}
                        style={[
                          styles.toggleBtn,
                          isSoloed && styles.toggleBtnSoloed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${isSoloed ? 'Unsolo' : 'Solo'} ${name} channel`}
                        accessibilityState={{ selected: isSoloed }}
                      >
                        <Text style={[
                          styles.toggleText,
                          isSoloed && styles.toggleTextSoloed,
                        ]}>S</Text>
                      </AnimatedPressable>
                      <PulsingView active={renderingChannels.has(ci)}>
                        <AnimatedPressable
                          onPress={() => handleRegenChannel(ci)}
                          disabled={renderingChannels.has(ci)}
                          style={[
                            styles.regenBtn,
                            flashChannels.has(ci) && styles.regenFlash,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Regenerate ${name} channel`}
                        >
                          <Text style={styles.regenText}>R</Text>
                        </AnimatedPressable>
                      </PulsingView>
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
                onLayout={row === 0 ? (e) => { gridRowHeight.current = e.nativeEvent.layout.height; } : undefined}
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

      {/* Load Modal */}
      <LoadModal
        visible={showLoad}
        onClose={() => setShowLoad(false)}
        onProjectLoaded={() => {
          if (audioGraphRef.current?.isPlaying) stopPlayback();
        }}
      />

      {/* Export Modal */}
      {song && (
        <ExportModal
          visible={showExport}
          song={song}
          onClose={() => { setShowExport(false); exportPromiseRef.current = null; }}
          renderPromise={exportPromiseRef.current}
        />
      )}

      <UpdateBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    userSelect: 'none',
  },
  brandBar: {
    paddingTop: 6,
    paddingRight: spacing.xl,
    paddingBottom: spacing.xs,
    alignItems: 'flex-end',
  },
  header: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.lg,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '700',
    color: colors.accentPrimary,
    letterSpacing: 2,
    flex: 1,
    padding: 0,
    margin: 0,
    borderWidth: 0,
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
    fontSize: 22,
    marginTop: -2,
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
    backgroundColor: colors.bgPrimary,
    zIndex: 1,
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
    paddingHorizontal: 3,
  },
  noteTextCursor: {
    fontWeight: '700',
  },
  channelFlash: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
  },
});
