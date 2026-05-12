/**
 * Regression tests for @zzfx-studio/zzfxm.
 *
 * Runs against the BUILT dist/ files (both main and micro entries) so
 * we catch any divergence between what tsup ships and what the source
 * intends. Uses Node's built-in test runner (`node --test`) — no extra
 * dependency, runs on every supported Node version.
 *
 * The headline regression: per-channel state isolation in `ZZFXM.build`.
 * The original Keith Clark / Frank Force algorithm declared
 * `instrument`, `attenuation`, `panning`, `sampleBuffer`, `sampleOffset`,
 * `notFirstBeat`, `pitch`, and `outSampleOffset` at function scope.
 * Channel N's final state leaked into channel N+1's first beat,
 * producing audible artifacts at every channel transition and at every
 * pattern loop boundary. The bit-for-bit symptom that this test
 * exploits: with a state leak, `patterns[[A, B]]` and `patterns[[B, A]]`
 * produce DIFFERENT mixed outputs even though channel summing is
 * commutative — because the leak makes channel order observable
 * through state.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// zzfx (which @zzfx-studio/zzfxm imports) eagerly does `new AudioContext`
// at module load. Node doesn't have AudioContext. Stub it — `ZZFXM.build`
// never reads from it (only `play` / `playSamples` do).
globalThis.AudioContext = class {}

const here = dirname(fileURLToPath(import.meta.url))
const distMainUrl = pathToFileURL(resolve(here, '..', 'dist', 'zzfxm.js')).href
const distMicroUrl = pathToFileURL(resolve(here, '..', 'dist', 'micro.min.js')).href
const main = await import(distMainUrl)
const micro = await import(distMicroUrl)

// ─── Sample song ────────────────────────────────────────────────────
// Channel layout: [instrument, panning, ...notes]. Two distinct
// channels with non-trivial note content so the per-channel state
// difference shows up audibly when isolation is broken.
const instruments = [
    // Pluck — fast attack, short decay, sine
    [0.5, 0, 440, 0, 0, 0.2, 1, 1],
    // Bass — sustained, square
    [0.7, 0, 110, 0, 0, 0.5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.1],
]
const channelA = [0, 0, 12, 0, 0, 19, 0, 0, 24, 0, 0, 19, 0, 0, 12, 0, 0]
const channelB = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0]
const patterns = [[channelA, channelB], [channelA.map((n, i) => (i >= 2 && n ? n + 2 : n)), channelB]]
const sequence = [0, 1, 0, 1]
const BPM = 125

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a song with channels in a specific order, returning [L, R]. */
function build(mod, channelOrder) {
    const reorderedPatterns = patterns.map(pat => channelOrder.map(idx => pat[idx]))
    return mod.ZZFXM.build(instruments, reorderedPatterns, sequence, BPM)
}

/** Compute peak absolute amplitude without spreading huge arrays. */
function peak(arr) {
    let p = 0
    for (let i = 0; i < arr.length; i++) {
        const v = arr[i] < 0 ? -arr[i] : arr[i]
        if (v > p) p = v
    }
    return p
}

/** Bit-for-bit equality on two number arrays. */
function arraysEqual(a, b) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}

// ─── Tests ──────────────────────────────────────────────────────────

test('main entry exports the expected API surface', () => {
    assert.equal(typeof main.zzfxm, 'function')
    assert.equal(typeof main.ZZFXM, 'object')
    assert.equal(typeof main.ZZFXM.build, 'function')
    assert.equal(typeof main.ZZFXM.play, 'function')
    assert.equal(typeof main.ZZFXM.sampleRate, 'number')
    assert.equal(main.ZZFXM.sampleRate, 44100)
})

test('micro entry exports the same API surface as main', () => {
    assert.equal(typeof micro.zzfxm, 'function')
    assert.equal(typeof micro.ZZFXM.build, 'function')
    assert.equal(typeof micro.ZZFXM.play, 'function')
    assert.equal(typeof micro.ZZFXM.sampleRate, 'number')
    assert.equal(micro.ZZFXM.sampleRate, main.ZZFXM.sampleRate)
})

