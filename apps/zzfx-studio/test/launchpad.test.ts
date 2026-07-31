import test from 'node:test';
import assert from 'node:assert/strict';

import * as lpMod from '../src/engine/launchpad';
import * as noteEntryMod from '../src/engine/noteEntry';

const lp = (lpMod as any).default ?? lpMod;
const noteEntry = (noteEntryMod as any).default ?? noteEntryMod;

const GRID_ROWS = 8;

const hex = (bytes: Uint8Array | number[]) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');

/** The bytes a flush produced, as a plain array. */
function frame(surface: any): number[] {
  const n = surface.flush();
  return n === 0 ? [] : [...surface.bytes.subarray(0, n)];
}

// --- ports ------------------------------------------------------------------

test('the MIDI port is the one that carries programmer-mode lighting', () => {
  // The device exposes both; SysEx sent to the DAW pair is ignored.
  assert.equal(lp.isLaunchpadControlPort('LPMiniMK3 MIDI Out'), true);
  assert.equal(lp.isLaunchpadControlPort('LPMiniMK3 DAW Out'), false);
  assert.equal(lp.isLaunchpadControlPort('Launchpad Mini MK3 LPMiniMK3 MIDI In'), true);
});

test('other controllers are not mistaken for a Launchpad', () => {
  for (const name of ['IAC Driver Bus 1', 'Arturia KeyStep', 'Launchkey Mini MK3', '']) {
    assert.equal(lp.isLaunchpadPort(name), false, `matched ${name}`);
  }
});

// --- mode frames, byte for byte ---------------------------------------------

test('the mode frames match the reference manual exactly', () => {
  // F0 00 20 29 02 0D 0E <mode> F7
  assert.equal(hex(lp.PROGRAMMER_MODE_ON), 'f0 00 20 29 02 0d 0e 01 f7');
  assert.equal(hex(lp.PROGRAMMER_MODE_OFF), 'f0 00 20 29 02 0d 0e 00 f7');
});

// --- grid geometry ----------------------------------------------------------

test('pads are numbered in decimal, row 1 at the bottom', () => {
  assert.equal(lp.padIndex(1, 1), 11, 'bottom-left');
  assert.equal(lp.padIndex(1, 8), 18, 'bottom-right');
  assert.equal(lp.padIndex(8, 1), 81, 'top-left');
  assert.equal(lp.padIndex(8, 8), 88, 'top-right');
});

test('row and column read back out of a pad number', () => {
  for (let row = 1; row <= 8; row++) {
    for (let col = 1; col <= 8; col++) {
      const i = lp.padIndex(row, col);
      assert.equal(lp.padRow(i), row);
      assert.equal(lp.padCol(i), col);
      assert.equal(lp.isGridPad(i), true);
    }
  }
});

test('the control rows are addressable but are not grid pads', () => {
  for (const cc of [...lp.SCENE_CC, ...lp.TOP_CC, lp.LOGO_CC]) {
    assert.equal(lp.isGridPad(cc), false, `${cc} counted as a grid pad`);
    assert.equal(lp.isAddressable(cc), true, `${cc} not addressable`);
  }
});

test('column zero does not exist, and there are exactly 81 LEDs', () => {
  // The decimal scheme leaves gaps at 10, 20 … 90. Lighting them would push a
  // full repaint to 90 specs, past the 81 the device accepts.
  for (const gap of [10, 20, 30, 40, 50, 60, 70, 80, 90]) {
    assert.equal(lp.isAddressable(gap), false, `${gap} treated as an LED`);
  }
  let count = 0;
  for (let i = 0; i < 128; i++) if (lp.isAddressable(i)) count++;
  assert.equal(count, lp.MAX_SPECS_PER_FRAME);
  assert.equal(count, 81);
});

// --- colour packing ---------------------------------------------------------

test('theme colours survive the trip to 7-bit RGB', () => {
  // The whole reason for the RGB spec rather than the 128-entry palette: the
  // channel colours arrive exact rather than approximated.
  const cases: [string, number[]][] = [
    ['#4ADE80', [37, 111, 64]],   // LEAD
    ['#38BDF8', [28, 94, 124]],   // HARM
    ['#FACC15', [125, 102, 10]],  // BASS
    ['#F87171', [124, 56, 56]],   // DRUM
    ['#E8740E', [116, 58, 7]],    // cursor / playhead
  ];
  for (const [css, wire] of cases) {
    const s = new lp.LedSurface();
    s.flush();                       // absorb the initial blackout
    s.set(11, lp.rgbFromHex(css));
    assert.deepEqual(frame(s).slice(7, 12), [lp.LED_RGB, 11, ...wire], css);
  }
});

