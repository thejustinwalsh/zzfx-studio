import test from 'node:test';
import assert from 'node:assert/strict';

import * as noteEntryMod from '../src/engine/noteEntry';
import * as scalesMod from '../src/engine/scales';
import * as chordsMod from '../src/engine/chords';
import * as typesMod from '../src/engine/types';

// tsx transpiles to CJS interop, so named exports land under `default`.
const ne = (noteEntryMod as any).default ?? noteEntryMod;
const scales = (scalesMod as any).default ?? scalesMod;
const chords = (chordsMod as any).default ?? chordsMod;
const types = (typesMod as any).default ?? typesMod;

const KEYS = scales.CHROMATIC;
const SCALE_NAMES = Object.keys(scales.SCALES);

test('letterToNote maps naturals at the reference octave', () => {
  assert.equal(ne.letterToNote('c', false, 4), 12);
  assert.equal(ne.letterToNote('d', false, 4), 14);
  assert.equal(ne.letterToNote('e', false, 4), 16);
  assert.equal(ne.letterToNote('f', false, 4), 17);
  assert.equal(ne.letterToNote('g', false, 4), 19);
  assert.equal(ne.letterToNote('a', false, 4), 21);
  assert.equal(ne.letterToNote('b', false, 4), 23);
});

test('letterToNote is case insensitive', () => {
  assert.equal(ne.letterToNote('C', false, 4), ne.letterToNote('c', false, 4));
});

test('sharps raise by exactly one semitone', () => {
  assert.equal(ne.letterToNote('c', true, 4), 13);
  assert.equal(ne.letterToNote('f', true, 4), 18);
});

test('Shift+E is F and Shift+B is C of the next octave', () => {
  assert.equal(ne.letterToNote('e', true, 4), ne.letterToNote('f', false, 4));
  assert.equal(ne.letterToNote('b', true, 4), ne.letterToNote('c', false, 5));
});

test('C at octave 3 is rejected rather than encoded as a rest', () => {
  // noteToZzfxm(C, 3) computes to 0, which ZzFXM reads as "no note".
  assert.equal(scales.noteToZzfxm(0, 3), 0);
  assert.equal(ne.letterToNote('c', false, 3), null);
});

test('the rest of octave 3 is enterable', () => {
  assert.equal(ne.letterToNote('c', true, 3), 1);
  assert.equal(ne.letterToNote('b', false, 3), 11);
});

test('entry past the top of the range is rejected', () => {
  assert.equal(ne.letterToNote('c', false, 7), 48);
  assert.equal(ne.letterToNote('c', true, 7), null);
  assert.equal(ne.letterToNote('d', false, 7), null);
});

test('every letter and sharp state across octaves 3-7 is in range or null', () => {
  for (const letter of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
    for (const sharp of [false, true]) {
      for (let oct = ne.MIN_OCTAVE; oct <= ne.MAX_OCTAVE; oct++) {
        const n = ne.letterToNote(letter, sharp, oct);
        if (n === null) continue;
        assert.ok(
          n >= ne.MIN_NOTE && n <= ne.MAX_NOTE,
          `${letter}${sharp ? '#' : ''}${oct} produced ${n}`
        );
      }
    }
  }
});

test('unmapped letters return null', () => {
  assert.equal(ne.letterToNote('h', false, 4), null);
  assert.equal(ne.letterToNote('z', false, 4), null);
});

test('scaleStep walks adjacent degrees and stays in key', () => {
  // C major from C4: C D E F G
  let n = 12;
  const walked: number[] = [];
  for (let i = 0; i < 4; i++) {
    n = ne.scaleStep(n, 1, 'C', 'major');
    walked.push(n);
  }
  assert.deepEqual(walked, [14, 16, 17, 19]);
});

test('scaleStep is reversible between in-scale notes', () => {
  const up = ne.scaleStep(12, 1, 'C', 'major');
  assert.equal(ne.scaleStep(up, -1, 'C', 'major'), 12);
});

