/**
 * Reference per-channel renderer ported verbatim from zzfx-studio's
 * apps/zzfx-studio/src/engine/zzfx.ts. Used as the ground-truth render
 * path in equivalence tests against the library's ZZFXM.build.
 */

import { ZZFX } from 'zzfx'

export function zzfxMChannels(instruments, patterns, sequence, BPM = 125, channelFilter) {
    const beatLength = (ZZFX.sampleRate / BPM) * 60 >> 2

    let channelCount = 0
    for (const pat of patterns) channelCount = Math.max(channelCount, pat.length)
    if (channelCount === 0) return []

    const maxPatternSteps = patterns[0][0].length - 2
    const totalSamples = ((sequence.length - 1) * maxPatternSteps + (maxPatternSteps - 1)) * beatLength

    const channelBuffers = []
    for (let ch = 0; ch < channelCount; ch++) {
        channelBuffers.push([new Array(totalSamples).fill(0), new Array(totalSamples).fill(0)])
    }

    const sampleCache = {}

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
        if (channelFilter !== undefined && channelFilter !== channelIndex) continue

        let sampleBuffer = []
        let sampleOffset = 0
        let notFirstBeat = 0
        let instrument = 0
        let panning = 0
        let attenuation = 0
        let outSampleOffset = 0

        const leftBuf = channelBuffers[channelIndex][0]
        const rightBuf = channelBuffers[channelIndex][1]

        sequence.forEach((patternIndex, sequenceIndex) => {
            const patternChannel = patterns[patternIndex][channelIndex] || [0, 0, 0]
            const nextSampleOffset =
                outSampleOffset + (patternChannel.length - 2 - (notFirstBeat ? 0 : 1)) * beatLength
            const isSequenceEnd = sequenceIndex === sequence.length - 1

            let k = outSampleOffset

            for (let i = 2; i < patternChannel.length + (isSequenceEnd ? 1 : 0); notFirstBeat = ++i) {
                const note = patternChannel[i]
                const stop =
                    (i === patternChannel.length + (isSequenceEnd ? 1 : 0) - 1 && isSequenceEnd) ||
                    instrument !== (patternChannel[0] || 0) ||
                    note ||
                    0

                for (
                    let j = 0;
                    j < beatLength && notFirstBeat;
                    j++ > beatLength - 99 && stop ? (attenuation += (attenuation < 1 ? 1 : 0) / 99) : 0
                ) {
                    const sample = ((1 - attenuation) * sampleBuffer[sampleOffset++]) / 2 || 0
                    leftBuf[k] = (leftBuf[k] || 0) - sample * panning + sample
                    rightBuf[k] = (rightBuf[k] || 0) + sample * panning + sample
                    k++
                }

                if (note) {
                    attenuation = note % 1
                    panning = patternChannel[1] || 0
                    if ((note | 0)) {
                        const noteInt = note | 0
                        const cacheKey = [(instrument = patternChannel[(sampleOffset = 0)] || 0), noteInt].toString()
                        sampleBuffer =
                            sampleCache[cacheKey] =
                                sampleCache[cacheKey] ||
                                (() => {
                                    const instrumentParameters = [...instruments[instrument]]
                                    instrumentParameters[2] *= 2 ** ((noteInt - 12) / 12)
                                    return noteInt > 0 ? ZZFX.buildSamples(...instrumentParameters) : []
                                })()
                    }
                }
            }

            outSampleOffset = nextSampleOffset
        })
    }

    return channelBuffers
}

/** Mix N per-channel stereo pairs into a single [left, right] mix. */
export function mixChannels(channelBuffers) {
    if (channelBuffers.length === 0) return [[], []]
    const len = channelBuffers[0][0].length
    const left = new Array(len).fill(0)
    const right = new Array(len).fill(0)
    for (const [cl, cr] of channelBuffers) {
        for (let i = 0; i < len; i++) {
            left[i] += cl[i] ?? 0
            right[i] += cr[i] ?? 0
        }
    }
    return [left, right]
}
