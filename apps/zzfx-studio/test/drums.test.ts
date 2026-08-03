import test from 'node:test';
import assert from 'node:assert/strict';
import { ZZFX } from 'zzfx';

import * as instMod from '../src/engine/instruments';
import * as fxMod from '../src/engine/effects';
import * as songImport from '../src/engine/song';
import type { NoteEffect } from '../src/engine/types';
const instruments = (instMod as any).default ?? instMod;
const effects = (fxMod as any).default ?? fxMod;
const song_ = (songImport as any).default ?? songImport;

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

/**
 * How pitch moves over time, across the part of the sound you can actually hear.
 *
 * Zero-crossing rate per window, with everything below -20dB of the peak
 * dropped. That tail matters: at 86Hz a window holds one crossing, so a single
 * stray crossing in a decayed tail reads as a 43Hz "climb" -- which is how this
 * measure kept reporting bubbles at -30dB, where nothing is audible at all.
 */
function pitchTrack(x: number[], win = 512): number[] {
  const rows: { hz: number; rms: number }[] = [];
  let peak = 0;
  for (let s = 0; s + win < x.length; s += win) {
    let z = 0, energy = 0;
    for (let i = s + 1; i < s + win; i++) {
      if ((x[i - 1] < 0) !== (x[i] < 0)) z++;
      energy += x[i] * x[i];
    }
    const rms = Math.sqrt(energy / win);
    peak = Math.max(peak, rms);
    rows.push({ hz: Math.round((z * 44100) / (2 * win)), rms });
  }
  return rows.filter((r) => r.rms >= peak * 0.1).map((r) => r.hz);
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

// The two that were missing from the fixtures, and the pair that broke.
const TIGHT   = [0.85, 0, 380, 0, 0.005, 0.05, 4, 1.0, -10, 0,0,0,0, 0.45, 0, 0,   0, 0.03, 0.03, 0];
const CRUSHED = [0.85, 0, 400, 0, 0.012, 0.09, 4, 1.0, -12, 0,0,0,0, 0.6,  0, 1.5, 0, 0.05, 0.04, 0];
const ARCHETYPES_ALL = { STANDARD, TIGHT, BOOMY, CRUSHED, METALLIC };

const rms = (x: number[]) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));

const render = (base: number[], voice: string, note: number) => {
  const p = instruments.drumVoiceInstrument(base, voice);
  p[2] *= 2 ** ((note - 12) / 12);
  return ZZFX.buildSamples(...p);
};
const NOTE = { KICK: 1, SNARE: 14, HAT: 32 } as const;

test('the noise voices stay broadband', () => {
  // Snare and hat are noise and must stay noise. The kick is deliberately not:
  // noise has no pitch, so it cannot have audible low end.
  for (const [aname, base] of Object.entries(ARCHETYPES)) {
    const reference = tonality(ZZFX.buildSamples(...base));
    for (const v of ['SNARE', 'HAT'] as const) {
      const t = tonality(render(base, v, NOTE[v]));
      assert.ok(
        t < reference * 2.5,
        `${aname} ${v} tonality ${t.toFixed(1)} against the archetype's ${reference.toFixed(1)} — it has become a tone`
      );
    }
  }
});

