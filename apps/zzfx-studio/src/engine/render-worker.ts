/**
 * Web Worker entry point for off-thread audio rendering.
 * Built separately via esbuild (see package.json "build:worker" script)
 * into public/render-worker.js as a self-contained bundle.
 *
 * The zzfx package eagerly creates `new AudioContext` at import time.
 * Workers don't have AudioContext, so we inject a stub via esbuild --inject
 * (see src/engine/worker-polyfill.ts) which runs before any imports.
 */

import type { Song } from './types';
import { renderSongBuffers } from './song';

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'render') {
    const buffers = renderSongBuffers(msg.song as Song);
    const transferable: ArrayBuffer[] = [];
    const result: [Float32Array, Float32Array][] = [];

    for (const [left, right] of buffers) {
      const l = left instanceof Float32Array ? left : new Float32Array(left);
      const r = right instanceof Float32Array ? right : new Float32Array(right);
      result.push([l, r]);
      transferable.push(l.buffer, r.buffer);
    }

    self.postMessage({ type: 'result', id: msg.id, buffers: result }, transferable as any);
  }
};
