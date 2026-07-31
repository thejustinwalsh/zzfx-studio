import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Song, SongLength, VibeName, NoteName, ScaleName, PatternLabel, Pattern, PatternEffects, NoteEffect } from './engine';
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

  // Pattern editing
  setNote: (pattern: PatternLabel, channel: number, row: number, note: number) => void;
  setEffect: (pattern: PatternLabel, channel: number, row: number, effect: NoteEffect | null) => void;

  // Undo/redo — session only, never persisted
  history: History;
  /** Replace the song and record the previous one as an undo step. */
  commitSong: (song: Song, label: string) => void;
  /** Open a transaction so a burst of edits collapses into one undo step. */
  beginEdit: (label: string) => void;
  endEdit: () => void;
  undo: () => boolean;
  redo: () => boolean;

  // Compound actions
  renameSong: (name: string) => void;
  loadSong: (song: Song) => void;
  generate: (v: VibeName, k: NoteName, s: ScaleName, b: number, l: SongLength) => Song;
  toggleMute: (ch: number) => void;
  toggleSolo: (ch: number) => void;
  updateVolume: (ch: number, vol: number) => void;

  // Project actions
  loadProject: (id: string) => void;
  deleteProject: (id: string) => void;
}

/**
 * A point in time we can return to.
 *
 * Snapshots are whole-song references rather than diffs. That is affordable
 * because every edit is an immutable update that clones only the channel it
 * touches — an old Song shares almost all of its structure with the current
 * one, so a snapshot costs a handful of pointers, not a copy of the song.
 *
 * activePattern rides along so undo returns you to where the edit happened
 * instead of silently changing a pattern you are not looking at.
 */
export interface Snapshot {
  song: Song;
  activePattern: PatternLabel;
  label: string;
}

export interface History {
  past: Snapshot[];
  future: Snapshot[];
  /** Open transaction: captured at beginEdit, banked at endEdit. */
  pending: Snapshot | null;
}

/** Deep enough that you can undo out of a long editing run. */
const HISTORY_LIMIT = 100;

export const EMPTY_HISTORY: History = { past: [], future: [], pending: null };

function snapshotOf(s: SongState, label: string): Snapshot | null {
  return s.song ? { song: s.song, activePattern: s.activePattern, label } : null;
}

/**
 * Bank the current state as an undo step and drop the redo branch.
 *
 * Skipped while a transaction is open — the transaction already captured the
 * state before the burst began, so a drag lands as one step rather than one
 * per pixel threshold crossed.
 */
function record(s: SongState, label: string): Pick<SongState, 'history'> | Record<string, never> {
  if (s.history.pending) return {};
  const snap = snapshotOf(s, label);
  if (!snap) return {};
  const past = [...s.history.past, snap];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { history: { past, future: [], pending: null } };
}

/**
 * What actually reaches storage. Undo history is deliberately absent: it holds
 * references to every past version of the song, and writing those to
 * localStorage would multiply the stored payload by the length of the session.
 */
export function partializeState(state: SongState) {
  return {
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
  };
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

      // Note values live at index row+2 — ChannelData is [instrument, pan, ...notes].
      setNote: (pattern, channel, row, note) => set((s) => {
        if (!s.song) return {};
        const existing = s.song.patterns[pattern];
        if (!existing) return {};
        if (existing[channel]?.[row + 2] === note) return {};

        const channels = [...existing] as Pattern;
        const data = [...channels[channel]];
        data[row + 2] = note;
        channels[channel] = data;

        const song = {
          ...s.song,
          patterns: { ...s.song.patterns, [pattern]: channels },
        };
        return syncToProject({ ...record(s, 'note'), song }, s);
      }),

      setEffect: (pattern, channel, row, effect) => set((s) => {
        if (!s.song) return {};
        const existing = s.song.patternEffects[pattern];
        if (!existing) return {};

        const channels = [...existing] as PatternEffects;
        const data = [...channels[channel]];
        data[row] = effect;
        channels[channel] = data;

        const song = {
          ...s.song,
          patternEffects: { ...s.song.patternEffects, [pattern]: channels },
        };
        return syncToProject({ ...record(s, 'effect'), song }, s);
      }),

      // --- Undo/redo ---------------------------------------------------------

      history: EMPTY_HISTORY,

      commitSong: (song, label) => set((s) =>
        syncToProject({ ...record(s, label), song }, s)
      ),

      beginEdit: (label) => set((s) => {
        if (s.history.pending) return {};
        const snap = snapshotOf(s, label);
        if (!snap) return {};
        return { history: { ...s.history, pending: snap } };
      }),

      endEdit: () => set((s) => {
        const { pending, past } = s.history;
        if (!pending) return {};
        // A transaction that changed nothing leaves no trace.
        if (pending.song === s.song) {
          return { history: { ...s.history, pending: null } };
        }
        const nextPast = [...past, pending];
        if (nextPast.length > HISTORY_LIMIT) nextPast.shift();
        return { history: { past: nextPast, future: [], pending: null } };
      }),

      undo: () => {
        const s = get();
        const prev = s.history.past[s.history.past.length - 1];
        if (!prev || !s.song) return false;
        set((cur) => {
          const current = snapshotOf(cur, prev.label);
          return syncToProject({
            song: prev.song,
            activePattern: prev.activePattern,
            history: {
              past: cur.history.past.slice(0, -1),
              future: current ? [...cur.history.future, current] : cur.history.future,
              pending: null,
            },
          }, cur);
        });
        return true;
      },

      redo: () => {
        const s = get();
        const next = s.history.future[s.history.future.length - 1];
        if (!next || !s.song) return false;
        set((cur) => {
          const current = snapshotOf(cur, next.label);
          return syncToProject({
            song: next.song,
            activePattern: next.activePattern,
            history: {
              past: current ? [...cur.history.past, current] : cur.history.past,
              future: cur.history.future.slice(0, -1),
              pending: null,
            },
          }, cur);
        });
        return true;
      },

      renameSong: (name) => set((s) => {
        if (!s.song) return {};
        const song = { ...s.song, config: { ...s.song.config, name } };
        return syncToProject({ song }, s);
      }),

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
          history: EMPTY_HISTORY,
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
          history: EMPTY_HISTORY,
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
          history: EMPTY_HISTORY,
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
              history: EMPTY_HISTORY,
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
          return { projects, activeProjectId: null, song: null, history: EMPTY_HISTORY };
        }
        return { projects };
      }),
    }),
    {
      name: 'zzfx-studio',
      version: 2,
      // Only persist data, not callbacks
      partialize: partializeState,
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
