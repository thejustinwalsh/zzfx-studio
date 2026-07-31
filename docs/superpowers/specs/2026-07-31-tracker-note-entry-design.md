# Tracker Note Entry — Design

Make the pattern grid fully editable: keyboard navigation and note entry, an
inline effect editor, and pointer-drag manipulation of notes and octaves.

## Scope

In scope:

- Cell cursor with arrow-key navigation across 8 stops per row (note + effect
  per channel).
- Keyboard note entry, `Shift` for sharps, `Delete` to clear.
- Octave register, stepped with `[` / `]`.
- Inline effect editor opened with `Enter`.
- Pointer drag: horizontal steps through scale degrees, vertical through
  octaves.
- Fix the C-3 rest collision in bass voicing.

Non-goals:

- Undo/redo. Drag is reversible by dragging back, `Delete` affects one cell, and
  every edit persists immediately. A history stack is a separate feature.
- Enharmonic spelling. Notes are pitches; the grid renders sharps.
- Copy/paste, block selection, pattern-length editing.
- Retuning instruments per channel (see Follow-up).

## Note encoding

ZzFXM stores a channel as `[instrument, panning, ...notes]`. A note is a
semitone offset where 12 is the instrument's own frequency:

```js
// packages/zzfxm/src/zzfxm.ts
if (note) { ... }                                    // :120  falsy = no note
noteInt > 0 ? ZZFX.buildSamples(...) : []            // :134
instrumentParameters[2] *= 2 ** ((noteInt - 12)/12)  // :131
```

`0` is the rest sentinel and cannot carry a pitch. Every instrument is tuned to
261.63 Hz (C4), and `BASE_OCTAVE_OFFSET = 4`, so note 12 is C4 and the usable
range is note 1 (`C#3`) through 48 (`C-7`).

### The C-3 collision

`noteToZzfxm(C, 3)` computes `0 + (3-4)*12 + 12 = 0` — the rest sentinel.
`buildChord` voices bass at octave 3 ([chords.ts:122]), so any chord whose root
is chromatic C encodes to silence in the bass channel. 40 key/scale/degree
combinations are affected. In the key of C — the store's default — every tonic
bass root is silent.

Fix: guard the bass voicings in `buildChord`. A root, third, or fifth computing
to `<= 0` is raised one octave.

```ts
const lift = (v: number) => (v > 0 ? v : v + 12);
```

This is deliberately surgical. It changes only the notes that were silent, needs
no persist migration, and keeps `zzfxmToNoteName` honest. Already-saved songs
keep their stored values and render as before; regenerating a pattern heals
them.

The editor treats `C-3` as unavailable rather than silently transposing, so
typing `C` at `OCT 3` is a no-op with a brief flash on the register.

## Architecture

The grid currently lives inline in `App.tsx`, which is 1255 lines. Adding a
cursor, a key handler, a drag recognizer, and an effect editor to that file
would make it unworkable. The grid moves out; `App.tsx` keeps audio ownership.

```
src/engine/noteEntry.ts      NEW  pure entry/step math, no React
src/engine/chords.ts          ~   bass voicing guard
src/components/PatternGrid.tsx NEW grid render + cursor + input
src/components/EffectEditor.tsx NEW inline effect popup
src/store.ts                  ~   setNote / setEffect
App.tsx                       ~   grid markup out, audio callbacks in
test/noteEntry.test.ts       NEW  node --import tsx --test
```

The boundary: `PatternGrid` owns cursor state and writes song data through store
actions. It never touches the audio graph. It signals edits upward through
`onEdit(channelIndex)`, and `App.tsx` — which already owns `renderEngineRef` and
`audioGraphRef` — decides what that means for playback.

```tsx
<PatternGrid
  pattern={currentPattern}
  effects={currentEffects}
  patternLabel={activePattern}
  playbackRow={playbackRow}
  songKey={song.config.key}
  scale={song.config.scale}
  onEdit={(ch) => scheduleChannelRerender(ch)}
  onAudition={(ch, note) => auditionNote(ch, note)}
/>
```

Cursor position and the octave register are session UI state. They are not
persisted and not part of `Song`.

## Cursor and navigation

Eight stops per row — note and effect for each of four channels:

```
 OCT4 │ LEAD  M S R │ HARM  M S R │ BASS  M S R │ DRUM  M S R
   00 │ C-4 SU0A    │ E-4 ----    │ C-3 ----    │ KCK ----
        ^^^ ^^^^
        note effect
```

`Left` / `Right` step through sub-columns and wrap into the neighbouring
channel. `Up` / `Down` move by row and clamp at 0 and 31. The cursor scrolls
into view when it leaves the visible range.

Two highlights coexist and must stay distinct: the playback row is a full-width
row background (existing `gridRowCursor`), the edit cursor is a cell-scoped
accent-orange box. Row-wide versus cell-scoped reads unambiguously even when
they overlap.

Keyboard input is web-only, gated behind a focused-grid flag and attached as a
`window` listener — the pattern `App.tsx` already uses. Arrow keys call
`preventDefault()` so the page does not scroll. On native, drag is the input
path.

