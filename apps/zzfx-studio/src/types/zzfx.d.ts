declare module 'zzfx' {
  export function zzfx(...parameters: number[]): AudioBufferSourceNode;

  export const ZZFX: {
    volume: number;
    sampleRate: number;
    audioContext: AudioContext;
    play(...parameters: number[]): AudioBufferSourceNode;
    playSamples(
      sampleChannels: number[][],
      volumeScale?: number,
      rate?: number,
      pan?: number,
      loop?: boolean
    ): AudioBufferSourceNode;
    buildSamples(
      volume?: number,
      randomness?: number,
      frequency?: number,
      attack?: number,
      sustain?: number,
      release?: number,
      shape?: number,
      shapeCurve?: number,
      slide?: number,
      deltaSlide?: number,
      pitchJump?: number,
      pitchJumpTime?: number,
      repeatTime?: number,
      noise?: number,
      modulation?: number,
      bitCrush?: number,
      delay?: number,
      sustainVolume?: number,
      decay?: number,
      tremolo?: number,
      filter?: number
    ): number[];
    getNote(semitoneOffset?: number, rootNoteFrequency?: number): number;
  };

  export class ZZFXSound {
    constructor(zzfxSound?: number[]);
    play(
      volume?: number,
      pitch?: number,
      randomnessScale?: number,
      pan?: number,
      loop?: boolean
    ): AudioBufferSourceNode;
  }
}
