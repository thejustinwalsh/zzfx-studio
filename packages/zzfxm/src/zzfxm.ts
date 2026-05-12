/**
 * ZzFX Music Renderer v2.0.3 by Keith Clark and Frank Force
 * https://github.com/keithclark/ZzFXM
 *
 * Modernized to use the zzfx npm package exports instead of globals.
 * MIT License
 */

import { ZZFX } from 'zzfx';

/** Channel data: [instrument, panning, ...notes] */
export type Channel = number[];

/** A pattern is an array of channels */
export type Pattern = Channel[];

/** ZzFX sound parameters array */
export type Instrument = number[];

/** Render and play a ZzFXM song */
export function zzfxm(
  instruments: Instrument[],
  patterns: Pattern[],
  sequence: number[],
  BPM = 125
): AudioBufferSourceNode {
  return ZZFX.playSamples(ZZFXM.build(instruments, patterns, sequence, BPM));
}

export const ZZFXM = {
  get sampleRate() { return ZZFX.sampleRate; },

  /** Render a song to stereo sample data */
  build(
    instruments: Instrument[],
    patterns: Pattern[],
    sequence: number[],
    BPM = 125
  ): [number[], number[]] {
    const beatLength = (ZZFX.sampleRate / BPM * 60) >> 2;

    let channelCount = 0;
    for (const pat of patterns) {
      if (pat.length > channelCount) channelCount = pat.length;
    }
    if (channelCount === 0 || sequence.length === 0) return [[], []];

    // Pattern length = MAX channel length, not channel-0 length. Authoring
    // tools that trim trailing zeros per channel for compact storage can
    // leave channel 0 shorter than its siblings; using channel 0's length
    // for the pattern boundary makes longer sibling channels overshoot,
    // which silently mixes adjacent patterns' edges together. With max-
    // channel-length, no channel can overshoot its allotted pattern span.
    const patternMaxLens: number[] = patterns.map((pat) => {
      let m = 0;
      for (const ch of pat) if (ch && ch.length > m) m = ch.length;
      return m;
    });

    let totalSteps = 0;
    for (const patternIndex of sequence) {
      totalSteps += (patternMaxLens[patternIndex] ?? 2) - 2;
    }
    const totalSamples = totalSteps * beatLength;
    if (totalSamples <= 0) return [[], []];

    const leftChannelBuffer: number[] = new Array(totalSamples).fill(0);
    const rightChannelBuffer: number[] = new Array(totalSamples).fill(0);
    const sampleCache: Record<string, number[]> = {};

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
      let sampleBuffer: number[] = [];
      let sampleOffset = 0;
      let notFirstBeat = 0;
      let instrument = 0;
      let panning = 0;
      let attenuation = 0;
      let outSampleOffset = 0;

      sequence.forEach((patternIndex: number, sequenceIndex: number) => {
        const patternChannel = patterns[patternIndex]?.[channelIndex] || [0, 0, 0];
        const canonicalLen = patternMaxLens[patternIndex] ?? 2;
        const nextSampleOffset =
          outSampleOffset +
          (canonicalLen - 2 - (notFirstBeat ? 0 : 1)) * beatLength;

        const isSequenceEnd = sequenceIndex === sequence.length - 1;
        let k = outSampleOffset;

        // Inner loop iterates the PATTERN's canonical row count, not
        // the current channel's length. Trimmed-trailing-zeros channels
        // still get their rest rows walked, so any active note's
        // release tail keeps writing across rows it would have written
        // in the un-trimmed source. Matches DAW-side renderer behavior.
        for (
          let i = 2;
          i < canonicalLen + (isSequenceEnd ? 1 : 0);
          notFirstBeat = ++i
        ) {
          const note = patternChannel[i];

          const stop =
            (i === canonicalLen + (isSequenceEnd ? 1 : 0) - 1 && isSequenceEnd) ||
            instrument !== (patternChannel[0] || 0) ||
            note ||
            0;

          for (
            let j = 0;
            j < beatLength && notFirstBeat;
            j++ > beatLength - 99 && stop
              ? (attenuation += (attenuation < 1 ? 1 : 0) / 99)
              : 0
          ) {
            const sample = ((1 - attenuation) * (sampleBuffer[sampleOffset++] ?? 0)) / 2 || 0;
            leftChannelBuffer[k] = leftChannelBuffer[k] - sample * panning + sample;
            rightChannelBuffer[k] = rightChannelBuffer[k++] + sample * panning + sample;
          }

          if (note) {
            attenuation = note % 1;
            panning = patternChannel[1] || 0;
            const noteInt = note | 0;
            if (noteInt) {
              sampleOffset = 0;
              instrument = patternChannel[0] || 0;
              const cacheKey = `${instrument}|${noteInt}`;
              if (!sampleCache[cacheKey]) {
                const instrumentParameters = [...(instruments[instrument] ?? [])];
                if (instrumentParameters[2] !== undefined) {
                  instrumentParameters[2] *= 2 ** ((noteInt - 12) / 12);
                }
                sampleCache[cacheKey] =
                  noteInt > 0 ? ZZFX.buildSamples(...instrumentParameters) : [];
              }
              sampleBuffer = sampleCache[cacheKey]!;
            }
          }
        }

        outSampleOffset = nextSampleOffset;
      });
    }

    return [leftChannelBuffer, rightChannelBuffer];
  },

  /** Play stereo sample data via Web Audio */
  play(
    sampleChannels: number[][],
    volumeScale = 1,
    rate = 1,
    pan = 0,
    loop = false
  ): AudioBufferSourceNode {
    return ZZFX.playSamples(sampleChannels, volumeScale, rate, pan, loop);
  },
};
