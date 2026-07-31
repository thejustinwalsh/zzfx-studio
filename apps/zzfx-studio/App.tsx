import { useRef, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo } from 'react';
import { ZZFX } from 'zzfx';
import { useSharedValue } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { Dimensions, Platform, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import { AnimatedPressable } from './src/components/AnimatedPressable';
import { colors, fonts, fontSize, spacing } from './src/theme';
import {
  Dropdown,
  Slider,
  PatternBlock,
  Oscilloscope,
  InstrumentCard,
  SequenceMatrix,
  PatternGrid,
  ExportModal,
  LoadModal,
  HelpModal,
  BrandTitle,
  RetroAvatar,
  UpdateBanner,
  computeBarColors,
  prefetchHighlighter,
} from './src/components';
import type { ChannelNote, RGB } from './src/components';
import type { NoteEffect } from './src/engine';
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
  unlockAudio,
  AudioGraph,
  CHROMATIC,
  SCALES,
  VIBE_CONFIG,
  codeToSong,
  baseOctaveFromFreq,
} from './src/engine';
import { shareCodeFromUrl, SHARE_PARAM, shouldShowMiniPlayer, loadShareCodec, prefetchShareCodec } from './src/engine/share';
import { EmbedPlayer } from './src/screens/EmbedPlayer';
import { openTextFile } from './src/platform';
import type { Song, SongLength, VibeName, NoteName, ScaleName, PatternLabel } from './src/engine';
import type { ChannelIndex } from './src/theme/colors';
import { buildOscColorTable } from './src/utils/oscColors';
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

/**
 * Which of the two apps this bundle is right now.
 *
 * Driven by height rather than by the URL: below the point where the studio can
 * show any pattern data it stops being a studio, so a short frame gets the mini
 * player. That makes a share link and an embed link the same link. `?embed=1`
 * still forces it, for embedding a deliberately large player.
 */
function useMiniPlayer(): boolean {
  const [height, setHeight] = useState(() =>
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.innerHeight
      : Dimensions.get('window').height
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      const sub = Dimensions.addEventListener('change', ({ window: w }) => setHeight(w.height));
      return () => sub.remove();
    }
    // Resizing an iframe from the parent page changes innerHeight without
    // firing a resize event inside the frame, so a resize listener alone misses
    // it. A ResizeObserver on the document element catches both.
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  return shouldShowMiniPlayer(height);
}

/**
 * A link carrying someone else's song must not generate or persist a random one
 * into the visitor's storage. Any other visit is an ordinary session and should
 * initialise normally — including a session that happens to be short enough to
 * render as the mini player.
 */
const HAS_SHARED_SONG =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? shareCodeFromUrl(window.location.href) !== null
    : false;

export default function App() {
  const mini = useMiniPlayer();

  useEffect(() => {
    if (!HAS_SHARED_SONG) initializeStore();
  }, []);

  return mini ? <EmbedPlayer /> : <Studio />;
}

// Prefetch syntax highlighter for export modal during idle time
prefetchHighlighter();

