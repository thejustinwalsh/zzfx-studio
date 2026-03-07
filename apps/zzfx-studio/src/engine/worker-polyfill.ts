// Stub AudioContext for Web Worker context.
// The zzfx package eagerly creates `new AudioContext` at import time,
// but buildSamples (all the worker uses) never touches it.
// Injected via esbuild --inject before any module code runs.
if (typeof globalThis.AudioContext === 'undefined') {
  (globalThis as any).AudioContext = class {};
}