test('brightness scales without shifting hue', () => {
  const full = lp.rgbFromHex('#4ADE80');
  const half = lp.scaleRgb(full, 0.5);
  const s = new lp.LedSurface();
  s.flush();
  s.set(11, half);
  assert.deepEqual(frame(s).slice(7, 12), [lp.LED_RGB, 11, 18, 55, 32]);
});

test('scaling clamps rather than producing out-of-range bytes', () => {
  const c = lp.rgbFromHex('#FFFFFF');
  const s = new lp.LedSurface();
  s.flush();
  s.set(11, lp.scaleRgb(c, 4));
  assert.deepEqual(frame(s).slice(7, 12), [lp.LED_RGB, 11, 127, 127, 127]);
  assert.equal(lp.scaleRgb(c, -1) & 0xffffff, 0);
});

test('palette specs are left alone by the RGB scaler', () => {
  const pulse = lp.palettePulse(37);
  assert.equal(lp.scaleRgb(pulse, 0.5), pulse);
});

// --- the manual's worked examples -------------------------------------------

test("the manual's three-spec example reproduces byte for byte", () => {
  // From the Programmer's Reference: a static colour on 0Bh, a flash on 0Ch and
  // a pulse on 0Dh, in one frame.
  const s = new lp.LedSurface();
  s.flush();

  s.set(0x0b, lp.paletteStatic(0x0d));
  s.set(0x0c, lp.paletteFlash(0x17, 0x15)); // colour A 17h, colour B 15h
  s.set(0x0d, lp.palettePulse(0x25));

  assert.equal(
    hex(frame(s)),
    'f0 00 20 29 02 0d 03 00 0b 0d 01 0c 15 17 02 0d 25 f7'
  );
});

test('flashing transmits colour B before colour A, as the spec orders them', () => {
  const s = new lp.LedSurface();
  s.flush();
  s.set(11, lp.paletteFlash(0x15, 0x17));
  assert.deepEqual(frame(s).slice(7, 11), [lp.LED_FLASH, 11, 0x17, 0x15]);
});

test('a dark pad is static palette entry zero', () => {
  // Matches the manual's "90h 12h 00h turns the pad off", and means a zeroed
  // table is a dark grid with no special-casing.
  assert.equal(lp.OFF, 0);
  const s = new lp.LedSurface();
  s.flush();
  s.set(11, lp.rgbFromHex('#FFFFFF'));
  s.flush();
  s.set(11, lp.OFF);
  assert.deepEqual(frame(s).slice(7, 10), [lp.LED_STATIC, 11, 0]);
});

// --- the diff ---------------------------------------------------------------

test('the first flush blacks out every LED, and is a legal frame', () => {
  const s = new lp.LedSurface();
  const f = frame(s);
  // Header + command, 81 static specs of 3 bytes, terminator.
  assert.equal(f.length, 7 + 81 * 3 + 1);
  assert.equal(hex(f.slice(0, 7)), 'f0 00 20 29 02 0d 03');
  assert.equal(f.at(-1), 0xf7);
  assert.ok(f.length <= lp.MAX_FRAME_BYTES);
});

test('an unchanged surface sends nothing at all', () => {
  const s = new lp.LedSurface();
  s.flush();
  assert.equal(s.flush(), 0, 'a second flush produced a frame');
  s.set(11, lp.OFF); // writing the value already shown is not a change
  assert.equal(s.flush(), 0);
});

test('only the pads that moved are transmitted', () => {
  const s = new lp.LedSurface();
  s.flush();

  // A playhead step: sixteen pads change out of eighty-one.
  for (let col = 1; col <= 8; col++) {
    s.set(lp.padIndex(1, col), lp.rgbFromHex('#E8740E'));
    s.set(lp.padIndex(2, col), lp.OFF);
  }
  const f = frame(s);
  // Eight RGB specs at 5 bytes; the eight OFFs were already dark, so they are
  // not resent.
  assert.equal(f.length, 7 + 8 * 5 + 1);
  assert.ok(f.length < 100, `steady-state frame was ${f.length} bytes`);
});

test('a full repaint stays inside the 81-spec limit', () => {
  const s = new lp.LedSurface();
  s.flush();
  for (let i = 0; i < 100; i++) if (lp.isAddressable(i)) s.set(i, lp.rgbFromHex('#4ADE80'));
  const f = frame(s);
  assert.equal(f.length, lp.MAX_FRAME_BYTES);
  assert.equal(f.length, 413);
  assert.equal((f.length - 8) / 5, 81, 'more specs than the device accepts');
});

test('invalidate forces a repaint, because the device state is unknown then', () => {
  const s = new lp.LedSurface();
  s.flush();
  assert.equal(s.flush(), 0);
  s.invalidate();
  assert.ok(s.flush() > 0, 'a reconnected device would keep stale pads lit');
});

