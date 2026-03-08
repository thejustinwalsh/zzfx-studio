# @zzfx-studio/app

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
