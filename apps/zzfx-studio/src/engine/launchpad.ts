/**
 * Novation Launchpad Mini MK3 codec.
 *
 * Every published JS Launchpad library targets the MK1/MK2 generation: a
 * stride-16 grid and 2-bit red/green LEDs. The MK3 uses decimal row/column
 * indices and a 24-bit RGB SysEx, so none of them light the right pad in the
 * right colour. This is that protocol, written against the Programmer's
 * Reference Manual.
 *
 * Programmer mode rather than the built-in Custom modes: Keys, Drum Rack and
 * Lighting are re-editable by the owner in Novation Components, so their note
 * maps are whatever that device last saved, and only one of the three accepts
 * lighting from outside. Programmer mode has a single fixed documented map and
 * full RGB, so our layouts and our LED feedback are generated from the same
 * table and cannot drift apart.
 *
 * No React, no Web MIDI calls — just bytes, so it can be tested without a
 * device on the desk.
 */
import type { NoteName, ScaleName } from './types';
import { DRUM_RANGES } from './noteEntry';
import { getScaleNotes } from './scales';

// --- ports ------------------------------------------------------------------

/**
 * The device exposes two port pairs. Programmer-mode lighting and Custom mode
 * input travel on the one named MIDI; the DAW pair is for Session integration
 * and ignores our SysEx.
 */
export function isLaunchpadPort(name: string): boolean {
  return /LPMiniMK3|Launchpad\s*Mini\s*MK3/i.test(name);
}

export function isLaunchpadControlPort(name: string): boolean {
  return isLaunchpadPort(name) && !/DAW/i.test(name);
}

// --- mode ------------------------------------------------------------------

/** F0 00 20 29 02 0D — Novation, Launchpad Mini MK3. */
export const SYSEX_HEADER = [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0d] as const;
const SYSEX_END = 0xf7;

/** Command 0Eh selects Live (0) or Programmer (1) mode. */
export const PROGRAMMER_MODE_ON = Uint8Array.from([...SYSEX_HEADER, 0x0e, 0x01, SYSEX_END]);

/**
 * Leaving the device in Programmer mode strands it dark and unresponsive until
 * it is power-cycled, so this must go out on unload, disconnect and teardown —
 * not only on the tidy path.
 */
export const PROGRAMMER_MODE_OFF = Uint8Array.from([...SYSEX_HEADER, 0x0e, 0x00, SYSEX_END]);

/** Command 03h carries a batch of LED specs. */
const CMD_LED = 0x03;

// --- grid geometry ----------------------------------------------------------

export const GRID_SIZE = 8;

/**
 * Pad index from a 1-based row and column, row 1 at the bottom.
 *
 * The MK3 numbers pads in decimal rather than packing bits: bottom-left is 11,
 * bottom-right 18, top-left 81. Reading a pad number tells you where it is.
 */
export function padIndex(row: number, col: number): number {
  return row * 10 + col;
}

export function padRow(index: number): number {
  return Math.floor(index / 10);
}

export function padCol(index: number): number {
  return index % 10;
}

/** True for the 64 pads of the square, excluding the CC rows and column. */
export function isGridPad(index: number): boolean {
  const row = padRow(index);
  const col = padCol(index);
  return row >= 1 && row <= GRID_SIZE && col >= 1 && col <= GRID_SIZE;
}

/** Right-hand column, top to bottom. Control changes, not notes. */
export const SCENE_CC = [89, 79, 69, 59, 49, 39, 29, 19] as const;

/** Top row, left to right. Control changes, not notes. */
export const TOP_CC = [91, 92, 93, 94, 95, 96, 97, 98] as const;

/** The illuminated logo, addressable like any other LED. */
export const LOGO_CC = 99;

/** One past the highest addressable index, so tables can be flat arrays. */
const INDEX_LIMIT = 100;

