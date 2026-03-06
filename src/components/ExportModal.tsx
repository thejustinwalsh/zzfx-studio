import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Modal } from 'react-native';
import { colors, fonts, fontSize, spacing } from '../theme';
import { zzfxM, zzfxP, unlockAudio, zzfxR } from '../engine/zzfx';
import { songToZzfxm } from '../engine/song';
import { songToCode, songToClipboard } from '../engine/serialize';
import type { Song } from '../engine/types';

interface ExportModalProps {
  visible: boolean;
  song: Song;
  onClose: () => void;
}

// Lazy-loaded highlighter — resolved once, cached forever
let _Highlighter: React.ComponentType<any> | null = null;
let _highlighterStyle: Record<string, any> | null = null;
let _loadPromise: Promise<void> | null = null;

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
    // Silently fall back to plain text
    _loadPromise = null;
  });
  return _loadPromise;
}

// Downsample stereo audio to a fixed number of bars (peak amplitude per bar)
function computeWaveform(left: number[], right: number[], barCount: number): number[] {
  const len = left.length;
  if (len === 0) return new Array(barCount).fill(0);
  const samplesPerBar = Math.floor(len / barCount);
  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    let peak = 0;
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, len);
    for (let j = start; j < end; j++) {
      const v = Math.abs(left[j] || 0) + Math.abs(right[j] || 0);
      if (v > peak) peak = v;
    }
    bars.push(peak);
  }
  const max = Math.max(...bars, 0.001);
  return bars.map(v => v / max);
}

export function ExportModal({ visible, song, onClose }: ExportModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [highlighterReady, setHighlighterReady] = useState(!!_Highlighter);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const durationRef = useRef(0);
  const rafRef = useRef(0);

  // Kick off highlighter load when modal opens
  useEffect(() => {
    if (visible && !_Highlighter) {
      loadHighlighter().then(() => {
        if (_Highlighter) setHighlighterReady(true);
      });
    }
  }, [visible]);

  // Pre-render the zzfxM output once when modal opens
  const rendered = useMemo(() => {
    if (!visible) return null;
    const expanded = songToZzfxm(song);
    const [left, right] = zzfxM(
      expanded.instruments,
      expanded.patterns,
      expanded.sequence,
      expanded.bpm,
    );
    return { left, right, expanded };
  }, [visible, song]);

  const waveform = useMemo(() => {
    if (!rendered) return [];
    return computeWaveform(rendered.left, rendered.right, 200);
  }, [rendered]);

  const code = useMemo(() => {
    if (!visible) return '';
    return songToCode(song);
  }, [visible, song]);

  const duration = useMemo(() => {
    if (!rendered) return 0;
    return rendered.left.length / zzfxR;
  }, [rendered]);

  useEffect(() => {
    if (!visible) {
      stopPlayback();
    }
    return () => stopPlayback();
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
    const source = zzfxP([rendered.left, rendered.right]);
    if (!source) return;

    sourceRef.current = source;
    durationRef.current = rendered.left.length / zzfxR;
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
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zzfx-${song.config.vibe}-${song.config.key}-${song.config.scale}.js`;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, song]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const BAR_HEIGHT = 48;
  const playheadIndex = Math.floor(playbackProgress * (waveform.length - 1));

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
                {formatTime(duration)} / {song.patternOrder.length} patterns
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>X</Text>
            </Pressable>
          </View>

          {/* Waveform */}
          <View style={styles.waveformSection}>
            <View style={styles.waveformContainer}>
              <View style={[styles.waveformBars, { height: BAR_HEIGHT }]}>
                {waveform.map((v, i) => {
                  const barH = Math.max(1, v * BAR_HEIGHT);
                  const isPast = i <= playheadIndex && isPlaying;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        {
                          height: barH,
                          backgroundColor: isPast ? colors.accentPrimary : colors.textDim,
                        },
                      ]}
                    />
                  );
                })}
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>
                  {isPlaying ? formatTime(playbackProgress * duration) : '0:00'}
                </Text>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>
            </View>
          </View>

          {/* Transport */}
          <View style={styles.transport}>
            <Pressable
              onPress={handlePlay}
              style={[styles.playBtn, isPlaying && styles.playBtnActive]}
            >
              <Text style={[styles.playBtnText, isPlaying && styles.playBtnTextActive]}>
                {isPlaying ? 'STOP' : 'PLAY ZZFXM'}
              </Text>
            </Pressable>
            <Pressable onPress={handleCopy} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>COPY ONELINER</Text>
            </Pressable>
            <Pressable onPress={handleCopyFull} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>COPY CODE</Text>
            </Pressable>
            <Pressable onPress={handleDownload} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>DOWNLOAD .JS</Text>
            </Pressable>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentPlay,
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