test('no drum sweeps upward, with or without an effect on it', () => {
  // The real discriminator, and the one tonality could not see: a low sine that
  // falls is a thud; the same sine driven through zero climbs back up the other
  // side and sounds like a bubble.
  //
  // Effects are included because that is how the generator plays these. The
  // previous version of this test checked the bare voice only, and missed the
  // crushed archetype's kick bubbling once a pitch drop was stacked on it --
  // its slide is -12, and even a quarter of that still climbed by the tail.
  // The palette, not an arbitrary list: those are the only effects that can
  // reach a drum, from the generator or from the pads.
  const FX_CASES: [string, NoteEffect | null][] = [
    ['raw', null],
    ...effects.DRUM_FX_PALETTE.flatMap((code: string) =>
      [0x40, 0x80, 0xc0].map((value) => [`${code} 0x${value.toString(16)}`, { code, value }] as [string, NoteEffect])
    ),
  ];
  for (const [aname, base] of Object.entries(ARCHETYPES_ALL)) {
    for (const v of VOICES) {
      for (const [fname, fx] of FX_CASES) {
        let p = instruments.drumVoiceInstrument(base, v);
        if (fx) p = effects.applyEffect(p, fx);
        p = [...p];
        p[2] *= 2 ** ((NOTE[v] - 12) / 12);
        const t = pitchTrack(ZZFX.buildSamples(...p));
        if (t.length < 4) continue;
        // A bubble has a shape: fall to a floor, then climb back off it. That
        // is what the frequency crossing zero and coming up the other side
        // looks like. Measuring the ends instead was useless -- an absolute
        // tolerance that catches an 86Hz kick is noise on an 11kHz hat, and one
        // loose enough for the hat lets the kick through.
        const floorAt = t.indexOf(Math.min(...t));
        const after = t.slice(floorAt + 1);
        const rebound = after.length ? Math.max(...after) - t[floorAt] : 0;
        // One zero-crossing in a 512-sample window is 43Hz, so that is the
        // measurement's own quantum and a single-quantum wobble means nothing.
        // A real rebound is the frequency having reached zero and come back:
        // the pre-cap crushed kick moved two quanta, 0Hz to 86Hz.
        const QUANTUM = 43;
        assert.ok(
          rebound <= Math.max(QUANTUM, t[0] * 0.4),
          `${aname} ${v} ${fname} falls to ${t[floorAt]}Hz then climbs ${rebound}Hz — [${t.slice(0, 10).join(' ')}]`
        );
      }
    }
  }
});


