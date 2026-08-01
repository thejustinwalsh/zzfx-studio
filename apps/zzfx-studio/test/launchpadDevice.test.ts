import test from 'node:test';
import assert from 'node:assert/strict';

import * as lpMod from '../src/engine/launchpad';
import * as devMod from '../src/engine/launchpadDevice';

const lp = (lpMod as any).default ?? lpMod;
const dev = (devMod as any).default ?? devMod;

const tables = (layout: string, octave = 4) => dev.layoutTables(layout, 'C', 'major', octave);

const KEYS = tables('KEYS');
const DRUMS = tables('DRUMS');
const SESSION = tables('SESSION');

const baseState = (over: Record<string, unknown> = {}) => ({
  layout: 'KEYS',
  armed: [false, false, false, false],
  held: new Set<number>(),
  keys: KEYS.keys,
  patternCount: 4,
  activePattern: 0,
  queuedPattern: null,
  patternFill: [],
  octave: 4,
  ...over,
});

/** Every cell the surface currently wants, keyed by index. */
function lit(surface: any): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 0; i < 100; i++) {
    if (!lp.isAddressable(i)) continue;
    const cell = surface.get(i);
    if (cell !== lp.OFF) out.set(i, cell);
  }
  return out;
}

// --- decoding ---------------------------------------------------------------

test('a pad press decodes to its channel and note', () => {
  const pad = lp.padIndex(1, 1); // bottom-left, BASS quadrant
  const e = dev.decodeLaunchpad([0x90, pad, 100], KEYS);
  assert.equal(e.kind, 'pad');
  assert.equal(e.pressed, true);
  assert.equal(e.velocity, 100);
  assert.equal(e.channel, 2, 'bottom-left is the BASS quadrant');
  assert.equal(e.note, KEYS.keys[pad]);
});

test('release arrives as note-on with zero velocity, and as note-off', () => {
  const pad = lp.padIndex(1, 1);
  assert.equal(dev.decodeLaunchpad([0x90, pad, 0], KEYS).pressed, false);
  assert.equal(dev.decodeLaunchpad([0x80, pad, 64], KEYS).pressed, false);
});

test('each quadrant reports its own channel', () => {
  const expected: [number, number, number][] = [
    [8, 1, 0], // LEAD
    [8, 8, 1], // HARM
    [1, 1, 2], // BASS
    [1, 8, 3], // DRUM
  ];
  for (const [row, col, channel] of expected) {
    const e = dev.decodeLaunchpad([0x90, lp.padIndex(row, col), 64], KEYS);
    assert.equal(e.channel, channel, `pad ${row},${col}`);
  }
});

test('a drum pad carries its effect, not just its note', () => {
  // The whole point of the kit: the pad plays a sound the generator writes, and
  // recording it stores the note and the effect the grid already understands.
  const raw = dev.decodeLaunchpad([0x90, lp.padIndex(1, 1), 64], DRUMS);
  assert.equal(raw.channel, 3);
  assert.equal(raw.note, lp.DRUM_VARIANTS[0].note);
  assert.equal(raw.effect, null, 'column one is the raw voice');

  const crunch = dev.decodeLaunchpad([0x90, lp.padIndex(1, 4), 64], DRUMS);
  assert.deepEqual(crunch.effect, { code: 'BC', value: 0x18 });
  assert.equal(crunch.note, raw.note, 'same voice, different treatment');
});

test('the drum quadrant in KEYS plays the kit, not scale degrees', () => {
  // Bottom-right quadrant. It used to be handed scale notes, which produced
  // sixteen drums pitched by a scale that has nothing to do with percussion.
  const pad = lp.padIndex(1, 5);
  const e = dev.decodeLaunchpad([0x90, pad, 64], KEYS);
  assert.equal(e.channel, 3, 'the drum quadrant should address drums');
  assert.equal(e.note, lp.DRUM_VARIANTS[0].note);
  assert.equal(KEYS.keys[pad], -1, 'no melodic note should be mapped there');
});

