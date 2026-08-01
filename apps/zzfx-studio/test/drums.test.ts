import test from 'node:test';
import assert from 'node:assert/strict';
import { ZZFX } from 'zzfx';

import * as instMod from '../src/engine/instruments';
const instruments = (instMod as any).default ?? instMod;

const VOICES = ['KICK', 'SNARE', 'HAT'] as const;

/**
 * How much one frequency bin dominates the spectrum.
 *
 * Broadband noise sits near 3; a pure or swept tone spikes into the tens or
 * hundreds. This is the number that catches a drum turning into a bubble, which
 * a brightness measure does not: a descending sine and a noise burst can share
 * a spectral centroid while sounding nothing alike.
 */
function tonality(x: number[], N = 1024): number {
  const win = x.slice(0, N);
  const mag: number[] = [];
  for (let k = 1; k < N / 2; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const a = (-2 * Math.PI * k * n) / N;
      re += (win[n] ?? 0) * Math.cos(a);
      im += (win[n] ?? 0) * Math.sin(a);
    }
    mag.push(Math.hypot(re, im));
  }
  const total = mag.reduce((a, b) => a + b, 0) || 1;
  return Math.max(...mag) / (total / mag.length);
}

const decaySamples = (x: number[]) => {
  const amp = x.map(Math.abs);
  const peak = Math.max(...amp);
  let last = 0;
  for (let i = 0; i < amp.length; i++) if (amp[i] >= peak * 0.1) last = i;
  return last;
};

//        vol  rnd  freq  atk  sus    rel   shp crv  sld  …
const STANDARD = [0.8, 0, 350, 0, 0.01, 0.08, 4, 1.0, -8, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.05, 0.04, 0];
const BOOMY    = [0.9, 0, 300, 0, 0.02, 0.12, 4, 1.0, -6, 0, 0, 0, 0, 0.55, 0, 0, 0, 0.08, 0.05, 0];
const METALLIC = [0.7, 0, 420, 0, 0.008, 0.07, 4, 1.0, -4, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.04, 0.03, 0];
const ARCHETYPES = { STANDARD, BOOMY, METALLIC };

const render = (base: number[], voice: string, note: number) => {
  const p = instruments.drumVoiceInstrument(base, voice);
  p[2] *= 2 ** ((note - 12) / 12);
  return ZZFX.buildSamples(...p);
};
const NOTE = { KICK: 1, SNARE: 14, HAT: 32 } as const;

test('no voice turns into a tone — drums stay broadband', () => {
  // The regression this guards: the kick was given a sine body and a steep
  // slide, which is a descending pure tone. It measured 112 here against the
  // archetype's 3.5, and sounded like a bubble.
  for (const [aname, base] of Object.entries(ARCHETYPES)) {
    const reference = tonality(ZZFX.buildSamples(...base));
    for (const v of VOICES) {
      const t = tonality(render(base, v, NOTE[v]));
      assert.ok(
        t < reference * 2.5,
        `${aname} ${v} tonality ${t.toFixed(1)} against the archetype's ${reference.toFixed(1)} — it has become a tone`
      );
    }
  }
});

test('the archetype still decides how a drum sounds', () => {
  // The other half of the regression: every parameter was assigned outright, so
  // all five archetypes collapsed to the same three sounds and generating a
  // song stopped varying its drums at all.
  for (const v of VOICES) {
    const lengths = Object.values(ARCHETYPES).map((b) => render(b, v, NOTE[v]).length);
    assert.equal(new Set(lengths).size, lengths.length, `${v} sounds identical across archetypes`);
  }
});

test('a voice never replaces the archetype waveform', () => {
  for (const [aname, base] of Object.entries(ARCHETYPES)) {
    for (const v of VOICES) {
      const p = instruments.drumVoiceInstrument(base, v);
      assert.equal(p[6], base[6], `${aname} ${v} changed the shape`);
      assert.equal(p[7], base[7], `${aname} ${v} changed the shape curve`);
      assert.equal(p[8], base[8], `${aname} ${v} changed the slide`);
    }
  }
});

test('the three voices separate by pitch and by envelope', () => {
  // Kick lowest and longest, hat highest and shortest. Shape 4 is broadband at
  // any frequency, so pitch alone never distinguished them -- the envelope is
  // what the ear actually uses.
  for (const [aname, base] of Object.entries(ARCHETYPES)) {
    const f = (v: string) => instruments.drumVoiceInstrument(base, v)[2];
    assert.ok(f('KICK') < f('SNARE'), `${aname}: kick should sit below snare`);
    assert.ok(f('SNARE') < f('HAT'), `${aname}: snare should sit below hat`);

    const d = (v: keyof typeof NOTE) => decaySamples(render(base, v, NOTE[v]));
    assert.ok(d('KICK') > d('SNARE') * 1.4, `${aname}: the kick should ring longer than the snare`);
    assert.ok(d('SNARE') > d('HAT') * 2, `${aname}: the hat should be far shorter than the snare`);
  }
});

test('padding a short archetype leaves no holes', () => {
  // ZzFX reads a hole as undefined rather than 0, which silences the voice.
  const short = [0.8, 0, 350];
  for (const v of VOICES) {
    const p = instruments.drumVoiceInstrument(short, v);
    assert.equal(p.length, 20);
    for (let i = 0; i < 20; i++) assert.equal(typeof p[i], 'number', `slot ${i} is not a number`);
  }
});
