import test from 'node:test';
import assert from 'node:assert/strict';

import * as storeMod from '../src/store';

const storeNs = (storeMod as any).default ?? storeMod;
const useSongStore = storeNs.useSongStore;

// A minimal song. The store only cares about its shape, not its musicality —
// importing the real generator would drag in zzfx, which needs an AudioContext.
function makeSong(): any {
  const channel = () => [0, 0, ...new Array(32).fill(0)];
  const fx = () => new Array(32).fill(null);
  return {
    config: { name: 'test', vibe: 'adventure', key: 'C', scale: 'major', bpm: 120, length: 'short' },
    instruments: [[0.5, 0, 261.63], [0.5, 0, 261.63], [0.5, 0, 130.815], [0.5, 0, 350]],
    patterns: { A: [channel(), channel(), channel(), channel()], B: [channel(), channel(), channel(), channel()] },
    patternRoles: { A: 'verse', B: 'contrast' },
    patternEffects: { A: [fx(), fx(), fx(), fx()], B: [fx(), fx(), fx(), fx()] },
    sequence: [0, 1],
    patternOrder: ['A', 'B'],
  };
}

function reset() {
  const s = useSongStore.getState();
  useSongStore.setState({
    projects: { p1: { id: 'p1', song: makeSong(), channelVolumes: [1, 1, 1, 1], activePattern: 'A', mutedChannels: [], soloChannel: null, lastSaved: 0 } },
    activeProjectId: 'p1',
    song: makeSong(),
    activePattern: 'A',
    history: storeNs.EMPTY_HISTORY,
  });
  return s;
}

const noteAt = (ch: number, row: number) =>
  useSongStore.getState().song.patterns[useSongStore.getState().activePattern][ch][row + 2];

test('a note edit is undoable and redoable', () => {
  reset();
  const { setNote, undo, redo } = useSongStore.getState();

  setNote('A', 0, 5, 24);
  assert.equal(noteAt(0, 5), 24);

  assert.equal(undo(), true);
  assert.equal(noteAt(0, 5), 0, 'undo did not restore the previous note');

  assert.equal(redo(), true);
  assert.equal(noteAt(0, 5), 24, 'redo did not reapply the edit');
});

test('undo and redo report false when there is nowhere to go', () => {
  reset();
  assert.equal(useSongStore.getState().undo(), false);
  assert.equal(useSongStore.getState().redo(), false);
});

test('separate keystrokes are separate undo steps', () => {
  reset();
  const { setNote, undo } = useSongStore.getState();
  setNote('A', 0, 0, 12);
  setNote('A', 0, 1, 14);
  setNote('A', 0, 2, 16);

  undo();
  assert.deepEqual([noteAt(0, 0), noteAt(0, 1), noteAt(0, 2)], [12, 14, 0]);
  undo();
  assert.deepEqual([noteAt(0, 0), noteAt(0, 1), noteAt(0, 2)], [12, 0, 0]);
  undo();
  assert.deepEqual([noteAt(0, 0), noteAt(0, 1), noteAt(0, 2)], [0, 0, 0]);
});

test('a transaction collapses a burst of edits into one undo step', () => {
  reset();
  const { beginEdit, setNote, endEdit, undo } = useSongStore.getState();

  // Stands in for a drag crossing twenty pixel thresholds.
  beginEdit('drag');
  for (let i = 0; i < 20; i++) setNote('A', 0, 5, 12 + i);
  endEdit();

  assert.equal(noteAt(0, 5), 31);
  assert.equal(useSongStore.getState().history.past.length, 1, 'drag left more than one step');

  assert.equal(undo(), true);
  assert.equal(noteAt(0, 5), 0, 'one undo did not clear the whole drag');
});

test('a transaction that changes nothing leaves no undo step', () => {
  reset();
  const { beginEdit, endEdit } = useSongStore.getState();
  beginEdit('drag');
  endEdit();
  assert.equal(useSongStore.getState().history.past.length, 0);
  assert.equal(useSongStore.getState().history.pending, null);
});

