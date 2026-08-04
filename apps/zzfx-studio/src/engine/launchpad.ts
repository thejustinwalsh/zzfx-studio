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
import type { NoteEffect, NoteName, ScaleName } from './types';
import { DRUM_NOTES } from './types';
import { getScaleNotes } from './scales';

// --- models -----------------------------------------------------------------

/**
 * The Launchpads that share this protocol.
 *
 * All three speak the same manufacturer header, the same LED command, the same
 * decimal pad numbering and the same colour spec — the worked lighting example
 * in each manual is byte-identical apart from one byte. What differs is that
 * byte, the port names, and, on the Pro, how Programmer mode is reached: the
 * Mini and X have a dedicated Live/Programmer toggle, while on the Pro
 * Programmer is a *layout* selected like any other. Getting that wrong means
 * the device simply never enters the mode, so it is spelled out per model
 * rather than assumed from the Mini.
 *
 * Sources: the Programmer's Reference manual for each device.
 */
export interface LaunchpadModel {
  id: 'mini-mk3' | 'x' | 'pro-mk3';
  name: string;
  /** Sixth SysEx byte, after the Novation manufacturer ID. */
  deviceId: number;
  /** Matches this model's ports, DAW and DIN interfaces included. */
  port: RegExp;
  /** Body after the header that enters Programmer mode. */
  enterProgrammer: readonly number[];
  /** Body that returns the device to its standalone behaviour. */
  leaveProgrammer: readonly number[];
  /**
   * Which layout each top-row button selects.
   *
   * The CC numbers are the same on every model but the legends printed on them
   * are not — the Mini reads Session/Drums/Keys, the X reads Session/Note/
   * Custom. Mapping per model keeps the button doing what it says.
   */
  layoutButtons: Readonly<Record<Layout, number>>;
}

/** Novation. Shared by every model here. */
export const SYSEX_MANUFACTURER = [0x00, 0x20, 0x29, 0x02] as const;
const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;

export const LAUNCHPAD_MODELS: readonly LaunchpadModel[] = [
  {
    id: 'mini-mk3',
    name: 'Launchpad Mini MK3',
    deviceId: 0x0d,
    port: /LPMiniMK3|Launchpad\s*Mini\s*MK3/i,
    // Dedicated Live/Programmer switch: 0Eh, then 1 for Programmer, 0 for Live.
    enterProgrammer: [0x0e, 0x01],
    leaveProgrammer: [0x0e, 0x00],
    // Printed: Session, Drums, Keys, User.
    layoutButtons: { SESSION: 95, DRUMS: 96, KEYS: 97 },
  },
  {
    id: 'x',
    name: 'Launchpad X',
    deviceId: 0x0c,
    port: /LPX|Launchpad\s*X/i,
    enterProgrammer: [0x0e, 0x01],
    leaveProgrammer: [0x0e, 0x00],
    // Printed: Session, Note, Custom, Capture MIDI. Note is the melodic one.
    layoutButtons: { SESSION: 95, KEYS: 96, DRUMS: 97 },
  },
  {
    id: 'pro-mk3',
    name: 'Launchpad Pro MK3',
    deviceId: 0x0e,
    port: /LPProMK3|Launchpad\s*Pro\s*MK3/i,
    // No mode toggle. Layout select is 00h <layout> <page> 00h, and Programmer
    // is layout 11h. Session is DAW-mode only, so standalone returns to
    // Note/Drum (04h) rather than Session.
    enterProgrammer: [0x00, 0x11, 0x00, 0x00],
    leaveProgrammer: [0x00, 0x04, 0x00, 0x00],
    layoutButtons: { SESSION: 95, KEYS: 96, DRUMS: 97 },
  },
];

/** The default when a device cannot be identified, and the one we can test. */
export const DEFAULT_MODEL = LAUNCHPAD_MODELS[0];

// --- ports ------------------------------------------------------------------

/** Which model a port belongs to, or null if it is not a Launchpad. */
export function modelForPort(name: string): LaunchpadModel | null {
  return LAUNCHPAD_MODELS.find((m) => m.port.test(name)) ?? null;
}

export function isLaunchpadPort(name: string): boolean {
  return modelForPort(name) !== null;
}

/**
 * True only for the port that honours Programmer-mode lighting.
 *
 * Every model exposes a DAW pair that ignores our SysEx, and the Pro adds a
 * third DIN pair for its physical MIDI sockets. Matching the first
 * Launchpad-looking port would hand us a device that never lights up.
 */
export function isLaunchpadControlPort(name: string): boolean {
  return isLaunchpadPort(name) && !/\bDAW\b|\bDIN\b/i.test(name);
}

// --- mode -------------------------------------------------------------------

/** Header for a model: F0 00 20 29 02 <deviceId>. */
export function sysexHeader(model: LaunchpadModel): number[] {
  return [SYSEX_START, ...SYSEX_MANUFACTURER, model.deviceId];
}

