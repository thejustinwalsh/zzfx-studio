import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, fonts, fontSize, spacing } from '../theme';
import { ZZFX } from 'zzfx';
import { zzfxP, unlockAudio, floatsToWav } from '../engine/zzfx';
import { songToCode, songToClipboard } from '../engine/serialize';
import { saveTextFile, saveBinaryFile } from '../platform';
import type { Song } from '../engine/types';

type StereoBuffer = [Float32Array, Float32Array];

interface ExportModalProps {
  visible: boolean;
  song: Song;
  onClose: () => void;
  renderPromise: Promise<StereoBuffer[]> | null;
}

// Lazy-loaded highlighter — resolved once, cached forever.
// Call prefetchHighlighter() to schedule loading during idle time.
let _Highlighter: React.ComponentType<any> | null = null;
let _highlighterStyle: Record<string, any> | null = null;
let _loadPromise: Promise<void> | null = null;

export function prefetchHighlighter(): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => loadHighlighter());
  } else {
    setTimeout(() => loadHighlighter(), 2000);
  }
}

function loadHighlighter(): Promise<void> {
  if (_Highlighter) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _loadPromise = Promise.all([
    import('@snapp-notes/react-native-syntax-highlighter'),
    import('react-syntax-highlighter/dist/esm/styles/prism/okaidia'),
  ]).then(([hlModule, styleModule]) => {
    _Highlighter = hlModule.default || hlModule;
    _highlighterStyle = styleModule.default || styleModule;
  }).catch(() => {
    _loadPromise = null;
  });
  return _loadPromise;
}

const BAR_COUNT = 200;

// Generate a fake waveform for the loading state — vaguely musical shape
function generateFakeWaveform(): number[] {
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const pos = i / BAR_COUNT;
    const envelope = Math.sin(pos * Math.PI) * 0.5 + 0.15;
    const noise = Math.random() * 0.35;
    bars.push(Math.min(1, envelope + noise));
  }
  return bars;
}

// Mix per-channel stereo buffers into a single stereo pair
function mixChannels(buffers: StereoBuffer[]): [Float32Array, Float32Array] {
  if (buffers.length === 0) return [new Float32Array(0), new Float32Array(0)];
  const len = buffers[0][0].length;
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  for (let ch = 0; ch < buffers.length; ch++) {
    const [cl, cr] = buffers[ch];
    for (let i = 0; i < len; i++) {
      left[i] += cl[i];
      right[i] += cr[i];
    }
  }
  return [left, right];
}

// Downsample stereo audio to a fixed number of bars (peak amplitude per bar)
function computeWaveform(left: Float32Array, right: Float32Array, barCount: number): number[] {
  const len = left.length;
  if (len === 0) return new Array(barCount).fill(0);
  const samplesPerBar = Math.floor(len / barCount);
  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    let peak = 0;
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, len);
    for (let j = start; j < end; j++) {
      const v = Math.abs(left[j]) + Math.abs(right[j]);
      if (v > peak) peak = v;
    }
    bars.push(peak);
  }
  const max = Math.max(...bars, 0.001);
  return bars.map(v => v / max);
}

