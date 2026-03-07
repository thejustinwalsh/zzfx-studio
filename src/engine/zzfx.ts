// ZzFX - Zuper Zmall Zound Zynth v1.3.2 by Frank Force
// MIT License - https://github.com/KilledByAPixel/ZzFX
//
// ZzFXM Music Renderer v2.0.3 by Keith Clark and Frank Force
// MIT License - https://github.com/keithclark/ZzFXM

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

export const zzfxR = 44100; // sample rate

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
  view.setUint32(24, zzfxR, true);       // sample rate
  view.setUint32(28, zzfxR * numChannels * bytesPerSample, true); // byte rate
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

export function zzfxG(
  volume = 1,
  randomness = 0.05,
  frequency = 220,
  attack = 0,
  sustain = 0,
  release = 0.1,
  shape = 0,
  shapeCurve = 1,
  slide = 0,
  deltaSlide = 0,
  pitchJump = 0,
  pitchJumpTime = 0,
  repeatTime = 0,
  noise = 0,
  modulation = 0,
  bitCrush = 0,
  delay = 0,
  sustainVolume = 1,
  decay = 0,
  tremolo = 0,
  filter = 0
): number[] {
  const sampleRate = zzfxR;
  const PI2 = Math.PI * 2;
  const abs = Math.abs;
  const sign = (v: number) => (v < 0 ? -1 : 1);

  let startSlide = (slide *= (500 * PI2) / sampleRate / sampleRate);
  let startFrequency = (frequency *=
    ((1 + randomness * 2 * Math.random() - randomness) * PI2) / sampleRate);
  let modOffset = 0;
  let repeat = 0;
  let crush = 0;
  let jump = 1;
  const b: number[] = [];
  let t = 0;
  let i = 0;
  let s = 0;
  let f: number;

  // Biquad LP/HP filter
  const quality = 2;
  const w = PI2 * abs(filter) * 2 / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha;
  const a1 = -2 * cos / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0;
  const b1 = -(sign(filter) + cos) / a0;
  const b2 = b0;
  let x2 = 0, x1 = 0, y2 = 0, y1 = 0;

  const minAttack = 9;
  attack = attack * sampleRate || minAttack;
  decay *= sampleRate;
  sustain *= sampleRate;
  release *= sampleRate;
  delay *= sampleRate;
  deltaSlide *= (500 * PI2) / sampleRate ** 3;
  modulation *= PI2 / sampleRate;
  pitchJump *= PI2 / sampleRate;
  pitchJumpTime *= sampleRate;
  repeatTime = (repeatTime * sampleRate) | 0;
  volume *= 0.3; // master volume

  const length = (attack + decay + sustain + release + delay) | 0;

  for (; i < length; b[i++] = s * volume) {
    if (!(++crush % ((bitCrush * 100) | 0))) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? shape > 4
                ? (t / PI2 % 1 < shapeCurve / 2 ? 1 : -1) // 5 square duty
                : Math.sin(t ** 3) // 4 noise
              : Math.max(Math.min(Math.tan(t), 1), -1) // 3 tan
            : 1 - (((2 * t) / PI2) % 2 + 2) % 2 // 2 saw
          : 1 - 4 * abs(Math.round(t / PI2) - t / PI2) // 1 triangle
        : Math.sin(t); // 0 sin

      s =
        (repeatTime
          ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime)
          : 1) *
        (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) *
        (i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain
              ? sustainVolume
              : i < length - delay
                ? ((length - i - delay) / release) * sustainVolume
                : 0);

      s = delay
        ? s / 2 +
          (delay > i
            ? 0
            : ((i < length - delay ? 1 : (length - i) / delay) *
                b[(i - delay) | 0]) /
              2 /
              volume)
        : s;

      if (filter)
        s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
    }

    f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++);
    t += f + f * noise * Math.sin(i ** 5);

    if (jump && ++jump > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      jump = 0;
    }

    if (repeatTime && !(++repeat % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      jump = jump || 1;
    }
  }

  return b;
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

  const buffer = ctx.createBuffer(channelCount, sampleLength, zzfxR);
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

// ZzFXM Music Renderer
export function zzfxM(
  instruments: number[][],
  patterns: number[][][],
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
  const sampleCache: Record<string, number[]> = {};
  const beatLength = (zzfxR / BPM) * 60 >> 2;

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
            ] = sampleCache[
              [instrument, note].toString()
            ] || (
              (instrumentParameters = [...instruments[instrument]]),
              (instrumentParameters[2] *= 2 ** ((note - 12) / 12)),
              note > 0 ? zzfxG(...instrumentParameters) : []
            );
          }
        }
      }

      outSampleOffset = nextSampleOffset;
    });
  }

  return [leftChannelBuffer, rightChannelBuffer];
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
  const beatLength = (zzfxR / BPM) * 60 >> 2;

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
                return noteInt > 0 ? zzfxG(...instrumentParameters) : [];
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