test('ZZFXM.build produces a deterministic buffer length', () => {
    const [left, right] = main.ZZFXM.build(instruments, patterns, sequence, BPM)
    // Length is Σ(pattern_steps) × beatLength.
    // beatLength = (44100 × 60 / 125) >> 2 = 5292
    // Each pattern's channel-0 has 17 entries — first two are [instrument, panning]
    // → 15 note rows per pattern. Sequence length 4 × 15 × 5292 = 317520.
    const beatLength = ((main.ZZFXM.sampleRate / BPM) * 60) >> 2
    const stepsPerPattern = channelA.length - 2
    const expected = sequence.length * stepsPerPattern * beatLength
    assert.equal(left.length, expected, 'left channel length matches Σ(steps) × beatLength')
    assert.equal(right.length, expected, 'right channel length matches Σ(steps) × beatLength')
})

test('main and micro produce bit-identical output', () => {
    const [mainL, mainR] = main.ZZFXM.build(instruments, patterns, sequence, BPM)
    const [microL, microR] = micro.ZZFXM.build(instruments, patterns, sequence, BPM)
    assert.ok(arraysEqual(mainL, microL), 'left channels are bit-identical across builds')
    assert.ok(arraysEqual(mainR, microR), 'right channels are bit-identical across builds')
})

test('output contains no NaN or Infinity samples', () => {
    const [left, right] = main.ZZFXM.build(instruments, patterns, sequence, BPM)
    for (let i = 0; i < left.length; i++) {
        if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) {
            assert.fail(`non-finite sample at index ${i}: L=${left[i]} R=${right[i]}`)
        }
    }
})

test('output renders audible audio without extreme clipping', () => {
    const [left, right] = main.ZZFXM.build(instruments, patterns, sequence, BPM)
    const peakL = peak(left)
    const peakR = peak(right)
    assert.ok(peakL > 0, 'left channel has non-zero peak')
    assert.ok(peakR > 0, 'right channel has non-zero peak')
    assert.ok(peakL < 1.5, `left peak ${peakL} not absurdly clipped`)
    assert.ok(peakR < 1.5, `right peak ${peakR} not absurdly clipped`)
})

test('loop boundary lands near silence (last sample ≈ 0)', () => {
    const [left, right] = main.ZZFXM.build(instruments, patterns, sequence, BPM)
    // The trailing-tail extension ramps `attenuation` to 1 across the
    // last beat, so the buffer should fade out cleanly. A loud final
    // sample = a click when source.loop = true wraps to sample 0.
    const lastL = Math.abs(left[left.length - 1])
    const lastR = Math.abs(right[right.length - 1])
    assert.ok(lastL < 0.05, `left tail amplitude ${lastL} should be near silence`)
    assert.ok(lastR < 0.05, `right tail amplitude ${lastR} should be near silence`)
})

test('per-channel state isolation: channel order is irrelevant', () => {
    // REGRESSION TEST — this is the assertion that would FAIL against
    // the original Keith Clark / Frank Force ZZFXM.build and PASS
    // against the per-channel-isolated build.
    //
    // Channel summation in the mix is commutative — rendering channels
    // in order [A, B] vs [B, A] must produce identical output IF and
    // ONLY IF each channel renders from fresh state. The buggy version
    // leaks state from channel N's last note into channel N+1's first
    // beat, so swapping channel order produces DIFFERENT mixed audio.
    const [forwardL, forwardR] = build(main, [0, 1])
    const [reverseL, reverseR] = build(main, [1, 0])
    assert.ok(
        arraysEqual(forwardL, reverseL),
        'left channel: [A,B] order must equal [B,A] order — channel summing is commutative'
    )
    assert.ok(
        arraysEqual(forwardR, reverseR),
        'right channel: [A,B] order must equal [B,A] order — channel summing is commutative'
    )
})