test('the other three quadrants stay melodic in KEYS', () => {
  for (const [row, col, ch] of [[8, 1, 0], [8, 8, 1], [1, 1, 2]] as const) {
    const e = dev.decodeLaunchpad([0x90, lp.padIndex(row, col), 64], KEYS);
    assert.equal(e.channel, ch);
    assert.equal(e.effect, null, 'melodic pads carry no baked effect');
  }
});

test('the scene column arms in KEYS and DRUMS, and launches in SESSION', () => {
  for (const t of [KEYS, DRUMS]) {
    const e = dev.decodeLaunchpad([0xb0, lp.ARM_CC[2], 127], t);
    assert.equal(e.kind, 'arm', `${t.layout} should arm`);
    assert.equal(e.channel, 2, 'third button is BASS');
  }
  const s = dev.decodeLaunchpad([0xb0, lp.ARM_CC[0], 127], SESSION);
  assert.equal(s.kind, 'scene', 'SESSION keeps the hardware scene-launch meaning');
});

test('arm buttons light in their channel colour, brighter when armed', () => {
  const s = new lp.LedSurface();
  dev.renderLaunchpad(s, baseState({ layout: 'KEYS', armed: [true, false, false, false] }));
  assert.equal(s.get(lp.ARM_CC[0]), lp.scaleRgb(dev.CHANNEL_CELLS[0], dev.LEVEL_ACTIVE));
  assert.equal(s.get(lp.ARM_CC[1]), lp.scaleRgb(dev.CHANNEL_CELLS[1], dev.LEVEL_IDLE));
});

test('an unmapped pad is silent rather than playing something arbitrary', () => {
  // Row 8 is past the end of the drum layout.
  const pad = lp.padIndex(8, 8);
  assert.equal(lp.DRUMS_LAYOUT[pad], -1, 'the fixture pad is unexpectedly mapped');
  assert.equal(dev.decodeLaunchpad([0x90, pad, 64], DRUMS), null);
});

test('SESSION pads report a channel and a pattern, not a note', () => {
  const e = dev.decodeLaunchpad([0x90, lp.padIndex(8, 1), 64], SESSION);
  assert.equal(e.channel, 0);
  assert.equal(e.pattern, 0);
  assert.equal(e.note, null);
  assert.equal(dev.decodeLaunchpad([0x90, lp.padIndex(8, 5), 64], SESSION), null,
    'columns 5-8 are unassigned in SESSION');
});

test('the scene column and top row arrive as control changes', () => {
  const scene = dev.decodeLaunchpad([0xb0, 89, 127], SESSION);
  assert.equal(scene.kind, 'scene');
  assert.equal(scene.pattern, 0);

  const top = dev.decodeLaunchpad([0xb0, 91, 127], SESSION);
  assert.equal(top.kind, 'top');

  const logo = dev.decodeLaunchpad([0xb0, 99, 127], SESSION);
  assert.equal(logo.kind, 'logo');
});

test('a control change that is not one of ours is ignored', () => {
  // CC 7 is volume; the device never sends it, but a merged port might.
  assert.equal(dev.decodeLaunchpad([0xb0, 7, 100], KEYS), null);
});

test('clock, aftertouch and truncated messages are ignored', () => {
  for (const msg of [[0xf8], [0xa0, 11, 64], [0xe0, 0, 64], [0x90, 11], []]) {
    assert.equal(dev.decodeLaunchpad(msg, KEYS), null, `accepted ${JSON.stringify(msg)}`);
  }
});

test('every decoded note is playable', () => {
  for (const t of [KEYS, DRUMS]) {
    for (let i = 0; i < 128; i++) {
      const e = dev.decodeLaunchpad([0x90, i, 64], t);
      if (!e || e.note === null) continue;
      assert.ok(e.note >= 1 && e.note <= 48, `pad ${i} produced note ${e.note}`);
      assert.ok(e.channel !== null && e.channel >= 0 && e.channel <= 3);
    }
  }
});

