---
"@zzfx-studio/zzfxm": patch
---

> Branch: fix/zzfxm-serializer-preserve-row-count
> PR: https://github.com/thejustinwalsh/zzfx-studio/pull/5

### a5fc538f496675c056bf288531ef0290b99ba13f
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
Files: packages/zzfxm/src/zzfxm.ts
Stats: 1 file changed, 9 insertions(+), 5 deletions(-)
