# @zzfx-studio/app

## 0.1.3

### Patch Changes

- 27cb9a8: > Branch: fix/zzfxm-per-channel-state-isolation

  > PR: https://github.com/thejustinwalsh/zzfx-studio/pull/1

  ### 0b8f8f2d950e3aa3d5e5f8f0144d27eddfa52391

  fix: isolate per-channel state in ZZFXM.build
  The original Keith Clark / Frank Force ZZFXM.build leaks per-channel
  state (`instrument`, `attenuation`, `panning`, `sampleBuffer`,
  `sampleOffset`, `notFirstBeat`, `pitch`, `outSampleOffset`) across
  channel iterations because they're declared at function scope. The
  outer `for (; hasMore; channelIndex++)` then carries channel N's
  final synth state into the first beat of channel N+1, producing
  audible artifacts at every channel transition and at pattern loop
  boundaries. The shared accumulators (`leftChannelBuffer`,
  `rightChannelBuffer`) also grew dynamically via sparse indexed
  writes, so the final buffer length depended on which channel ran
  furthest — making `source.loop = true` sample-inaccurate.

  This patch moves per-channel state declarations inside the channel
  loop body so each channel starts fresh, and replaces the `hasMore`-
  based dynamic outer loop with a counted loop over a pre-computed
  `channelCount` (the widest pattern). Buffer length is now computed
  deterministically as `Σ(pattern_steps) × beatLength` across the
  sequence, and both stereo buffers are zero-filled upfront. The DSP
  math (waveform writes, attenuation envelope, panning, sample cache,
  instrument transposition) is unchanged.

  API is unchanged: same `[number[], number[]]` return, same `zzfxm`
  and `ZZFXM` exports, same micro build behavior. Consumers calling
  `ZZFXM.build(...)` or `zzfxm(...)` now hear correct output that
  matches the studio app's in-house per-channel renderer.

  Also wire the export dialog's PLAY ZZFXM button to call the
  shipped `ZZFXM.build` from `@zzfx-studio/zzfxm` directly, instead of
  going through the studio's in-house `zzfxMChannels` + mix path used
  for the waveform display. This is the validation hook: if the
  export dialog sounds wrong, the shipped library is wrong. After
  this fix the two paths produce audibly identical output.
  Files: apps/zzfx-studio/src/components/ExportModal.tsx, packages/zzfxm/src/zzfxm.ts
  Stats: 2 files changed, 127 insertions(+), 59 deletions(-)

- Updated dependencies [27cb9a8]
  - @zzfx-studio/zzfxm@0.1.3

## 0.2.0

### Minor Changes

- > Branch: main

  - Full tracker-style song generator with 4 channels (Lead, Harmony, Bass, Drums)
  - Vibe-based generation: adventure, battle, dungeon, titleScreen, boss
  - Configurable key, scale, BPM, and song length (short/long/epic)
  - Section roles (verse, contrast, bridge, breakdown, climax) shape pattern generation
  - 8 note effects: slide up/down, vibrato, duty cycle, staccato, pitch drop, bit crush, tremolo
  - Instrument archetype + trait system for varied, musically coherent sounds
  - Per-channel mute/solo, volume control, and hot-swap regeneration
  - Oscilloscope and waveform preview visualization
  - Auto-generated song names with deterministic pixel-art avatars
  - Multi-project support: save, browse, load, and delete songs
  - Song serialization with persistent state via zustand
  - Export modal with syntax-highlighted ESM code output
  - Async audio rendering via Web Worker for responsive UI
  - PWA with offline support, service worker, and update banner
  - Native file I/O when running in Neutralino desktop shell
  - Accessibility labels and roles on all interactive elements
  - ESM export format using `@zzfx-studio/zzfxm/micro` import

  Initial release of the ZzFX Studio web application -- a tracker-style music generator for indie game devs and chiptune hobbyists.

### Patch Changes

- Updated dependencies
  - @zzfx-studio/zzfxm@0.2.0
