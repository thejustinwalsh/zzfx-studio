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
    let instrumentParameters: number[];
    let i: number;
    let j: number;
    let k: number;
    let note: number;
    let sample: number;
    let patternChannel: number[];
    let notFirstBeat: number;
    let stop: number | boolean;
    let instrument: number;
    let pitch: number;
    let attenuation: number;
    let outSampleOffset: number;
    let isSequenceEnd: boolean;
    let sampleOffset = 0;
    let nextSampleOffset: number;
    let sampleBuffer: number[] = [];
    let leftChannelBuffer: number[] = [];
    let rightChannelBuffer: number[] = [];
    let channelIndex = 0;
    let panning = 0;
    let hasMore = 1;
    let sampleCache: Record<string, number[]> = {};
    let beatLength = ZZFX.sampleRate / BPM * 60 >> 2;

    for (; hasMore; channelIndex++) {
      sampleBuffer = [(hasMore = notFirstBeat = pitch = outSampleOffset = 0)];

      sequence.map((patternIndex: number, sequenceIndex: number) => {
        patternChannel = patterns[patternIndex][channelIndex] || [0, 0, 0];
        hasMore |= patterns[patternIndex][channelIndex] ? 1 : 0;
        nextSampleOffset =
          outSampleOffset +
          (patterns[patternIndex][0].length - 2 - (notFirstBeat ? 0 : 1)) *
            beatLength;

        isSequenceEnd = sequenceIndex == sequence.length - 1;
        for (
          i = 2, k = outSampleOffset;
          i < patternChannel.length + (isSequenceEnd ? 1 : 0);
          notFirstBeat = ++i
        ) {
          note = patternChannel[i];

          stop =
            (i == patternChannel.length + (isSequenceEnd ? 1 : 0) - 1 &&
              isSequenceEnd) ||
            instrument != (patternChannel[0] || 0) ||
            note ||
            0;

          for (
            j = 0;
            j < beatLength && notFirstBeat;
            j++ > beatLength - 99 && stop
              ? (attenuation += (attenuation < 1 ? 1 : 0) / 99)
              : 0
          ) {
            sample = ((1 - attenuation) * sampleBuffer[sampleOffset++]) / 2 || 0;
            leftChannelBuffer[k] =
              (leftChannelBuffer[k] || 0) - sample * panning + sample;
            rightChannelBuffer[k] =
              (rightChannelBuffer[k++] || 0) + sample * panning + sample;
          }

          if (note) {
            attenuation = note % 1;
            panning = patternChannel[1] || 0;
            if ((note |= 0)) {
              sampleBuffer = sampleCache[
                [
                  (instrument = patternChannel[(sampleOffset = 0)] || 0),
                  note,
                ].toString()
              ] = sampleCache[[instrument, note].toString()] || (
                (instrumentParameters = [...instruments[instrument]]),
                (instrumentParameters[2] *= 2 ** ((note - 12) / 12)),
                note > 0 ? ZZFX.buildSamples(...instrumentParameters) : []
              );
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
