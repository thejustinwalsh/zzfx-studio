import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, PanResponder, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Oscilloscope } from '../components/Oscilloscope';
import { RetroAvatar } from '../components/RetroAvatar';
import { BrandTitle } from '../components/BrandTitle/BrandTitle';
import { colors, fonts, fontSize, spacing } from '../theme';
import { AudioGraph, createRenderEngine, unlockAudio } from '../engine';
import { shareCodeFromUrl, loadShareCodec } from '../engine/share';
import { useSongStore } from '../store';
import { buildOscColorTable } from '../utils/oscColors';
import type { Song } from '../engine';

const CHANNEL_COLORS = [colors.ch0Primary, colors.ch1Primary, colors.ch2Primary, colors.ch3Primary];

/**
 * Same treatment as the studio header: an 18px title with a 16px identicon,
 * separated by spacing.lg. Matching it here keeps one look rather than two
 * near-identical ones that drift apart.
 */
const TITLE_SIZE = 18;
const ICON_SIZE = 16;

/** Breathing room between the title, transport, spectrum and position rows. */
const ROW_GAP = 7;
const CHANNEL_NAMES = ['LEAD', 'HARM', 'BASS', 'DRUM'];

type Phase = 'loading' | 'ready' | 'empty' | 'session';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * The mini player behind `?s=…&embed=1`.
 *
 * Deliberately small: name, the song's own settings, a transport and a
 * spectrum. It never autoplays — a cross-origin iframe cannot start audio
 * without a gesture inside it, and a page that made noise on load would be
 * unwelcome anyway.
 */
