import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { loadLaunchpad } from '../engine/launchpadLoader';
import type { LaunchpadEvent, LaunchpadSession, LaunchpadViewState } from '../engine/launchpadDevice';
import { CC_DOWN, CC_DRUMS, CC_KEYS, CC_SESSION, CC_UP, type Layout } from '../engine/launchpad';
import { DEFAULT_BASE_OCTAVE, octaveRangeFor } from '../engine/scales';
import type { PatternLabel, Song } from '../engine/types';

/** Notes start at index 2 of a channel row; the first two are instrument and pan. */
const NOTE_OFFSET = 2;

const NO_PADS: ReadonlySet<number> = new Set<number>();

type LaunchpadModule = Awaited<ReturnType<typeof loadLaunchpad>>;

/**
 * Which layout each top-row button selects.
 *
 * The buttons are printed on the hardware: Session, Drums, Keys, User. The four
 * CCs before them are the arrows, which drive the octave.
 */
const LAYOUT_BUTTONS: Record<number, Layout> = {
  [CC_SESSION]: 'SESSION',
  [CC_DRUMS]: 'DRUMS',
  [CC_KEYS]: 'KEYS',
};

export interface UseLaunchpadOptions {
  song: Song | null;
  activePattern: PatternLabel;
  armedChannels: number[];
  /** A pad played a note. Mirrors the MIDI note path. */
  onNote: (channel: number, note: number, velocity: number) => void;
  /** A session cell or scene button selected a pattern. */
  onSelectPattern: (patternIndex: number) => void;
  /** The tracker's octave, shared with the grid rather than held separately. */
  octave: number;
  onOctaveChange: (next: number) => void;
}

export interface LaunchpadControls {
  supported: boolean;
  enabled: boolean;
  connecting: boolean;
  deviceName: string | null;
  error: string | null;
  layout: Layout;
  setLayout: (layout: Layout) => void;
  enable: () => void;
  disable: () => void;
}

/**
 * Launchpad Mini MK3 control.
 *
 * The device module is imported on demand, so a session that never touches a
 * Launchpad neither downloads the protocol nor sees the SysEx prompt — which is
 * a heavier one than plain MIDI input asks for.
 */