/**
 * True for the 81 indices the device actually lights.
 *
 * The decimal scheme leaves gaps: column 0 does not exist, so 10, 20 … 90 are
 * not LEDs. Addressing one is not merely wasteful — a full repaint that
 * included them would carry 90 specs, past the 81 the device accepts.
 */
export function isAddressable(index: number): boolean {
  return index >= 11 && index <= 99 && index % 10 !== 0;
}

/** The addressable indices in ascending order, built once for the flush loop. */
const ADDRESSABLE: Uint8Array = (() => {
  const out: number[] = [];
  for (let i = 11; i <= 99; i++) if (isAddressable(i)) out.push(i);
  return Uint8Array.from(out);
})();

// --- colour -----------------------------------------------------------------

/**
 * A cell is one packed int: the spec type in the high byte, its payload below.
 *
 * Keeping every lighting mode in a single Int32Array means the diff is an
 * integer compare with no per-pad object and nothing for the collector to walk.
 */
export const LED_STATIC = 0;
export const LED_FLASH = 1;
export const LED_PULSE = 2;
export const LED_RGB = 3;

/** Static palette entry 0. A zeroed table is therefore a dark grid. */
export const OFF = 0;

export function rgb(r: number, g: number, b: number): number {
  return (LED_RGB << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/** Pack a `#RRGGBB` string, so the theme's own colours can be used verbatim. */
export function rgbFromHex(hex: string): number {
  const v = parseInt(hex.replace('#', ''), 16);
  return rgb((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/**
 * Scale an RGB cell's brightness. Used to distinguish a channel's pads that
 * hold notes from the one that is sounding, without changing hue — the colour
 * stays the channel's identity and brightness carries the state.
 */
export function scaleRgb(cell: number, factor: number): number {
  if (cell >>> 24 !== LED_RGB) return cell;
  const f = Math.max(0, Math.min(1, factor));
  return rgb(
    Math.round(((cell >> 16) & 0xff) * f),
    Math.round(((cell >> 8) & 0xff) * f),
    Math.round((cell & 0xff) * f)
  );
}

/**
 * Palette-indexed lighting. Flashing and pulsing exist only in the palette —
 * the RGB spec has no animated form — so anything that breathes gives up exact
 * brand colour in exchange for the hardware syncing it to MIDI beat clock.
 */
export function paletteStatic(entry: number): number {
  return (LED_STATIC << 24) | (entry & 0x7f);
}

/** Alternates `a` and `b` at half the beat. */
export function paletteFlash(a: number, b: number): number {
  return (LED_FLASH << 24) | ((b & 0x7f) << 8) | (a & 0x7f);
}

/** Fades in and out over two beats — Ableton's queued-clip idiom. */
export function palettePulse(entry: number): number {
  return (LED_PULSE << 24) | (entry & 0x7f);
}

/** Bytes a spec occupies after its type and index: flash carries two. */
function payloadLength(type: number): number {
  return type === LED_RGB ? 3 : type === LED_FLASH ? 2 : 1;
}

// --- layouts ----------------------------------------------------------------

export type Layout = 'SESSION' | 'KEYS' | 'DRUMS';

/**
 * Which tracker channel a pad belongs to, by quadrant.
 *
 *   ┌─────────┬─────────┐  rows 5-8
 *   │ 0 LEAD  │ 1 HARM  │
 *   ├─────────┼─────────┤
 *   │ 2 BASS  │ 3 DRUM  │  rows 1-4
 *   └─────────┴─────────┘
 *   cols 1-4    cols 5-8
 *
 * Returns null off the square.
 */
export function padChannel(index: number): number | null {
  if (!isGridPad(index)) return null;
  const top = padRow(index) > 4 ? 0 : 2;
  const right = padCol(index) > 4 ? 1 : 0;
  return top + right;
}

/** Row and column within a pad's own quadrant, both 1-based. */
function quadrantLocal(index: number): { row: number; col: number } {
  const row = padRow(index);
  const col = padCol(index);
  return { row: row > 4 ? row - 4 : row, col: col > 4 ? col - 4 : col };
}

const QUADRANT_SIZE = 4;

/**
 * KEYS — each quadrant is sixteen scale degrees for its channel.
 *
 * Degrees ascend left to right then upward, so higher pitch is higher on the
 * grid, matching the tracker itself.
 *
 * All four quadrants hold the same ZzFXM note values, which is deliberate: a
 * note value is relative to its channel's own tuning, so the same pad sounds an
 * octave lower on the bass than on the lead. That is the point of a split — you
 * want the bass part in the bass register — and it is how the grid already
 * behaves when you type the same note into two channels.
 *
 * Note 0 is ZzFXM's rest sentinel, so a C3 tonic is unrepresentable on a
 * C4-tuned channel and getScaleNotes drops it; the quadrant simply starts a
 * degree higher. A C3-tuned channel reaches its own C3 normally.
 *
 * Allocates one table per key or scale change, never per frame.
 */
export function buildKeysLayout(
  root: NoteName,
  scale: ScaleName,
  lowOctave = 3,
  highOctave = 6
): Int8Array {
  const table = new Int8Array(INDEX_LIMIT).fill(-1);
  const notes = getScaleNotes(root, scale, lowOctave, highOctave);

  for (let row = 1; row <= GRID_SIZE; row++) {
    for (let col = 1; col <= GRID_SIZE; col++) {
      const index = padIndex(row, col);
      const local = quadrantLocal(index);
      const degree = (local.row - 1) * QUADRANT_SIZE + (local.col - 1);
      const note = notes[degree];
      if (note) table[index] = note.note;
    }
  }
  return table;
}

/**
 * DRUMS — one pad per distinct drum sound, in pitch order.
 *
 * The three voices hold different numbers of notes (KCK 6, SNR 16, HAT 26), so
 * rather than force them into equal blocks each voice fills consecutive pads
 * and the next starts on a fresh row. Every lit pad is a sound you cannot get
 * from any other pad, and the row breaks make the three zones readable by
 * position rather than colour alone.
 */
function buildDrumsLayout(): Int8Array {
  const table = new Int8Array(INDEX_LIMIT).fill(-1);
  let row = 1;

  for (const range of DRUM_RANGES) {
    let col = 1;
    for (let note = range.min; note <= range.max && row <= GRID_SIZE; note++) {
      table[padIndex(row, col)] = note;
      if (++col > GRID_SIZE) {
        col = 1;
        row++;
      }
    }
    // Start the next voice on its own row unless the last one filled exactly.
    if (col > 1) row++;
  }
  return table;
}

/** Static, so it is built once at load rather than on every layout switch. */
export const DRUMS_LAYOUT: Int8Array = buildDrumsLayout();

/**
 * SESSION — column is a channel, row is a pattern, as in Ableton.
 *
 * The four channels take columns 1-4; the right-hand CC column launches a whole
 * pattern across every channel. Row 8 is the first pattern so the grid reads
 * downward like the pattern list in the app.
 */
export interface SessionCell {
  channel: number;
  pattern: number;
}

export function sessionCell(index: number): SessionCell | null {
  if (!isGridPad(index)) return null;
  const col = padCol(index);
  if (col > 4) return null;
  return { channel: col - 1, pattern: GRID_SIZE - padRow(index) };
}

/** Pattern index for a scene-launch button, or null if it is not one. */
export function sceneCcToPattern(cc: number): number | null {
  const i = SCENE_CC.indexOf(cc as (typeof SCENE_CC)[number]);
  return i < 0 ? null : i;
}

/** The pad a given session cell occupies, for lighting it back. */
export function sessionPad(channel: number, pattern: number): number | null {
  if (channel < 0 || channel > 3 || pattern < 0 || pattern >= GRID_SIZE) return null;
  return padIndex(GRID_SIZE - pattern, channel + 1);
}

// --- frame writer -----------------------------------------------------------

/** Header, up to 81 five-byte RGB specs, terminator. */
const FRAME_CAPACITY = SYSEX_HEADER.length + 1 + 81 * 5 + 1;

/**
 * Anything a frame can be written to.
 *
 * `MIDIOutput.send` accepts any byte sequence, but this TS DOM lib types the
 * parameter as `number[]` alone, which a typed array is not assignable to.
 * Declaring the shape we actually rely on keeps the cast at the boundary
 * instead of scattered through the call sites — and lets tests pass a spy.
 */
export interface MidiSink {
  send(data: Uint8Array | number[], timestamp?: number): void;
}

/**
 * The LED surface, and the SysEx frame that carries changes to it.
 *
 * One buffer and two Int32Arrays for the life of the session. `set` writes the
 * wanted state; `flush` walks the diff against what the hardware is already
 * showing and packs only what moved. A playhead step dirties around sixteen
 * pads, so a steady-state frame is under ninety bytes rather than four hundred,
 * and neither path allocates.
 */
export class LedSurface {
  /** The frame buffer. Valid only up to the length `flush` returns. */
  readonly bytes = new Uint8Array(FRAME_CAPACITY);

  private readonly want = new Int32Array(INDEX_LIMIT);
  private readonly shown = new Int32Array(INDEX_LIMIT);

  constructor() {
    this.bytes.set(SYSEX_HEADER, 0);
    this.bytes[SYSEX_HEADER.length] = CMD_LED;
    this.invalidate();
  }

  /** Queue a cell. Indices that are not LEDs are ignored rather than throwing. */
  set(index: number, cell: number): void {
    if (isAddressable(index)) this.want[index] = cell;
  }

  get(index: number): number {
    return isAddressable(index) ? this.want[index] : OFF;
  }

  /** Queue every addressable LED dark. */
  clear(): void {
    this.want.fill(OFF);
  }

  /**
   * Forget what the hardware is showing, so the next flush repaints in full.
   *
   * Needed after entering Programmer mode or reconnecting: the device's own
   * state is unknown then, and a diff against a stale shadow leaves pads lit
   * that we believe are already dark.
   */
  invalidate(): void {
    this.shown.fill(-1);
  }

  /**
   * Pack the pending changes into `bytes` and return their length.
   *
   * Returns 0 when nothing changed, which is the common case between rows —
   * the caller should send nothing rather than an empty frame.
   */
  flush(): number {
    const { bytes, want, shown } = this;
    let n = SYSEX_HEADER.length + 1;

    for (let k = 0; k < ADDRESSABLE.length; k++) {
      const i = ADDRESSABLE[k];
      const cell = want[i];
      if (cell === shown[i]) continue;
      shown[i] = cell;

      const type = (cell >>> 24) & 0xff;
      bytes[n++] = type;
      bytes[n++] = i;
      if (type === LED_RGB) {
        // 0-255 per channel on our side, 0-127 on the wire.
        bytes[n++] = (cell >> 17) & 0x7f;
        bytes[n++] = (cell >> 9) & 0x7f;
        bytes[n++] = (cell >> 1) & 0x7f;
      } else if (type === LED_FLASH) {
        bytes[n++] = (cell >> 8) & 0x7f;
        bytes[n++] = cell & 0x7f;
      } else {
        bytes[n++] = cell & 0x7f;
      }
    }

    if (n === SYSEX_HEADER.length + 1) return 0;
    bytes[n++] = SYSEX_END;
    return n;
  }

  /** Flush and transmit, if anything moved. */
  send(port: MidiSink): boolean {
    const n = this.flush();
    if (n === 0) return false;
    port.send(this.bytes.subarray(0, n));
    return true;
  }
}

/** Largest frame the device will accept in one message, per the manual. */
export const MAX_SPECS_PER_FRAME = 81;

/** Bytes a full repaint of every addressable LED would occupy, all RGB. */
export const MAX_FRAME_BYTES =
  SYSEX_HEADER.length + 1 + MAX_SPECS_PER_FRAME * (2 + payloadLength(LED_RGB)) + 1;
