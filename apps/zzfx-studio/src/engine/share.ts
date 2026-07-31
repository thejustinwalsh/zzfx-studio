import type { Song, SectionRole, VibeName, NoteName, ScaleName, SongLength } from './types';
import { EFFECT_CODES } from './types';

/**
 * Songs travel in the URL as a bit-packed binary blob, deflated and base64url'd.
 *
 * This is a transport format, not a storage format — it decodes back into the
 * ordinary Song object and nothing else in the app knows it exists. Packing
 * earns its keep: a dense eight-pattern song is ~1.9k here against ~4.4k as
 * compressed JSON, because notes fit in six bits and the JSON keys vanish.
 *
 * The parameter is `?s=` rather than `#s=` deliberately. A hash never leaves
 * the browser, which would rule out link previews and oEmbed forever; a query
 * parameter keeps that option open. Both behave the same for iframe embeds.
 */
export const SHARE_PARAM = 's';

/**
 * The studio's fixed chrome — transport, sequence strip, oscilloscope,
 * instrument cards and the grid header — before a single row of pattern data.
 * Measured from the running app rather than estimated.
 */
export const STUDIO_CHROME_HEIGHT = 399;
export const GRID_ROW_HEIGHT = 19.5;

/** Below four visible rows the studio is furniture, not an instrument. */
export const MIN_USABLE_ROWS = 4;
/** Where it stops feeling cramped. */
export const IDEAL_ROWS = 8;

/** Height at which the studio can still show `rows` rows of pattern data. */
export function studioHeightForRows(rows: number): number {
  return Math.ceil(STUDIO_CHROME_HEIGHT + rows * GRID_ROW_HEIGHT);
}

/**
 * The mini player is chosen by height, not by URL — a share link and an embed
 * link are the same link, and the frame's height decides which one you get.
 *
 * The threshold is exactly where the studio stops being usable: fewer than four
 * rows of pattern data. Note this lands above a phone in landscape, so a phone
 * held sideways gets the player — which is correct, since the studio could not
 * show even one row there.
 */
export const MINI_PLAYER_MAX_HEIGHT = studioHeightForRows(MIN_USABLE_ROWS) - 1;

/** Comfortable studio height — eight rows visible. */
export const STUDIO_IDEAL_HEIGHT = studioHeightForRows(IDEAL_ROWS);

/** Tall enough for the player's own chrome, far below the studio threshold. */
export const DEFAULT_EMBED_HEIGHT = 180;
/** Wide enough for the title, the settings line and the channel legend. */
export const DEFAULT_EMBED_WIDTH = 520;

/**
 * `?embed=1` forces the mini player regardless of size — an escape hatch for
 * embedding a deliberately large player. It is not in generated snippets.
 * A query flag rather than a path because the app exports as a single HTML file
 * and GitHub Pages has no rewrites: `/embed` would simply 404.
 */
export const EMBED_PARAM = 'embed';

const FORMAT_VERSION = 1;

const FLAG_DEFLATED = 1;

/**
 * These arrays ARE the wire format — an index is what gets written. Appending
 * is safe; reordering or removing silently breaks every link ever shared.
 * A test pins them against the live types.
 */
const VIBES = ['adventure', 'battle', 'dungeon', 'titleScreen', 'boss'] as const;
const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SCALE_NAMES = ['major', 'minor', 'pentatonic', 'dorian', 'mixolydian', 'harmonicMinor'] as const;
const LENGTHS = ['short', 'long', 'epic'] as const;
const ROLES = ['verse', 'contrast', 'bridge', 'breakdown', 'climax'] as const;

export const WIRE_ENUMS = { VIBES, KEYS, SCALE_NAMES, LENGTHS, ROLES };

/** Notes are 0..48, so six bits each. */
const NOTE_BITS = 6;
const MAX_NOTE_VALUE = (1 << NOTE_BITS) - 1;

// ---------------------------------------------------------------------------

