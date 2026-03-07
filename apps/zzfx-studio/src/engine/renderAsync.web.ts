// Web implementation: uses a Web Worker for off-thread audio rendering.

import type { Song } from './types';
import type { StereoBuffer, RenderEngine } from './renderAsync';

let sharedWorker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, {
  resolve: (buffers: StereoBuffer[]) => void;
  reject: (err: Error) => void;
}>();

function getWorkerURL(): string {
  const base = typeof window !== 'undefined'
    ? window.location.href.replace(/\/[^/]*$/, '/')
    : '/';
  return base + 'render-worker.js';
}

function getWorker(): Worker {
  if (sharedWorker) return sharedWorker;

  sharedWorker = new Worker(getWorkerURL());

  sharedWorker.onmessage = (e: MessageEvent) => {
    const { type, id, buffers } = e.data;
    if (type === 'result') {
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        p.resolve(buffers as StereoBuffer[]);
      }
    }
  };

  sharedWorker.onerror = (err) => {
    console.error('[RenderWorker] error:', err.message);
    // Reject all pending requests
    for (const [, p] of pending) {
      p.reject(new Error(`Worker error: ${err.message}`));
    }
    pending.clear();
  };

  return sharedWorker;
}

export function createRenderEngine(): RenderEngine {
  return {
    renderSongBuffers(song: Song): Promise<StereoBuffer[]> {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        try {
          getWorker().postMessage({ type: 'render', id, song });
        } catch (err) {
          pending.delete(id);
          reject(err);
        }
      });
    },

    dispose() {
      if (sharedWorker) {
        sharedWorker.terminate();
        sharedWorker = null;
      }
      pending.clear();
    },
  };
}