test('scaleStep never leaves the scale, in any key or mode', () => {
  for (const key of KEYS) {
    for (const scale of SCALE_NAMES) {
      const rootIdx = KEYS.indexOf(key);
      const classes = new Set(
        scales.SCALES[scale].map((i: number) => (rootIdx + i) % 12)
      );
      let n = ne.MIN_NOTE;
      for (let i = 0; i < 60; i++) {
        n = ne.scaleStep(n, 1, key, scale);
        assert.ok(
          classes.has(n % 12),
          `${key} ${scale}: stepped onto ${n}, outside the scale`
        );
      }
    }
  }
});

test('an off-scale note snaps toward the direction of travel', () => {
  // C#4 (13) is not in C major. Right lands on D-4, left on C-4.
  assert.equal(ne.scaleStep(13, 1, 'C', 'major'), 14);
  assert.equal(ne.scaleStep(13, -1, 'C', 'major'), 12);
});

test('scaleStep clamps at the range ends instead of wrapping', () => {
  let low = ne.MIN_NOTE;
  for (let i = 0; i < 40; i++) low = ne.scaleStep(low, -1, 'C', 'major');
  assert.ok(low >= ne.MIN_NOTE, `clamped low to ${low}`);

  let high = ne.MAX_NOTE;
  for (let i = 0; i < 40; i++) high = ne.scaleStep(high, 1, 'C', 'major');
  assert.ok(high <= ne.MAX_NOTE, `clamped high to ${high}`);
});

test('octaveStep moves a full octave and refuses to leave the range', () => {
  assert.equal(ne.octaveStep(12, 1), 24);
  assert.equal(ne.octaveStep(24, -1), 12);
  // Would fall to 0 (the rest sentinel) or below — stays put.
  assert.equal(ne.octaveStep(5, -1), 5);
  assert.equal(ne.octaveStep(45, 1), 45);
});

test('octaveStep leaves rests alone', () => {
  assert.equal(ne.octaveStep(0, 1), 0);
  assert.equal(ne.octaveStep(0, -1), 0);
});

test('drum mnemonics map to the canonical drum values', () => {
  assert.equal(ne.drumFromLetter('k'), types.DRUM_NOTES.KICK);
  assert.equal(ne.drumFromLetter('s'), types.DRUM_NOTES.SNARE);
  assert.equal(ne.drumFromLetter('h'), types.DRUM_NOTES.HAT);
  assert.equal(ne.drumFromLetter('x'), null);
});

test('drum mnemonics agree with how the grid names them', () => {
  assert.equal(types.drumNoteToName(ne.drumFromLetter('k')), 'KCK');
  assert.equal(types.drumNoteToName(ne.drumFromLetter('s')), 'SNR');
  assert.equal(types.drumNoteToName(ne.drumFromLetter('h')), 'HAT');
});

test('cycleDrum walks the drum types and clamps at both ends', () => {
  const kick = ne.drumFromLetter('k');
  const snare = ne.cycleDrum(kick, 1);
  const hat = ne.cycleDrum(snare, 1);
  assert.equal(types.drumNoteToName(snare), 'SNR');
  assert.equal(types.drumNoteToName(hat), 'HAT');
  assert.equal(types.drumNoteToName(ne.cycleDrum(hat, 1)), 'HAT');
  assert.equal(types.drumNoteToName(ne.cycleDrum(kick, -1)), 'KCK');
});

test('nudgeDrum stays inside the current drum type', () => {
  for (const range of ne.DRUM_RANGES) {
    for (let n = range.min; n <= range.max; n++) {
      for (const dir of [1, -1] as const) {
        const out = ne.nudgeDrum(n, dir);
        assert.equal(
          types.drumNoteToName(out),
          types.drumNoteToName(n),
          `nudging ${n} by ${dir} changed drum type`
        );
        assert.ok(out >= range.min && out <= range.max);
      }
    }
  }
});

test('regression: no bass chord root encodes to the rest sentinel', () => {
  const offenders: string[] = [];
  for (const key of KEYS) {
    for (const scale of SCALE_NAMES) {
      const prog = chords.generateChordProgression('adventure', key, scale);
      for (const chord of prog.chordAtRow) {
        for (const field of ['root', 'third', 'fifth'] as const) {
          if (chord[field] <= 0) {
            offenders.push(`${key} ${scale} ${field}=${chord[field]}`);
          }
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `voicings encoding as rests: ${offenders.length}`);
});