class Writer {
  private bytes: number[] = [];

  u8(v: number) { this.bytes.push(v & 0xff); }
  u16(v: number) { this.u8(v >> 8); this.u8(v); }

  /** Full double — instrument params are doubles everywhere else in the app,
   *  and truncating them would make a shared song differ from the original. */
  f64(v: number) {
    const d = new DataView(new ArrayBuffer(8));
    d.setFloat64(0, v);
    for (let i = 0; i < 8; i++) this.u8(d.getUint8(i));
  }

  str(s: string) {
    const enc = new TextEncoder().encode(s);
    this.u16(enc.length);
    enc.forEach((c) => this.u8(c));
  }

  bytesOut(): Uint8Array { return new Uint8Array(this.bytes); }
}

/** Reads defensively — every payload arrives from a URL a stranger wrote. */
class Reader {
  private i = 0;
  overrun = false;

  constructor(private d: Uint8Array) {}

  private take(): number {
    if (this.i >= this.d.length) { this.overrun = true; return 0; }
    return this.d[this.i++];
  }

  u8(): number { return this.take(); }
  u16(): number { return (this.take() << 8) | this.take(); }

  f64(): number {
    const d = new DataView(new ArrayBuffer(8));
    for (let i = 0; i < 8; i++) d.setUint8(i, this.take());
    return d.getFloat64(0);
  }

  str(): string {
    const n = this.u16();
    if (this.overrun || this.i + n > this.d.length) { this.overrun = true; return ''; }
    const s = new TextDecoder().decode(this.d.slice(this.i, this.i + n));
    this.i += n;
    return s;
  }
}

const indexOf = <T extends readonly string[]>(arr: T, v: string): number => {
  const i = arr.indexOf(v as never);
  return i < 0 ? 0 : i;
};

// ---------------------------------------------------------------------------

export function packSong(song: Song): Uint8Array {
  const w = new Writer();
  w.u8(FORMAT_VERSION);

  const c = song.config;
  w.str(c.name ?? '');
  w.u8(indexOf(VIBES, c.vibe));
  w.u8(indexOf(KEYS, c.key));
  w.u8(indexOf(SCALE_NAMES, c.scale));
  w.u8(indexOf(LENGTHS, c.length));
  w.u16(Math.round(c.bpm));

  w.u8(song.instruments.length);
  for (const inst of song.instruments) {
    w.u8(inst.length);
    // Most ZzFX slots sit at exactly 0; a presence mask skips them entirely.
    let mask = 0;
    inst.forEach((v, i) => { if (v !== 0) mask |= 1 << i; });
    w.u8(mask & 0xff); w.u8((mask >> 8) & 0xff); w.u8((mask >> 16) & 0xff);
    for (const v of inst) if (v !== 0) w.f64(v);
  }

  w.u8(song.patternOrder.length);
  for (const label of song.patternOrder) {
    w.u8(label.charCodeAt(0));
    w.u8(indexOf(ROLES, song.patternRoles?.[label] ?? 'verse'));

    const pattern = song.patterns[label];
    w.u8(pattern.length);
    for (const ch of pattern) {
      const notes = ch.slice(2);
      w.u8(ch[0] ?? 0);
      w.u8((ch[1] ?? 0) + 128);
      w.u8(notes.length);
      let acc = 0, bits = 0;
      for (const n of notes) {
        acc = (acc << NOTE_BITS) | (Math.max(0, Math.min(MAX_NOTE_VALUE, n | 0)));
        bits += NOTE_BITS;
        while (bits >= 8) { bits -= 8; w.u8(acc >> bits); }
      }
      if (bits) w.u8(acc << (8 - bits));
    }

    // Effects are mostly empty, so only the hits are written.
    const effects = song.patternEffects?.[label];
    for (let ci = 0; ci < pattern.length; ci++) {
      const ch = effects?.[ci] ?? [];
      const hits: [number, number, number][] = [];
      ch.forEach((e, row) => {
        if (e && row < 32) hits.push([row, indexOf(EFFECT_CODES, e.code), e.value & 0xff]);
      });
      w.u8(hits.length);
      for (const [row, code, value] of hits) { w.u8((row << 3) | code); w.u8(value); }
    }
  }

  w.u8(song.sequence.length);
  for (const s of song.sequence) w.u8(s & 0xff);

  return w.bytesOut();
}

