/**
 * THE WITHERED REALM — deterministic synth comparison. ZZFX.buildSamples
 * calls Math.random() for the `randomness` param; without seeding, each
 * call produces a slightly different waveform. We stub Math.random to
 * a seeded PRNG and reset before each render so the two engines see
 * the SAME random sequence.
 *
 * With determinism enforced, any remaining divergence is purely
 * algorithmic.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

globalThis.AudioContext = class {}

const here = dirname(fileURLToPath(import.meta.url))

// Seeded PRNG — mulberry32, deterministic.
function makePrng(seed) {
    let s = seed >>> 0
    return () => {
        s = (s + 0x6d2b79f5) >>> 0
        let t = s
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// Replace Math.random with a seeded PRNG; reset to a known seed before
// each render so both engines see identical random sequences.
function withSeededRandom(seed, fn) {
    const orig = Math.random
    Math.random = makePrng(seed)
    try {
        return fn()
    } finally {
        Math.random = orig
    }
}

const { ZZFXM } = await import(pathToFileURL(resolve(here, '..', 'dist', 'zzfxm.js')).href)
const { zzfxMChannels, mixChannels } = await import('./fixtures/zzfxMChannels.mjs')

const BPM = 85
const ROWS = 32

const instruments = [
  [0.4889256267632808,0.01,261.63,0.01,0.19663695876404427,0.10427466982956364,0,1,0,0,0,0,0.25,0,0,0,0,0.8,0.02,0.3326563545967728],
  [0.1825769486749022,0.01,261.63,0.02,0.3394830272194687,0.18390454327021163,0,1,0,0,0,0,0,0,0,0,0.04106401100906151,0.5,0.03],
  [0.6320620016650419,0.01,261.63,0,0.1493611988265708,0.058027135055597576,1,1,0,0,0,0,0,0,0,0,0.05829242280255856,0.85,0.02],
  [0.25,0,300,0,0.020370541587307698,0.12576215981026873,4,1,-6,0,0,0,0,0.55,0,0,0,0.08,0.05],
  [0.4889256267632808,0.01,261.63,0.01,0.19663695876404427,0.10427466982956364,0,1,0,0,0,0,0.31,0,0,0,0,0.8,0.02,0.2],
  [0.1825769486749022,0.01,261.63,0.02,0.3394830272194687,0.18390454327021163,0,1,0,0,0,0,0.31,0,0,0,0.04106401100906151,0.5,0.03,0.2],
  [0.25,0,300,0,0.020370541587307698,0.12576215981026873,4,1,-6,0,-25.098039215686274,0.017549019607843136,0,0.55,0,0,0,0.08,0.05],
]

const patternsExported = [
  [
    [0,0,0,0,0,0,0,0,24,0,14,0,0,0,0,14,0,0,0,0,0,0,0,0,21,0,16,0,0,0,0,23],
    [1,0,0,21,24,24,28,28,24,24,0,14,17,17,21,0,17,17,0,21,24,24,28,28,24,24,16,16,19,19,23,0,19,19],
    [2,0,9,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,9,0,0,0,0,0,0,0,4],
    [3,0,0,0,32,0,0,0,0,0,14,0,32,0,0,0,32,0,0,0,0,0,32,0,0,0,14,0,0,0,0,0,32],
    [4,0,21,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,24],
    [5,0,0,0,0,0,0,0,0,0,14],
    [6,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  ],
  [
    [0],[0],
    [2,0,9,0,0,0,9,0,0,0,2,0,0,0,2,0,0,0,9,0,0,0,9,0,0,0,4,0,0,0,4,0,0,0],
    [3,0,0,0,32,0,32,0,32,0,32,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,32],
    [0],[0],
    [6,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  ],
]
const sequence = [0,0,1,0,0]

const padChannel = (ch) => {
    if (ch.length >= ROWS + 2) return ch
    const padded = new Array(ROWS + 2)
    for (let i = 0; i < ROWS + 2; i++) padded[i] = i < ch.length ? ch[i] : 0
    return padded
}
const patternsUniform = patternsExported.map(pat => pat.map(padChannel))

function firstDiff(a, b, eps = 1e-12) {
    if (a.length !== b.length) return { kind: 'length', a: a.length, b: b.length }
    for (let i = 0; i < a.length; i++) {
        if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > eps) {
            return { kind: 'sample', index: i, a: a[i], b: b[i], delta: (a[i] ?? 0) - (b[i] ?? 0) }
        }
    }
    return null
}

function rms(a, b) {
    const len = Math.min(a.length, b.length)
    let sum = 0
    for (let i = 0; i < len; i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0)
        sum += d * d
    }
    return Math.sqrt(sum / len)
}

const SEED = 12345

const refMix = withSeededRandom(SEED, () =>
    mixChannels(zzfxMChannels(instruments, patternsUniform, sequence, BPM))
)
const exportRender = withSeededRandom(SEED, () =>
    ZZFXM.build(instruments, patternsExported, sequence, BPM)
)
const libUniform = withSeededRandom(SEED, () =>
    ZZFXM.build(instruments, patternsUniform, sequence, BPM)
)

console.log(`  REF (DAW path, seeded RNG)         len=${refMix[0].length}`)
console.log(`  LIB on uniform (seeded RNG)        len=${libUniform[0].length}  rms-vs-REF=${rms(refMix[0], libUniform[0]).toExponential(3)}`)
console.log(`  EXPORT (consumer, seeded RNG)      len=${exportRender[0].length}  rms-vs-REF=${rms(refMix[0], exportRender[0]).toExponential(3)}`)

test('LIB on uniform matches DAW byte-identical with deterministic RNG', () => {
    const d = firstDiff(refMix[0], libUniform[0])
    if (d) console.log('  divergence:', d)
    assert.equal(d, null, 'engines diverge even with seeded RNG — real algorithmic bug')
})

test('EXPORT (trimmed) matches DAW byte-identical with deterministic RNG', () => {
    const d = firstDiff(refMix[0], exportRender[0])
    if (d) console.log('  divergence:', d)
    assert.equal(d, null, 'consumer trim diverges from DAW even with seeded RNG')
})
