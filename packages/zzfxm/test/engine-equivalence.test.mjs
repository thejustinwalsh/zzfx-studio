/**
 * Engine equivalence test — pins ZZFXM.build's output against zzfxMChannels
 * (the studio's reference renderer used for DAW transport). The two paths
 * should produce IDENTICAL mixed audio for any well-formed input.
 *
 * If this test fails, downstream consumers calling `zzfxm()` / `ZZFXM.build`
 * on data exported from the studio hear different audio than the DAW
 * produces — which is the bug we're chasing.
 *
 * The test isolates LAYERS:
 *   1. Same in-memory data → both engines → diff. (This file.)
 *   2. Same data → serialize → parse → both engines → diff. (Follow-up.)
 *
 * Each layer pinpoints where divergence enters.
 */

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

// Simple two-channel song with pluck + bass, three patterns, varied sequence.
// All channels uniform at length 34 (canonical) so we test the engines on the
// same baseline data shape the DAW uses internally.
const instruments = [
    [0.5, 0, 440, 0, 0, 0.2, 1, 1],
    [0.7, 0, 110, 0, 0, 0.5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.1],
]
const ROWS = 32
const mkChannel = (instIdx, notes) => {
    const ch = [instIdx, 0]
    for (let i = 0; i < ROWS; i++) ch.push(notes[i] ?? 0)
    return ch
}
const patternA = [
    mkChannel(0, [12, 0, 0, 19, 0, 0, 24, 0, 0, 19, 0, 0, 12, 0, 0, 7]),
    mkChannel(1, [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]),
]
const patternB = [
    mkChannel(0, [0, 0, 14, 0, 0, 21, 0, 0, 26, 0, 0, 21, 0, 0, 14, 0]),
    mkChannel(1, [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]),
]
const patternC = [
    mkChannel(0, [0, 24, 0, 0, 26, 0, 0, 0, 28, 0, 0, 0, 26, 0, 24, 0]),
    mkChannel(1, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
]
const patterns = [patternA, patternB, patternC]
const sequence = [0, 1, 0, 1, 2, 1]

function firstDifference(a, b, eps = 1e-9) {
    if (a.length !== b.length) return { kind: 'length', a: a.length, b: b.length }
    for (let i = 0; i < a.length; i++) {
        if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > eps) {
            return { kind: 'sample', index: i, a: a[i], b: b[i], delta: (a[i] ?? 0) - (b[i] ?? 0) }
        }
    }
    return null
}

function rmsDifference(a, b) {
    const len = Math.min(a.length, b.length)
    let sum = 0
    for (let i = 0; i < len; i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0)
        sum += d * d
    }
    return Math.sqrt(sum / len)
}

test('ZZFXM.build and zzfxMChannels produce identical mixed output', () => {
    const [libL, libR] = ZZFXM.build(instruments, patterns, sequence, BPM)
    const channelBufs = zzfxMChannels(instruments, patterns, sequence, BPM)
    const [refL, refR] = mixChannels(channelBufs)

    const lenDiff = firstDifference(libL, refL)
    const rms = rmsDifference(libL, refL)

    console.log(`  LIB    length: ${libL.length}`)
    console.log(`  REF    length: ${refL.length}`)
    console.log(`  RMS difference (left):  ${rms.toExponential(3)}`)
    if (lenDiff) console.log(`  First divergence:`, lenDiff)

    assert.equal(libL.length, refL.length, `length mismatch: lib=${libL.length} ref=${refL.length}`)
    assert.equal(lenDiff, null, `samples diverge: ${JSON.stringify(lenDiff)}`)
})
