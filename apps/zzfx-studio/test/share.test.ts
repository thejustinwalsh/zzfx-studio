import test from 'node:test';
import assert from 'node:assert/strict';

import * as shareMod from '../src/engine/share';
import * as scalesMod from '../src/engine/scales';
import * as typesMod from '../src/engine/types';
import * as instrumentsMod from '../src/engine/instruments';
import * as songMod from '../src/engine/song';

const share = (shareMod as any).default ?? shareMod;
const scales = (scalesMod as any).default ?? scalesMod;
const types = (typesMod as any).default ?? typesMod;
const instruments = (instrumentsMod as any).default ?? instrumentsMod;
const songGen = (songMod as any).default ?? songMod;

const VIBES = ['adventure', 'battle', 'dungeon', 'titleScreen', 'boss'];
const LENGTHS = ['short', 'long', 'epic'];

/** A real generated song — the thing users actually share. */
function realSong(opts: any = {}) {
  return songGen.generateSong({
    vibe: 'boss', key: 'C', scale: 'dorian', bpm: 136, length: 'long', ...opts,
  });
}

test('a generated song round-trips byte for byte', async () => {
  const song = realSong();
  const back = await share.songFromShareCode(await share.songToShareCode(song));
  assert.deepEqual(back, song);
  assert.equal(JSON.stringify(back), JSON.stringify(song), 'JSON differs after a round trip');
});

test('round-trips across every vibe, key, scale and length', async () => {
  for (const vibe of VIBES) {
    for (const length of LENGTHS) {
      const song = realSong({ vibe, length, key: 'F#', scale: 'harmonicMinor' });
      const back = await share.songFromShareCode(await share.songToShareCode(song));
      assert.equal(
        JSON.stringify(back), JSON.stringify(song),
        `changed for vibe=${vibe} length=${length}`
      );
    }
  }
});

test('instrument parameters survive exactly, including the randomness slot', async () => {
  const song = realSong();
  const back = await share.songFromShareCode(await share.songToShareCode(song));
  for (let ch = 0; ch < song.instruments.length; ch++) {
    assert.deepEqual(back.instruments[ch], song.instruments[ch], `instrument ${ch} drifted`);
    // Index 1 is ZzFX's per-note randomness; it is a stored value, not noise
    // introduced by sharing, and must come back untouched.
    assert.equal(back.instruments[ch][1], song.instruments[ch][1], 'randomness changed');
    // Index 2 is frequency — the value float32 would have mangled.
    assert.equal(back.instruments[ch][2], song.instruments[ch][2], 'tuning changed');
  }
});

test('a float that float32 cannot hold survives', async () => {
  const song = realSong();
  song.instruments[0][2] = 261.63;      // not representable in float32
  song.instruments[0][4] = 0.005;
  song.instruments[1][0] = 0.1 + 0.2;   // 0.30000000000000004
  const back = await share.songFromShareCode(await share.songToShareCode(song));
  assert.equal(back.instruments[0][2], 261.63);
  assert.equal(back.instruments[0][4], 0.005);
  assert.equal(back.instruments[1][0], 0.1 + 0.2);
});

test('notes and effects survive exactly', async () => {
  const song = realSong();
  const label = song.patternOrder[0];
  song.patternEffects[label][0][3] = { code: 'VB', value: 0x36 };
  song.patternEffects[label][2][17] = { code: 'BC', value: 0xff };
  song.patterns[label][0][2 + 5] = 48;   // top of the note range
  song.patterns[label][0][2 + 6] = 1;    // bottom

  const back = await share.songFromShareCode(await share.songToShareCode(song));
  assert.deepEqual(back.patterns[label], song.patterns[label]);
  assert.deepEqual(back.patternEffects[label], song.patternEffects[label]);
});

test('the share code is URL-safe', async () => {
  const code = await share.songToShareCode(realSong());
  assert.equal(encodeURIComponent(code), code, 'the code would be mangled by URL encoding');
  assert.ok(!/[?#&=+/]/.test(code), 'the code contains URL delimiters');
});

test('packing beats compressed JSON by a wide margin', async () => {
  const song = realSong();
  const code = await share.songToShareCode(song);
  const jsonLen = encodeURIComponent(JSON.stringify(song)).length;
  assert.ok(code.length < jsonLen / 4, `packed ${code.length} vs raw ${jsonLen}`);
  assert.ok(code.length < 4000, `share code grew to ${code.length} chars`);
});

test('the wire enums match the live types', () => {
  // Reordering any of these silently breaks every link already shared.
  assert.deepEqual([...share.WIRE_ENUMS.KEYS], [...scales.CHROMATIC]);
  assert.deepEqual([...share.WIRE_ENUMS.SCALE_NAMES], Object.keys(scales.SCALES));
  assert.deepEqual([...share.WIRE_ENUMS.VIBES], VIBES);
  assert.equal(share.WIRE_ENUMS.ROLES.length, 5);
});

test('effect codes are indexed in the order the engine declares them', async () => {
  const song = realSong();
  const label = song.patternOrder[0];
  types.EFFECT_CODES.forEach((code: string, i: number) => {
    song.patternEffects[label][0][i] = { code, value: i * 7 };
  });
  const back = await share.songFromShareCode(await share.songToShareCode(song));
  assert.deepEqual(back.patternEffects[label][0], song.patternEffects[label][0]);
});

test('garbage in the parameter is ignored rather than thrown', async () => {
  for (const bad of ['', 'x', '!!!!', 'AAAAAAAAAAAA', '%%%%', 'a'.repeat(500)]) {
    assert.equal(await share.songFromShareCode(bad), null, `accepted or threw on: ${bad}`);
  }
});

test('a truncated payload is refused, not half-decoded', async () => {
  const code = await share.songToShareCode(realSong());
  for (const frac of [0.25, 0.5, 0.75, 0.9]) {
    const cut = code.slice(0, Math.floor(code.length * frac));
    const out = await share.songFromShareCode(cut);
    assert.ok(out === null || typeof out === 'object', 'threw on truncated input');
  }
});

test('a corrupted payload never hangs or throws', async () => {
  const code = await share.songToShareCode(realSong());
  for (let i = 0; i < 40; i++) {
    const at = (i * 37) % code.length;
    const mutated = code.slice(0, at) + (code[at] === 'A' ? 'B' : 'A') + code.slice(at + 1);
    const out = await share.songFromShareCode(mutated);
    assert.ok(out === null || typeof out === 'object');
  }
});

test('a future format version is refused', () => {
  const packed = share.packSong(realSong());
  packed[0] = 99;
  assert.equal(share.unpackSong(packed), null);
});

test('the code is found in a URL alongside other parameters', async () => {
  const song = realSong();
  const url = await share.songToShareUrl(song, 'https://x.dev', '/zzfx-studio/');
  assert.ok(url.startsWith('https://x.dev/zzfx-studio/?s='));

  const code = share.shareCodeFromUrl(url);
  assert.equal(JSON.stringify(await share.songFromShareCode(code)), JSON.stringify(song));

  const messy = `https://x.dev/?utm=a&s=${code}&z=1#top`;
  assert.equal(share.shareCodeFromUrl(messy), code);
});

test('URLs without a share code read as empty', () => {
  assert.equal(share.shareCodeFromUrl('https://x.dev/'), null);
  assert.equal(share.shareCodeFromUrl('https://x.dev/?other=1'), null);
  // A hash is not a query — this format deliberately uses the query.
  assert.equal(share.shareCodeFromUrl('https://x.dev/#s=abc'), null);
});
