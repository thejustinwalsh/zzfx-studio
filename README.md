# ZzFX Studio

A browser-based chiptune tracker that generates 4-channel retro songs using algorithmic composition. No AI, no network calls -- pure client-side generation using Euclidean rhythms, scale-constrained melodies, and probability-weighted patterns.

Built with ZzFX + ZzFXM for audio synthesis in ~1KB.

![ZzFX Studio](docs/demo.gif)

## Features

- **Instant song generation** -- click and it's done, <10ms
- **5 vibe templates** -- Adventure, Battle, Dungeon, Title Screen, Boss
- **4-channel tracker grid** -- Lead, Harmony, Bass, Drums with note effects
- **Per-channel regeneration** -- don't like the bass line? regenerate just that channel
- **Live playback** -- BPM changes, mute/solo, and instrument swaps while playing
- **Multi-project support** -- save and switch between songs (persisted to localStorage)
- **Export** -- copy ZzFXM code, download .js, or export .wav
- **Import** -- load previously exported .js files back in
- **Oscilloscope** -- real-time frequency visualization colored by active notes
- **ADSR visualization** -- see envelope shapes on each instrument card

## Generation Engine

Songs are built algorithmically using proven music generation techniques:

1. **Drums first** -- kick templates + probability-weighted snare + gap-filling hats
2. **Bass** -- Euclidean rhythm timing + scale-constrained note pools
3. **Melody** -- constrained random walk with motif repetition
4. **Harmony** -- reactive gap-fill with arpeggiated chord tones

All melodic content is locked to the selected key/scale. Each vibe template controls density, BPM range, preferred scales, and effect probability.

### Note Effects

8 retro-authentic per-note effects: Slide Up, Slide Down, Vibrato, Detune, Staccato, Pitch Drop, Bit Crush, Tremolo.

## Tech Stack

- **React Native** + **React Native Web** (web-first)
- **React Native Skia** for waveform/ADSR visualization
- **Expo 55** with Metro bundler
- **ZzFX** + **ZzFXM** -- inlined ~1KB audio engine
- **Zustand** for state management with persistence
- **pnpm** as package manager

## Quick Start

```bash
pnpm install
pnpm web
```

Then open http://localhost:8081 in your browser.

## Project Structure

```
src/
  engine/          -- generation engine (scales, drums, bass, melody, harmony, effects)
    euclidean.ts   -- Bjorklund algorithm for rhythm distribution
    drums.ts       -- kick/snare/hat pattern generation
    bass.ts        -- Euclidean rhythm + scale-constrained bass lines
    melody.ts      -- constrained random walk + motif repetition
    harmony.ts     -- reactive arpeggio + chord tone fill
    effects.ts     -- note effect generation and application
    instruments.ts -- ZzFX parameter generation per vibe
    vibes.ts       -- vibe template configurations
    chords.ts      -- chord progression generation
    song.ts        -- full song assembly + regeneration
    audioGraph.ts  -- Web Audio API graph with per-channel gain
    zzfx.ts        -- inlined ZzFX/ZzFXM source
    serialize.ts   -- song-to-code and code-to-song conversion
  components/      -- UI components
  theme/           -- colors, typography, layout constants
  store.ts         -- zustand store with multi-project persistence
```

## Export Format

Generated songs export as self-contained JavaScript that plays via ZzFXM:

```javascript
// "Neon Pulse" -- adventure / C major / 120 BPM
zzfxM(...songData); // paste into your game
```

The oneliner format is optimized for game jam usage -- paste directly into your project.

## License

[MIT](LICENSE)

## Credits

- [ZzFX](https://github.com/KilledByAPixel/ZzFX) by Frank Force -- tiny JavaScript sound engine
- [ZzFXM](https://github.com/keithclark/ZzFXM) by Keith Clark -- tiny music renderer