test('the kick is the low one, by a wide margin', () => {
  // Measured on the sound, not the parameter: a shape-4 drum at a low base
  // frequency still ends up as bright as the hat, which is exactly the trap
  // this fell into.
  for (const [aname, base] of Object.entries(ARCHETYPES)) {
    const peak = (v: keyof typeof NOTE) => Math.max(...pitchTrack(render(base, v, NOTE[v])));
    assert.ok(
      peak('KICK') < peak('HAT') / 4,
      `${aname}: the kick peaks at ${peak('KICK')}Hz against the hat's ${peak('HAT')}Hz`
    );
    assert.ok(peak('KICK') < peak('SNARE') / 4, `${aname}: the kick is not below the snare`);
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
  // Shape and curve are the archetype's identity. Swapping the kick's shape for
  // a sine is what produced a bubble; a voice may only adjust how the archetype
  // is played, never what it is.
  for (const [aname, base] of Object.entries(ARCHETYPES)) {
    for (const v of VOICES) {
      const p = instruments.drumVoiceInstrument(base, v);
      // The kick alone is allowed a sine body; nothing else may change shape.
      if (v !== 'KICK') assert.equal(p[6], base[6], `${aname} ${v} changed the shape`);
      assert.equal(p[7], base[7], `${aname} ${v} changed the shape curve`);
      // The slide may deepen, but never reverse or run away: a steep enough
      // sweep rings as a tone whatever the shape underneath it.
      assert.ok(
        Math.sign(p[8]) === Math.sign(base[8]) && Math.abs(p[8]) <= Math.abs(base[8]) * 1.3,
        `${aname} ${v} slide went from ${base[8]} to ${p[8]}`
      );
    }
  }
});

test('the voices separate low to high, and the hat is the short one', () => {
  for (const [aname, base] of Object.entries(ARCHETYPES)) {
    const f = (v: string) => instruments.drumVoiceInstrument(base, v)[2];
    assert.ok(f('KICK') < f('SNARE'), `${aname}: kick should sit below snare`);
    assert.ok(f('SNARE') < f('HAT'), `${aname}: snare should sit below hat`);

    const d = (v: keyof typeof NOTE) => decaySamples(render(base, v, NOTE[v]));
    assert.ok(d('SNARE') > d('HAT') * 2, `${aname}: the hat should be far shorter than the snare`);
  }
});

test('the kick is a thud, not a wash', () => {
  // It was given a tail nearly twice the archetype's, which turns a low noise
  // burst into a long wash -- audibly the wrong instrument. A kick gets its
  // weight from being low and hitting hard, not from ringing on.
  for (const [aname, base] of Object.entries(ARCHETYPES)) {
    const archetype = ZZFX.buildSamples(...base).length;
    const kick = render(base, 'KICK', NOTE.KICK).length;
    assert.ok(
      kick <= archetype * 1.15,
      `${aname}: the kick runs ${kick} samples against the archetype's ${archetype} -- it is washing, not thudding`
    );
    // And it must actually be the low one.
    const p = instruments.drumVoiceInstrument(base, 'KICK');
    assert.ok(p[2] < base[2] * 0.8, `${aname}: the kick is not low enough to read as low end`);
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

test('no archetype leaves a voice inaudible', () => {
  // The `crushed` archetype carries bitCrush 1.5, a 294Hz effective sample
  // rate. Applied to a hat -- which is nothing but high frequencies -- it left
  // it at a seventh of every other archetype's level, with its pitch collapsed.
  // One kit in five was broken.
  for (const [aname, base] of Object.entries(ARCHETYPES_ALL)) {
    const reference = rms(ZZFX.buildSamples(...base));
    for (const v of VOICES) {
      const level = rms(render(base, v, NOTE[v])) / reference;
      assert.ok(
        level > 0.35,
        `${aname} ${v} renders at ${level.toFixed(2)}x the archetype — inaudible next to the others`
      );
    }
  }
});

test('bit crush never reaches a drum at all', () => {
  // It is a sample-and-hold, so its damage is proportional to pitch: an 11kHz
  // snare or hat aliases down to about 1kHz at the gentlest usable setting, and
  // the boomy kick rebounds. There is no drum it is safe on.
  assert.equal(effects.DRUM_FX_PALETTE.includes('BC'), false);
});

test('the generator only writes effects a drum survives', () => {
  // Measured, not assumed: BC collapses the snare and hat and rebounds the
  // boomy kick; SU rebounds the crushed kick; DT and ST rebound the boomy one.
  // Anything the generator can put on the drum channel has to be in the
  // palette, including whatever a vibe asks for.
  const palette = new Set(effects.DRUM_FX_PALETTE);
  assert.deepEqual([...palette].sort(), ['PD', 'SD', 'TR', 'VB']);

  for (const vibe of ['adventure', 'battle', 'dungeon', 'titleScreen', 'boss'] as const) {
    for (const code of effects.vibeDrumEffects(vibe)) {
      assert.ok(palette.has(code), `${vibe} asks for ${code} on drums, which is not in the palette`);
    }
  }
});

test('every drum sound the generator emits renders cleanly', () => {
  // The end-to-end guarantee, and the one that matters: not "is this effect
  // safe in isolation" but "does anything the generator actually writes sound
  // wrong on any archetype it might have picked". Effects are chosen per vibe
  // and per role, so the only honest way to check is to generate and look.
  const seen = new Map<string, { note: number; fx: NoteEffect | null }>();
  for (const vibe of ['adventure', 'battle', 'dungeon', 'titleScreen', 'boss'] as const) {
    for (let i = 0; i < 2; i++) {
      const song = song_.generateSong({ vibe, key: 'C', scale: 'minor', bpm: 130, length: 'epic' });
      for (const label of song.patternOrder) {
        const notes = song.patterns[label][3];
        const fxs = song.patternEffects?.[label]?.[3] ?? [];
        for (let r = 0; r < 32; r++) {
          const note = notes[r + 2];
          if (!note || note <= 0) continue;
          const fx = fxs[r] ?? null;
          seen.set(`${note}:${fx ? fx.code + fx.value : 'raw'}`, { note, fx });
        }
      }
    }
  }
  assert.ok(seen.size > 0, 'the generator wrote no drums at all');

  const voiceOf = (n: number) => (n <= 6 ? 'KICK' : n <= 22 ? 'SNARE' : 'HAT') as const;
  for (const [key, { note, fx }] of seen) {
    if (fx) {
      assert.ok(
        effects.DRUM_FX_PALETTE.includes(fx.code),
        `${key}: the generator wrote ${fx.code}, which is not in the drum palette`
      );
    }
    // Every archetype, because generation picks one at random.
    for (const [aname, base] of Object.entries(ARCHETYPES_ALL)) {
      let p = instruments.drumVoiceInstrument(base, voiceOf(note));
      if (fx) p = effects.applyEffect(p, fx);
      p = [...p];
      p[2] *= 2 ** ((note - 12) / 12);
      const t = pitchTrack(ZZFX.buildSamples(...p));
      assert.ok(t.length > 0, `${aname} ${key} is silent`);
      const floorAt = t.indexOf(Math.min(...t));
      const after = t.slice(floorAt + 1);
      const rebound = after.length ? Math.max(...after) - t[floorAt] : 0;
      assert.ok(
        rebound <= Math.max(43, t[0] * 0.4),
        `${aname} ${key} falls to ${t[floorAt]}Hz then climbs ${rebound}Hz`
      );
    }
  }
});