test('setting a note to the value it already has is not an undo step', () => {
  reset();
  const { setNote } = useSongStore.getState();
  setNote('A', 0, 5, 24);
  setNote('A', 0, 5, 24);
  assert.equal(useSongStore.getState().history.past.length, 1);
});

test('a new edit after undo discards the redo branch', () => {
  reset();
  const { setNote, undo, redo } = useSongStore.getState();
  setNote('A', 0, 0, 12);
  undo();
  assert.equal(useSongStore.getState().history.future.length, 1);

  setNote('A', 0, 1, 14);
  assert.equal(useSongStore.getState().history.future.length, 0, 'stale redo branch survived');
  assert.equal(redo(), false);
});

test('effect edits are undoable', () => {
  reset();
  const { setEffect, undo } = useSongStore.getState();
  const fx = { code: 'VB', value: 0x36 };
  setEffect('A', 1, 3, fx);
  assert.deepEqual(useSongStore.getState().song.patternEffects.A[1][3], fx);
  undo();
  assert.equal(useSongStore.getState().song.patternEffects.A[1][3], null);
});

test('commitSong records a coarse edit such as a regenerate', () => {
  reset();
  const { commitSong, undo } = useSongStore.getState();
  const before = useSongStore.getState().song;
  const regenerated = makeSong();
  regenerated.patterns.A[2][7] = 19;

  commitSong(regenerated, 'regenerate channel');
  assert.equal(noteAt(2, 5), 19);   // index 7 is row 5 — [instrument, pan, ...notes]

  undo();
  assert.equal(useSongStore.getState().song, before, 'undo did not restore the pre-regen song');
});

test('undo returns to the pattern the edit happened in', () => {
  reset();
  const { setNote, setActivePattern, undo } = useSongStore.getState();
  setNote('A', 0, 4, 24);
  setActivePattern('B');
  assert.equal(useSongStore.getState().activePattern, 'B');

  undo();
  assert.equal(useSongStore.getState().activePattern, 'A', 'undo left the view on an unrelated pattern');
});

test('history is bounded', () => {
  reset();
  const { setNote } = useSongStore.getState();
  for (let i = 0; i < 150; i++) setNote('A', 0, i % 32, (i % 30) + 12);
  const { past } = useSongStore.getState().history;
  assert.ok(past.length <= 100, `history grew to ${past.length}`);
});

test('snapshots share structure rather than copying the song', () => {
  reset();
  const { setNote } = useSongStore.getState();
  const before = useSongStore.getState().song;

  setNote('A', 0, 5, 24);
  const snap = useSongStore.getState().history.past[0];

  // The untouched channel and the untouched pattern are the same objects,
  // which is what makes whole-song snapshots affordable.
  assert.equal(snap.song, before);
  assert.equal(snap.song.patterns.B, useSongStore.getState().song.patterns.B);
  assert.equal(snap.song.patterns.A[1], useSongStore.getState().song.patterns.A[1]);
  assert.notEqual(snap.song.patterns.A[0], useSongStore.getState().song.patterns.A[0]);
});

test('switching projects clears history', () => {
  reset();
  const { setNote } = useSongStore.getState();
  setNote('A', 0, 0, 12);
  assert.equal(useSongStore.getState().history.past.length, 1);

  useSongStore.getState().loadProject('p1');
  assert.equal(useSongStore.getState().history.past.length, 0);
  assert.equal(useSongStore.getState().undo(), false);
});

test('history is not part of the persisted payload', () => {
  reset();
  useSongStore.getState().setNote('A', 0, 0, 12);
  assert.ok(useSongStore.getState().history.past.length > 0, 'no history to leak');

  const persisted = storeNs.partializeState(useSongStore.getState());
  assert.equal('history' in persisted, false, 'song snapshots would be written to storage');
  // The song itself must still be saved.
  assert.ok(persisted.song, 'song went missing from the persisted payload');
});