## Keyboard map

| Key | Action |
|---|---|
| `A`–`G` | enter note at the current octave, advance cursor one row |
| `Shift` + `A`–`G` | same, one semitone up (sharp) |
| `K` / `S` / `H` | on CH3 only: kick / snare / hat |
| `Delete` / `Backspace` | clear the field under the cursor |
| `[` / `]` | octave register down / up, clamped 3–7 |
| `Enter` | open the effect editor on an effect cell |
| `Esc` | close the editor, or blur the grid |

Sharps are arithmetic, not special-cased: `Shift+E` is `F`, `Shift+B` is `C` of
the next octave. Entering a note auto-advances the cursor down one row, the
universal tracker behaviour for fast entry.

Digits are deliberately not bound to octave selection — they belong to the
effect editor's hex entry.

## Effect editor

`Enter` on an effect cell opens an inline editor anchored to that cell.

| Key | Action |
|---|---|
| `Up` / `Down` | cycle the effect code through `EFFECT_CODES`, plus "none" |
| `Left` / `Right` | value ±1 |
| `Shift` + `Left` / `Right` | value ±16 (one hex digit) |
| `0`–`9`, `A`–`F` | type the hex value directly |
| `Enter` / `Esc` | commit and close |
| `Delete` | clear the effect |

Edits apply live as they change, so the value is audible on the next pass rather
than only on commit.

## Drag

A `DRAG` toggle in the grid header, default on for pointer devices and off for
touch. With it off the grid scrolls as it does today. This is not optional
polish — on touch, a vertical drag on a cell is indistinguishable from a scroll.

```
pointer down on cell ──► axis lock: first 6px of movement picks H or V, locks it
                         │
      ┌──────────────────┴──────────────────┐
   horizontal                            vertical
   1 step / 12px                         1 octave / 24px
      │                                     │
  CH0–2: ± scale degree               CH0–2: ± octave, clamped 1–48
  CH3:   cycle KCK→SNR→HAT            CH3:   nudge raw value in drum range
```

Axis lock matters: without it a sloppy diagonal changes pitch and octave at
once, and there is no undo to recover.

Horizontal steps move by scale degree, using `song.config.key` and `scale`. A
note already off-scale — which the keyboard can now produce — snaps to the
nearest scale note in the drag direction. Dragging right from `C#4` in C major
gives `D-4`, left gives `C-4`. A single drag pulls a hand-typed accidental back
into key.

Drum ranges follow `drumNoteToName`: KCK 1–6, SNR 7–22, HAT 23–48. Vertical drag
nudges within the current drum's range, giving pitch variation without exposing
raw numbers.

Implemented with `PanResponder`, which works on both react-native-web and
native. `react-native-gesture-handler` is not a dependency and is not worth
adding for this.

## Audio and persistence

Edits reuse the live-swap path already proven by `handleRegenChannel`
([App.tsx:460]): write the song, re-render, then `replaceChannel` for the edited
channel only, quantized to the next row boundary. Playback never stops. Edits
are debounced like the BPM handler so a drag does not queue a render per step.

Audition policy:

```
stopped  → one-shot through the channel instrument, throttled 60ms during drag
playing  → silent; the swapped buffer delivers the edit when the playhead arrives
```

During playback the hot-swap is the feedback, so no audition code runs. If a
render does not complete before the playhead reaches the edited row, the change
lands on the next loop. That is a timing consequence of async rendering, not a
failure state.

`setNote` and `setEffect` route through the existing `syncToProject`, so edits
persist to the active project with no new persistence work.

## Testing

`node --import tsx --test test/*.test.ts`, matching the zero-framework
`node --test` convention already used by `packages/zzfxm`. `tsx` is already a
devDependency; no new packages.

`noteEntry.ts` is pure and carries the logic worth testing:

- `letterToNote` across all letters, both sharp states, octaves 3–7.
- `C` at octave 3 returns null rather than 0 or a transposed note.
- `Shift+B` at octave 4 is C5; `Shift+E` is F.
- `scaleStep` walks degrees in each scale and stays in key.
- `scaleStep` from an off-scale note snaps toward the drag direction.
- `scaleStep` clamps at 1 and 48 instead of wrapping.
- Drum cycling and range nudging stay inside `drumNoteToName` boundaries.

Plus a regression test for the collision: generating across all 12 keys and 6
scales yields no bass chord root encoded as 0.

## Follow-up

The deeper register fix — tune the bass instrument to 130.81 Hz and shift its
note values up an octave — is the structurally correct use of ZzFXM's frequency
parameter and would remove the collision by construction. It is not done here
because it makes `zzfxmToNoteName` an octave wrong for the bass channel unless
display becomes instrument-aware, and it requires a persist migration for saved
projects.

[chords.ts:122]: ../../../apps/zzfx-studio/src/engine/chords.ts
[App.tsx:460]: ../../../apps/zzfx-studio/App.tsx
