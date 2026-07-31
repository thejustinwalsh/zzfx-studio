import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { PulsingView } from './PulsingView';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { spacing } from '../theme/layout';
import {
  EFFECT_CODES,
  MAX_OCTAVE,
  MIN_OCTAVE,
  cycleDrum,
  drumFromLetter,
  drumNoteToName,
  effectToDisplayString,
  isDrumLetter,
  isNoteLetter,
  letterToNote,
  nudgeDrum,
  octaveStep,
  scaleStep,
  zzfxmToNoteName,
} from '../engine';
import type {
  EffectCode,
  NoteEffect,
  NoteName,
  Pattern,
  PatternEffects,
  PatternLabel,
  ScaleName,
} from '../engine';

export const GRID_ROWS = 32;
const CHANNELS = 4;
const CHANNEL_NAMES = ['LEAD', 'HARM', 'BASS', 'DRUM'];
const CHANNEL_COLORS = [
  colors.ch0Primary,
  colors.ch1Primary,
  colors.ch2Primary,
  colors.ch3Primary,
];

/** Pixels of travel per edit step. */
const H_STEP_PX = 12;
const V_STEP_PX = 24;
/** Movement before the drag commits to an axis. */
const AXIS_LOCK_PX = 6;
const AUDITION_THROTTLE_MS = 60;

type CursorField = 'note' | 'effect';

interface Cursor {
  row: number;
  channel: number;
  field: CursorField;
}

interface PatternGridProps {
  pattern: Pattern;
  effects: PatternEffects | undefined;
  patternLabel: PatternLabel;
  songKey: NoteName;
  scale: ScaleName;
  playbackRow: number | null;
  mutedChannels: Set<number>;
  explicitMutes: number[];
  soloChannel: number | null;
  renderingChannels: Set<number>;
  flashChannels: Set<number>;
  onToggleMute: (ch: number) => void;
  onToggleSolo: (ch: number) => void;
  onRegenChannel: (ch: number) => void;
  onSetNote: (channel: number, row: number, note: number) => void;
  onSetEffect: (channel: number, row: number, effect: NoteEffect | null) => void;
  /** Fired after any edit so the host can re-render and hot-swap audio. */
  onEdit: (channel: number) => void;
  /** Fired only when playback is stopped — the host decides how to sound it. */
  onAudition: (channel: number, note: number) => void;
  isPlaying: boolean;
  onScrollRef?: (ref: ScrollView | null) => void;
  onLayoutMetrics?: (m: { rowHeight: number; headerHeight: number; viewportHeight: number; contentHeight: number }) => void;
}

/** Apply a stepping function `n` times in the given direction. */
function applySteps(
  note: number,
  steps: number,
  step: (n: number, dir: 1 | -1) => number
): number {
  const dir: 1 | -1 = steps >= 0 ? 1 : -1;
  let n = note;
  for (let i = 0; i < Math.abs(steps); i++) n = step(n, dir);
  return n;
}

// The browser's focus ring would sit alongside the tracker cursor and read as a
// second, competing selection. The cursor box is the only selection indicator.
const NO_FOCUS_RING = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

// A drag across cells would otherwise paint a text selection over the grid.
const NO_TEXT_SELECT = Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null;

function prefersPointer(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: fine)').matches;
}

