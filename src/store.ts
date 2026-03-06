import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Song, SongLength, VibeName, NoteName, ScaleName, PatternLabel } from './engine';
import { generateSong, generateSongName, VIBE_CONFIG, CHROMATIC, SCALES } from './engine';

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const VIBE_OPTIONS: VibeName[] = ['adventure', 'battle', 'dungeon', 'titleScreen', 'boss'];
const KEY_OPTIONS: NoteName[] = [...CHROMATIC];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export interface ProjectEntry {
  id: string;
  song: Song;
  channelVolumes: number[];
  activePattern: PatternLabel;
  mutedChannels: number[];
  soloChannel: number | null;
  lastSaved: number; // timestamp
}

interface SongState {
  // Multi-project state
  projects: Record<string, ProjectEntry>;
  activeProjectId: string | null;

  // Derived from active project (kept as top-level for backward compat)
  song: Song | null;
  vibe: VibeName;
  key: NoteName;
  scale: ScaleName;
  bpm: number;
  songLength: SongLength;
  channelVolumes: number[];
  activePattern: PatternLabel;
  mutedChannels: number[];
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

  // Project actions
  loadProject: (id: string) => void;
  deleteProject: (id: string) => void;
}

// Sync top-level state to the active project entry
function syncToProject(state: Partial<SongState>, full: SongState): Partial<SongState> {
  const id = state.activeProjectId ?? full.activeProjectId;
  if (!id) return state;

  const song = state.song ?? full.song;
  if (!song) return state;

  const projects = { ...(state.projects ?? full.projects) };
  projects[id] = {
    id,
    song,
    channelVolumes: state.channelVolumes ?? full.channelVolumes,
    activePattern: state.activePattern ?? full.activePattern,
    mutedChannels: state.mutedChannels ?? full.mutedChannels,
    soloChannel: state.soloChannel !== undefined ? state.soloChannel : full.soloChannel,
    lastSaved: Date.now(),
  };

  return { ...state, projects };
}

