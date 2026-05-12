/** Serialization roundtrip — uniform input rendered both directly
 * (PATH A) and through the row-count-preserving trim helper (PATH C)
 * must be byte-identical to the DAW reference renderer. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

globalThis.AudioContext = class {}

const here = dirname(fileURLToPath(import.meta.url))
const distMainUrl = pathToFileURL(resolve(here, '..', 'dist', 'zzfxm.js')).href
const { ZZFXM } = await import(distMainUrl)
const { zzfxMChannels, mixChannels } = await import('./fixtures/zzfxMChannels.mjs')

const BPM = 125
const ROWS = 32

const instruments = [
    [0.5, 0, 440, 0, 0, 0.2, 1, 1],
    [0.7, 0, 110, 0, 0, 0.5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.1],
]
const mkChannel = (instIdx, notes) => {
    const ch = [instIdx, 0]
    for (let i = 0; i < ROWS; i++) ch.push(notes[i] ?? 0)
    return ch
}
// Channels intentionally have notes that don't reach the canonical last row.
// After trim, several channels will be shorter than 34.
const patternA = [
    mkChannel(0, [12, 0, 0, 19, 0, 0, 24, 0, 0, 19, 0, 0, 12, 0, 0, 0]),  // last note at row 12
    mkChannel(1, [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]),       // last note at row 6
]
const patternB = [
    mkChannel(0, [0, 0, 14, 0, 0, 21, 0, 0, 26, 0, 0, 21, 0, 0, 14, 0]),
    mkChannel(1, [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]),
]
const patterns = [patternA, patternB]
const sequence = [0, 1, 0, 1]

function trimZeros(arr) {
    let last = arr.length - 1
    while (last > 0 && (arr[last] === 0 || arr[last] === undefined)) last--
    return arr.slice(0, last + 1)
}

function trimChannelsPreservingRowCount(channels) {
    if (channels.length === 0) return channels
    const canonicalLen = channels.reduce((m, c) => Math.max(m, c.length), 0)
    const trimmed = channels.map(trimZeros)
    const trimmedMax = trimmed.reduce((m, c) => Math.max(m, c.length), 0)
    if (trimmedMax >= canonicalLen) return trimmed
    const targetIdx = trimmed.findIndex(c => c.length === trimmedMax)
    if (targetIdx < 0) return trimmed
    const t = trimmed[targetIdx]
    trimmed[targetIdx] = [...t, ...Array(canonicalLen - t.length).fill(0)]
    return trimmed
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

function firstDiff(a, b, eps = 1e-9) {
    if (a.length !== b.length) return { kind: 'length', a: a.length, b: b.length }
    for (let i = 0; i < a.length; i++) {
        if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > eps) {
            return { kind: 'sample', index: i, a: a[i], b: b[i] }
        }
    }
    return null
}

// REFERENCE — zzfxMChannels mix on the un-trimmed (DAW-shape) data
const refMix = mixChannels(zzfxMChannels(instruments, patterns, sequence, BPM))
const refL = refMix[0]

// PATH A — ZZFXM.build on un-trimmed data
const pathA = ZZFXM.build(instruments, patterns, sequence, BPM)
const aL = pathA[0]

// PATH C — ZZFXM.build on trim + row-count-preserving pad (new serializer)
const trimmedC = patterns.map(trimChannelsPreservingRowCount)
const pathC = ZZFXM.build(instruments, trimmedC, sequence, BPM)
const cL = pathC[0]

console.log(`  REF length:                  ${refL.length}`)
console.log(`  PATH A (no trim) length:     ${aL.length}  diff vs REF: ${firstDiff(refL, aL)?.kind ?? 'IDENTICAL'}  rms=${rms(refL, aL).toExponential(2)}`)
console.log(`  PATH C (preserving trim):    ${cL.length}  diff vs REF: ${firstDiff(refL, cL)?.kind ?? 'IDENTICAL'}  rms=${rms(refL, cL).toExponential(2)}`)
console.log(`  Trimmed C channel shapes:`, trimmedC.map(pat => pat.map(c => c.length)))

test('PATH A (no trim) is byte-identical to DAW reference', () => {
    assert.equal(firstDiff(refL, aL), null, 'engines diverge on identical input')
})

test('PATH C (row-count-preserving trim) is byte-identical to DAW reference', () => {
    assert.equal(firstDiff(refL, cL), null, 'trim+pad still introduces divergence')
})
