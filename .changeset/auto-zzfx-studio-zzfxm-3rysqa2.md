---
"@zzfx-studio/zzfxm": patch
---

> Branch: fix/zzfxm-trimmed-channel-overshoot
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