test('per-channel state isolation: micro build also has channel-order independence', () => {
    // Same regression test against the micro build — both bundle paths
    // must be patched together.
    const [forwardL, forwardR] = build(micro, [0, 1])
    const [reverseL, reverseR] = build(micro, [1, 0])
    assert.ok(arraysEqual(forwardL, reverseL), 'micro left: channel order is irrelevant')
    assert.ok(arraysEqual(forwardR, reverseR), 'micro right: channel order is irrelevant')
})

test('mixed channel lengths within a pattern — looped buffer has no overshoot ghost', () => {
    // REGRESSION TEST for the trimmed-channel overshoot bug.
    //
    // Authoring tools like zzfx-studio strip trailing zeros from each
    // channel for compact serialization. If channel 0 happens to end
    // with rests, it gets trimmed shorter than its siblings. A naive
    // pattern-boundary policy keyed to channel 0's length would let
    // longer sibling channels overshoot their allotted step count;
    // those overshoot writes overlap the NEXT pattern's contribution
    // at the same channel, audible as a doubled note at every pattern
    // boundary when source.loop = true.
    //
    // The fix: pattern length = MAX channel length, so no channel can
    // overshoot. This test constructs a pattern where channel 0 (length
    // 6, equivalent of trimmed `[0, 0, 12, 0, 0, 0, 0, 0]`) is shorter
    // than channel 1 (length 8, full row count). After looping the song
    // once through a 2-pattern sequence, the playback at sample index
    // `totalSamples` (which is what source.loop wraps to) should match
    // sample index 0 — i.e. the loop wraps cleanly to silence and the
    // first beat doesn't have residual energy from a previous overshoot.
    const inst = [[0.5, 0, 440, 0, 0, 0.1, 1, 1]]
    const ch0Trimmed = [0, 0, 12, 0, 0, 0]               // length 6 — trailing zeros stripped
    const ch1Full = [0, 0, 14, 0, 16, 0, 18, 0]          // length 8 — full row count
    const patternsA = [[ch0Trimmed, ch1Full], [ch0Trimmed, ch1Full]]
    const sequenceA = [0, 1]

    const [left] = main.ZZFXM.build(inst, patternsA, sequenceA, BPM)
    const beatLength = ((main.ZZFXM.sampleRate / BPM) * 60) >> 2
    // Pattern step count must come from the LONGER channel (8 - 2 = 6 steps)
    // not channel 0 (6 - 2 = 4 steps). Two patterns × 6 steps × beatLength.
    const expected = sequenceA.length * (ch1Full.length - 2) * beatLength
    assert.equal(
        left.length,
        expected,
        `pattern length must use MAX channel length; expected ${expected} samples, got ${left.length}`
    )

    // Each pattern boundary should be a clean musical edge. Sample at
    // the boundary index between patterns 0 and 1 (= one pattern's
    // worth of audio in) should be drawn purely from pattern 1's
    // first beat — not contaminated by pattern 0 channel 1's overshoot.
    // We can't easily assert the exact value, but we can assert that
    // doing the same render with channel 0 PADDED to channel 1's length
    // produces IDENTICAL output (the fix's invariant — trimmed vs padded
    // are equivalent because the trim is just removing trailing zeros).
    const ch0Padded = [...ch0Trimmed, 0, 0]              // length 8 — same as ch1
    const patternsB = [[ch0Padded, ch1Full], [ch0Padded, ch1Full]]
    const [leftPadded] = main.ZZFXM.build(inst, patternsB, sequenceA, BPM)
    assert.ok(
        arraysEqual(left, leftPadded),
        'trimmed channel-0 and padded channel-0 must produce identical audio — the trim is information-preserving for ZZFXM playback'
    )
})

test('empty sequence renders an empty buffer (no crash)', () => {
    const [left, right] = main.ZZFXM.build(instruments, patterns, [], BPM)
    assert.equal(left.length, 0)
    assert.equal(right.length, 0)
})

test('no patterns renders an empty buffer (no crash)', () => {
    const [left, right] = main.ZZFXM.build(instruments, [], [0], BPM)
    assert.equal(left.length, 0)
    assert.equal(right.length, 0)
})