// --- rendering --------------------------------------------------------------

test('layouts live on the buttons the hardware prints them on', () => {
  // The Mini MK3's top row is  ↑ ↓ ← →  Session Drums Keys User.  Driving
  // layouts from the arrows made every printed label on the device a lie.
  assert.deepEqual(
    [lp.CC_UP, lp.CC_DOWN, lp.CC_LEFT, lp.CC_RIGHT],
    [91, 92, 93, 94],
    'the arrows are the first four top-row CCs'
  );
  assert.deepEqual(
    [lp.CC_SESSION, lp.CC_DRUMS, lp.CC_KEYS, lp.CC_USER],
    [95, 96, 97, 98],
    'the named mode buttons follow them'
  );

  for (const cc of [lp.CC_SESSION, lp.CC_DRUMS, lp.CC_KEYS]) {
    const e = dev.decodeLaunchpad([0xb0, cc, 127], SESSION);
    assert.equal(e.kind, 'top', `CC ${cc} did not decode as a top-row press`);
    assert.equal(e.index, cc);
  }
});

test('the top row shows which layout is active', () => {
  const s = new lp.LedSurface();
  dev.renderLaunchpad(s, baseState({ layout: 'KEYS' }));
  const bright = lp.scaleRgb(dev.CURSOR_CELL, dev.LEVEL_ACTIVE);
  const dim = lp.scaleRgb(dev.CURSOR_CELL, dev.LEVEL_IDLE);
  assert.equal(s.get(lp.CC_KEYS), bright, 'KEYS should be lit');
  assert.equal(s.get(lp.CC_SESSION), dim, 'SESSION should be dim');
  assert.equal(s.get(lp.CC_DRUMS), dim, 'DRUMS should be dim');
});

test('no layout is bound to an arrow', () => {
  const s = new lp.LedSurface();
  for (const layout of ['SESSION', 'KEYS', 'DRUMS']) {
    dev.renderLaunchpad(s, baseState({ layout }));
    const active = lp.scaleRgb(dev.CURSOR_CELL, dev.LEVEL_ACTIVE);
    for (const arrow of [lp.CC_LEFT, lp.CC_RIGHT]) {
      assert.notEqual(s.get(arrow), active, `${layout} lit an arrow as if it were its button`);
    }
  }
});

test('the octave arrows dim at the ends of the range', () => {
  const s = new lp.LedSurface();
  const lit = lp.scaleRgb(dev.CURSOR_CELL, dev.LEVEL_PRESENT);
  const dim = lp.scaleRgb(dev.CURSOR_CELL, dev.LEVEL_IDLE);

  dev.renderLaunchpad(s, baseState({ octave: 5 }));
  assert.equal(s.get(lp.CC_UP), lit, 'up should be lit mid-range');
  assert.equal(s.get(lp.CC_DOWN), lit, 'down should be lit mid-range');

  dev.renderLaunchpad(s, baseState({ octave: 3 }));
  assert.equal(s.get(lp.CC_DOWN), dim, 'down should dim at the floor');
  assert.equal(s.get(lp.CC_UP), lit);

  dev.renderLaunchpad(s, baseState({ octave: 7 }));
  assert.equal(s.get(lp.CC_UP), dim, 'up should dim at the ceiling');
  assert.equal(s.get(lp.CC_DOWN), lit);
});

test('the octave shifts what the KEYS pads play', () => {
  const low = dev.layoutTables('KEYS', 'C', 'major', 4);
  const high = dev.layoutTables('KEYS', 'C', 'major', 5);
  const pad = lp.padIndex(1, 1);
  assert.equal(high.keys[pad] - low.keys[pad], 12, 'an octave up should be twelve semitones');
});

