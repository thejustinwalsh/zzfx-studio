import { zzfxR } from './zzfx';

export class AudioGraph {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private analyser: AnalyserNode;
  private gainNodes: GainNode[];
  private sources: (AudioBufferSourceNode | null)[];
  private playStartTime: number = 0;
  private songDuration: number = 0;
  private _bpm: number = 125;
  private _isPlaying: boolean = false;

  onEnded?: () => void;

  constructor() {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.7;

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Create 4 persistent gain nodes
    this.gainNodes = [];
    this.sources = [];
    for (let i = 0; i < 4; i++) {
      const gain = this.ctx.createGain();
      gain.connect(this.masterGain);
      this.gainNodes.push(gain);
      this.sources.push(null);
    }
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get bpm(): number {
    return this._bpm;
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  getPosition(): number {
    if (!this._isPlaying || this.songDuration === 0) return 0;
    const elapsed = this.ctx.currentTime - this.playStartTime;
    return elapsed % this.songDuration;
  }

  play(channelBuffers: [number[], number[]][], songDurationSec: number, bpm: number): void {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Stop any existing sources
    this.stopSources();

    this.songDuration = songDurationSec;
    this._bpm = bpm;
    this.playStartTime = this.ctx.currentTime;
    this._isPlaying = true;

    const numChannels = Math.min(channelBuffers.length, 4);
    for (let ch = 0; ch < numChannels; ch++) {
      this.createAndStartSource(ch, channelBuffers[ch], 0);
    }
  }

  stop(): void {
    this.stopSources();
    this._isPlaying = false;
  }

  setChannelGain(ch: number, gain: number): void {
    if (ch >= 0 && ch < this.gainNodes.length) {
      this.gainNodes[ch].gain.value = gain;
    }
  }

  replaceChannel(ch: number, stereoBuffer: [number[], number[]]): void {
    if (!this._isPlaying || ch < 0 || ch >= 4) return;

    const now = this.ctx.currentTime;
    const elapsed = (now - this.playStartTime) % this.songDuration;

    // Quantize to next row boundary
    const rowDuration = 60 / this._bpm / 4;
    const nextRowTime = Math.ceil(elapsed / rowDuration) * rowDuration;
    const swapTime = this.playStartTime + Math.floor((now - this.playStartTime) / this.songDuration) * this.songDuration + nextRowTime;

    // Stop old source at swap time
    const oldSource = this.sources[ch];
    if (oldSource) {
      try { oldSource.stop(swapTime); } catch (_) { /* already stopped */ }
    }

    // Create new source starting at swap time with correct offset
    const offset = nextRowTime % this.songDuration;
    this.createAndStartSource(ch, stereoBuffer, offset, swapTime);
  }

  private createAndStartSource(
    ch: number,
    stereoBuffer: [number[], number[]],
    offset: number,
    when?: number
  ): void {
    const [left, right] = stereoBuffer;
    if (left.length === 0) return;

    const buffer = this.ctx.createBuffer(2, left.length, zzfxR);
    buffer.getChannelData(0).set(left);
    buffer.getChannelData(1).set(right);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.gainNodes[ch]);

    if (when !== undefined) {
      source.start(when, offset);
    } else {
      source.start(0, offset);
    }

    this.sources[ch] = source;
  }

  private stopSources(): void {
    for (let i = 0; i < this.sources.length; i++) {
      const src = this.sources[i];
      if (src) {
        try { src.stop(); } catch (_) { /* already stopped */ }
        src.disconnect();
        this.sources[i] = null;
      }
    }
  }
}
