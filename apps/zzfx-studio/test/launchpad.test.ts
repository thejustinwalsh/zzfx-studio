import test from 'node:test';
import assert from 'node:assert/strict';

import * as lpMod from '../src/engine/launchpad';

const lp = (lpMod as any).default ?? lpMod;

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

test('every model reaches programmer mode the way its manual says', () => {
  // The Mini and X have a dedicated Live/Programmer toggle. The Pro has none:
  // Programmer is layout 11h, selected like any other, and standalone returns
  // to Note/Drum because Session is DAW-mode only. Sending the Mini's toggle
  // to a Pro would silently do nothing at all.
  const byId = (id: string) => lp.LAUNCHPAD_MODELS.find((m: any) => m.id === id);

  assert.equal(hex(lp.programmerModeOn(byId('mini-mk3'))), 'f0 00 20 29 02 0d 0e 01 f7');
  assert.equal(hex(lp.programmerModeOff(byId('mini-mk3'))), 'f0 00 20 29 02 0d 0e 00 f7');
  assert.equal(hex(lp.programmerModeOn(byId('x'))), 'f0 00 20 29 02 0c 0e 01 f7');
  assert.equal(hex(lp.programmerModeOff(byId('x'))), 'f0 00 20 29 02 0c 0e 00 f7');
  assert.equal(hex(lp.programmerModeOn(byId('pro-mk3'))), 'f0 00 20 29 02 0e 00 11 00 00 f7');
  assert.equal(hex(lp.programmerModeOff(byId('pro-mk3'))), 'f0 00 20 29 02 0e 00 04 00 00 f7');
});

test('the device id is the only thing that differs in the header', () => {
  for (const m of lp.LAUNCHPAD_MODELS) {
    assert.deepEqual(lp.sysexHeader(m).slice(0, 5), [0xf0, 0x00, 0x20, 0x29, 0x02], m.name);
    assert.equal(lp.sysexHeader(m)[5], m.deviceId, m.name);
  }
  assert.deepEqual(lp.LAUNCHPAD_MODELS.map((m: any) => m.deviceId), [0x0d, 0x0c, 0x0e]);
});

test('every model is identified from its own port', () => {
  for (const [port, id] of [['LPMiniMK3 MIDI Out', 'mini-mk3'], ['LPX MIDI Out', 'x'], ['LPProMK3 MIDI Out', 'pro-mk3']] as const) {
    assert.equal(lp.modelForPort(port)?.id, id, port);
    assert.equal(lp.isLaunchpadControlPort(port), true, port);
  }
  assert.equal(lp.modelForPort('Arturia KeyStep'), null);
});

test('the DAW and DIN interfaces are refused on every model', () => {
  // Each model exposes a DAW pair that ignores our SysEx; the Pro adds a DIN
  // pair for its sockets. Taking one connects to a device that never lights.
  for (const port of ['LPMiniMK3 DAW Out', 'LPX DAW Out', 'LPProMK3 DAW Out', 'LPProMK3 DIN Out']) {
    assert.equal(lp.isLaunchpadPort(port), true, `${port} is still a Launchpad`);
    assert.equal(lp.isLaunchpadControlPort(port), false, `${port} must not be used for control`);
  }
});

test('the LED frame header follows the model', () => {
  for (const m of lp.LAUNCHPAD_MODELS) {
    const surf = new lp.LedSurface(m);
    assert.ok(surf.flush() > 0);
    assert.equal(
      hex([...surf.bytes.subarray(0, 7)]),
      `f0 00 20 29 02 ${m.deviceId.toString(16).padStart(2, '0')} 03`,
      m.name
    );
  }
});