test('an armed channel is brighter than an idle one', () => {
  const s = new lp.LedSurface();
  dev.renderLaunchpad(s, baseState({ armed: [true, false, false, false] }));
  const lead = s.get(lp.padIndex(8, 1));
  const harm = s.get(lp.padIndex(8, 8));
  assert.equal(lead, lp.scaleRgb(dev.CHANNEL_CELLS[0], dev.LEVEL_PRESENT));
  assert.equal(harm, lp.scaleRgb(dev.CHANNEL_CELLS[1], dev.LEVEL_IDLE));
});

test('a held pad lights full under the finger', () => {
  const pad = lp.padIndex(8, 1);
  const s = new lp.LedSurface();
  dev.renderLaunchpad(s, baseState({ held: new Set([pad]) }));
  assert.equal(s.get(pad), lp.scaleRgb(dev.CHANNEL_CELLS[0], dev.LEVEL_ACTIVE));
});

test('every quadrant keeps its own hue at every brightness', () => {
  // Colour is identity; state is brightness. Mixing the two would make the
  // grid unreadable for anyone relying on hue to tell channels apart.
  const s = new lp.LedSurface();
  dev.renderLaunchpad(s, baseState({ armed: [true, false, true, false] }));
  for (const [row, col, ch] of [[8, 1, 0], [8, 8, 1], [1, 1, 2], [1, 8, 3]] as const) {
    const cell = s.get(lp.padIndex(row, col));
    const full = dev.CHANNEL_CELLS[ch];
    // Same hue means the scaled components stay in the original proportion.
    const ratio = ((cell >> 16) & 0xff) / (((full >> 16) & 0xff) || 1);
    assert.ok(
      Math.abs(((cell >> 8) & 0xff) - ((full >> 8) & 0xff) * ratio) <= 1,
      `channel ${ch} shifted hue`
    );
  }
});

test('DRUMS leaves pads with no sound behind them dark', () => {
  const s = new lp.LedSurface();
  dev.renderLaunchpad(s, baseState({ layout: 'DRUMS' }));
  for (let i = 0; i < 100; i++) {
    if (!lp.isGridPad(i)) continue;
    if (lp.DRUMS_LAYOUT[i] < 0) {
      assert.equal(s.get(i), lp.OFF, `pad ${i} lit with no sound behind it`);
    } else {
      assert.notEqual(s.get(i), lp.OFF, `drum pad ${i} was dark`);
    }
  }
});

test('SESSION shows the playing pattern brightest and empty cells dimmest', () => {
  const s = new lp.LedSurface();
  dev.renderLaunchpad(s, baseState({
    layout: 'SESSION',
    patternCount: 2,
    activePattern: 1,
    patternFill: [[true, false, false, false], [false, false, false, false]],
  }));
  const active = s.get(lp.sessionPad(0, 1));
  const filled = s.get(lp.sessionPad(0, 0));
  const empty = s.get(lp.sessionPad(1, 0));
  assert.equal(active, lp.scaleRgb(dev.CHANNEL_CELLS[0], dev.LEVEL_ACTIVE));
  assert.equal(filled, lp.scaleRgb(dev.CHANNEL_CELLS[0], dev.LEVEL_PRESENT));
  assert.equal(empty, lp.scaleRgb(dev.CHANNEL_CELLS[1], dev.LEVEL_IDLE));
});

test('a queued pattern pulses, which the device syncs to the beat', () => {
  const s = new lp.LedSurface();
  dev.renderLaunchpad(s, baseState({ layout: 'SESSION', patternCount: 4, queuedPattern: 2 }));
  assert.equal(s.get(lp.SCENE_CC[2]), lp.palettePulse(dev.QUEUED_PALETTE));
  // And it is a pulse spec on the wire, not an RGB one.
  s.flush();
  s.invalidate();
  const n = s.flush();
  const bytes = [...s.bytes.subarray(0, n)];
  const at = bytes.indexOf(lp.SCENE_CC[2]);
  assert.equal(bytes[at - 1], lp.LED_PULSE);
  assert.equal(bytes[at + 1], dev.QUEUED_PALETTE);
});

