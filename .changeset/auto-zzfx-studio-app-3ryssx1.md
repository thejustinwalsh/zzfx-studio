---
"@zzfx-studio/app": patch
---

> Branch: fix/zzfxm-per-channel-state-isolation
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