test("layouts sit on each model's own printed buttons", () => {
  const byId = (id: string) => lp.LAUNCHPAD_MODELS.find((m: any) => m.id === id);
  assert.deepEqual(byId('mini-mk3').layoutButtons, { SESSION: 95, DRUMS: 96, KEYS: 97 });
  // The X reads Session, Note, Custom — Note is the melodic one, so KEYS moves.
  assert.deepEqual(byId('x').layoutButtons, { SESSION: 95, KEYS: 96, DRUMS: 97 });

  for (const m of lp.LAUNCHPAD_MODELS) {
    const ccs = Object.values(m.layoutButtons) as number[];
    assert.equal(new Set(ccs).size, 3, `${m.name} reuses a button`);
    for (const cc of ccs) {
      assert.ok((lp.TOP_CC as readonly number[]).includes(cc), `${m.name}: ${cc} is not top-row`);
      assert.equal((lp.ARROW_CC as readonly number[]).includes(cc), false, `${m.name} put a layout on an arrow`);
    }
  }
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

test('a steady-state repaint allocates nothing, send() included', () => {
  // The earlier version of this test only checked that `bytes` kept its
  // identity and never called send() -- where subarray() was allocating a view
  // every frame. It passed while the property it claimed was false.
  const s = new lp.LedSurface();
  const buf = s.bytes;
  const sent: unknown[] = [];
  const port = { send: (d: Uint8Array) => sent.push(d) };

  s.send(port);                       // initial blackout
  const firstView = sent[0];

  // A playhead-shaped change: the same eight pads move each step, so every
  // frame after the first has the same length.
  for (let i = 0; i < 50; i++) {
    for (let col = 1; col <= 8; col++) {
      s.set(lp.padIndex(1, col), i % 2 ? lp.rgbFromHex('#E8740E') : lp.OFF);
    }
    s.send(port);
  }

  assert.equal(s.bytes, buf, 'the frame buffer was reallocated');
  // Lit frames carry five-byte RGB specs and dark frames three-byte palette
  // specs, so the loop alternates between exactly two lengths. Two views for
  // fifty frames means the steady state stopped allocating after the first of
  // each; the previous code produced fifty.
  const views = new Set(sent.slice(1));
  assert.ok(views.size <= 2, `send() allocated ${views.size} views across 50 frames of 2 lengths`);
  assert.notEqual(sent[1], firstView, 'the blackout is a different length, so a different view');
  assert.equal((sent[1] as Uint8Array).buffer, buf.buffer, 'the view must window the same memory, not copy');
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
      assert.equal(table[lp.padIndex(row + 4, col + 4)], bass, 'HARM quadrant differs');
      // The drum quadrant is a kit, not a scale — it holds no melodic notes.
      assert.equal(table[lp.padIndex(row, col + 4)], -1, 'the drum quadrant was given scale notes');
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

test('the drum kit is the sounds the generator actually writes', () => {
  // Not one pad per note value: that gave 6 kicks, 16 snares and 26 hi-hats
  // separated only by pitch, none of which matched a generated song.
  assert.equal(lp.DRUM_VARIANTS.length, 12, 'three voices times four variants');
  assert.deepEqual(
    lp.DRUM_VARIANTS.map((v: any) => v.label),
    [
      'KCK', 'KCK PD60', 'KCK PDA0', 'KCK BC18',
      'SNR', 'SNR PD60', 'SNR PDA0', 'SNR BC18',
      'HAT', 'HAT PD60', 'HAT PDA0', 'HAT BC18',
    ]
  );
});

test('every pad effect comes from the generator\'s own drum pool', () => {
  // CHANNEL_FX_POOLS[3] is ['PD','BC'] — punch kicks, crunch snares. A pad that
  // offered anything else would play a sound no generated song contains.
  for (const v of lp.DRUM_VARIANTS) {
    if (!v.effect) continue;
    assert.ok(['PD', 'BC'].includes(v.effect.code), `${v.label} uses ${v.effect.code}`);
    assert.ok(v.effect.value >= 0 && v.effect.value <= 0xff, `${v.label} value out of range`);
  }
});

test('each voice offers its raw form first, then its effects', () => {
  for (let v = 0; v < 3; v++) {
    const row = lp.DRUM_VARIANTS.slice(v * 4, v * 4 + 4);
    assert.equal(row[0].effect, null, `${row[0].label} should be the raw voice`);
    assert.ok(row.slice(1).every((x: any) => x.effect), 'the rest should carry effects');
    assert.ok(row.every((x: any) => x.note === row[0].note), 'a row is one voice');
  }
});

test('the kit sits bottom-left in DRUMS and in the drum quadrant in KEYS', () => {
  // Same kit in both, so there is one thing to learn rather than two.
  for (let v = 0; v < 3; v++) {
    for (let c = 0; c < 4; c++) {
      const idx = v * 4 + c;
      assert.equal(lp.DRUMS_LAYOUT[lp.padIndex(1 + v, 1 + c)], idx, 'DRUMS placement');
      assert.equal(lp.KEYS_DRUM_LAYOUT[lp.padIndex(1 + v, 5 + c)], idx, 'KEYS quadrant placement');
    }
  }
  // Rows above the kit are dark rather than holding something arbitrary.
  for (let row = 4; row <= 8; row++) {
    assert.equal(lp.DRUMS_LAYOUT[lp.padIndex(row, 1)], -1, `row ${row} should be dark`);
  }
});

test('voices run upward, so higher on the grid is higher in pitch', () => {
  const noteAt = (row: number) => lp.DRUM_VARIANTS[lp.DRUMS_LAYOUT[lp.padIndex(row, 1)]].note;
  assert.ok(noteAt(1) < noteAt(2), 'kick should sit below snare');
  assert.ok(noteAt(2) < noteAt(3), 'snare should sit below hat');
});

test('the scene column arms channels, one per tracker channel', () => {
  assert.deepEqual([...lp.ARM_CC], [89, 79, 69, 59], 'top four, in channel order downward');
  for (let ch = 0; ch < 4; ch++) assert.equal(lp.armCcToChannel(lp.ARM_CC[ch]), ch);
  assert.equal(lp.armCcToChannel(49), null, 'the lower half arms nothing');
  assert.equal(lp.armCcToChannel(99), null, 'the logo is not an arm button');
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