export const useSongStore = create<SongState>()(
  persist(
    (set, get) => ({
      projects: {},
      activeProjectId: null,

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

      setSong: (song) => set((s) => syncToProject({ song }, s)),
      setVibe: (vibe) => set({ vibe }),
      setKey: (key) => set({ key }),
      setScale: (scale) => set({ scale }),
      setBpm: (bpm) => set({ bpm }),
      setSongLength: (songLength) => set({ songLength }),
      setChannelVolumes: (vols) => set((s) => {
        const channelVolumes = typeof vols === 'function' ? vols(s.channelVolumes) : vols;
        return syncToProject({ channelVolumes }, s);
      }),
      setActivePattern: (activePattern) => set((s) => syncToProject({ activePattern }, s)),
      setMutedChannels: (chs) => set((s) => {
        const mutedChannels = typeof chs === 'function' ? chs(s.mutedChannels) : chs;
        return syncToProject({ mutedChannels }, s);
      }),
      setSoloChannel: (soloChannel) => set((s) => syncToProject({ soloChannel }, s)),

      loadSong: (song) => {
        // Import from file — create a new project for it
        const id = generateId();
        const entry: ProjectEntry = {
          id,
          song,
          channelVolumes: song.instruments.map(p => p[0] ?? 1),
          activePattern: song.patternOrder[0],
          mutedChannels: [],
          soloChannel: null,
          lastSaved: Date.now(),
        };
        set((s) => ({
          projects: { ...s.projects, [id]: entry },
          activeProjectId: id,
          song,
          vibe: song.config.vibe,
          key: song.config.key,
          scale: song.config.scale,
          bpm: song.config.bpm,
          songLength: song.config.length,
          activePattern: song.patternOrder[0],
          channelVolumes: song.instruments.map(p => p[0] ?? 1),
          mutedChannels: [],
          soloChannel: null,
        }));
      },

      generate: (v, k, s, b, l) => {
        const newSong = generateSong({ vibe: v, key: k, scale: s, bpm: b, length: l });
        const id = generateId();
        const entry: ProjectEntry = {
          id,
          song: newSong,
          channelVolumes: newSong.instruments.map(p => p[0] ?? 1),
          activePattern: newSong.patternOrder[0],
          mutedChannels: [],
          soloChannel: null,
          lastSaved: Date.now(),
        };
        set((prev) => ({
          projects: { ...prev.projects, [id]: entry },
          activeProjectId: id,
          song: newSong,
          vibe: v,
          key: k,
          scale: s,
          bpm: newSong.config.bpm,
          songLength: l,
          activePattern: newSong.patternOrder[0],
          channelVolumes: newSong.instruments.map(p => p[0] ?? 1),
          mutedChannels: [],
          soloChannel: null,
        }));
        return newSong;
      },

      toggleMute: (ch) => set((s) => {
        const muted = new Set(s.mutedChannels);
        if (muted.has(ch)) muted.delete(ch);
        else muted.add(ch);
        const mutedChannels = [...muted];
        const soloChannel = s.soloChannel === ch ? null : s.soloChannel;
        return syncToProject({ mutedChannels, soloChannel }, s);
      }),

      toggleSolo: (ch) => set((s) => {
        const soloChannel = s.soloChannel === ch ? null : ch;
        return syncToProject({ soloChannel }, s);
      }),

      updateVolume: (ch, vol) => set((s) => {
        if (!s.song) return {};
        const newInstruments = [...s.song.instruments];
        newInstruments[ch] = [...newInstruments[ch]];
        newInstruments[ch][0] = vol;
        const newVols = [...s.channelVolumes];
        newVols[ch] = vol;
        const song = { ...s.song, instruments: newInstruments };
        return syncToProject({ song, channelVolumes: newVols }, s);
      }),

      loadProject: (id) => set((s) => {
        const project = s.projects[id];
        if (!project) return {};
        return {
          activeProjectId: id,
          song: project.song,
          vibe: project.song.config.vibe,
          key: project.song.config.key,
          scale: project.song.config.scale,
          bpm: project.song.config.bpm,
          songLength: project.song.config.length,
          activePattern: project.activePattern,
          channelVolumes: project.channelVolumes,
          mutedChannels: project.mutedChannels,
          soloChannel: project.soloChannel,
        };
      }),

      deleteProject: (id) => set((s) => {
        const projects = { ...s.projects };
        delete projects[id];
        // If deleting the active project, switch to the most recent remaining
        if (s.activeProjectId === id) {
          const sorted = Object.values(projects).sort((a, b) => b.lastSaved - a.lastSaved);
          const next = sorted[0];
          if (next) {
            return {
              projects,
              activeProjectId: next.id,
              song: next.song,
              vibe: next.song.config.vibe,
              key: next.song.config.key,
              scale: next.song.config.scale,
              bpm: next.song.config.bpm,
              songLength: next.song.config.length,
              activePattern: next.activePattern,
              channelVolumes: next.channelVolumes,
              mutedChannels: next.mutedChannels,
              soloChannel: next.soloChannel,
            };
          }
          return { projects, activeProjectId: null, song: null };
        }
        return { projects };
      }),
    }),
    {
      name: 'zzfx-gen-studio',
      version: 2,
      // Only persist data, not callbacks
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
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
      // Migrate from v1 (single song) to v2 (multi-project)
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          // v1: single song stored at top level, no projects
          const state = persisted as any;
          if (state.song) {
            // Backfill name if missing from v1
            if (!state.song.config.name) {
              state.song.config.name = generateSongName(state.song.config.vibe);
            }
            const id = generateId();
            const entry: ProjectEntry = {
              id,
              song: state.song,
              channelVolumes: state.channelVolumes ?? [1, 1, 1, 1],
              activePattern: state.activePattern ?? 'A',
              mutedChannels: state.mutedChannels ?? [],
              soloChannel: state.soloChannel ?? null,
              lastSaved: Date.now(),
            };
            state.projects = { [id]: entry };
            state.activeProjectId = id;
          } else {
            state.projects = {};
            state.activeProjectId = null;
          }
        }
        return persisted as any;
      },
    }
  )
);

// Wait for persist hydration, then generate a song if none was persisted
export function initializeStore(): Promise<void> {
  return new Promise((resolve) => {
    // If already hydrated (e.g. no storage), handle immediately
    if (useSongStore.persist.hasHydrated()) {
      _ensureSong();
      resolve();
      return;
    }
    useSongStore.persist.onFinishHydration(() => {
      _ensureSong();
      resolve();
    });
  });
}

function _ensureSong() {
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

/** Hook to check if the store has finished hydrating */
export function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useSongStore.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    const unsub = useSongStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [hydrated]);
  return hydrated;
}
