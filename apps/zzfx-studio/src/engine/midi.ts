/**
 * Web MIDI input.
 *
 * Loaded lazily — nothing here runs until the MIDI icon is pressed, because
 * requesting access needs a user gesture anyway and most sessions never use a
 * controller. Kept free of React so the mapping can be tested without a device.
 */
import { DEFAULT_BASE_OCTAVE } from './scales';

/** MIDI note 60 is middle C; ZzFXM's note 12 is the instrument's own frequency. */
const MIDI_MIDDLE_C = 60;
const ZZFXM_MIDDLE_C = 12;

export const MIDI_CHANNEL_COUNT = 16;

/**
 * Which MIDI channel each tracker channel speaks on.
 *
 * General MIDI reserves channel 10 for percussion, so drums go there — external
 * gear then maps them onto a kit without being told to. Values are 1-based as
 * they appear on hardware; the wire format is 0-based.
 */
export const CHANNEL_TO_MIDI = [1, 2, 3, 10];

export function midiToTrackerChannel(midiChannel1Based: number): number | null {
  const i = CHANNEL_TO_MIDI.indexOf(midiChannel1Based);
  return i < 0 ? null : i;
}

export interface MidiNoteEvent {
  type: 'noteon' | 'noteoff';
  /** 0-15 as transmitted. */
  channel: number;
  note: number;
  velocity: number;
}

/**
 * Decode a MIDI message, or null if it is not a note.
 *
 * A note-on with zero velocity is a note-off — many controllers send it that
 * way instead of 0x80, and treating it as a note-on produces stuck notes.
 */
export function parseMidiMessage(data: Uint8Array | number[]): MidiNoteEvent | null {
  if (!data || data.length < 3) return null;
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  const note = data[1];
  const velocity = data[2];

  if (status === 0x90) {
    return { type: velocity > 0 ? 'noteon' : 'noteoff', channel, note, velocity };
  }
  if (status === 0x80) {
    return { type: 'noteoff', channel, note, velocity };
  }
  return null;
}

/**
 * MIDI note number to a ZzFXM note value for a channel with the given tuning.
 *
 * Returns null when the result falls outside the playable range rather than
 * clamping — a clamped note is a wrong note, and silently transposing what
 * someone played is worse than dropping it.
 */
export function midiNoteToZzfxm(
  midiNote: number,
  baseOctave: number = DEFAULT_BASE_OCTAVE,
  minNote = 1,
  maxNote = 48
): number | null {
  // Shift by the channel's tuning: a C4-tuned channel puts middle C at 12, a
  // C3-tuned one puts it at 24.
  const octaveShift = (DEFAULT_BASE_OCTAVE - baseOctave) * 12;
  const value = midiNote - MIDI_MIDDLE_C + ZZFXM_MIDDLE_C + octaveShift;
  if (value < minNote || value > maxNote) return null;
  return value;
}

/**
 * Which tracker channels a note should reach.
 *
 * One armed channel takes everything, whatever channel it arrived on — that is
 * what makes an ordinary keyboard work, since most transmit on channel 1 only.
 * With several armed, the incoming channel picks between them, which is the
 * multi-part case and how a controller split across quadrants routes.
 */
export function routeToChannels(armed: number[], incomingChannel0Based: number): number[] {
  if (armed.length === 0) return [];
  if (armed.length === 1) return armed;
  const mapped = midiToTrackerChannel(incomingChannel0Based + 1);
  return mapped !== null && armed.includes(mapped) ? [mapped] : [];
}

/**
 * The row a note lands on when played into a running pattern.
 *
 * Rounds to the nearest row rather than taking the current one: a note struck
 * on the beat arrives slightly after it, so flooring would drift everything one
 * row late. At 136 BPM a row is 110ms, which is well within hearing.
 */
export function quantizeToRow(positionSeconds: number, bpm: number, rows: number): number {
  const rowDuration = 60 / bpm / 4;
  return Math.round(positionSeconds / rowDuration) % rows;
}

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiSession {
  devices: MidiDevice[];
  /** Stops listening and releases the handlers. */
  dispose(): void;
}

export function isMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}

/**
 * Ask for MIDI access and start listening.
 *
 * Must be called from a user gesture. `sysex` stays false — note input does not
 * need it, and asking for it triggers a considerably heavier permission prompt.
 * (Launchpad LED control will need it, which is a good reason to keep that
 * behind its own opt-in rather than folding it in here.)
 */
export async function startMidi(
  onNote: (event: MidiNoteEvent) => void,
  onDevicesChanged?: (devices: MidiDevice[]) => void
): Promise<MidiSession> {
  const nav = navigator as Navigator & {
    requestMIDIAccess?: (opts?: { sysex?: boolean }) => Promise<MIDIAccess>;
  };
  if (!nav.requestMIDIAccess) throw new Error('Web MIDI is not available in this browser');

  const access = await nav.requestMIDIAccess({ sysex: false });
  // MIDIInputMap is a ReadonlyMap at runtime, but this TS DOM lib types it
  // without the iteration methods.
  const inputs = access.inputs as unknown as Map<string, MIDIInput>;

  const listen = () => {
    for (const input of inputs.values()) {
      input.onmidimessage = (e: MIDIMessageEvent) => {
        const parsed = parseMidiMessage(e.data ?? []);
        if (parsed) onNote(parsed);
      };
    }
  };

  const snapshot = (): MidiDevice[] =>
    [...inputs.values()].map((i) => ({
      id: i.id,
      name: i.name ?? 'Unknown device',
      manufacturer: i.manufacturer ?? '',
    }));

  listen();

  // Controllers get plugged in and pulled out mid-session; the port list changes
  // without a reload, so re-bind rather than assume the first snapshot holds.
  access.onstatechange = () => {
    listen();
    onDevicesChanged?.(snapshot());
  };

  return {
    devices: snapshot(),
    dispose() {
      for (const input of inputs.values()) input.onmidimessage = null;
      access.onstatechange = null;
    },
  };
}
