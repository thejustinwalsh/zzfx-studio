/**
 * Launchpad Mini MK3 runtime — input decoding, LED rendering, and the session
 * that binds them to a real device.
 *
 * The decode and render halves are pure and sit at the top of the file, so the
 * mapping can be tested without hardware. Only `openLaunchpad` touches Web MIDI.
 *
 * This module needs `sysex: true`, which is a heavier permission prompt than
 * note input, so it is loaded and opened only when someone explicitly turns
 * Launchpad control on.
 */
import { colors } from '../theme/colors';
import {
  DRUMS_LAYOUT,
  LOGO_CC,
  LedSurface,
  OFF,
  PROGRAMMER_MODE_OFF,
  PROGRAMMER_MODE_ON,
  SCENE_CC,
  TOP_CC,
  buildKeysLayout,
  isGridPad,
  isLaunchpadControlPort,
  padChannel,
  padIndex,
  palettePulse,
  rgbFromHex,
  scaleRgb,
  sceneCcToPattern,
  sessionCell,
  sessionPad,
  type Layout,
  type MidiSink,
} from './launchpad';
import type { NoteName, ScaleName } from './types';

// --- palette ----------------------------------------------------------------

/** The four channel colours, packed once. */
export const CHANNEL_CELLS = [
  rgbFromHex(colors.ch0Primary),
  rgbFromHex(colors.ch1Primary),
  rgbFromHex(colors.ch2Primary),
  rgbFromHex(colors.ch3Primary),
] as const;

export const CURSOR_CELL = rgbFromHex(colors.accentPrimary);

/**
 * Brightness tiers. Hue always carries channel identity, so state is expressed
 * as brightness and never as a different colour — that keeps the grid readable
 * for colour-blind users, who still get position and brightness.
 */
export const LEVEL_IDLE = 0.12;
export const LEVEL_PRESENT = 0.35;
export const LEVEL_ACTIVE = 1;

/**
 * Palette entry 21 is a mid green. Pulsing is palette-only — the RGB spec has
 * no animated form — so a queued pattern trades exact brand colour for the
 * device syncing the fade to MIDI beat clock, which is what makes it read as
 * "waiting for the bar" rather than "blinking".
 */
export const QUEUED_PALETTE = 21;

// --- input ------------------------------------------------------------------

export type LaunchpadEventKind = 'pad' | 'scene' | 'top' | 'logo';

export interface LaunchpadEvent {
  kind: LaunchpadEventKind;
  /** Raw LED index, so a handler can light the thing it just received. */
  index: number;
  pressed: boolean;
  velocity: number;
  /** Tracker channel for grid pads, else null. */
  channel: number | null;
  /** ZzFXM note under the active layout, else null. */
  note: number | null;
  /** Pattern for session cells and scene buttons, else null. */
  pattern: number | null;
}

export interface LayoutTables {
  layout: Layout;
  /** Rebuilt when the song's key or scale changes. */
  keys: Int8Array;
}

export function layoutTables(layout: Layout, root: NoteName, scale: ScaleName): LayoutTables {
  return { layout, keys: buildKeysLayout(root, scale) };
}

/**
 * Decode one message from the device into an app-level event.
 *
 * Pads arrive as note-on/off on channel 1; the scene column, top row and logo
 * arrive as control changes. Both use zero velocity for release. Returns null
 * for anything else — clock, aftertouch, the device's own mode replies.
 */