function sysex(model: LaunchpadModel, body: readonly number[]): Uint8Array {
  return Uint8Array.from([...sysexHeader(model), ...body, SYSEX_END]);
}

export function programmerModeOn(model: LaunchpadModel): Uint8Array {
  return sysex(model, model.enterProgrammer);
}

/**
 * Leaving a device in Programmer mode strands it dark and unresponsive until it
 * is power-cycled, so this must go out on unload, disconnect and teardown — not
 * only on the tidy path.
 */
export function programmerModeOff(model: LaunchpadModel): Uint8Array {
  return sysex(model, model.leaveProgrammer);
}

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

/**
 * The top row is printed on the hardware, and the two halves mean different
 * things: four arrows, then four named mode buttons.
 *
 *   91  92  93  94   95        96      97     98
 *   ↑   ↓   ←   →    Session   Drums   Keys   User
 *
 * Layouts belong on the named buttons — pressing the one that says Keys should
 * give you keys. Driving them from the arrows instead means the legend on the
 * device lies about what its own buttons do.
 */
export const CC_UP = 91;
export const CC_DOWN = 92;
export const CC_LEFT = 93;
export const CC_RIGHT = 94;
export const CC_SESSION = 95;
export const CC_DRUMS = 96;
export const CC_KEYS = 97;
export const CC_USER = 98;

/**
 * Arm toggles, in KEYS and DRUMS where the scene column is otherwise idle.
 *
 * The top four of the right-hand column, in channel order downward. The column
 * cannot express the left/right half of a quadrant, so it does not try to
 * mirror the grid's geometry — it is a plain channel list, coloured by channel
 * so which is which needs no explanation.
 *
 * In SESSION the same column launches patterns, which is what the hardware's
 * own scene-launch column is for.
 */
export const ARM_CC = [89, 79, 69, 59] as const;

export function armCcToChannel(cc: number): number | null {
  const i = ARM_CC.indexOf(cc as (typeof ARM_CC)[number]);
  return i < 0 ? null : i;
}

/** The four arrows, which we deliberately leave alone. */
export const ARROW_CC = [CC_UP, CC_DOWN, CC_LEFT, CC_RIGHT] as const;

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

/** Drums are the fourth channel, and the one quadrant that is not melodic. */
export const DRUM_CHANNEL = 3;

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
      // The drum quadrant is a kit, not a scale. Feeding it scale degrees gave
      // sixteen pads of drums pitched by a scale that has nothing to do with
      // percussion; KEYS_DRUM_LAYOUT covers it instead.
      if (padChannel(index) === DRUM_CHANNEL) continue;
      const local = quadrantLocal(index);
      const degree = (local.row - 1) * QUADRANT_SIZE + (local.col - 1);
      const note = notes[degree];
      if (note) table[index] = note.note;
    }
  }
  return table;
}

/**
 * DRUMS — four kits, one per quadrant, differing by effect.
 *
 *   ┌───────────────┬───────────────┐
 *   │  PD  punch    │  SD  deepen   │   rows 5-8
 *   ├───────────────┼───────────────┤
 *   │  raw          │  VB  rattle   │   rows 1-4
 *   └───────────────┴───────────────┘
 *     cols 1-4         cols 5-8
 *
 * Every quadrant holds the same three drums, one per row bottom to top: kick,
 * snare, hat. The four columns step through each drum's own note range, so
 * they are real pitch variation rather than four copies of one sound.
 *
 * The effects are the ones the song generator puts on drums -- pitch drop and
 * bit crush -- so a pad plays a sound a generated song can also contain.
 */
export interface DrumVariant {
  /** ZzFXM note; picks both the voice and its pitch within that voice. */
  note: number;
  effect: NoteEffect | null;
  /** Shown in the UI, and what the grid reads back. */
  label: string;
}

/** Voices bottom to top, matching the grid's own low-to-high convention. */
const DRUM_VOICE_LABELS = ['KCK', 'SNR', 'HAT'] as const;

/** Each voice's playable span, mirroring DRUM_RANGES in noteEntry. */
const DRUM_VOICE_SPANS = [
  { min: 1, max: 6 },
  { min: 7, max: 22 },
  { min: 23, max: 48 },
] as const;

/** One quadrant per entry; null is the plain kit. Order matches padChannel. */
const DRUM_QUADRANT_FX: readonly (NoteEffect | null)[] = [
  null,                          // bottom-left
  { code: 'PD', value: 0x60 },   // bottom-right
  { code: 'PD', value: 0xa0 },   // top-left
  { code: 'BC', value: 0x18 },   // top-right
];

export const DRUM_VARIANT_COLS = 4;
export const DRUM_VARIANT_ROWS = DRUM_VOICE_LABELS.length;

const QUADRANT_ORIGINS = [
  { row: 1, col: 1 },
  { row: 1, col: 5 },
  { row: 5, col: 1 },
  { row: 5, col: 5 },
] as const;

