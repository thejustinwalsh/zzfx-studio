# @zzfx-studio/app

## 0.1.5

### Patch Changes

- 4143867: > Branch: fix/zzfxm-serializer-preserve-row-count

  > PR: https://github.com/thejustinwalsh/zzfx-studio/pull/5

  ### 717f927eb4d9dc5ce891016a501e8c7af0ecd5a6

  fix: serializer preserves canonical row count per pattern
  Per-channel trimZeros is a compression technique — a 32-row channel
  ending in 15 rests doesn't need 15 trailing commas in the output.
  But the prior implementation trimmed EVERY channel independently,
  which lost the pattern's row count whenever all channels happened
  to land on a zero in the canonical final row (breakdowns with
  sustained drones are the typical case).

  Downstream, ZZFXM.build keys its pattern-boundary advancement off
  max-channel-length per pattern. A pattern where every channel got
  trimmed below canonical plays one row short, and the song's loop
  boundary phase-shifts on each wrap — audible as a ghost note that
  compounds over repeated loops.

  Fix: after trimming each channel, if the longest trimmed channel
  falls below the pre-trim canonical length, pad it back to canonical.
  Costs at most (canonicalLen - trimmedMax) extra zeros per pattern;
  every other channel keeps its full trim. Compression preserved,
  row count signal preserved.

  Applied at all three serialization sites: songToJson (used by the
  re-import JSON metadata comment), songToCode (Copy Code human
  output), and songToClipboard (Copy Oneliner). fmtChannel removed —
  its inline trim is replaced by the pattern-level trim that
  preserves row count.
  Files: apps/zzfx-studio/src/components/ExportModal.tsx, apps/zzfx-studio/src/engine/serialize.ts
  Stats: 2 files changed, 5 insertions(+), 28 deletions(-)

  ### 76e4e06ff5bf708c4ab85e1f1a9e429d94f5a123

  fix: serializer preserves canonical row count per pattern
  Per-channel trimZeros is a compression technique — a 32-row channel
  ending in 15 rests doesn't need 15 trailing commas in the output.
  But the prior implementation trimmed EVERY channel independently,
  which lost the pattern's row count whenever all channels happened
  to land on a zero in the canonical final row (breakdowns with
  sustained drones are the typical case).

  Downstream, ZZFXM.build keys its pattern-boundary advancement off
  max-channel-length per pattern. A pattern where every channel got
  trimmed below canonical plays one row short, and the song's loop
  boundary phase-shifts on each wrap — audible as a ghost note that
  compounds over repeated loops.

  Fix: after trimming each channel, if the longest trimmed channel
  falls below the pre-trim canonical length, pad it back to canonical.
  Costs at most (canonicalLen - trimmedMax) extra zeros per pattern;
  every other channel keeps its full trim. Compression preserved,
  row count signal preserved.

  Applied at all three serialization sites: songToJson (used by the
  re-import JSON metadata comment), songToCode (Copy Code human
  output), and songToClipboard (Copy Oneliner). fmtChannel removed —
  its inline trim is replaced by the pattern-level trim that
  preserves row count.
  Files: apps/zzfx-studio/src/components/ExportModal.tsx, apps/zzfx-studio/src/engine/serialize.ts
  Stats: 2 files changed, 49 insertions(+), 19 deletions(-)

- Updated dependencies [e707ffa]
  - @zzfx-studio/zzfxm@0.1.5

## 0.1.4

### Patch Changes

- cf6d2e0: > Branch: fix/zzfxm-trimmed-channel-overshoot

  > PR: https://github.com/thejustinwalsh/zzfx-studio/pull/3

  ### b8a04bcb3d31afc2dfef6019b528e755a5cd2b1b

  fix: use max channel length for pattern boundary advancement
  ZZFXM.build's pattern-boundary advancement (`outSampleOffset` and the
  upfront totalSteps allocation) keyed off `patterns[patternIndex][0]
.length` — i.e. it assumed channel 0 set the canonical step count for
  the pattern. This is a contract the library never enforced. Authoring
  tools that strip trailing zeros per channel for compact serialization
  (zzfx-studio's `Copy Code` / `Copy Oneliner`) can leave channel 0
  shorter than its siblings whenever channel 0 happens to end with
  rests. The longer sibling channels then overshoot their allotted
  step count and the overshoot writes overlap the next pattern's
  contribution at the same channel — audible as a doubled "ghost note"
  at every pattern boundary when source.loop = true.

  Fix: compute pattern step count as the MAX channel length across all
  channels in the pattern, instead of `pattern[0].length`. This makes
  the canonical step count a property of the PATTERN (musical length),
  not an artifact of channel 0's specific contents. No channel can
  overshoot. Channels shorter than max contribute silence past their
  end — same musical result as if they were zero-padded to max. The
  DSP math and per-channel state isolation are unchanged.

  Also: wire the export dialog's PLAY ZZFXM button to feed the SHIPPED
  serialized form (channels trimmed via `trimZeros`) into ZZFXM.build,
  so the preview validates the consumer-facing data shape. If you can
  hear the bug in the export dialog, downstream consumers pasting the
  exported code will hear it too.

  Regression test added: `mixed channel lengths within a pattern —
looped buffer has no overshoot ghost`. Verifies (a) buffer length
  is derived from max channel length, not channel 0, and (b) a trimmed
  channel-0 produces output identical to a padded channel-0, proving
  the trim is information-preserving for ZZFXM playback.
  Files: apps/zzfx-studio/src/components/ExportModal.tsx, packages/zzfxm/src/zzfxm.ts, packages/zzfxm/test/zzfxm.test.mjs
  Stats: 3 files changed, 89 insertions(+), 12 deletions(-)

- Updated dependencies [cf6d2e0]
  - @zzfx-studio/zzfxm@0.1.4

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