export function decodeLaunchpad(
  data: Uint8Array | number[],
  tables: LayoutTables
): LaunchpadEvent | null {
  if (!data || data.length < 3) return null;
  const status = data[0] & 0xf0;
  const index = data[1];
  const velocity = data[2];

  const isNote = status === 0x90 || status === 0x80;
  const isCc = status === 0xb0;
  if (!isNote && !isCc) return null;

  const pressed = status !== 0x80 && velocity > 0;

  if (isCc) {
    if (index === LOGO_CC) {
      return { kind: 'logo', index, pressed, velocity, channel: null, note: null, pattern: null };
    }
    const scene = sceneCcToPattern(index);
    if (scene !== null) {
      return { kind: 'scene', index, pressed, velocity, channel: null, note: null, pattern: scene };
    }
    if ((TOP_CC as readonly number[]).includes(index)) {
      return { kind: 'top', index, pressed, velocity, channel: null, note: null, pattern: null };
    }
    return null;
  }

  if (!isGridPad(index)) return null;

  if (tables.layout === 'SESSION') {
    const cell = sessionCell(index);
    if (!cell) return null;
    return {
      kind: 'pad',
      index,
      pressed,
      velocity,
      channel: cell.channel,
      note: null,
      pattern: cell.pattern,
    };
  }

  const table = tables.layout === 'DRUMS' ? DRUMS_LAYOUT : tables.keys;
  const note = table[index];
  // An unmapped pad is silent rather than playing something arbitrary.
  if (note < 0) return null;

  return {
    kind: 'pad',
    index,
    pressed,
    velocity,
    // DRUMS addresses the drum channel wherever you hit it; KEYS splits by
    // quadrant so four instruments are playable at once.
    channel: tables.layout === 'DRUMS' ? 3 : padChannel(index),
    note,
    pattern: null,
  };
}

// --- rendering --------------------------------------------------------------

export interface LaunchpadViewState {
  layout: Layout;
  /** Channels accepting MIDI, drawn brighter than the rest. */
  armed: readonly boolean[];
  /** Pads currently held, so a press lights under the finger. */
  held: ReadonlySet<number>;
  /**
   * The active KEYS table. Needed so a degree the scale cannot reach stays
   * dark rather than lighting a pad that plays nothing when pressed.
   */
  keys: Int8Array;
  // SESSION only.
  patternCount: number;
  activePattern: number;
  queuedPattern: number | null;
  /** `[pattern][channel]` — whether that cell has any notes at all. */
  patternFill: readonly (readonly boolean[])[];
}

const TOP_LAYOUT_BUTTONS: Record<Layout, number> = {
  SESSION: TOP_CC[0],
  KEYS: TOP_CC[1],
  DRUMS: TOP_CC[2],
};

/**
 * Paint the whole surface for a state. Writes only; the caller flushes, and the
 * diff means an unchanged frame costs nothing on the wire.
 */
export function renderLaunchpad(surface: LedSurface, state: LaunchpadViewState): void {
  surface.clear();

  // The top row selects the layout, lit in the accent so it never reads as a
  // channel. Only the active one is bright.
  for (const [layout, cc] of Object.entries(TOP_LAYOUT_BUTTONS)) {
    const on = state.layout === (layout as Layout);
    surface.set(cc, scaleRgb(CURSOR_CELL, on ? LEVEL_ACTIVE : LEVEL_IDLE));
  }
  surface.set(LOGO_CC, scaleRgb(CURSOR_CELL, LEVEL_PRESENT));

  if (state.layout === 'SESSION') renderSession(surface, state);
  else renderInstrument(surface, state);
}

function renderSession(surface: LedSurface, state: LaunchpadViewState): void {
  for (let pattern = 0; pattern < state.patternCount && pattern < 8; pattern++) {
    for (let channel = 0; channel < 4; channel++) {
      const pad = sessionPad(channel, pattern);
      if (pad === null) continue;

      const filled = state.patternFill[pattern]?.[channel] ?? false;
      const level = pattern === state.activePattern
        ? LEVEL_ACTIVE
        : filled
          ? LEVEL_PRESENT
          : LEVEL_IDLE;
      surface.set(pad, scaleRgb(CHANNEL_CELLS[channel], level));
    }

    // Scene column: the pattern as a whole.
    const cc = SCENE_CC[pattern];
    if (pattern === state.queuedPattern) surface.set(cc, palettePulse(QUEUED_PALETTE));
    else surface.set(cc, scaleRgb(CURSOR_CELL, pattern === state.activePattern ? LEVEL_ACTIVE : LEVEL_IDLE));
  }
}

function renderInstrument(surface: LedSurface, state: LaunchpadViewState): void {
  const table = state.layout === 'DRUMS' ? DRUMS_LAYOUT : state.keys;

  for (let row = 1; row <= 8; row++) {
    for (let col = 1; col <= 8; col++) {
      const pad = padIndex(row, col);
      const channel = state.layout === 'DRUMS' ? 3 : padChannel(pad);
      if (channel === null) continue;

      // A pad with no note behind it stays dark, so the drum zones read as
      // shapes rather than a uniform wash.
      if (table[pad] < 0) {
        surface.set(pad, OFF);
        continue;
      }

      const level = state.held.has(pad)
        ? LEVEL_ACTIVE
        : state.armed[channel]
          ? LEVEL_PRESENT
          : LEVEL_IDLE;
      surface.set(pad, scaleRgb(CHANNEL_CELLS[channel], level));
    }
  }
}