export function useLaunchpad(opts: UseLaunchpadOptions): LaunchpadControls {
  const [module, setModule] = useState<LaunchpadModule | null>(null);
  const [wanted, setWanted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>('KEYS');
  const [held, setHeld] = useState<ReadonlySet<number>>(NO_PADS);

  const sessionRef = useRef<LaunchpadSession | null>(null);

  const supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  const { song, activePattern, armedChannels, onNote, onSelectPattern, octave, onOctaveChange } = opts;
  const key = song?.config.key ?? 'C';
  const scale = song?.config.scale ?? 'major';

  /**
   * The pad-to-note tables.
   *
   * Built once per layout, key or scale change and never during a repaint —
   * rebuilding them per frame would allocate two typed arrays several times a
   * second for a result that almost never differs.
   */
  const tables = useMemo(
    () => (module ? module.layoutTables(layout, key, scale, octave) : null),
    [module, layout, key, scale, octave]
  );

  /**
   * Which cells hold anything, so an empty pattern reads as empty on the grid.
   */
  const patternFill = useMemo(() => {
    if (!song) return [];
    return (song.patternOrder ?? []).map((label) =>
      [0, 1, 2, 3].map((ch) =>
        (song.patterns[label]?.[ch] ?? []).slice(NOTE_OFFSET).some((n) => n > 0)
      )
    );
  }, [song]);

  const armed = useMemo(
    () => [0, 1, 2, 3].map((ch) => armedChannels.includes(ch)),
    [armedChannels]
  );

  const activeIndex = song?.patternOrder?.indexOf(activePattern) ?? -1;

  // Derived rather than stored: wanting the device without having it open is
  // exactly what connecting means, and a second state could disagree with it.
  const connecting = wanted && !enabled;

  /**
   * A message from the device.
   *
   * An effect event so it always sees the current layout and armed set without
   * tearing the MIDI binding down and back up every time either changes.
   */
  const handleEvent = useEffectEvent((event: LaunchpadEvent) => {
    if (event.kind === 'top') {
      if (!event.pressed) return;
      const picked = LAYOUT_BUTTONS[event.index];
      if (picked) { setLayout(picked); return; }

      if (event.index === CC_UP || event.index === CC_DOWN) {
        const { min, max } = octaveRangeFor(DEFAULT_BASE_OCTAVE);
        const next = octave + (event.index === CC_UP ? 1 : -1);
        // Stop at the edge rather than wrapping — an octave that jumps from the
        // top of the range to the bottom under your finger is never what you
        // wanted, and the arrow is already dimmed to say so.
        if (next >= min && next <= max) onOctaveChange(next);
      }
      return;
    }

    if (event.kind === 'scene') {
      if (event.pressed && event.pattern !== null) onSelectPattern(event.pattern);
      return;
    }

    if (event.kind !== 'pad') return;

    // Light under the finger, whatever else the pad does.
    setHeld((prev) => {
      const next = new Set(prev);
      if (event.pressed) next.add(event.index);
      else next.delete(event.index);
      return next;
    });

    if (!event.pressed) return;

    if (event.pattern !== null) onSelectPattern(event.pattern);
    else if (event.channel !== null && event.note !== null) {
      onNote(event.channel, event.note, event.velocity);
    }
  });

  const enable = useCallback(() => {
    setError(null);
    setWanted(true);
  }, []);
  const disable = useCallback(() => setWanted(false), []);

  /**
   * Connect and disconnect.
   *
   * Driven by a flag rather than done inside the button's handler because
   * `handleEvent` is an effect event, and those may only be reached from an
   * effect. Chrome's activation window is seconds wide, so the permission
   * prompt still counts as coming from the click that set the flag.
   *
   * Disposal lives in the cleanup, which covers unmount as well as an explicit
   * disconnect — a device left in Programmer mode is dark and unresponsive
   * until it is power-cycled.
   */
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;

    void (async () => {
      try {
        const mod = await loadLaunchpad();
        if (cancelled) return;
        const session = await mod.openLaunchpad({
          tables: mod.layoutTables('KEYS', 'C', 'major', DEFAULT_BASE_OCTAVE),
          onEvent: handleEvent,
          onDisconnect: () => setWanted(false),
        });
        if (cancelled) {
          session.dispose();
          return;
        }
        sessionRef.current = session;
        setModule(mod);
        setDeviceName(session.deviceName);
        setEnabled(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not reach the Launchpad');
        setWanted(false);
      }
    })();

    return () => {
      cancelled = true;
      sessionRef.current?.dispose();
      sessionRef.current = null;
      setEnabled(false);
      setDeviceName(null);
      setHeld(NO_PADS);
    };
  }, [wanted]);

  // The layout, key or scale changed what every pad means.
  useEffect(() => {
    if (!enabled || !tables) return;
    sessionRef.current?.setTables(tables);
  }, [enabled, tables]);

  // Repaint. The surface diffs, so a state change that moves nothing sends
  // nothing — this can run as often as React likes.
  useEffect(() => {
    const session = sessionRef.current;
    if (!enabled || !session || !tables) return;
    const state: LaunchpadViewState = {
      layout,
      armed,
      held,
      keys: tables.keys,
      patternCount: patternFill.length,
      activePattern: activeIndex,
      queuedPattern: null,
      patternFill,
      octave,
    };
    session.render(state);
  }, [enabled, tables, layout, armed, held, patternFill, activeIndex, octave]);

  return {
    supported,
    enabled,
    connecting,
    deviceName,
    error,
    layout,
    setLayout,
    enable,
    disable,
  };
}
