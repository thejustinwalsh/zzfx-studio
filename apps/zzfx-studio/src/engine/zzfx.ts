import { ZZFX } from 'zzfx';

export { ZZFXM, zzfxm } from '@zzfx-studio/zzfxm';

let audioContext: AudioContext | null = null;
let masterAnalyser: AnalyserNode | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function getAnalyser(): AnalyserNode {
  const ctx = getAudioContext();
  if (!masterAnalyser) {
    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 256;
    masterAnalyser.smoothingTimeConstant = 0.7;
    masterAnalyser.connect(ctx.destination);
  }
  return masterAnalyser;
}

// Encode stereo float arrays to a 16-bit PCM WAV blob
export function floatsToWav(left: number[], right: number[]): Blob {
  const len = left.length;
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataSize = len * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // WAV header
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, ZZFX.sampleRate, true);       // sample rate
  view.setUint32(28, ZZFX.sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true);         // block align
  view.setUint16(34, bytesPerSample * 8, true);                   // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleaved 16-bit samples
  let offset = 44;
  for (let i = 0; i < len; i++) {
    const clampL = Math.max(-1, Math.min(1, left[i] || 0));
    const clampR = Math.max(-1, Math.min(1, right[i] || 0));
    view.setInt16(offset, clampL * 0x7FFF | 0, true);
    view.setInt16(offset + 2, clampR * 0x7FFF | 0, true);
    offset += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function zzfxP(
  sampleChannels: number[][],
  volumeScale = 1,
  rate = 1,
  pan = 0,
  loop = false
): AudioBufferSourceNode | null {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const channelCount = sampleChannels.length;
  const sampleLength = sampleChannels[0].length;
  if (sampleLength === 0) return null;

  const buffer = ctx.createBuffer(channelCount, sampleLength, ZZFX.sampleRate);
  const source = ctx.createBufferSource();

  sampleChannels.forEach((c, i) => buffer.getChannelData(i).set(c));
  source.buffer = buffer;
  source.playbackRate.value = rate;
  source.loop = loop;

  const analyser = getAnalyser();
  const gainNode = ctx.createGain();
  gainNode.gain.value = volumeScale;
  gainNode.connect(analyser);

  const pannerNode = new StereoPannerNode(ctx, { pan });
  source.connect(pannerNode).connect(gainNode);
  source.start();

  return source;
}

// Per-channel renderer — returns array of [left, right] stereo pairs, one per channel.
// Optional channelFilter renders only that channel (others get silent buffers).
export function zzfxMChannels(
  instruments: number[][],
  patterns: number[][][],
  sequence: number[],
  BPM = 125,
  channelFilter?: number
): [number[], number[]][] {
  const beatLength = (ZZFX.sampleRate / BPM) * 60 >> 2;

  // Determine channel count from patterns
  let channelCount = 0;
  for (const pat of patterns) {
    channelCount = Math.max(channelCount, pat.length);
  }
  if (channelCount === 0) return [];

  // Pre-compute total buffer length using same logic as zzfxM:
  // first pattern loses 1 beat (notFirstBeat guard), rest get full length
  const maxPatternSteps = patterns[0][0].length - 2;
  const totalSamples = ((sequence.length - 1) * maxPatternSteps + (maxPatternSteps - 1)) * beatLength;

  // Allocate per-channel stereo buffers
  const channelBuffers: [number[], number[]][] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    channelBuffers.push([new Array(totalSamples).fill(0), new Array(totalSamples).fill(0)]);
  }

  const sampleCache: Record<string, number[]> = {};

  for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
    // Skip channels we don't need to render
    if (channelFilter !== undefined && channelFilter !== channelIndex) continue;

    let sampleBuffer: number[] = [];
    let sampleOffset = 0;
    let notFirstBeat = 0;
    let instrument = 0;
    let panning = 0;
    let attenuation = 0;
    let outSampleOffset = 0;

    const leftBuf = channelBuffers[channelIndex][0];
    const rightBuf = channelBuffers[channelIndex][1];

    sequence.forEach((patternIndex: number, sequenceIndex: number) => {
      const patternChannel = patterns[patternIndex][channelIndex] || [0, 0, 0];
      const nextSampleOffset = outSampleOffset +
        (patternChannel.length - 2 - (notFirstBeat ? 0 : 1)) * beatLength;
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
          const sample = ((1 - attenuation) * sampleBuffer[sampleOffset++]) / 2 || 0;
          leftBuf[k] = (leftBuf[k] || 0) - sample * panning + sample;
          rightBuf[k] = (rightBuf[k] || 0) + sample * panning + sample;
          k++;
        }

        if (note) {
          attenuation = note % 1;
          panning = patternChannel[1] || 0;
          if ((note | 0)) {
            const noteInt = note | 0;
            const cacheKey = [(instrument = patternChannel[(sampleOffset = 0)] || 0), noteInt].toString();
            sampleBuffer = sampleCache[cacheKey] = sampleCache[cacheKey] || (
              () => {
                const instrumentParameters = [...instruments[instrument]];
                instrumentParameters[2] *= 2 ** ((noteInt - 12) / 12);
                return noteInt > 0 ? ZZFX.buildSamples(...instrumentParameters) : [];
              }
            )();
          }
        }
      }

      outSampleOffset = nextSampleOffset;
    });
  }

  return channelBuffers;
}

export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}
