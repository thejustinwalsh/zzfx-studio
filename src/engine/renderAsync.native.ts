// Native implementation: synchronous fallback (worklets TBD).

import type { Song } from './types';
import type { StereoBuffer, RenderEngine } from './renderAsync';
import { renderSongBuffers } from './song';

export function createRenderEngine(): RenderEngine {
  return {
    async renderSongBuffers(song: Song): Promise<StereoBuffer[]> {
      const buffers = renderSongBuffers(song);
      // Convert number[][] to Float32Array[]
      return buffers.map(([left, right]) => [
        new Float32Array(left),
        new Float32Array(right),
      ] as StereoBuffer);
    },

    dispose() {
      // No-op on native
    },
  };
}