export function PatternGrid({
  pattern,
  effects,
  patternLabel,
  songKey,
  scale,
  playbackRow,
  mutedChannels,
  explicitMutes,
  soloChannel,
  renderingChannels,
  flashChannels,
  onToggleMute,
  onToggleSolo,
  onRegenChannel,
  onSetNote,
  onSetEffect,
  onEdit,
  onAudition,
  isPlaying,
  onScrollRef,
  onLayoutMetrics,
}: PatternGridProps) {
  const [cursor, setCursor] = useState<Cursor>({ row: 0, channel: 0, field: 'note' });
  const [focused, setFocused] = useState(false);
  const [octave, setOctave] = useState(4);
  const [dragEnabled, setDragEnabled] = useState(prefersPointer);
  const [editingEffect, setEditingEffect] = useState(false);
  const [rejectFlash, setRejectFlash] = useState(false);

  const containerRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const geom = useRef({ width: 0, rowHeight: 0, headerHeight: 0, viewportHeight: 0, contentHeight: 0 });
  const lastAudition = useRef(0);

  // Pattern changed under us — park the cursor somewhere valid.
  useEffect(() => {
    setEditingEffect(false);
  }, [patternLabel]);

  const noteAt = useCallback(
    (channel: number, row: number): number => pattern[channel]?.[row + 2] ?? 0,
    [pattern]
  );

  const effectAt = useCallback(
    (channel: number, row: number): NoteEffect | null => effects?.[channel]?.[row] ?? null,
    [effects]
  );

  const audition = useCallback(
    (channel: number, note: number) => {
      // During playback the hot-swapped buffer delivers the edit at the row.
      if (isPlaying || note <= 0) return;
      const now = Date.now();
      if (now - lastAudition.current < AUDITION_THROTTLE_MS) return;
      lastAudition.current = now;
      onAudition(channel, note);
    },
    [isPlaying, onAudition]
  );

  const writeNote = useCallback(
    (channel: number, row: number, note: number) => {
      if (noteAt(channel, row) === note) return;
      onSetNote(channel, row, note);
      onEdit(channel);
      audition(channel, note);
    },
    [noteAt, onSetNote, onEdit, audition]
  );

  const flashReject = useCallback(() => {
    setRejectFlash(true);
    setTimeout(() => setRejectFlash(false), 150);
  }, []);

  // ---- Cursor scroll-follow -------------------------------------------------

  const revealRow = useCallback((row: number) => {
    const { rowHeight, viewportHeight, headerHeight } = geom.current;
    if (!rowHeight || !viewportHeight) return;
    const top = row * rowHeight;
    const bottom = top + rowHeight;
    const visibleTop = scrollOffset.current;
    const visibleBottom = visibleTop + viewportHeight - headerHeight;
    if (top < visibleTop) {
      scrollRef.current?.scrollTo({ y: top, animated: false });
    } else if (bottom > visibleBottom) {
      scrollRef.current?.scrollTo({ y: bottom - (viewportHeight - headerHeight), animated: false });
    }
  }, []);

  const scrollOffset = useRef(0);

  const moveCursor = useCallback(
    (next: Cursor) => {
      setCursor(next);
      revealRow(next.row);
    },
    [revealRow]
  );

  // ---- Keyboard -------------------------------------------------------------

  const handleEffectKey = useEffectEvent((e: KeyboardEvent): boolean => {
    const { row, channel } = cursor;
    const current = effectAt(channel, row);
    const codeIdx = current ? EFFECT_CODES.indexOf(current.code) : -1;
    const value = current?.value ?? 0;

    const commit = (effect: NoteEffect | null) => {
      onSetEffect(channel, row, effect);
      onEdit(channel);
    };

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        // Cycle through the codes plus a "none" slot at index -1.
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        const nextIdx = codeIdx + dir;
        if (nextIdx < -1) commit(null);
        else if (nextIdx >= EFFECT_CODES.length) commit({ code: EFFECT_CODES[EFFECT_CODES.length - 1], value });
        else if (nextIdx === -1) commit(null);
        else commit({ code: EFFECT_CODES[nextIdx] as EffectCode, value });
        return true;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (!current) return true;
        const delta = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 16 : 1);
        commit({ code: current.code, value: Math.min(255, Math.max(0, value + delta)) });
        return true;
      }
      case 'Enter':
      case 'Escape':
        setEditingEffect(false);
        return true;
      case 'Delete':
      case 'Backspace':
        commit(null);
        return true;
      default: {
        const hex = parseInt(e.key, 16);
        if (!Number.isNaN(hex) && e.key.length === 1) {
          // Shift in one hex digit from the right.
          const code = current?.code ?? EFFECT_CODES[0];
          commit({ code, value: ((value << 4) | hex) & 0xff });
          return true;
        }
        return false;
      }
    }
  });

  const handleGridKey = useEffectEvent((e: KeyboardEvent): boolean => {
    const { row, channel, field } = cursor;

    switch (e.key) {
      case 'ArrowUp':
        moveCursor({ ...cursor, row: Math.max(0, row - 1) });
        return true;
      case 'ArrowDown':
        moveCursor({ ...cursor, row: Math.min(GRID_ROWS - 1, row + 1) });
        return true;
      case 'ArrowLeft': {
        // Walk backwards through note/effect stops, wrapping into the previous channel.
        if (field === 'effect') moveCursor({ ...cursor, field: 'note' });
        else if (channel > 0) moveCursor({ ...cursor, channel: channel - 1, field: 'effect' });
        return true;
      }
      case 'ArrowRight': {
        if (field === 'note') moveCursor({ ...cursor, field: 'effect' });
        else if (channel < CHANNELS - 1) moveCursor({ ...cursor, channel: channel + 1, field: 'note' });
        return true;
      }
      case 'Enter':
        if (field === 'effect') setEditingEffect(true);
        return true;
      case 'Escape':
        setFocused(false);
        return true;
      case 'Delete':
      case 'Backspace':
        if (field === 'effect') {
          onSetEffect(channel, row, null);
          onEdit(channel);
        } else {
          writeNote(channel, row, 0);
        }
        return true;
      case '[':
        setOctave((o) => Math.max(MIN_OCTAVE, o - 1));
        return true;
      case ']':
        setOctave((o) => Math.min(MAX_OCTAVE, o + 1));
        return true;
    }

    if (e.key.length !== 1 || field !== 'note') return false;

    // Drums answer to mnemonics, not pitches.
    if (channel === 3) {
      if (!isDrumLetter(e.key)) return false;
      const drum = drumFromLetter(e.key);
      if (drum === null) return false;
      writeNote(channel, row, drum);
      moveCursor({ ...cursor, row: Math.min(GRID_ROWS - 1, row + 1) });
      return true;
    }

    if (!isNoteLetter(e.key)) return false;
    const note = letterToNote(e.key, e.shiftKey, octave);
    if (note === null) {
      // C-3 collides with the rest sentinel, and past C-7 is out of range.
      flashReject();
      return true;
    }
    writeNote(channel, row, note);
    moveCursor({ ...cursor, row: Math.min(GRID_ROWS - 1, row + 1) });
    return true;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const handled = editingEffect ? handleEffectKey(e) : handleGridKey(e);
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, editingEffect]);

  // Clicking outside the grid releases keyboard capture.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onDown = (e: Event) => {
      const node = containerRef.current as unknown as HTMLElement | null;
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        setFocused(false);
        setEditingEffect(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);

  // ---- Drag -----------------------------------------------------------------

  // The responder must stay stable across renders, so the values it reads live
  // in refs rather than in its closure.
  const dragCtx = useRef({
    enabled: dragEnabled,
    noteAt,
    writeNote,
    songKey,
    scale,
    setCursorFn: setCursor,
  });
  dragCtx.current = { enabled: dragEnabled, noteAt, writeNote, songKey, scale, setCursorFn: setCursor };

  const drag = useRef<{
    row: number;
    channel: number;
    startNote: number;
    axis: null | 'h' | 'v';
    lastApplied: number;
  } | null>(null);

  const locateCell = useCallback((x: number, y: number) => {
    const { width, rowHeight } = geom.current;
    if (!width || !rowHeight) return null;
    const colStart = ROW_NUM_WIDTH;
    if (x < colStart) return null;
    const colWidth = (width - colStart) / CHANNELS;
    const channel = Math.min(CHANNELS - 1, Math.max(0, Math.floor((x - colStart) / colWidth)));
    const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(y / rowHeight)));
    return { channel, row };
  }, []);

  // Pointer events rather than PanResponder: the grid lives inside a
  // ScrollView, and the responder system hands vertical gestures to the
  // scroller before they ever reach a child. Pointer capture cannot be stolen.
  const rowsRef = useRef<View | null>(null);
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);

  const localPoint = useCallback((e: PointerEvent) => {
    const node = rowsRef.current as unknown as HTMLElement | null;
    if (Platform.OS === 'web' && node?.getBoundingClientRect) {
      const r = node.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    return { x: e.offsetX ?? e.clientX, y: e.offsetY ?? e.clientY };
  }, []);

  const handlePointerDown = useCallback(
    (e: { nativeEvent: PointerEvent }) => {
      if (!dragCtx.current.enabled) return;
      const ne = e.nativeEvent;
      const { x, y } = localPoint(ne);
      const cell = locateCell(x, y);
      if (!cell) return;

      const startNote = dragCtx.current.noteAt(cell.channel, cell.row);
      drag.current = { ...cell, startNote, axis: null, lastApplied: startNote };
      pointerOrigin.current = { x: ne.clientX, y: ne.clientY };
      dragCtx.current.setCursorFn({ row: cell.row, channel: cell.channel, field: 'note' });
      setFocused(true);
      setEditingEffect(false);

      const node = rowsRef.current as unknown as HTMLElement | null;
      node?.setPointerCapture?.(ne.pointerId);
    },
    [localPoint, locateCell]
  );

  const handlePointerMove = useCallback((e: { nativeEvent: PointerEvent }) => {
    const d = drag.current;
    const origin = pointerOrigin.current;
    if (!d || !origin) return;

    const dx = e.nativeEvent.clientX - origin.x;
    const dy = e.nativeEvent.clientY - origin.y;

    // Commit to whichever axis the gesture declares first — a diagonal that
    // changed both pitch and octave would be unrecoverable without undo.
    if (!d.axis) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      d.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }

    const { songKey: k, scale: sc, writeNote: write } = dragCtx.current;

    // Steps are measured from the note the drag started on, not accumulated,
    // so dragging back to where you began restores the original value.
    let next: number;
    if (d.axis === 'h') {
      const steps = Math.round(dx / H_STEP_PX);
      next =
        d.channel === 3
          ? applySteps(d.startNote, steps, cycleDrum)
          : applySteps(d.startNote, steps, (n, dir) => scaleStep(n, dir, k, sc));
    } else {
      // Screen-down is positive dy; dragging up should raise pitch.
      const steps = Math.round(-dy / V_STEP_PX);
      next =
        d.channel === 3
          ? applySteps(d.startNote, steps, nudgeDrum)
          : applySteps(d.startNote, steps, octaveStep);
    }

    if (next === d.lastApplied) return;
    d.lastApplied = next;
    write(d.channel, d.row, next);
  }, []);

  const handlePointerUp = useCallback((e: { nativeEvent: PointerEvent }) => {
    drag.current = null;
    pointerOrigin.current = null;
    const node = rowsRef.current as unknown as HTMLElement | null;
    node?.releasePointerCapture?.(e.nativeEvent.pointerId);
  }, []);

  // ---- Render ---------------------------------------------------------------

  const octaveLabel = `OCT${octave}`;

  const reportMetrics = useCallback(() => {
    onLayoutMetrics?.({
      rowHeight: geom.current.rowHeight,
      headerHeight: geom.current.headerHeight,
      viewportHeight: geom.current.viewportHeight,
      contentHeight: geom.current.contentHeight,
    });
  }, [onLayoutMetrics]);

  return (
    <View style={styles.container} ref={containerRef} collapsable={false}>
      <ScrollView
        ref={(r) => {
          scrollRef.current = r;
          onScrollRef?.(r);
        }}
        style={styles.gridContainer}
        stickyHeaderIndices={[0]}
        // A wheel is not a drag, so pointer devices keep scrolling while drag
        // editing is on. Only touch has to give one up for the other.
        scrollEnabled={!dragEnabled || prefersPointer()}
        onScroll={(e) => { scrollOffset.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        onLayout={(e) => {
          geom.current.viewportHeight = e.nativeEvent.layout.height;
          geom.current.width = e.nativeEvent.layout.width - spacing.md * 2;
          reportMetrics();
        }}
        onContentSizeChange={(_w, h) => {
          geom.current.contentHeight = h;
          reportMetrics();
        }}
      >
        {/* Channel headers */}
        <View
          style={styles.gridHeader}
          onLayout={(e) => {
            geom.current.headerHeight = e.nativeEvent.layout.height;
            reportMetrics();
          }}
        >
          <View style={styles.rowNumCol}>
            <Pressable
              onPress={() => setOctave((o) => (o >= MAX_OCTAVE ? MIN_OCTAVE : o + 1))}
              accessibilityRole="button"
              accessibilityLabel={`Octave ${octave}. Tap to change.`}
            >
              <Text
                style={[
                  styles.octaveText,
                  focused && styles.octaveTextFocused,
                  rejectFlash && styles.octaveTextReject,
                ]}
              >
                {octaveLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setDragEnabled((d) => !d)}
              accessibilityRole="button"
              accessibilityLabel={`Drag editing ${dragEnabled ? 'on' : 'off'}`}
              accessibilityState={{ selected: dragEnabled }}
            >
              <Text style={[styles.dragText, dragEnabled && styles.dragTextOn]}>DRAG</Text>
            </Pressable>
          </View>
          {CHANNEL_NAMES.map((name, ci) => {
            const isMuted = mutedChannels.has(ci);
            const isSoloed = soloChannel === ci;
            const isExplicitMuted = explicitMutes.includes(ci);
            return (
              <View key={name} style={styles.channelCol}>
                <View style={styles.channelHeaderRow}>
                  <Text
                    style={[
                      styles.headerText,
                      { color: isMuted ? colors.textDim : CHANNEL_COLORS[ci] },
                    ]}
                  >
                    {name}
                  </Text>
                  <View style={styles.headerBtnGroup}>
                    <AnimatedPressable
                      onPress={() => onToggleMute(ci)}
                      style={[styles.toggleBtn, isExplicitMuted && styles.toggleBtnMuted]}
                      accessibilityRole="button"
                      accessibilityLabel={`${isExplicitMuted ? 'Unmute' : 'Mute'} ${name} channel`}
                      accessibilityState={{ selected: isExplicitMuted }}
                    >
                      <Text style={[styles.toggleText, isExplicitMuted && styles.toggleTextActive]}>
                        M
                      </Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      onPress={() => onToggleSolo(ci)}
                      style={[styles.toggleBtn, isSoloed && styles.toggleBtnSoloed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${isSoloed ? 'Unsolo' : 'Solo'} ${name} channel`}
                      accessibilityState={{ selected: isSoloed }}
                    >
                      <Text style={[styles.toggleText, isSoloed && styles.toggleTextSoloed]}>S</Text>
                    </AnimatedPressable>
                    <PulsingView active={renderingChannels.has(ci)}>
                      <AnimatedPressable
                        onPress={() => onRegenChannel(ci)}
                        disabled={renderingChannels.has(ci)}
                        style={[styles.regenBtn, flashChannels.has(ci) && styles.regenFlash]}
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

        {/* Rows */}
        <View
          ref={rowsRef}
          collapsable={false}
          onPointerDown={handlePointerDown as never}
          onPointerMove={handlePointerMove as never}
          onPointerUp={handlePointerUp as never}
          onPointerCancel={handlePointerUp as never}
          style={dragEnabled ? NO_TEXT_SELECT : undefined}
        >
          {Array.from({ length: GRID_ROWS }, (_, row) => {
            const isBeat = row % 8 === 0;
            const isPlayhead = row === playbackRow;
            return (
              <View
                key={row}
                onLayout={
                  row === 0
                    ? (e) => {
                        geom.current.rowHeight = e.nativeEvent.layout.height;
                        reportMetrics();
                      }
                    : undefined
                }
                style={[
                  styles.gridRow,
                  isBeat && styles.gridRowBeat,
                  row % 2 === 0 && styles.gridRowAlt,
                  isPlayhead && styles.gridRowCursor,
                ]}
              >
                <View style={styles.rowNumCol}>
                  <Text
                    style={[
                      styles.rowNum,
                      isBeat && styles.rowNumBeat,
                      isPlayhead && styles.rowNumCursor,
                    ]}
                  >
                    {row.toString(16).toUpperCase().padStart(2, '0')}
                  </Text>
                </View>
                {Array.from({ length: CHANNELS }, (_, ci) => {
                  const noteVal = noteAt(ci, row);
                  const noteName = ci === 3 ? drumNoteToName(noteVal) : zzfxmToNoteName(noteVal);
                  const fx = effectAt(ci, row);
                  const fxStr = effectToDisplayString(fx);
                  const isFlashing = flashChannels.has(ci);
                  const noteColor =
                    noteVal > 0
                      ? mutedChannels.has(ci)
                        ? colors.textDim
                        : CHANNEL_COLORS[ci]
                      : colors.textDim;

                  const noteFocused =
                    focused && cursor.row === row && cursor.channel === ci && cursor.field === 'note';
                  const fxFocused =
                    focused && cursor.row === row && cursor.channel === ci && cursor.field === 'effect';

                  return (
                    <View key={ci} style={[styles.channelCol, isFlashing && styles.channelFlash]}>
                      <View style={styles.cellRow}>
                        <Pressable
                          style={[styles.noteField, NO_FOCUS_RING, noteFocused && styles.cellCursor]}
                          onPress={() => {
                            setFocused(true);
                            setEditingEffect(false);
                            setCursor({ row, channel: ci, field: 'note' });
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Row ${row}, ${CHANNEL_NAMES[ci]}, note ${noteName}`}
                        >
                          <Text style={[styles.noteText, { color: noteColor }]}>{noteName}</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.fxField,
                            NO_FOCUS_RING,
                            fxFocused && styles.cellCursor,
                            fxFocused && editingEffect && styles.cellEditing,
                          ]}
                          onPress={() => {
                            setFocused(true);
                            setCursor({ row, channel: ci, field: 'effect' });
                            setEditingEffect(false);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Row ${row}, ${CHANNEL_NAMES[ci]}, effect ${fxStr}`}
                        >
                          <Text
                            style={[
                              styles.noteText,
                              { color: fx ? noteColor : colors.textDim },
                              fxFocused && editingEffect && styles.fxEditingText,
                            ]}
                          >
                            {fxStr}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {focused && (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>
            {editingEffect
              ? '↑↓ code   ←→ value   ⇧←→ ±16   0-F type   ENTER done'
              : '↑↓←→ move   A-G note   ⇧ sharp   [ ] octave   ENTER effect   DEL clear'}
          </Text>
        </View>
      )}
    </View>
  );
}

const ROW_NUM_WIDTH = 36;

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    width: ROW_NUM_WIDTH,
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
  octaveText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  octaveTextFocused: {
    color: colors.accentPrimary,
  },
  octaveTextReject: {
    color: colors.accentStop,
  },
  dragText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textDim,
    marginTop: 1,
  },
  dragTextOn: {
    color: colors.accentGenerate,
    fontWeight: '700',
  },
  headerBtnGroup: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
  },
  toggleBtn: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
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
  cellRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteField: {
    paddingHorizontal: 2,
  },
  fxField: {
    paddingHorizontal: 2,
    marginLeft: 2,
  },
  // Cell-scoped box, distinct from the row-wide playback highlight.
  cellCursor: {
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    backgroundColor: 'rgba(232, 116, 14, 0.12)',
  },
  cellEditing: {
    backgroundColor: 'rgba(232, 116, 14, 0.28)',
  },
  fxEditingText: {
    color: colors.accentHover,
    fontWeight: '700',
  },
  noteText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.gridNote,
  },
  channelFlash: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
  },
  hintBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderTrack,
    backgroundColor: colors.bgSurface,
  },
  hintText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textSecondary,
  },
});
