# @zzfx-studio/zzfxm

[![npm](https://img.shields.io/npm/v/@zzfx-studio/zzfxm)](https://www.npmjs.com/package/@zzfx-studio/zzfxm)
[![license](https://img.shields.io/npm/l/@zzfx-studio/zzfxm)](./LICENSE)

Modern TypeScript [ZzFXM](https://github.com/keithclark/ZzFXM) music renderer -- the same tiny tracker format, now with proper module exports and TypeScript types. Based on ZzFXM v2.0.3 by Keith Clark and Frank Force.

Part of [ZzFX Studio](https://thejustinwalsh.github.io/zzfx-studio) -- an algorithmic chiptune tracker that generates 4-channel retro songs instantly using pure math.

## Install

```sh
npm install @zzfx-studio/zzfxm zzfx
```

Or for the micro build with zero dependencies (~1.4KB gzipped):

```sh
npm install @zzfx-studio/zzfxm
```

## Usage

```js
import { zzfxm, ZZFXM } from '@zzfx-studio/zzfxm';

// Build and play in one call
zzfxm(instruments, patterns, sequence, 120);

// Or build sample data separately
const [left, right] = ZZFXM.build(instruments, patterns, sequence, 120);

// Then play it when ready
ZZFXM.play([left, right]);
```

### Micro build

```js
import { zzfxm, ZZFXM } from '@zzfx-studio/zzfxm/micro';
```

Same API -- ZzFX is bundled inline so there's no peer dependency to install. This is a convenience for music-only playback. If you also need ZzFX for sound effects, install both packages separately to avoid bundling the synth engine twice.

## API

### `zzfxm(instruments, patterns, sequence, BPM?)`

Sequence and play a song via Web Audio. Returns an `AudioBufferSourceNode`.

### `ZZFXM.build(instruments, patterns, sequence, BPM?)`

Sequence a song to stereo sample data. Returns `[leftChannel, rightChannel]` as `number[]` arrays. No audio playback -- useful for offline export or piping into your own audio graph.

### `ZZFXM.play(sampleChannels, volumeScale?, rate?, pan?, loop?)`

Play stereo sample data via Web Audio. Returns an `AudioBufferSourceNode`.

### `ZZFXM.sampleRate`

The sample rate used for synthesis (44100).

## Song format

```
instruments: number[][]   -- array of ZzFX sound parameter arrays
patterns:    number[][][] -- [pattern][channel][instrument, panning, ...notes]
sequence:    number[]     -- pattern indices defining playback order
BPM:         number       -- tempo (default: 125)
```

Notes are MIDI-style integers where 12 = root pitch. A note value of 0 means silence for that step. Fractional note values control attenuation for fadeout effects.

## Differences from the original ZzFXM

This package uses the `zzfx` npm package as its synth engine rather than the legacy `zzfxG` global that the original ZzFXM was written against. The sequencer logic is unchanged, but there are practical differences:

- **ZzFX synth behavior may differ.** The `zzfx` npm package may have diverged from the version of ZzFX that was current when a song was originally authored. Songs exported from the [ZzFXM tracker](https://keithclark.github.io/ZzFXM/) or other tools using older ZzFX versions may sound slightly different -- particularly instruments that rely on edge-case synth behavior around filter, modulation, or bit crush parameters.
- **No globals.** The original ZzFXM expected `zzfx`, `zzfxG`, `zzfxR`, and `zzfxX` to exist as globals. This package imports from the `zzfx` module directly. If you have code that patches ZzFX globals, those patches won't affect this package.
- **`AudioContext` in Workers.** The `zzfx` package creates an `AudioContext` at import time. This is harmless in the main thread, but will throw in a Web Worker where `AudioContext` doesn't exist. If you bundle this for use in a worker (e.g. for offline sequencing with `ZZFXM.build`), stub it before imports: `globalThis.AudioContext = class {};`

## Background

The original [ZzFXM](https://github.com/keithclark/ZzFXM) by Keith Clark and Frank Force is a tiny music sequencer for the [ZzFX](https://github.com/KilledByAPixel/ZzFX) sound system, designed for size-constrained contexts like JS game jams and demoscene productions. It was built for `<script>` tag usage, relying on ZzFX globals.

This package modernizes ZzFXM to work as a proper npm module -- ESM and CJS builds, TypeScript types, and `zzfx` as a peer dependency. The sequencer is the original ZzFXM code, updated only to replace global references (`zzfxG`, `zzfxR`) with imports from the `zzfx` package. The micro build bundles ZzFX inline and minifies with terser for a complete synth + sequencer in ~1.4KB gzipped.

## Credits

- [ZzFXM](https://github.com/keithclark/ZzFXM) by Keith Clark and Frank Force (MIT)
- [ZzFX](https://github.com/KilledByAPixel/ZzFX) by Frank Force (MIT)

## License

[MIT](./LICENSE)