test('clear darkens everything that was lit', () => {
  const s = new lp.LedSurface();
  s.flush();
  s.set(11, lp.rgbFromHex('#4ADE80'));
  s.set(88, lp.rgbFromHex('#F87171'));
  s.flush();
  s.clear();
  const f = frame(s);
  assert.equal(f.length, 7 + 2 * 3 + 1, 'clear resent pads that were already dark');
});

test('flushing reuses one buffer, so a repaint allocates nothing', () => {
  const s = new lp.LedSurface();
  const buf = s.bytes;
  s.flush();
  for (let i = 0; i < 50; i++) {
    s.set(11, i % 2 ? lp.rgbFromHex('#4ADE80') : lp.OFF);
    s.flush();
  }
  assert.equal(s.bytes, buf, 'the frame buffer was reallocated');
  assert.equal(buf.length, lp.MAX_FRAME_BYTES);
});

test('send transmits only when something moved', () => {
  const sent: number[][] = [];
  const port = { send: (d: Uint8Array) => sent.push([...d]) };
  const s = new lp.LedSurface();

  assert.equal(s.send(port), true, 'the initial blackout was skipped');
  assert.equal(s.send(port), false, 'an idle surface still transmitted');
  assert.equal(sent.length, 1);

  s.set(11, lp.rgbFromHex('#4ADE80'));
  assert.equal(s.send(port), true);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].at(-1), 0xf7, 'frame was not terminated');
});

test('indices that are not LEDs are ignored rather than corrupting a frame', () => {
  const s = new lp.LedSurface();
  s.flush();
  for (const bad of [0, 10, 90, 100, 255, -1]) s.set(bad, lp.rgbFromHex('#FFFFFF'));
  assert.equal(s.flush(), 0, 'a non-LED index reached the wire');
});

// --- layouts ----------------------------------------------------------------

test('quadrants carry the four channels', () => {
  //  ┌───────┬───────┐
  //  │ LEAD  │ HARM  │  rows 5-8
  //  ├───────┼───────┤
  //  │ BASS  │ DRUM  │  rows 1-4
  //  └───────┴───────┘
  assert.equal(lp.padChannel(lp.padIndex(8, 1)), 0, 'top-left is LEAD');
  assert.equal(lp.padChannel(lp.padIndex(5, 4)), 0);
  assert.equal(lp.padChannel(lp.padIndex(8, 8)), 1, 'top-right is HARM');
  assert.equal(lp.padChannel(lp.padIndex(1, 1)), 2, 'bottom-left is BASS');
  assert.equal(lp.padChannel(lp.padIndex(1, 8)), 3, 'bottom-right is DRUM');
  assert.equal(lp.padChannel(lp.LOGO_CC), null, 'the logo is not in a quadrant');
});

test('every grid pad belongs to exactly one quadrant, sixteen each', () => {
  const tally = [0, 0, 0, 0];
  for (let row = 1; row <= 8; row++) {
    for (let col = 1; col <= 8; col++) {
      const ch = lp.padChannel(lp.padIndex(row, col));
      assert.ok(ch !== null && ch >= 0 && ch <= 3);
      tally[ch]++;
    }
  }
  assert.deepEqual(tally, [16, 16, 16, 16]);
});

test('KEYS ascends left to right then upward within a quadrant', () => {
  const table = lp.buildKeysLayout('C', 'major');
  // Bottom-left of the BASS quadrant is the lowest degree it holds.
  const first = table[lp.padIndex(1, 1)];
  assert.ok(first > 0, 'the first degree was unmapped');
  assert.ok(table[lp.padIndex(1, 2)] > first, 'moving right did not go up');
  assert.ok(table[lp.padIndex(2, 1)] > table[lp.padIndex(1, 4)], 'the row wrap went backwards');
});

test('the quadrants hold the same note values, so each plays in its own register', () => {
  // A note value is relative to its channel's tuning, so identical tables mean
  // the same pad sounds an octave lower on the C3-tuned bass than on the lead.
  // That is the split we want, not a bug — the bass part belongs down there.
  const table = lp.buildKeysLayout('C', 'major');
  for (let row = 1; row <= 4; row++) {
    for (let col = 1; col <= 4; col++) {
      const bass = table[lp.padIndex(row, col)];
      assert.equal(table[lp.padIndex(row + 4, col)], bass, 'LEAD quadrant differs');
      assert.equal(table[lp.padIndex(row, col + 4)], bass, 'DRUM quadrant differs');
      assert.equal(table[lp.padIndex(row + 4, col + 4)], bass, 'HARM quadrant differs');
    }
  }
});

test('KEYS only ever produces playable notes', () => {
  for (const key of ['C', 'F#', 'A']) {
    for (const scale of ['major', 'minor']) {
      const table = lp.buildKeysLayout(key as any, scale as any);
      for (let i = 0; i < 100; i++) {
        const n = table[i];
        if (n < 0) continue;
        assert.ok(n >= 1 && n <= 48, `${key} ${scale} pad ${i} produced ${n}`);
        assert.ok(lp.isGridPad(i), `${key} ${scale} mapped a note onto CC ${i}`);
      }
    }
  }
});

