// zzfx constructs an AudioContext the moment it is imported, and the store
// reaches it through the engine barrel. Stub just enough of the Web Audio and
// storage surface for logic tests to run headless; nothing here renders sound.

class StubAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  state = 'running';
  destination = {};
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  createAnalyser() {
    return { fftSize: 256, smoothingTimeConstant: 0, connect() {}, disconnect() {} };
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(0) };
  }
  createBufferSource() {
    return { buffer: null, connect() {}, start() {}, stop() {} };
  }
  resume() {}
}

const g = globalThis as Record<string, unknown>;
g.AudioContext ??= StubAudioContext;
g.webkitAudioContext ??= StubAudioContext;

// zustand's persist middleware needs a storage object to initialise at all.
// An in-memory one keeps the middleware's real code path under test without
// touching disk.
class MemoryStorage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
}
g.localStorage ??= new MemoryStorage();
