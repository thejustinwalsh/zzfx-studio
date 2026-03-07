// Platform-agnostic interface for async audio rendering.
// Platform-specific implementations in renderAsync.web.ts and renderAsync.native.ts
// Metro resolves .web.ts / .native.ts at build time.

import type { Song } from './types';

export type StereoBuffer = [Float32Array, Float32Array];

export interface RenderEngine {
  renderSongBuffers(song: Song): Promise<StereoBuffer[]>;
  dispose(): void;
}

// This function is implemented in renderAsync.web.ts and renderAsync.native.ts.
// TypeScript sees this base file for type checking; Metro picks the platform file at runtime.
export declare function createRenderEngine(): RenderEngine;