test('the key changes what the pads play', () => {
  const c = lp.buildKeysLayout('C', 'major');
  const d = lp.buildKeysLayout('D', 'major');
  assert.notDeepEqual([...c], [...d]);

  // Not at the lowest pads, though. In the default C4 tuning a C3 tonic encodes
  // to ZzFXM note 0, the rest sentinel, so getScaleNotes drops it and both
  // scales open on D3 — then share E3. They first part at the third pad, F
  // natural against F sharp. Pads agreeing there is correct, not a collision.
  assert.equal(c[lp.padIndex(1, 1)], d[lp.padIndex(1, 1)], 'both open on D3');
  assert.equal(c[lp.padIndex(1, 2)], d[lp.padIndex(1, 2)], 'both hold E3');
  assert.equal(c[lp.padIndex(1, 3)], 5, 'C major takes F natural');
  assert.equal(d[lp.padIndex(1, 3)], 6, 'D major takes F sharp');
});

test('DRUMS lays out every distinct drum sound exactly once', () => {
  const table = lp.DRUMS_LAYOUT;
  const seen = new Map<number, number>();
  for (let i = 0; i < 100; i++) {
    const n = table[i];
    if (n < 0) continue;
    assert.ok(lp.isGridPad(i), `a drum landed on CC ${i}`);
    assert.equal(seen.has(n), false, `note ${n} appears twice`);
    seen.set(n, i);
  }
  // Every note in every voice's range is reachable.
  const total = noteEntry.DRUM_RANGES.reduce(
    (sum: number, r: any) => sum + (r.max - r.min + 1),
    0
  );
  assert.equal(seen.size, total, 'some drum sound has no pad');
  for (const range of noteEntry.DRUM_RANGES) {
    for (let n = range.min; n <= range.max; n++) {
      assert.ok(seen.has(n), `${range.name} note ${n} is unreachable`);
    }
  }
});

test('each drum voice starts on a fresh row, so the zones read by position', () => {
  const table = lp.DRUMS_LAYOUT;
  const rowOfFirst = (min: number) => {
    for (let i = 0; i < 100; i++) if (table[i] === min) return lp.padRow(i);
    return -1;
  };
  const rows: number[] = noteEntry.DRUM_RANGES.map((r: any) => rowOfFirst(r.min));
  assert.deepEqual(rows, [1, 2, 4], 'KCK / SNR / HAT should begin on rows 1, 2 and 4');
  // Each voice therefore occupies a contiguous band with no other voice in it.
  for (const [i, range] of noteEntry.DRUM_RANGES.entries()) {
    const used: number[] = [];
    for (let j = 0; j < 100; j++) {
      if (table[j] >= range.min && table[j] <= range.max) used.push(lp.padRow(j));
    }
    const nextRow: number = rows[i + 1] ?? GRID_ROWS + 1;
    assert.ok(Math.max(...used) < nextRow, `${range.name} overlaps the next voice`);
  }
});

// --- session ----------------------------------------------------------------

test('SESSION puts channels in columns and patterns in rows', () => {
  // Row 8 is the first pattern, so the grid reads downward like the app's list.
  assert.deepEqual(lp.sessionCell(lp.padIndex(8, 1)), { channel: 0, pattern: 0 });
  assert.deepEqual(lp.sessionCell(lp.padIndex(8, 4)), { channel: 3, pattern: 0 });
  assert.deepEqual(lp.sessionCell(lp.padIndex(1, 1)), { channel: 0, pattern: 7 });
  assert.equal(lp.sessionCell(lp.padIndex(8, 5)), null, 'columns 5-8 are unassigned');
});

test('session cells round-trip through their pad', () => {
  for (let channel = 0; channel < 4; channel++) {
    for (let pattern = 0; pattern < 8; pattern++) {
      const pad = lp.sessionPad(channel, pattern);
      assert.ok(pad !== null);
      assert.deepEqual(lp.sessionCell(pad), { channel, pattern });
    }
  }
  assert.equal(lp.sessionPad(4, 0), null, 'there is no fifth channel');
  assert.equal(lp.sessionPad(0, 8), null, 'there is no ninth row');
});

test('the scene column launches whole patterns, top to bottom', () => {
  assert.equal(lp.sceneCcToPattern(89), 0, 'the top scene is the first pattern');
  assert.equal(lp.sceneCcToPattern(19), 7, 'the bottom scene is the last');
  assert.equal(lp.sceneCcToPattern(99), null, 'the logo is not a scene');
  assert.equal(lp.sceneCcToPattern(11), null, 'a grid pad is not a scene');
});