export function ExportModal({ visible, song, onClose, renderPromise }: ExportModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [highlighterReady, setHighlighterReady] = useState(!!_Highlighter);
  const [rendered, setRendered] = useState<{ left: Float32Array; right: Float32Array } | null>(null);
  const [displayWaveform, setDisplayWaveform] = useState<number[]>([]);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const durationRef = useRef(0);
  const rafRef = useRef(0);
  const lerpRafRef = useRef(0);
  const fakeWaveformRef = useRef<number[]>([]);

  // Ensure highlighter is ready when modal opens
  useEffect(() => {
    if (!visible) return;
    if (_Highlighter) {
      setHighlighterReady(true);
      return;
    }
    loadHighlighter().then(() => {
      if (_Highlighter) setHighlighterReady(true);
    });
  }, [visible]);

  // Generate fake waveform when modal opens
  useEffect(() => {
    if (visible && fakeWaveformRef.current.length === 0) {
      fakeWaveformRef.current = generateFakeWaveform();
      setDisplayWaveform(fakeWaveformRef.current);
    }
    if (!visible) {
      fakeWaveformRef.current = [];
      setDisplayWaveform([]);
    }
  }, [visible]);

  // Await the render promise when modal opens
  useEffect(() => {
    if (!visible || !renderPromise) {
      setRendered(null);
      return;
    }
    let cancelled = false;
    renderPromise.then(buffers => {
      if (cancelled) return;
      const [left, right] = mixChannels(buffers);
      setRendered({ left, right });
    });
    return () => { cancelled = true; };
  }, [visible, renderPromise]);

  const isRendering = visible && !rendered;

  const realWaveform = useMemo(() => {
    if (!rendered) return null;
    return computeWaveform(rendered.left, rendered.right, BAR_COUNT);
  }, [rendered]);

  // Lerp from fake waveform to real waveform when render completes
  useEffect(() => {
    if (!realWaveform) return;
    const from = displayWaveform.length === BAR_COUNT ? displayWaveform : fakeWaveformRef.current;
    if (from.length !== BAR_COUNT) {
      setDisplayWaveform(realWaveform);
      return;
    }
    const duration = 400;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const lerped = new Array(BAR_COUNT);
      for (let i = 0; i < BAR_COUNT; i++) {
        lerped[i] = from[i] + (realWaveform[i] - from[i]) * eased;
      }
      setDisplayWaveform(lerped);
      if (t < 1) {
        lerpRafRef.current = requestAnimationFrame(tick);
      }
    };
    lerpRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(lerpRafRef.current);
  }, [realWaveform]);

  const code = useMemo(() => {
    if (!visible) return '';
    return songToCode(song);
  }, [visible, song]);

  const duration = useMemo(() => {
    if (!rendered) return 0;
    return rendered.left.length / ZZFX.sampleRate;
  }, [rendered]);

  useEffect(() => {
    if (!visible) {
      stopPlayback();
      cancelAnimationFrame(lerpRafRef.current);
    }
    return () => { stopPlayback(); cancelAnimationFrame(lerpRafRef.current); };
  }, [visible]);

  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    setPlaybackProgress(0);
  }, []);

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (!rendered) return;

    unlockAudio();
    const source = zzfxP([rendered.left as any, rendered.right as any]);
    if (!source) return;

    sourceRef.current = source;
    durationRef.current = rendered.left.length / ZZFX.sampleRate;
    setIsPlaying(true);

    const ctx = source.context as AudioContext;
    startTimeRef.current = ctx.currentTime;

    const tick = () => {
      if (!sourceRef.current) return;
      const elapsed = ctx.currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / durationRef.current, 1);
      setPlaybackProgress(progress);
      if (progress >= 1) {
        stopPlayback();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    source.onended = () => {
      stopPlayback();
    };
  }, [isPlaying, rendered, stopPlayback]);

  const handleCopy = useCallback(async () => {
    const clipCode = songToClipboard(song);
    try {
      await navigator.clipboard.writeText(clipCode);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = clipCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }, [song]);

  const handleCopyFull = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }, [code]);

  const handleDownload = useCallback(() => {
    const filename = `${(song.config.name || 'zzfx-song').toLowerCase().replace(/\s+/g, '-')}.js`;
    saveTextFile(code, filename, [{ name: 'JavaScript', extensions: ['js'] }]);
  }, [code, song]);

  const handleDownloadWav = useCallback(() => {
    if (!rendered) return;
    const blob = floatsToWav(rendered.left as any, rendered.right as any);
    const filename = `${(song.config.name || 'zzfx-song').toLowerCase().replace(/\s+/g, '-')}.wav`;
    saveBinaryFile(blob, filename, [{ name: 'WAV Audio', extensions: ['wav'] }]);
  }, [rendered, song]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Pulsing opacity for loading state waveform
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    if (isRendering) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.25, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.6, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false,
      );
    } else {
      cancelAnimation(pulseOpacity);
      pulseOpacity.value = withTiming(1, { duration: 300 });
    }
  }, [isRendering, pulseOpacity]);

  const waveformAnimStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const BAR_HEIGHT = 48;
  const playheadIndex = Math.floor(playbackProgress * (displayWaveform.length - 1));

  if (!visible) return null;

  const SyntaxHighlighter = highlighterReady ? _Highlighter : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>EXPORT</Text>
            <View style={styles.headerMeta}>
              <Text style={styles.meta}>
                {song.config.vibe.toUpperCase()} / {song.config.key} {song.config.scale} / {song.config.bpm} BPM
              </Text>
              <Text style={styles.meta}>
                {duration > 0 ? formatTime(duration) : '--:--'} / {song.patternOrder.length} patterns
              </Text>
            </View>
            <AnimatedPressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close export modal">
              <Text style={styles.closeBtnText}>X</Text>
            </AnimatedPressable>
          </View>

          {/* Waveform */}
          <View style={styles.waveformSection}>
            <View style={styles.waveformContainer}>
              <Animated.View style={[styles.waveformBars, { height: BAR_HEIGHT }, waveformAnimStyle]}>
                {displayWaveform.map((v, i) => {
                  const barH = Math.max(1, v * BAR_HEIGHT);
                  const isPast = !isRendering && i <= playheadIndex && isPlaying;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        {
                          height: barH,
                          backgroundColor: isPast ? colors.accentPrimary : isRendering ? colors.borderSubtle : colors.textDim,
                        },
                      ]}
                    />
                  );
                })}
              </Animated.View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>
                  {isPlaying ? formatTime(playbackProgress * duration) : '0:00'}
                </Text>
                <Text style={styles.timeText}>{duration > 0 ? formatTime(duration) : '--:--'}</Text>
              </View>
            </View>
          </View>

          {/* Transport */}
          <View style={styles.transport}>
            <AnimatedPressable
              onPress={handlePlay}
              disabled={isRendering}
              style={[styles.playBtn, isPlaying && styles.playBtnActive, isRendering && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Stop preview' : 'Play ZzFXM preview'}
            >
              <Text style={[styles.playBtnText, isPlaying && styles.playBtnTextActive, isRendering && styles.btnDisabledText]}>
                {isPlaying ? 'STOP' : 'PLAY ZZFXM'}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable onPress={handleCopy} style={styles.actionBtn} accessibilityRole="button" accessibilityLabel="Copy one-liner code to clipboard">
              <Text style={styles.actionBtnText}>COPY ONELINER</Text>
            </AnimatedPressable>
            <AnimatedPressable onPress={handleCopyFull} style={styles.actionBtn} accessibilityRole="button" accessibilityLabel="Copy full code to clipboard">
              <Text style={styles.actionBtnText}>COPY CODE</Text>
            </AnimatedPressable>
            <AnimatedPressable onPress={handleDownload} style={styles.actionBtn} accessibilityRole="button" accessibilityLabel="Download as JavaScript file">
              <Text style={styles.actionBtnText}>DOWNLOAD .JS</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={handleDownloadWav}
              disabled={isRendering}
              style={[styles.actionBtn, isRendering && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Download as WAV audio file"
            >
              <Text style={[styles.actionBtnText, isRendering && styles.btnDisabledText]}>DOWNLOAD .WAV</Text>
            </AnimatedPressable>
          </View>

          {/* Code */}
          <ScrollView style={styles.codeScroll} contentContainerStyle={styles.codeContent}>
            {SyntaxHighlighter ? (
              <SyntaxHighlighter
                language="javascript"
                highlighter="prism"
                style={_highlighterStyle}
                fontSize={11}
                fontFamily={fonts.mono}
                customStyle={{
                  backgroundColor: 'transparent',
                  padding: 0,
                  margin: 0,
                }}
              >
                {code}
              </SyntaxHighlighter>
            ) : (
              <Text style={styles.codeText} selectable>{code}</Text>
            )}
          </ScrollView>
        </View>
      </View>
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
    maxWidth: 900,
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
  headerMeta: {
    flex: 1,
    gap: 2,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  closeBtnText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  waveformSection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  waveformContainer: {
    gap: spacing.xs,
  },
  waveformBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
  },
  waveformBar: {
    flex: 1,
    minWidth: 1,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textDim,
  },
  transport: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    flexWrap: 'wrap',
  },
  playBtn: {
    minWidth: 120,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentPlay,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  playBtnActive: {
    borderColor: colors.accentStop,
    backgroundColor: colors.accentStop,
  },
  playBtnText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    fontWeight: '700',
    color: colors.accentPlay,
    letterSpacing: 0.5,
  },
  playBtnTextActive: {
    color: colors.bgPrimary,
  },
  btnDisabled: {
    borderColor: colors.borderSubtle,
  },
  btnDisabledText: {
    color: colors.textDim,
  },
  actionBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  actionBtnText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  codeScroll: {
    flex: 1,
    backgroundColor: colors.bgSurface,
    userSelect: 'text',
  },
  codeContent: {
    padding: spacing.xl,
  },
  codeText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
