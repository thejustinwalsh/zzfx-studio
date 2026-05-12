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

  /**
   * Render a song to stereo sample data.
   *
   * Algorithm is the original Keith Clark / Frank Force ZzFXM beat
   * synthesizer, with two corrections from the canonical upstream:
   *
   *   1. **Per-channel state isolation.** Upstream declared
   *      `instrument`, `attenuation`, `panning`, `sampleBuffer`,
   *      `sampleOffset`, `notFirstBeat`, `pitch`, and `outSampleOffset`
   *      at function scope and only reassigned them conditionally
   *      inside the inner loop. The outer
   *      `for (; hasMore; channelIndex++)` then leaked those values
   *      across channel iterations, so the first note of channel N+1
   *      inherited channel N's last instrument, envelope position,
   *      pan, etc. — producing audible artifacts at the first beat
   *      of every non-zero channel and at every pattern loop boundary.
   *      Here, all per-channel state lives inside the channel loop
   *      body and starts fresh each iteration.
   *
   *   2. **Pre-allocated, deterministic-length buffers.** Upstream
   *      grew `leftChannelBuffer` / `rightChannelBuffer` dynamically
   *      via sparse indexed writes (`arr[k] = (arr[k] || 0) + ...`),
   *      which produced a buffer whose length depended on whichever
   *      channel iteration wrote furthest. Here, total length is
   *      computed up front as the sum of pattern-step counts across
   *      the sequence, multiplied by beatLength. Both buffers are
   *      zero-filled, so the loop boundary is sample-accurate and
   *      `source.loop = true` doesn't desync.
   *
   * The DSP math (waveform write, attenuation envelope, panning,
   * sample cache, instrument transposition) is unchanged.
   */
  build(
    instruments: Instrument[],
    patterns: Pattern[],
    sequence: number[],
    BPM = 125
  ): [number[], number[]] {
    const beatLength = (ZZFX.sampleRate / BPM * 60) >> 2;

    // Channel count = widest pattern. Upstream's `for (; hasMore; ...)`
    // walked channels until none had data; equivalent to stopping at
    // the max channel index any pattern uses, which we compute once.
    let channelCount = 0;
    for (const pat of patterns) {
      if (pat.length > channelCount) channelCount = pat.length;
    }
    if (channelCount === 0 || sequence.length === 0) return [[], []];

    // Total song length = sum of (pattern.steps × beatLength) across
    // the sequence. The first pattern's first beat is skipped by the
    // `notFirstBeat` guard (-1 beatLength); the last pattern gets a
    // trailing tail from the `isSequenceEnd ? 1 : 0` loop extension
    // (+1 beatLength). The two adjustments cancel exactly, so the
    // total reduces to a clean sum of pattern step counts.
    let totalSteps = 0;
    for (const patternIndex of sequence) {
      const pattern = patterns[patternIndex];
      totalSteps += (pattern?.[0]?.length ?? 2) - 2;
    }
    const totalSamples = totalSteps * beatLength;
    if (totalSamples <= 0) return [[], []];

    // Pre-allocated mixed stereo buffers — same `[left, right]` return
    // shape as upstream. Per-channel passes accumulate into the same
    // pair (the channel mix), but each channel's STATE is isolated
    // below so the accumulation is correct.
    const leftChannelBuffer: number[] = new Array(totalSamples).fill(0);
    const rightChannelBuffer: number[] = new Array(totalSamples).fill(0);

    // Sample cache memoizes synthesized waveforms by [instrument, note].
    // Shared across channels intentionally — same instrument playing
    // the same note resolves to the same waveform regardless of which
    // channel triggered it.
    const sampleCache: Record<string, number[]> = {};

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
      // PER-CHANNEL STATE — declared inside the loop so every channel
      // starts with `notFirstBeat = 0`, fresh attenuation envelope,
      // zeroed instrument/panning, empty sample buffer. This is the
      // primary fix vs upstream's shared state.
      let sampleBuffer: number[] = [];
      let sampleOffset = 0;
      let notFirstBeat = 0;
      let instrument = 0;
      let panning = 0;
      let attenuation = 0;
      let outSampleOffset = 0;

      sequence.forEach((patternIndex: number, sequenceIndex: number) => {
        const patternChannel = patterns[patternIndex]?.[channelIndex] || [0, 0, 0];
        const nextSampleOffset =
          outSampleOffset +
          ((patterns[patternIndex]?.[0]?.length ?? 2) - 2 - (notFirstBeat ? 0 : 1)) *
            beatLength;

        const isSequenceEnd = sequenceIndex === sequence.length - 1;
        let k = outSampleOffset;

        for (
          let i = 2;
          i < patternChannel.length + (isSequenceEnd ? 1 : 0);
          notFirstBeat = ++i
        ) {
          const note = patternChannel[i];

          const stop =
            (i === patternChannel.length + (isSequenceEnd ? 1 : 0) - 1 &&
              isSequenceEnd) ||
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