// --- session ----------------------------------------------------------------

export interface LaunchpadPorts {
  input: MIDIInput;
  output: MIDIOutput;
}

export interface LaunchpadSession {
  readonly surface: LedSurface;
  readonly deviceName: string;
  /** Repaint from a state and transmit whatever changed. */
  render(state: LaunchpadViewState): void;
  /** Swap the active layout's tables, e.g. when the song's key changes. */
  setTables(tables: LayoutTables): void;
  /** Restore the device to Live mode and release everything. */
  dispose(): void;
}

/**
 * Find the device's MIDI port pair.
 *
 * The Launchpad exposes two pairs; only the one named MIDI honours
 * Programmer-mode lighting, so matching the first Launchpad-looking port would
 * silently give us a device that never lights up.
 */
export function findLaunchpadPorts(access: MIDIAccess): LaunchpadPorts | null {
  const inputs = access.inputs as unknown as Map<string, MIDIInput>;
  const outputs = access.outputs as unknown as Map<string, MIDIOutput>;

  const input = [...inputs.values()].find((p) => isLaunchpadControlPort(p.name ?? ''));
  const output = [...outputs.values()].find((p) => isLaunchpadControlPort(p.name ?? ''));
  return input && output ? { input, output } : null;
}

export function isSysexSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}

export interface OpenLaunchpadOptions {
  tables: LayoutTables;
  onEvent: (event: LaunchpadEvent) => void;
  onDisconnect?: () => void;
}

/**
 * Take control of the device.
 *
 * Must be called from a user gesture. Requests SysEx, which Chrome prompts for
 * separately and more heavily than plain MIDI.
 */
export async function openLaunchpad(opts: OpenLaunchpadOptions): Promise<LaunchpadSession> {
  const nav = navigator as Navigator & {
    requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<MIDIAccess>;
  };
  if (!nav.requestMIDIAccess) throw new Error('Web MIDI is not available in this browser');

  const access = await nav.requestMIDIAccess({ sysex: true });
  const ports = findLaunchpadPorts(access);
  if (!ports) throw new Error('No Launchpad Mini MK3 found. Check it is plugged in and powered.');

  const { input } = ports;
  // See MidiSink: the DOM lib under-types what send accepts.
  const output = ports.output as unknown as MidiSink & MIDIPort;
  const surface = new LedSurface();
  let tables = opts.tables;
  let disposed = false;

  output.send(PROGRAMMER_MODE_ON);
  // The device's own LED state is unknown on entry, so the first frame must be
  // a full repaint rather than a diff against an assumed-dark grid.
  surface.invalidate();

  input.onmidimessage = (e: MIDIMessageEvent) => {
    const event = decodeLaunchpad(e.data ?? [], tables);
    if (event) opts.onEvent(event);
  };

  const restore = () => {
    if (disposed) return;
    disposed = true;
    try {
      surface.clear();
      surface.send(output);
      output.send(PROGRAMMER_MODE_OFF);
    } catch {
      // The port is already gone — nothing left to restore.
    }
  };

  // Closing the tab without this strands the device dark and unresponsive in
  // Programmer mode until it is power-cycled. pagehide covers the cases
  // beforeunload misses on mobile and in the back/forward cache.
  const onPageHide = () => restore();
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
  }

  const onStateChange = () => {
    if (input.state === 'disconnected' || output.state === 'disconnected') {
      opts.onDisconnect?.();
    }
  };
  access.addEventListener?.('statechange', onStateChange);

  return {
    surface,
    deviceName: input.name ?? 'Launchpad Mini MK3',
    render(state) {
      renderLaunchpad(surface, state);
      surface.send(output);
    },
    setTables(next) {
      tables = next;
      // The layout changed what every pad means, so nothing on screen is valid.
      surface.invalidate();
    },
    dispose() {
      input.onmidimessage = null;
      access.removeEventListener?.('statechange', onStateChange);
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('beforeunload', onPageHide);
      }
      restore();
    },
  };
}