/** The pitch a column plays, stepping across the voice's own range. */
function noteForColumn(voice: number, col: number): number {
  const { min, max } = DRUM_VOICE_SPANS[voice];
  const step = (max - min) / Math.max(1, DRUM_VARIANT_COLS - 1);
  return Math.round(min + step * col);
}

const fxLabel = (fx: NoteEffect | null) =>
  fx ? ` ${fx.code}${fx.value.toString(16).toUpperCase().padStart(2, '0')}` : '';

export const DRUM_VARIANTS: readonly DrumVariant[] = DRUM_QUADRANT_FX.flatMap((effect) =>
  DRUM_VOICE_LABELS.flatMap((label, v) =>
    Array.from({ length: DRUM_VARIANT_COLS }, (_, c) => ({
      note: noteForColumn(v, c),
      effect,
      label: `${label}${c > 0 ? String(c + 1) : ''}${fxLabel(effect)}`,
    }))
  )
);

const VARIANTS_PER_QUADRANT = DRUM_VARIANT_ROWS * DRUM_VARIANT_COLS;

/**
 * Lay kits into the grid.
 *
 * Used twice: DRUMS spreads all four over the surface, and KEYS fits the plain
 * one into its drum quadrant, so a pad means the same thing in both.
 */
function buildDrumTable(
  quadrants: readonly number[],
  origins: readonly { row: number; col: number }[]
): Int8Array {
  const table = new Int8Array(INDEX_LIMIT).fill(-1);
  quadrants.forEach((q, i) => {
    const origin = origins[i];
    for (let v = 0; v < DRUM_VARIANT_ROWS; v++) {
      for (let c = 0; c < DRUM_VARIANT_COLS; c++) {
        const row = origin.row + v;
        const col = origin.col + c;
        if (row > GRID_SIZE || col > GRID_SIZE) continue;
        table[padIndex(row, col)] = q * VARIANTS_PER_QUADRANT + v * DRUM_VARIANT_COLS + c;
      }
    }
  });
  return table;
}

/** Pad → index into DRUM_VARIANTS, or -1. Built once at load. */
export const DRUMS_LAYOUT: Int8Array = buildDrumTable([0, 1, 2, 3], QUADRANT_ORIGINS);

/** KEYS has room for one kit only, so it gets the plain one. */
export const KEYS_DRUM_LAYOUT: Int8Array = buildDrumTable([0], [{ row: 1, col: 5 }]);

/** The variant a pad plays under a layout, or null where nothing is mapped. */
export function drumVariantAt(index: number, table: Int8Array): DrumVariant | null {
  if (!isGridPad(index)) return null;
  const v = table[index];
  return v < 0 ? null : DRUM_VARIANTS[v];
}

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

/** Header (6), command (1), up to 81 five-byte RGB specs, terminator. */
const HEADER_LENGTH = 6;
const FRAME_CAPACITY = HEADER_LENGTH + 1 + 81 * 5 + 1;

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

  /**
   * Cached windows over `bytes`, one per frame length.
   *
   * Keyed by length rather than holding a single view, because lengths
   * alternate in normal use: a lit pad is a five-byte RGB spec and a dark one a
   * three-byte palette spec, so a playhead step and its cleanup differ in size
   * and a one-entry cache would thrash between them. Few distinct lengths ever
   * occur, and each entry is a window on the same memory, never a copy.
   */
  private readonly views = new Map<number, Uint8Array>();

  /**
   * The model decides one byte of the header. Everything after it — the LED
   * command, the pad numbering, the colour spec — is identical across models.
   */
  constructor(model: LaunchpadModel = DEFAULT_MODEL) {
    this.bytes.set(sysexHeader(model), 0);
    this.bytes[HEADER_LENGTH] = CMD_LED;
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
    let n = HEADER_LENGTH + 1;

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

    if (n === HEADER_LENGTH + 1) return 0;
    bytes[n++] = SYSEX_END;
    return n;
  }

  /**
   * Flush and transmit, if anything moved.
   *
   * Views are cached because `subarray` allocates one per call and this runs
   * several times a second while playing. The same handful of frame lengths
   * recur, so after the first of each the steady state allocates nothing.
   */
  send(port: MidiSink): boolean {
    const n = this.flush();
    if (n === 0) return false;
    let view = this.views.get(n);
    if (!view) {
      view = this.bytes.subarray(0, n);
      this.views.set(n, view);
    }
    port.send(view);
    return true;
  }
}

/** Largest frame the device will accept in one message, per the manual. */
export const MAX_SPECS_PER_FRAME = 81;

/** Bytes a full repaint of every addressable LED would occupy, all RGB. */
export const MAX_FRAME_BYTES =
  HEADER_LENGTH + 1 + MAX_SPECS_PER_FRAME * (2 + payloadLength(LED_RGB)) + 1;
