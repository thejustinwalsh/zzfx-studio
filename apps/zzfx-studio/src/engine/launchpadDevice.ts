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
  ARM_CC,
  DRUM_CHANNEL,
  armCcToChannel,
  KEYS_DRUM_LAYOUT,
  drumVariantAt,
  LOGO_CC,
  LedSurface,
  OFF,
  PROGRAMMER_MODE_OFF,
  PROGRAMMER_MODE_ON,
  SCENE_CC,
  CC_DOWN,
  CC_DRUMS,
  CC_KEYS,
  CC_SESSION,
  CC_UP,
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
import type { NoteEffect, NoteName, ScaleName } from './types';
import { DEFAULT_BASE_OCTAVE, octaveRangeFor } from './scales';

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

export type LaunchpadEventKind = 'pad' | 'scene' | 'arm' | 'top' | 'logo';

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
  /**
   * The effect baked into the pad, for drum pads that carry one.
   *
   * Travels with the note so recording writes both, which is exactly what the
   * grid already stores — no special case for the device.
   */
  effect: NoteEffect | null;
  /** Pattern for session cells and scene buttons, else null. */
  pattern: number | null;
}

export interface LayoutTables {
  layout: Layout;
  octave: number;
  /** Rebuilt when the song's key, scale or octave changes. */
  keys: Int8Array;
}

/**
 * Octaves of scale notes to generate for KEYS.
 *
 * A quadrant shows sixteen degrees; four octaves of a seven-note scale is
 * twenty-eight, so every pad is reachable with headroom for pentatonic.
 */
const KEYS_OCTAVE_SPAN = 3;

/**
 * Build the tables for a layout at a given octave.
 *
 * The octave is the tracker's own, shared with the grid rather than kept
 * separately — two octave controls that disagree would be worse than none.
 */
export function layoutTables(
  layout: Layout,
  root: NoteName,
  scale: ScaleName,
  octave: number = DEFAULT_BASE_OCTAVE
): LayoutTables {
  return { layout, octave, keys: buildKeysLayout(root, scale, octave, octave + KEYS_OCTAVE_SPAN) };
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
      return { kind: 'logo', index, pressed, velocity, channel: null, note: null, effect: null, pattern: null };
    }
    if (tables.layout !== 'SESSION') {
      const armCh = armCcToChannel(index);
      if (armCh !== null) {
        return { kind: 'arm', index, pressed, velocity, channel: armCh, note: null, effect: null, pattern: null };
      }
    }
    const scene = sceneCcToPattern(index);
    if (scene !== null) {
      return { kind: 'scene', index, pressed, velocity, channel: null, note: null, effect: null, pattern: scene };
    }
    if ((TOP_CC as readonly number[]).includes(index)) {
      return { kind: 'top', index, pressed, velocity, channel: null, note: null, effect: null, pattern: null };
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
      effect: null,
      pattern: cell.pattern,
    };
  }

  // Drums come from the kit, in both layouts: DRUMS is the kit alone, and in
  // KEYS it occupies the drum quadrant while the other three stay melodic.
  const drumTable =
    tables.layout === 'DRUMS' ? DRUMS_LAYOUT
    : padChannel(index) === DRUM_CHANNEL ? KEYS_DRUM_LAYOUT
    : null;

  if (drumTable) {
    const variant = drumVariantAt(index, drumTable);
    // An unmapped pad is silent rather than playing something arbitrary.
    if (!variant) return null;
    return {
      kind: 'pad',
      index,
      pressed,
      velocity,
      channel: DRUM_CHANNEL,
      note: variant.note,
      effect: variant.effect,
      pattern: null,
    };
  }

  if (tables.layout === 'DRUMS') return null;

  const note = tables.keys[index];
  if (note < 0) return null;

  return {
    kind: 'pad',
    index,
    pressed,
    velocity,
    // KEYS splits by quadrant so four instruments are playable at once.
    channel: padChannel(index),
    note,
    effect: null,
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
  /** The tracker's octave, shared with the grid. */
  octave: number;
}

/**
 * Layouts sit on the buttons the hardware prints them on.
 *
 * The first four top-row CCs are the arrows; putting layouts there made the
 * legend on the device lie about its own buttons. The arrows drive the octave
 * instead, which is what an arrow on an instrument usually does.
 */
const TOP_LAYOUT_BUTTONS: Record<Layout, number> = {
  SESSION: CC_SESSION,
  DRUMS: CC_DRUMS,
  KEYS: CC_KEYS,
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

  // The arrows step the octave. Each is lit only while it has somewhere to go,
  // so running out of range is visible before you press into it.
  const { min, max } = octaveRangeFor(DEFAULT_BASE_OCTAVE);
  surface.set(CC_UP, scaleRgb(CURSOR_CELL, state.octave < max ? LEVEL_PRESENT : LEVEL_IDLE));
  surface.set(CC_DOWN, scaleRgb(CURSOR_CELL, state.octave > min ? LEVEL_PRESENT : LEVEL_IDLE));

  if (state.layout === 'SESSION') {
    renderSession(surface, state);
  } else {
    // The scene column arms channels here. Hue is the channel, brightness is
    // whether it is armed — the same language the pads use.
    ARM_CC.forEach((cc, ch) => {
      surface.set(cc, scaleRgb(CHANNEL_CELLS[ch], state.armed[ch] ? LEVEL_ACTIVE : LEVEL_IDLE));
    });
    renderInstrument(surface, state);
  }
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
  for (let row = 1; row <= 8; row++) {
    for (let col = 1; col <= 8; col++) {
      const pad = padIndex(row, col);
      // Drums come from the kit in both layouts; the melodic table covers the
      // rest. Whichever answers for this pad also decides whether it is lit.
      const isDrum = state.layout === 'DRUMS' || padChannel(pad) === DRUM_CHANNEL;
      const table = state.layout === 'DRUMS' ? DRUMS_LAYOUT
        : isDrum ? KEYS_DRUM_LAYOUT
        : state.keys;
      const channel = isDrum ? DRUM_CHANNEL : padChannel(pad);
      if (channel === null) continue;

      // A pad with nothing behind it stays dark, so the kit reads as a shape
      // rather than a uniform wash.
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