test('patterns the song does not have stay dark', () => {
  const s = new lp.LedSurface();
  dev.renderLaunchpad(s, baseState({ layout: 'SESSION', patternCount: 2, patternFill: [] }));
  assert.equal(s.get(lp.sessionPad(0, 5)), lp.OFF, 'a nonexistent pattern was lit');
  assert.equal(s.get(lp.SCENE_CC[5]), lp.OFF);
});

test('rendering the same state twice sends nothing the second time', () => {
  const s = new lp.LedSurface();
  const state = baseState({ armed: [true, false, false, false] });
  dev.renderLaunchpad(s, state);
  s.flush();
  dev.renderLaunchpad(s, state);
  assert.equal(s.flush(), 0, 'an idle repaint reached the wire');
});

test('a repaint never exceeds what the device accepts', () => {
  for (const layout of ['SESSION', 'KEYS', 'DRUMS']) {
    const s = new lp.LedSurface();
    dev.renderLaunchpad(s, baseState({
      layout,
      patternCount: 8,
      patternFill: Array.from({ length: 8 }, () => [true, true, true, true]),
    }));
    const n = s.flush();
    assert.ok(n <= lp.MAX_FRAME_BYTES, `${layout} produced ${n} bytes`);
    assert.ok(lit(s).size <= lp.MAX_SPECS_PER_FRAME, `${layout} lit ${lit(s).size} LEDs`);
  }
});

// --- ports ------------------------------------------------------------------

const port = (name: string) => ({ name, id: name, state: 'connected' });

test('the MIDI pair is chosen over the DAW pair', () => {
  const access = {
    inputs: new Map([
      ['a', port('LPMiniMK3 DAW In')],
      ['b', port('LPMiniMK3 MIDI In')],
    ]),
    outputs: new Map([
      ['c', port('LPMiniMK3 DAW Out')],
      ['d', port('LPMiniMK3 MIDI Out')],
    ]),
  };
  const found = dev.findLaunchpadPorts(access);
  assert.equal(found.input.name, 'LPMiniMK3 MIDI In');
  assert.equal(found.output.name, 'LPMiniMK3 MIDI Out');
});

test('no Launchpad means no ports, rather than grabbing another controller', () => {
  const access = {
    inputs: new Map([['a', port('Arturia KeyStep')]]),
    outputs: new Map([['b', port('Arturia KeyStep')]]),
  };
  assert.equal(dev.findLaunchpadPorts(access), null);
});

test('an input without a matching output is not a usable device', () => {
  // Lighting needs the output half; half a pair would connect and never light.
  const access = {
    inputs: new Map([['a', port('LPMiniMK3 MIDI In')]]),
    outputs: new Map(),
  };
  assert.equal(dev.findLaunchpadPorts(access), null);
});

test('the kit lights in both layouts, and only where it exists', () => {
  for (const layout of ['DRUMS', 'KEYS']) {
    const s = new lp.LedSurface();
    dev.renderLaunchpad(s, baseState({ layout, armed: [false, false, false, true] }));
    const table = layout === 'DRUMS' ? lp.DRUMS_LAYOUT : lp.KEYS_DRUM_LAYOUT;
    let lit = 0;
    for (let i = 0; i < 100; i++) {
      if (!lp.isGridPad(i) || table[i] < 0) continue;
      assert.notEqual(s.get(i), lp.OFF, `${layout}: kit pad ${i} was dark`);
      lit++;
    }
    assert.equal(lit, 12, `${layout} should light twelve kit pads`);
  }
});

test('DRUMS leaves everything outside the kit dark', () => {
  const s = new lp.LedSurface();
  dev.renderLaunchpad(s, baseState({ layout: 'DRUMS' }));
  for (let row = 4; row <= 8; row++) {
    for (let col = 1; col <= 8; col++) {
      assert.equal(s.get(lp.padIndex(row, col)), lp.OFF, `pad ${row},${col} lit with nothing behind it`);
    }
  }
});
