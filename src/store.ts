import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Song, SongLength, VibeName, NoteName, ScaleName, PatternLabel } from './engine';
import { generateSong, VIBE_CONFIG, CHROMATIC, SCALES } from './engine';

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const VIBE_OPTIONS: VibeName[] = ['adventure', 'battle', 'dungeon', 'titleScreen', 'boss'];
const KEY_OPTIONS: NoteName[] = [...CHROMATIC];

interface SongState {
  // Persisted song data
  song: Song | null;
  vibe: VibeName;
  key: NoteName;
  scale: ScaleName;
  bpm: number;
  songLength: SongLength;
  channelVolumes: number[];
  activePattern: PatternLabel;
  mutedChannels: number[]; // array instead of Set for JSON serialization
  soloChannel: number | null;

  // Actions
  setSong: (song: Song) => void;
  setVibe: (v: VibeName) => void;
  setKey: (k: NoteName) => void;
  setScale: (s: ScaleName) => void;
  setBpm: (bpm: number) => void;
  setSongLength: (l: SongLength) => void;
  setChannelVolumes: (vols: number[] | ((prev: number[]) => number[])) => void;
  setActivePattern: (p: PatternLabel) => void;
  setMutedChannels: (chs: number[] | ((prev: number[]) => number[])) => void;
  setSoloChannel: (ch: number | null) => void;

  // Compound actions
  loadSong: (song: Song) => void;
  generate: (v: VibeName, k: NoteName, s: ScaleName, b: number, l: SongLength) => Song;
  toggleMute: (ch: number) => void;
  toggleSolo: (ch: number) => void;
  updateVolume: (ch: number, vol: number) => void;
}

export const useSongStore = create<SongState>()(
  persist(
    (set, get) => ({
      song: null,
      vibe: 'adventure',
      key: 'C',
      scale: 'major',
      bpm: 120,
      songLength: 'long',
      channelVolumes: [1, 1, 1, 1],
      activePattern: 'A',
      mutedChannels: [],
      soloChannel: null,

      setSong: (song) => set({ song }),
      setVibe: (vibe) => set({ vibe }),
      setKey: (key) => set({ key }),
      setScale: (scale) => set({ scale }),
      setBpm: (bpm) => set({ bpm }),
      setSongLength: (songLength) => set({ songLength }),
      setChannelVolumes: (vols) => set((s) => ({
        channelVolumes: typeof vols === 'function' ? vols(s.channelVolumes) : vols,
      })),
      setActivePattern: (activePattern) => set({ activePattern }),
      setMutedChannels: (chs) => set((s) => ({
        mutedChannels: typeof chs === 'function' ? chs(s.mutedChannels) : chs,
      })),
      setSoloChannel: (soloChannel) => set({ soloChannel }),

      loadSong: (song) => set({
        song,
        vibe: song.config.vibe,
        key: song.config.key,
        scale: song.config.scale,
        bpm: song.config.bpm,
        songLength: song.config.length,
        activePattern: song.patternOrder[0],
        channelVolumes: song.instruments.map(p => p[0] ?? 1),
      }),

      generate: (v, k, s, b, l) => {
        const newSong = generateSong({ vibe: v, key: k, scale: s, bpm: b, length: l });
        set({
          song: newSong,
          vibe: v,
          key: k,
          scale: s,
          bpm: newSong.config.bpm,
          songLength: l,
          activePattern: newSong.patternOrder[0],
          channelVolumes: newSong.instruments.map(p => p[0] ?? 1),
        });
        return newSong;
      },

      toggleMute: (ch) => set((s) => {
        const muted = new Set(s.mutedChannels);
        if (muted.has(ch)) muted.delete(ch);
        else muted.add(ch);
        return {
          mutedChannels: [...muted],
          soloChannel: s.soloChannel === ch ? null : s.soloChannel,
        };
      }),

      toggleSolo: (ch) => set((s) => ({
        soloChannel: s.soloChannel === ch ? null : ch,
      })),

      updateVolume: (ch, vol) => set((s) => {
        if (!s.song) return {};
        const newInstruments = [...s.song.instruments];
        newInstruments[ch] = [...newInstruments[ch]];
        newInstruments[ch][0] = vol;
        const newVols = [...s.channelVolumes];
        newVols[ch] = vol;
        return {
          song: { ...s.song, instruments: newInstruments },
          channelVolumes: newVols,
        };
      }),
    }),
    {
      name: 'zzfx-gen-studio',
      // Only persist the song data, not callbacks
      partialize: (state) => ({
        song: state.song,
        vibe: state.vibe,
        key: state.key,
        scale: state.scale,
        bpm: state.bpm,
        songLength: state.songLength,
        channelVolumes: state.channelVolumes,
        activePattern: state.activePattern,
        mutedChannels: state.mutedChannels,
        soloChannel: state.soloChannel,
      }),
    }
  )
);

// Initialize store — generate a random song if none persisted
export function initializeStore() {
  const { song } = useSongStore.getState();
  if (!song) {
    const v = pick(VIBE_OPTIONS);
    const k = pick(KEY_OPTIONS);
    const vibeConf = VIBE_CONFIG[v];
    const s = pick(vibeConf.preferredScales);
    const b = vibeConf.bpmRange[0] + Math.floor(Math.random() * (vibeConf.bpmRange[1] - vibeConf.bpmRange[0] + 1));
    useSongStore.getState().generate(v, k, s, b, 'long');
  }
}