export function unpackSong(bytes: Uint8Array): Song | null {
  const r = new Reader(bytes);
  if (r.u8() !== FORMAT_VERSION) return null;

  const name = r.str();
  const vibe = VIBES[r.u8()] as VibeName | undefined;
  const key = KEYS[r.u8()] as NoteName | undefined;
  const scale = SCALE_NAMES[r.u8()] as ScaleName | undefined;
  const length = LENGTHS[r.u8()] as SongLength | undefined;
  const bpm = r.u16();
  if (!vibe || !key || !scale || !length) return null;
  if (bpm <= 0 || bpm > 1000) return null;

  const config = { name, vibe, key, scale, bpm, length };

  const instCount = r.u8();
  if (instCount === 0 || instCount > 16) return null;
  const instruments: number[][] = [];
  for (let k = 0; k < instCount; k++) {
    const len = r.u8();
    if (len === 0 || len > 24) return null;
    const mask = r.u8() | (r.u8() << 8) | (r.u8() << 16);
    const inst = new Array<number>(len).fill(0);
    for (let i = 0; i < len; i++) if (mask & (1 << i)) inst[i] = r.f64();
    if (r.overrun) return null;
    instruments.push(inst);
  }

  const patCount = r.u8();
  if (patCount === 0 || patCount > 26) return null;

  const patterns: Record<string, number[][]> = {};
  const patternRoles: Record<string, SectionRole> = {};
  const patternEffects: Record<string, unknown[]> = {};
  const patternOrder: string[] = [];

  for (let p = 0; p < patCount; p++) {
    const label = String.fromCharCode(r.u8());
    const role = ROLES[r.u8()] ?? 'verse';
    const chCount = r.u8();
    if (chCount === 0 || chCount > 8) return null;

    const channels: number[][] = [];
    for (let c = 0; c < chCount; c++) {
      const instrument = r.u8();
      const pan = r.u8() - 128;
      const noteCount = r.u8();
      if (noteCount > 64) return null;
      const ch = [instrument, pan];
      let acc = 0, bits = 0;
      for (let i = 0; i < noteCount; i++) {
        while (bits < NOTE_BITS) { acc = (acc << 8) | r.u8(); bits += 8; }
        bits -= NOTE_BITS;
        ch.push((acc >> bits) & MAX_NOTE_VALUE);
      }
      if (r.overrun) return null;
      channels.push(ch);
    }

    const fxChannels: (unknown | null)[][] = [];
    for (let c = 0; c < chCount; c++) {
      const hits = r.u8();
      if (hits > 32) return null;
      const arr = new Array<unknown | null>(32).fill(null);
      for (let h = 0; h < hits; h++) {
        const b = r.u8();
        const row = b >> 3;
        const code = EFFECT_CODES[b & 7];
        const value = r.u8();
        if (row < 32 && code) arr[row] = { code, value };
      }
      if (r.overrun) return null;
      fxChannels.push(arr);
    }

    patternOrder.push(label);
    patterns[label] = channels;
    patternRoles[label] = role;
    patternEffects[label] = fxChannels;
  }

  const seqCount = r.u8();
  if (seqCount === 0 || seqCount > 255) return null;
  const sequence: number[] = [];
  for (let i = 0; i < seqCount; i++) sequence.push(r.u8());
  if (r.overrun) return null;
  // An out-of-range index would render as nothing.
  if (!sequence.every((i) => i >= 0 && i < patternOrder.length)) return null;

  return {
    config,
    instruments,
    patterns,
    patternRoles,
    patternEffects,
    sequence,
    patternOrder,
  } as unknown as Song;
}

