import test from 'node:test';
import assert from 'node:assert/strict';

import * as shareMod from '../src/engine/share';
import * as codecMod from '../src/engine/shareCodec';
import * as scalesMod from '../src/engine/scales';
import * as typesMod from '../src/engine/types';
import * as instrumentsMod from '../src/engine/instruments';
import * as songMod from '../src/engine/song';

const eager = (shareMod as any).default ?? shareMod;
const codec = (codecMod as any).default ?? codecMod;
// The split is an implementation detail of loading, not of behaviour.
const share = { ...eager, ...codec };
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

/** Anything the decoder hands back must be a song the engine can actually use. */
function assertUsableSong(song: any, context: string) {
  assert.equal(song.instruments.length, 4, `${context}: wrong instrument count`);
  assert.ok(song.patternOrder.length > 0, `${context}: no patterns`);
  for (const label of song.patternOrder) {
    const pattern = song.patterns[label];
    assert.equal(pattern.length, 4, `${context}: wrong channel count`);
    for (const ch of pattern) {
      assert.equal(ch.length, 34, `${context}: channel is not [instrument, pan, ...32 notes]`);
      assert.ok(ch.every((n: number) => Number.isFinite(n)), `${context}: non-numeric note`);
    }
  }
  assert.ok(
    song.sequence.every((i: number) => i >= 0 && i < song.patternOrder.length),
    `${context}: sequence points outside patternOrder`
  );
}

test('a truncated payload is refused outright, never half-decoded', async () => {
  const code = await share.songToShareCode(realSong());
  for (const frac of [0.25, 0.5, 0.75, 0.9]) {
    const cut = code.slice(0, Math.floor(code.length * frac));
    const out = await share.songFromShareCode(cut);
    // A truncated deflate stream cannot inflate, so there is nothing to salvage.
    assert.equal(out, null, `a payload cut to ${frac * 100}% decoded to something`);
  }
});

test('a corrupted payload yields null or a usable song, never a broken one', async () => {
  const code = await share.songToShareCode(realSong());
  let decoded = 0;
  for (let i = 0; i < 40; i++) {
    const at = (i * 37) % code.length;
    const mutated = code.slice(0, at) + (code[at] === 'A' ? 'B' : 'A') + code.slice(at + 1);
    const out = await share.songFromShareCode(mutated);
    if (out === null) continue;
    decoded++;
    // If it claims to have decoded, it must be structurally sound — a
    // half-decoded song reaching the engine is the failure this guards.
    assertUsableSong(out, `bit flipped at ${at}`);
  }
  assert.ok(decoded >= 0);
});

test('a hostile payload cannot claim a shape the engine cannot render', async () => {
  const packed = share.packSong(realSong(1));
  // Instrument count sits right after the config block; forge an absurd one.
  const forged = Uint8Array.from(packed);
  const nameLen = (forged[1] << 8) | forged[2];
  const instCountAt = 3 + nameLen + 4 + 2;
  forged[instCountAt] = 99;
  assert.equal(share.unpackSong(forged), null, 'accepted 99 instruments');
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


// --- embed ----------------------------------------------------------------

test('the embed URL is the share URL — height selects the player', async () => {
  const song = realSong();
  const shareUrl = await share.songToShareUrl(song, 'https://tjw.dev', '/zzfx-studio/');
  const embedUrl = await share.songToEmbedUrl(song, 'https://tjw.dev', '/zzfx-studio/');
  assert.equal(embedUrl, shareUrl, 'sharing and embedding produced different links');
  const back = await share.songFromShareCode(share.shareCodeFromUrl(embedUrl));
  assert.equal(JSON.stringify(back), JSON.stringify(song));
});

test('a short viewport gets the mini player, a tall one gets the studio', () => {
  const H = share.MINI_PLAYER_MAX_HEIGHT;
  assert.equal(share.shouldShowMiniPlayer(share.DEFAULT_EMBED_HEIGHT), true);
  assert.equal(share.shouldShowMiniPlayer(H), true, 'boundary is inclusive');
  assert.equal(share.shouldShowMiniPlayer(H + 1), false);
  assert.equal(share.shouldShowMiniPlayer(800), false);
});

test('the breakpoint is exactly the four-row floor', () => {
  const fourRows = share.studioHeightForRows(share.MIN_USABLE_ROWS);
  assert.equal(share.shouldShowMiniPlayer(fourRows), false, 'four rows must be the studio');
  assert.equal(share.shouldShowMiniPlayer(fourRows - 1), true, 'below four rows must be the player');
  // Eight rows is the comfortable target and is obviously the studio.
  assert.equal(share.shouldShowMiniPlayer(share.STUDIO_IDEAL_HEIGHT), false);
  assert.ok(share.STUDIO_IDEAL_HEIGHT > fourRows);
});

test('a phone in landscape gets the player, because the studio cannot fit a row', () => {
  // ~375 is the short edge of common phones. It is under the four-row floor,
  // so the player is the correct answer there.
  assert.equal(share.shouldShowMiniPlayer(375), true);
  assert.ok(375 < share.studioHeightForRows(share.MIN_USABLE_ROWS));
});

test('the eager module pulls in nothing from the codec', () => {
  // Startup must not reach packing, compression or base64 — that is the whole
  // point of the split.
  for (const name of ['packSong', 'unpackSong', 'songToShareCode', 'songFromShareCode']) {
    assert.equal((eager as any)[name], undefined, `${name} leaked into the eager module`);
  }
  // What startup does need is there.
  for (const name of ['shareCodeFromUrl', 'shouldShowMiniPlayer', 'embedSnippet', 'loadShareCodec']) {
    assert.equal(typeof (eager as any)[name], 'function', `${name} missing from the eager module`);
  }
});

test('the codec loads on demand and exposes the encode and decode halves', async () => {
  const mod: any = await eager.loadShareCodec();
  assert.equal(typeof mod.songToShareCode, 'function');
  assert.equal(typeof mod.songFromShareCode, 'function');
});

test('the embed snippet is a well-formed iframe', async () => {
  const url = await share.songToEmbedUrl(realSong(), 'https://tjw.dev', '/zzfx-studio/');
  const html = share.embedSnippet(url, 'Supreme Monolith');
  assert.ok(html.startsWith('<iframe '));
  assert.ok(html.endsWith('</iframe>'));
  assert.ok(html.includes(`src="${url}"`));
  // Needed for the frame to be allowed to make sound after a press.
  assert.ok(html.includes('allow="autoplay"'));
  assert.ok(html.includes('title="Supreme Monolith"'));
  // Fixed size, not a percentage — the height is what selects the mini player.
  assert.ok(html.includes(`width="${share.DEFAULT_EMBED_WIDTH}"`));
  assert.ok(html.includes(`height="${share.DEFAULT_EMBED_HEIGHT}"`));
  assert.ok(!html.includes('width="100%"'), 'width must be fixed, not fluid');
  assert.ok(
    share.DEFAULT_EMBED_HEIGHT <= share.MINI_PLAYER_MAX_HEIGHT,
    'the default embed height would render the studio, not the player'
  );
});

test('a song title cannot break out of the snippet attribute', () => {
  const html = share.embedSnippet('https://x.dev/', 'Evil" onload="alert(1)');
  assert.ok(!html.includes('onload="alert(1)"'), 'title escaped out of the attribute');
  assert.ok(html.includes('&quot;'));
});