export function EmbedPlayer() {
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('loading');
  const [sharedSong, setSharedSong] = useState<Song | null>(null);
  // Without a share code this is just the current session shown small, so it
  // plays whatever is loaded rather than claiming the link is empty.
  const sessionSong = useSongStore((s) => s.song);
  const song = sharedSong ?? sessionSong;
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.8);
  // State rather than a ref: the pre-render finishes after the first paint, and
  // a ref update would leave the total reading 0:00 until something unrelated
  // happened to re-render.
  const [duration, setDuration] = useState(0);
  // The spectrum fills whatever the fixed rows leave behind. Measuring the box
  // it actually gets beats computing it: arithmetic and flex disagreed, and the
  // difference showed up as slack above and below the bars.
  const [scopeBox, setScopeBox] = useState(0);

  const audioRef = useRef<AudioGraph | null>(null);
  const engineRef = useRef(createRenderEngine());
  const buffersRef = useRef<Awaited<ReturnType<typeof engineRef.current.renderSongBuffers>>>([]);
  const rafRef = useRef(0);

  useEffect(() => {
    const code = typeof window === 'undefined' ? null : shareCodeFromUrl(window.location.href);
    if (!code) { setPhase('session'); return; }

    let cancelled = false;
    loadShareCodec()
      .then(({ songFromShareCode }) => songFromShareCode(code))
      .then((loaded: Song | null) => {
        if (cancelled) return;
        if (!loaded) { setPhase('empty'); return; }
        setSharedSong(loaded);
        setPhase('ready');
      })
      .catch(() => setPhase('empty'));
    return () => { cancelled = true; };
  }, []);

  // Pre-render whichever song we ended up with, so the first press is instant.
  useEffect(() => {
    if (!song) return;
    let cancelled = false;
    buffersRef.current = [];
    engineRef.current.renderSongBuffers(song).then((buffers) => {
      if (cancelled) return;
      buffersRef.current = buffers;
      if (buffers[0]?.[0]) setDuration(buffers[0][0].length / 44100);
    });
    return () => { cancelled = true; };
  }, [song]);

  const stop = useCallback(() => {
    audioRef.current?.stop();
    setIsPlaying(false);
    setPosition(0);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const tick = useCallback(() => {
    const ag = audioRef.current;
    if (!ag?.isPlaying) return;
    setPosition(ag.getPosition());
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // The frame can be any size an embedder picks, so the layout is driven by the
  // room available rather than by fixed breakpoints alone.
  const tiny = height < 120;      // a single strip — transport and title only
  const short = height < 160;     // no room for the settings line
  const narrow = width < 420;     // legend would crowd the timecodes
  const wide = width >= 640;

  const playSize = tiny ? 30 : height < 220 ? 42 : 52;
  const titleSize = tiny ? 14 : TITLE_SIZE;
  const iconSize = tiny ? 13 : ICON_SIZE;
  const timeSize = tiny ? 16 : height < 220 ? 24 : 30;
  // Everything left after the title bar and position row goes to the band.
  const scopeHeight = Math.max(20, scopeBox);
  const barCount = wide ? 96 : narrow ? 28 : 56;

  // Where the playhead sits, so the spectrum can be tinted by the notes
  // actually sounding — the same treatment the studio uses.
  const playback = useMemo(() => {
    if (!song || !isPlaying) return null;
    const rowDuration = 60 / song.config.bpm / 4;
    const totalRows = Math.floor(position / rowDuration);
    const patternIdx = Math.floor(totalRows / 32) % song.sequence.length;
    const label = song.patternOrder[song.sequence[patternIdx]];
    return { label, row: totalRows % 32 };
  }, [song, isPlaying, position]);

  const colorTable = useMemo(() => {
    if (!song || !playback) return null;
    const pattern = song.patterns[playback.label];
    if (!pattern) return null;
    return buildOscColorTable(song, pattern, barCount, audioRef.current?.getAnalyser());
  }, [song, playback?.label, barCount]);

  const play = useCallback(async () => {
    if (!song) return;
    if (isPlaying) { stop(); return; }

    unlockAudio();
    if (!audioRef.current) {
      audioRef.current = new AudioGraph();
      audioRef.current.setMasterVolume(volume);
    }

    let buffers = buffersRef.current;
    if (!buffers.length) {
      buffers = await engineRef.current.renderSongBuffers(song);
      buffersRef.current = buffers;
    }
    if (!buffers[0]?.[0]?.length) return;

    const seconds = buffers[0][0].length / 44100;
    setDuration(seconds);
    audioRef.current.play(buffers, seconds, song.config.bpm);
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [song, isPlaying, stop, tick, volume]);

  const changeVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    setVolume(clamped);
    // Applies to this player's graph only — the studio has its own.
    audioRef.current?.setMasterVolume(clamped);
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.stop();
    engineRef.current.dispose();
  }, []);

  const openStudio = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('embed');
    // Break out of the iframe rather than loading the studio inside it.
    Linking.openURL(url.toString());
  }, []);

  if (phase === 'loading' || (phase === 'session' && !song)) {
    return (
      <View style={styles.container}>
        <Text style={styles.dim}>LOADING…</Text>
      </View>
    );
  }

  if (!song) {
    return (
      <View style={styles.container}>
        <Text style={styles.brand}>ZZFX STUDIO</Text>
        <Text style={styles.dim}>
          {phase === 'empty' ? 'This link has no song in it.' : 'No song loaded.'}
        </Text>
      </View>
    );
  }

  const c = song.config;
  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={styles.container}>
      {/* Title bar — the marquee line, badged with the song's own identicon. */}
      <View style={styles.titleBar}>
        <RetroAvatar name={c.name || 'UNTITLED'} size={iconSize} color={colors.textPrimary} />
        <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={1}>
          {(c.name || 'UNTITLED').toUpperCase()}
        </Text>
        <View style={styles.rule} />
        <AnimatedPressable
          onPress={openStudio}
          style={styles.brandLink}
          accessibilityRole="link"
          accessibilityLabel="Open this song in ZzFX Studio"
        >
          <BrandTitle />
          <Text style={styles.brandArrow}>↗</Text>
        </AnimatedPressable>
      </View>

      {/* Main band: transport, timecode, spectrum, readouts. */}
      <View style={styles.band}>
        <AnimatedPressable
          onPress={play}
          style={[
            styles.playBtn,
            { width: playSize, height: playSize },
            isPlaying && styles.playBtnActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Stop' : 'Play'}
        >
          <Text
            style={[
              styles.playGlyph,
              { fontSize: Math.round(playSize * 0.36) },
              isPlaying && styles.playGlyphActive,
            ]}
          >
            {isPlaying ? '■' : '▶'}
          </Text>
        </AnimatedPressable>

        <View style={styles.timeBlock}>
          <Text style={[styles.timeBig, { fontSize: timeSize }]}>{formatTime(position)}</Text>
          {!tiny && <Text style={styles.timeTotal}>{formatTime(duration)}</Text>}
        </View>

        {/* Equal spacers either side so the volume sits centred between the
            timecode and the readouts, rather than crowding the readouts. */}
        <View style={styles.bandSpacer} />
        {!tiny && (
          <VolumeSlider value={volume} onChange={changeVolume} width={narrow ? 48 : 72} />
        )}
        <View style={styles.bandSpacer} />

        {!narrow && !tiny && (
          <View style={styles.readouts}>
            <Readout label="VIBE" value={c.vibe} />
            <Readout label="KEY" value={`${c.key} ${c.scale}`} />
            <Readout label="BPM" value={String(c.bpm)} />
          </View>
        )}
      </View>

      {/* The spectrum gets the full width, on its own line. */}
      <View
        style={styles.scope}
        onLayout={(e) => setScopeBox(Math.round(e.nativeEvent.layout.height))}
      >
        <Oscilloscope
          analyser={audioRef.current?.getAnalyser() ?? null}
          isPlaying={isPlaying}
          height={scopeHeight}
          barCount={barCount}
          barColors={playback && colorTable ? colorTable[playback.row] : undefined}
        />
      </View>

      {/* Position, with the channel legend riding the same line. */}
      <View style={styles.positionRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%` }]} />
        </View>
        {!tiny && (
          <View style={styles.channels}>
            {CHANNEL_NAMES.map((name, i) => (
              <View key={name} style={styles.channelChip}>
                <View style={[styles.channelDot, { backgroundColor: CHANNEL_COLORS[i] }]} />
                {!narrow && <Text style={styles.channelLabel}>{name}</Text>}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * A compact volume control, dragged rather than stepped. Hard-edged to match
 * the rest of the interface — no thumb, just a filled track.
 */
function VolumeSlider({
  value,
  onChange,
  width,
}: {
  value: number;
  onChange: (v: number) => void;
  width: number;
}) {
  const trackWidth = useRef(width);

  const setFromX = useCallback((x: number) => {
    onChange(x / Math.max(1, trackWidth.current));
  }, [onChange]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
      }),
    [setFromX]
  );

  return (
    <View style={styles.volume}>
      <Text style={styles.volumeLabel}>VOL</Text>
      <View
        style={[styles.volumeTrack, { width }]}
        onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
        accessibilityRole="adjustable"
        accessibilityLabel={`Volume ${Math.round(value * 100)} percent`}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        {...responder.panHandlers}
      >
        <View style={[styles.volumeFill, { width: `${value * 100}%` }]} />
      </View>
    </View>
  );
}

/** A terse labelled readout, in the spirit of WinAmp's kbps/kHz blocks. */
function Readout({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readout}>
      <Text style={styles.readoutLabel}>{label}</Text>
      <Text style={styles.readoutValue} numberOfLines={1}>{value.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: ROW_GAP,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: 3,
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderTrack,
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bandSpacer: {
    flex: 1,
  },
  timeBlock: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minWidth: 62,
  },
  timeBig: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    color: colors.accentPrimary,
    letterSpacing: 1,
  },
  timeTotal: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textDim,
    letterSpacing: 1,
    marginTop: -2,
  },
  volume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  volumeLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.textDim,
    letterSpacing: 1,
  },
  volumeTrack: {
    height: 8,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
  },
  volumeFill: {
    height: '100%',
    backgroundColor: colors.textSecondary,
  },
  readouts: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  readout: {
    minWidth: 54,
  },
  readoutLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.textDim,
    letterSpacing: 1,
  },
  readoutValue: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleTiny: {
    fontSize: 13,
  },
  title: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textDim,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  brand: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.accentPrimary,
    letterSpacing: 1,
  },
  brandLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  brandArrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.accentPrimary,
  },
  playBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentPlay,
  },
  playBtnActive: {
    borderColor: colors.accentStop,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  playGlyph: {
    fontFamily: fonts.mono,
    color: colors.accentPlay,
  },
  playGlyphActive: {
    color: colors.accentStop,
  },
  scope: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 20,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: colors.bgElevated,
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.accentPrimary,
  },
  channels: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  channelDot: {
    width: 6,
    height: 6,
  },
  channelLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  dim: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textDim,
    textAlign: 'center',
  },
});
