import { computeBarColors } from '../components';
import type { ChannelNote, RGB } from '../components';
import type { Pattern, Song } from '../engine';

/**
 * Per-row spectrum colours for a pattern.
 *
 * The analyser only reports magnitudes, not which channel produced them, so the
 * colour has to be worked out from the score: for every row, find the note
 * still sounding on each channel, weight it by where it sits in that
 * instrument's envelope, and let `computeBarColors` distribute those into bars.
 *
 * Shared so the studio and the embedded mini player tint identically — a copy
 * in each would drift the moment either was touched.
 */
export function buildOscColorTable(
  song: Song,
  pattern: Pattern,
  barCount: number,
  analyser: AnalyserNode | null | undefined,
  rows = 32
): RGB[][] {
  const rowDuration = 60 / song.config.bpm / 4;
  const sampleRate = analyser?.context?.sampleRate;
  const fftSize = analyser?.fftSize;

  const ctx = analyser?.context as AudioContext | undefined;
  const audioLatency = (ctx?.baseLatency ?? 0) + (ctx?.outputLatency ?? 0);

  const envelopes = song.instruments.map((params) => ({
    attack: params[3] ?? 0,
    sustain: params[4] ?? 0,
    release: params[5] ?? 0,
    decay: params[18] ?? 0,
  }));

  const channelCount = pattern.length;
  const channelNoteMap: (ChannelNote | null)[][] = Array.from({ length: rows }, () => []);

  for (let row = 0; row < rows; row++) {
    for (let ch = 0; ch < channelCount; ch++) {
      // Walk back to the most recent struck note — it may still be ringing.
      let foundNote = 0;
      let noteRow = -1;
      for (let r = row; r >= 0; r--) {
        const val = pattern[ch][r + 2];
        if (val > 0) { foundNote = val; noteRow = r; break; }
      }

      if (foundNote <= 0 || noteRow < 0) {
        channelNoteMap[row].push(null);
        continue;
      }

      const elapsed = (row - noteRow) * rowDuration + audioLatency;
      const env = envelopes[ch];
      const adsrDuration = env.attack + env.decay + env.sustain + env.release;

      const visualTail = 0.3;
      const minVisualDuration = 0.4;
      const totalVisualDuration = Math.max(adsrDuration + visualTail, minVisualDuration);

      if (elapsed > totalVisualDuration) {
        channelNoteMap[row].push(null);
        continue;
      }

      let amp = 1.0;
      if (elapsed < env.attack) {
        amp = elapsed / Math.max(env.attack, 0.001);
      } else if (elapsed < env.attack + env.decay) {
        amp = 1.0;
      } else if (elapsed < env.attack + env.decay + env.sustain) {
        amp = 0.8;
      } else if (elapsed < adsrDuration) {
        const releaseElapsed = elapsed - (env.attack + env.decay + env.sustain);
        amp = Math.max(0, 0.8 * (1 - releaseElapsed / Math.max(env.release, 0.001)));
      } else {
        const tailElapsed = elapsed - adsrDuration;
        const tailProgress = tailElapsed / visualTail;
        amp = 0.3 * (1 - tailProgress * tailProgress);
      }

      const baseFreq = song.instruments[ch][2] ?? 261.63;
      const frequency = baseFreq * Math.pow(2, (foundNote - 12) / 12);
      const shape = song.instruments[ch][6] ?? 0;
      // Drums are broadband, so they would otherwise wash the whole spectrum.
      const baseWeight = ch === 3 ? 0.35 : 1.0;
      channelNoteMap[row].push({ frequency, shape, weight: baseWeight * amp });
    }
  }

  return channelNoteMap.map((notes) => computeBarColors(notes, barCount, sampleRate, fftSize));
}