// --- transport -------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Compression Streams exist in every current browser but not in React Native. */
export function isShareSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function pipeThrough(
  stream: { writable: WritableStream; readable: ReadableStream },
  bytes: Uint8Array
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // A malformed payload makes these reject asynchronously. Swallow them here so
  // the failure surfaces once, from the read below, rather than escaping as an
  // unhandled rejection — which is exactly what a corrupt share link produces.
  void writer.write(bytes as unknown as BufferSource).catch(() => {});
  void writer.close().catch(() => {});
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    return await pipeThrough(new CompressionStream('deflate-raw'), bytes);
  } catch {
    return null;
  }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    return await pipeThrough(new DecompressionStream('deflate-raw'), bytes);
  } catch {
    return null;
  }
}

export async function songToShareCode(song: Song): Promise<string> {
  const packed = packSong(song);
  if (isShareSupported()) {
    const body = await deflate(packed);
    if (body) return toBase64Url(new Uint8Array([FLAG_DEFLATED, ...body]));
  }
  return toBase64Url(new Uint8Array([0, ...packed]));
}

export async function songFromShareCode(code: string): Promise<Song | null> {
  if (!code) return null;
  const raw = fromBase64Url(code);
  if (!raw || raw.length < 2) return null;

  const flags = raw[0];
  let body: Uint8Array = raw.slice(1);
  if (flags & FLAG_DEFLATED) {
    const out = await inflate(body);
    if (!out) return null;
    body = out;
  }
  try {
    return unpackSong(body);
  } catch {
    return null;
  }
}

/** Pull the share code out of a URL, if it carries one. */
export function shareCodeFromUrl(url: string): string | null {
  const q = url.indexOf('?');
  if (q < 0) return null;
  const search = url.slice(q + 1).split('#')[0];
  for (const pair of search.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    if (pair.slice(0, eq) === SHARE_PARAM) {
      try { return decodeURIComponent(pair.slice(eq + 1)); } catch { return null; }
    }
  }
  return null;
}

export async function songToShareUrl(song: Song, origin: string, pathname: string): Promise<string> {
  return `${origin}${pathname}?${SHARE_PARAM}=${await songToShareCode(song)}`;
}

/**
 * Same URL as sharing — the iframe's height is what selects the mini player.
 * Kept as its own function so callers read clearly at the call site.
 */
export async function songToEmbedUrl(song: Song, origin: string, pathname: string): Promise<string> {
  return songToShareUrl(song, origin, pathname);
}

/**
 * A paste-ready iframe. `allow="autoplay"` does not make it autoplay — nothing
 * here does — it grants the frame permission to start audio once the visitor
 * presses play, which a cross-origin frame is otherwise refused.
 */
export function embedSnippet(
  url: string,
  title: string,
  width: number = DEFAULT_EMBED_WIDTH,
  height: number = DEFAULT_EMBED_HEIGHT
): string {
  const safe = title.replace(/"/g, '&quot;');
  return (
    `<iframe src="${url}" width="${width}" height="${height}" frameborder="0" ` +
    `allow="autoplay" loading="lazy" title="${safe}"></iframe>`
  );
}

/** Whether the URL explicitly forces the mini player. */
export function isEmbedUrl(url: string): boolean {
  const q = url.indexOf('?');
  if (q < 0) return false;
  const search = url.slice(q + 1).split('#')[0];
  return search.split('&').some((pair) => {
    const [k, v] = pair.split('=');
    return k === EMBED_PARAM && v !== '0' && v !== 'false';
  });
}

/** The mini player shows when the frame is short, or when forced by the flag. */
export function shouldShowMiniPlayer(url: string, viewportHeight: number): boolean {
  return isEmbedUrl(url) || viewportHeight <= MINI_PLAYER_MAX_HEIGHT;
}