function Studio() {
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
    generate, loadSong, renameSong, commitSong,
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
  const [showHelp, setShowHelp] = useState(false);

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

  const previewParams = useCallback((instrument: number[], channelIndex: number) => {
    unlockAudio();
    const params = [...instrument];
    if (channelIndex === 3) {
      params[2] *= 2 ** ((12 - 12) / 12);
    }
    const samples = ZZFX.buildSamples(...params);
    if (samples.length > 0) {
      zzfxP([samples]);
    }
  }, []);

  const handleRegenPattern = useCallback((label: PatternLabel) => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    const { pattern, effects } = regeneratePattern(currentSong, label);
    commitSong({
      ...currentSong,
      patterns: { ...currentSong.patterns, [label]: pattern },
      patternEffects: { ...currentSong.patternEffects, [label]: effects },
    }, `regenerate pattern ${label}`);
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
        commitSong(newSong, 'regenerate channel');
        flashChannel([channelIndex]);
        setRenderingChannels(prev => { const next = new Set(prev); next.delete(channelIndex); return next; });
        channelBuffersRef.current[channelIndex] = buffers[channelIndex];
        audioGraphRef.current?.replaceChannel(channelIndex, buffers[channelIndex]);
      });
    } else {
      commitSong(newSong, 'regenerate channel');
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
        commitSong(newSong, 'regenerate instrument');
        previewParams(newInstruments[channelIndex], channelIndex);
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
      commitSong(newSong, 'regenerate instrument');
      previewParams(newInstruments[channelIndex], channelIndex);
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

  // --- Pattern editing -----------------------------------------------------

  // A drag fires an edit every 12px, so collapse the burst into one render.
  const editTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const scheduleChannelRerender = useCallback((channelIndex: number) => {
    const timers = editTimersRef.current;
    const existing = timers.get(channelIndex);
    if (existing) clearTimeout(existing);

    timers.set(channelIndex, setTimeout(() => {
      timers.delete(channelIndex);
      const currentSong = useSongStore.getState().song;
      if (!currentSong) return;

      renderEngineRef.current.renderSongBuffers(currentSong).then(buffers => {
        if (buffers.length === 0 || buffers[0][0].length === 0) return;
        channelBuffersRef.current[channelIndex] = buffers[channelIndex];
        // Only hot-swap while playing; otherwise the buffers are just staged
        // for the next play.
        if (audioGraphRef.current?.isPlaying) {
          audioGraphRef.current.replaceChannel(channelIndex, buffers[channelIndex]);
        } else {
          channelBuffersRef.current = buffers;
        }
      });
    }, 120));
  }, []);

  useEffect(() => {
    const timers = editTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const handleSetNote = useCallback((channelIndex: number, row: number, note: number) => {
    useSongStore.getState().setNote(activePattern, channelIndex, row, note);
  }, [activePattern]);

  const handleSetEffect = useCallback((channelIndex: number, row: number, effect: NoteEffect | null) => {
    useSongStore.getState().setEffect(activePattern, channelIndex, row, effect);
  }, [activePattern]);

  // Sound a single note through its channel's instrument. Only called when
  // playback is stopped — during playback the swapped buffer delivers the edit.
  const handleAuditionNote = useCallback((channelIndex: number, note: number) => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong || note <= 0) return;
    unlockAudio();
    const params = [...currentSong.instruments[channelIndex]];
    params[2] *= 2 ** ((note - 12) / 12);
    const samples = ZZFX.buildSamples(...params);
    if (samples.length > 0) zzfxP([samples]);
  }, []);

  // A shared link carries the whole song in its query string. Load it once on
  // startup, then strip the parameter so a refresh does not keep reimporting
  // the same song as a new project.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const code = shareCodeFromUrl(window.location.href);
    if (!code) return;

    let cancelled = false;
    // The codec only loads because this URL carries a song.
    loadShareCodec().then(({ songFromShareCode }) => songFromShareCode(code)).then((shared) => {
      if (cancelled || !shared) return;
      useSongStore.getState().loadSong(shared);
    }).finally(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete(SHARE_PARAM);
      window.history.replaceState({}, '', url.toString());
    });
    return () => { cancelled = true; };
  }, []);

  // Undo replaces the whole song, so every channel's audio is stale.
  const rerenderAllChannels = useCallback(() => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    renderEngineRef.current.renderSongBuffers(currentSong).then(buffers => {
      if (buffers.length === 0 || buffers[0][0].length === 0) return;
      channelBuffersRef.current = buffers;
      if (audioGraphRef.current?.isPlaying) {
        const songDuration = buffers[0][0].length / 44100;
        audioGraphRef.current.replaceAllChannels(
          buffers,
          songDuration,
          useSongStore.getState().song?.config.bpm ?? 120
        );
      }
    });
  }, []);

  // Undo/redo is global rather than grid-scoped — it also covers the
  // regenerate buttons, which are reachable without ever focusing the grid.
  const handleHistoryKey = useEffectEvent((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.key.toLowerCase() !== 'z') return false;
    const { undo, redo } = useSongStore.getState();
    const moved = e.shiftKey ? redo() : undo();
    if (moved) rerenderAllChannels();
    return true;
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (handleHistoryKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handlePreviewInstrument = useCallback((channelIndex: number) => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    previewParams(currentSong.instruments[channelIndex], channelIndex);
  }, [previewParams]);

  // Export / Import
  const handleImport = useCallback(async () => {
    const text = await openTextFile([{ name: 'Song files', extensions: ['js', 'txt'] }]);
    if (!text) return;
    const imported = codeToSong(text);
    if (!imported) return;
    loadSong(imported);
    if (audioGraphRef.current?.isPlaying) stopPlayback();
  }, [stopPlayback]);

  // Listen for app events (e.g. Neutralino menu, keyboard shortcuts)
  const onImport = useEffectEvent(() => handleImport());
  useEffect(() => {
    window.addEventListener('zs-import', onImport);
    return () => window.removeEventListener('zs-import', onImport);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioGraphRef.current?.stop();
      if (volTimerRef.current) clearTimeout(volTimerRef.current);
      if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    };
  }, []);

  const baseOctaves = useMemo(
    () => (song?.instruments ?? []).map(p => baseOctaveFromFreq(p[2])),
    [song?.instruments]
  );

  const currentPattern = song && song.patterns[activePattern];
  const currentEffects = song?.patternEffects?.[activePattern];

  // Grid scroll measurement refs
  const gridScrollHeight = useRef(0);

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
    return buildOscColorTable(
      song,
      currentPattern,
      BAR_COUNT,
      audioGraphRef.current?.getAnalyser()
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
                  // Fetch the share codec while the export screen is being
                  // read, so the first press of share does not wait on it.
                  prefetchShareCodec();
                  setShowExport(true);
                }}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel="Export song"
              >
                <Text style={styles.actionBtnText}>EXPORT</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => setShowHelp(true)}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel="Keyboard shortcuts"
              >
                <Text style={styles.actionBtnText}>?</Text>
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
        <PatternGrid
          pattern={currentPattern}
          effects={currentEffects}
          patternLabel={activePattern}
          baseOctaves={baseOctaves}
          songKey={song!.config.key}
          scale={song!.config.scale}
          playbackRow={playbackRow}
          mutedChannels={effectiveMutes}
          explicitMutes={mutedChannels}
          soloChannel={soloChannel}
          renderingChannels={renderingChannels}
          flashChannels={flashChannels}
          onToggleMute={toggleMute}
          onToggleSolo={toggleSolo}
          onRegenChannel={handleRegenChannel}
          onSetNote={handleSetNote}
          onSetEffect={handleSetEffect}
          onEdit={scheduleChannelRerender}
          onAudition={handleAuditionNote}
          onBeginEdit={useSongStore.getState().beginEdit}
          onEndEdit={useSongStore.getState().endEdit}
          isPlaying={isPlaying}
          onScrollRef={(r) => { gridScrollRef.current = r; }}
          onLayoutMetrics={(m) => {
            gridRowHeight.current = m.rowHeight;
            gridHeaderHeight.current = m.headerHeight;
            gridScrollHeight.current = m.viewportHeight;
          }}
        />
      ) : null}

      <HelpModal visible={showHelp} onClose={() => setShowHelp(false)} />

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
});
