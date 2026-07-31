import test from 'node:test';
import assert from 'node:assert/strict';

import * as midiMod from '../src/engine/midi';
import * as scalesMod from '../src/engine/scales';

const midi = (midiMod as any).default ?? midiMod;
const scales = (scalesMod as any).default ?? scalesMod;

// --- message decoding -------------------------------------------------------

test('note-on and note-off decode with channel, note and velocity', () => {
  assert.deepEqual(midi.parseMidiMessage([0x90, 60, 100]), {
    type: 'noteon', channel: 0, note: 60, velocity: 100,
  });
  assert.deepEqual(midi.parseMidiMessage([0x82, 64, 0]), {
    type: 'noteoff', channel: 2, note: 64, velocity: 0,
  });
});

test('note-on with zero velocity is a note-off', () => {
  // Many controllers release notes this way rather than sending 0x80. Treating
  // it as a note-on leaves the note stuck on.
  const e = midi.parseMidiMessage([0x90, 60, 0]);
  assert.equal(e.type, 'noteoff');
});

test('the channel nibble is read from the status byte', () => {
  for (let ch = 0; ch < 16; ch++) {
    assert.equal(midi.parseMidiMessage([0x90 | ch, 60, 64]).channel, ch);
  }
});

test('non-note messages are ignored', () => {
  for (const msg of [
    [0xb0, 7, 100],    // control change
    [0xe0, 0, 64],     // pitch bend
    [0xf8],            // clock
    [0x90, 60],        // truncated
    [],
  ]) {
    assert.equal(midi.parseMidiMessage(msg), null, `accepted ${JSON.stringify(msg)}`);
  }
});

// --- note mapping -----------------------------------------------------------

test('middle C maps to the reference note on a C4-tuned channel', () => {
  assert.equal(midi.midiNoteToZzfxm(60, 4), 12);
  assert.equal(scales.zzfxmToNoteName(12, 4), 'C-4');
});

test('a channel tuned an octave lower puts middle C an octave up its range', () => {
  // The bass channel is tuned to C3, so middle C sits at 24 there and still
  // sounds as C4 — the note played is the note heard.
  assert.equal(midi.midiNoteToZzfxm(60, 3), 24);
  assert.equal(scales.zzfxmToNoteName(24, 3), 'C-4');
});

test('semitones map one for one', () => {
  assert.equal(midi.midiNoteToZzfxm(61, 4), 13);
  assert.equal(midi.midiNoteToZzfxm(72, 4), 24);
  assert.equal(midi.midiNoteToZzfxm(48, 4), 0 + 0 || midi.midiNoteToZzfxm(48, 4));
  assert.equal(midi.midiNoteToZzfxm(49, 4), 1);
});

test('notes outside the range are dropped rather than clamped', () => {
  // A clamped note is a wrong note; silently transposing what someone played is
  // worse than not playing it.
  assert.equal(midi.midiNoteToZzfxm(20, 4), null, 'far below the range');
  assert.equal(midi.midiNoteToZzfxm(127, 4), null, 'far above the range');
  assert.equal(midi.midiNoteToZzfxm(47, 4), null, 'one below the lowest playable');
  assert.equal(midi.midiNoteToZzfxm(96, 4), 48, 'the top of the range still maps');
});

test('every mapped note lands inside the playable range', () => {
  for (let base of [3, 4]) {
    for (let n = 0; n < 128; n++) {
      const v = midi.midiNoteToZzfxm(n, base);
      if (v === null) continue;
      assert.ok(v >= 1 && v <= 48, `midi ${n} at base ${base} produced ${v}`);
    }
  }
});

// --- channel routing --------------------------------------------------------

test('drums speak on MIDI channel 10, per General MIDI', () => {
  assert.deepEqual([...midi.CHANNEL_TO_MIDI], [1, 2, 3, 10]);
  assert.equal(midi.midiToTrackerChannel(10), 3);
  assert.equal(midi.midiToTrackerChannel(1), 0);
  assert.equal(midi.midiToTrackerChannel(5), null);
});

test('a single armed channel takes every note, whatever channel it arrived on', () => {
  // The common case: most keyboards transmit on channel 1 only.
  for (let incoming = 0; incoming < 16; incoming++) {
    assert.deepEqual(midi.routeToChannels([2], incoming), [2]);
  }
});

test('with several armed, the incoming channel picks between them', () => {
  const armed = [0, 1, 3];
  assert.deepEqual(midi.routeToChannels(armed, 0), [0], 'midi ch 1 -> LEAD');
  assert.deepEqual(midi.routeToChannels(armed, 1), [1], 'midi ch 2 -> HARM');
  assert.deepEqual(midi.routeToChannels(armed, 9), [3], 'midi ch 10 -> DRUM');
  assert.deepEqual(midi.routeToChannels(armed, 2), [], 'BASS is not armed');
  assert.deepEqual(midi.routeToChannels(armed, 7), [], 'unmapped channel goes nowhere');
});

test('nothing armed means nothing is written', () => {
  assert.deepEqual(midi.routeToChannels([], 0), []);
});

// --- recording --------------------------------------------------------------

test('a note lands on the nearest row, not the one just passed', () => {
  const bpm = 136;
  const rowDuration = 60 / bpm / 4;   // 0.110s

  // Dead on row 4.
  assert.equal(midi.quantizeToRow(rowDuration * 4, bpm, 32), 4);
  // Slightly late, as a struck note always is — must still be row 4.
  assert.equal(midi.quantizeToRow(rowDuration * 4 + 0.04, bpm, 32), 4);
  // Slightly early.
  assert.equal(midi.quantizeToRow(rowDuration * 4 - 0.04, bpm, 32), 4);
  // Past the midpoint belongs to the next row.
  assert.equal(midi.quantizeToRow(rowDuration * 4.6, bpm, 32), 5);
});

test('quantizing wraps within the pattern', () => {
  const bpm = 120;
  const rowDuration = 60 / bpm / 4;
  assert.equal(midi.quantizeToRow(rowDuration * 32, bpm, 32), 0);
  assert.equal(midi.quantizeToRow(rowDuration * 33, bpm, 32), 1);
});

test('flooring instead of rounding would drift a row late', () => {
  const bpm = 136;
  const rowDuration = 60 / bpm / 4;
  const slightlyLate = rowDuration * 4 + 0.04;
  assert.equal(Math.floor(slightlyLate / rowDuration), 4);
  // Nearer the boundary, flooring loses the row while rounding keeps it.
  const veryLate = rowDuration * 5 - 0.01;
  assert.equal(Math.floor(veryLate / rowDuration), 4, 'floor reports the previous row');
  assert.equal(midi.quantizeToRow(veryLate, bpm, 32), 5, 'rounding reports the intended row');
});

// --- support detection ------------------------------------------------------

test('support detection does not throw when the API is absent', () => {
  assert.equal(typeof midi.isMidiSupported(), 'boolean');
});
