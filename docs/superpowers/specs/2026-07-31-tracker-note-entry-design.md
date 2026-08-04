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
- Fix the C-3 rest collision by tuning the bass channel to its own register.
- Undo/redo for pattern edits and regenerations.

Non-goals:

- Enharmonic spelling. Notes are pitches; the grid renders sharps.
- Copy/paste, block selection, pattern-length editing.

## Note encoding

ZzFXM stores a channel as `[instrument, panning, ...notes]`. A note is a
semitone offset where 12 is the instrument's own frequency:

```js
// packages/zzfxm/src/zzfxm.ts
if (note) { ... }                                    // :120  falsy = no note
noteInt > 0 ? ZZFX.buildSamples(...) : []            // :134
instrumentParameters[2] *= 2 ** ((noteInt - 12)/12)  // :131
```

`0` is the rest sentinel and cannot carry a pitch. Which octave note 12 lands on
is therefore a property of the *instrument*, not of the format: an instrument
tuned to 261.63 (C4) puts note 12 at C4, one tuned to 130.81 (C3) puts it at C3.
Usable values run 1 to 48.

### The C-3 collision

`noteToZzfxm(C, 3)` computes `0 + (3-4)*12 + 12 = 0` — the rest sentinel.
`buildChord` voices bass at octave 3, so any chord whose root is chromatic C
encoded to silence in the bass channel. 40 key/scale/degree combinations were
affected. In the key of C — the store's default — every tonic bass root was
silent.

The root cause is that all four channels were tuned to 261.63 (C4) while
occupying different registers, forcing the bass into note values 0-11 where C
lands on the reserved value. ZzFXM intends the frequency parameter to set a
channel's register, with note values riding above it.

Fix: tune the bass instrument to C3 and let its note values start at 12.

| Bass @ oct 3 | value | before | after | intended |
|---|---|---|---|---|
| C3 | 12 | **C4** | C3 | C3 |
| D3 | 2 → 14 | D3 | D3 | D3 |
| ...  | | unchanged | unchanged | |

Every other bass pitch is preserved exactly. `FREQ_C3` is derived as
`FREQ_C4 / 2` rather than written as the rounded 130.81, which is off by 0.07
cents — deriving it makes the retuning provably pitch-preserving instead of
merely close.

### Reading tuning back, instead of migrating

Note names cannot be hardcoded to "12 is C4" once channels are tuned
differently. `baseOctaveFromFreq` recovers a channel's base octave from its own
instrument:

```
freq 261.63 → base octave 4      freq 130.81 → base octave 3
```

This is what makes the change safe without a persist migration. A song saved
under the old tuning carries its own instrument array, so it keeps sounding as
it always did *and* still labels correctly. A migration would gain almost
nothing anyway: it preserves pitches by construction, and notes already lost to
the bug are stored as `0`, indistinguishable from intended rests. Regenerating
a pattern heals them.

Every tuning has exactly one unreachable note — the C of octave `base - 1`. The
editor rejects it with a flash on the register rather than silently substituting
a pitch. Tuning bass to C3 moves its hole from C3 down to C2, freeing the octave
the channel actually plays in. Addressable octaves become `[base - 1, base + 3]`,
so the register clamps when the cursor crosses into a differently tuned
channel.

## Architecture

The grid currently lives inline in `App.tsx`, which is 1255 lines. Adding a
cursor, a key handler, a drag recognizer, and an effect editor to that file
would make it unworkable. The grid moves out; `App.tsx` keeps audio ownership.

```
src/engine/noteEntry.ts      NEW  pure entry/step math, no React
src/engine/scales.ts          ~   tuning-aware encoding + note naming
src/engine/instruments.ts     ~   bass archetypes tuned to C3
src/engine/chords.ts          ~   bass voiced against its own base octave
src/components/PatternGrid.tsx NEW grid render + cursor + input + effect editor
src/store.ts                  ~   setNote / setEffect / undo history
App.tsx                       ~   grid markup out, audio + undo keybinding in
test/noteEntry.test.ts       NEW  node --import tsx --test
test/history.test.ts         NEW  undo/redo model
test/setup.ts                NEW  AudioContext + localStorage stubs
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
  baseOctaves={baseOctaves}
  playbackRow={playbackRow}
  songKey={song.config.key}
  scale={song.config.scale}
  onEdit={(ch) => scheduleChannelRerender(ch)}
  onAudition={(ch, note) => auditionNote(ch, note)}
  onBeginEdit={beginEdit}
  onEndEdit={endEdit}
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
| `[` / `]` | octave register down / up, clamped to the channel's range |
| `Enter` | open the effect editor on an effect cell |
| `Esc` | close the editor, or blur the grid |
| `Ctrl`/`Cmd` + `Z` | undo (global, not grid-scoped) |
| `Ctrl`/`Cmd` + `Shift` + `Z` | redo |

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

Implemented with pointer events (`onPointerDown` / `Move` / `Up`) plus
`setPointerCapture`, not `PanResponder`. The grid lives inside a `ScrollView`,
and the gesture responder system awards vertical gestures to the scroller before
they reach a child — horizontal drags worked and vertical ones silently did
nothing. Pointer capture cannot be stolen, and `clientX/clientY` deltas are
exact CSS pixels. `react-native-gesture-handler` is not a dependency and is not
worth adding for this.

Steps are measured from the note the drag started on rather than accumulated, so
dragging back to the origin restores the original value.

A wheel is not a drag, so pointer devices keep normal scrolling while drag
editing is on; only touch has to trade one for the other.

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

## Undo/redo

Covers pattern edits and the regenerate buttons (channel, pattern, instrument).
Regenerate-channel replaces 32 notes from one click and is the most destructive
action in the app. Mixer, BPM and mute/solo stay out: they are non-destructive
and continuously adjustable, so they would only make the history noisy.
Generating or loading a different song clears the history — undoing across that
boundary is meaningless.

History is session-only and excluded from `partializeState`, so song snapshots
never reach localStorage.

### Snapshots, not diffs

A snapshot holds a reference to a whole `Song`. That is affordable *because*
every edit is already an immutable update that clones only the channel it
touches — an old song shares almost all of its structure with the current one,
so a snapshot costs a handful of pointers rather than a copy. A test asserts
this sharing directly, since it is the assumption the whole design rests on.

`activePattern` rides along in the snapshot, so undo returns you to where the
edit happened instead of silently altering a pattern you are not looking at.

### Coalescing

A drag writes a note every 12px. Without grouping, one gesture would cost twenty
undos.

```
pointerdown → beginEdit('drag')   captures the song once
   ...drag writes freely, history untouched...
pointerup   → endEdit()           banks a single step
```

`record` is skipped while a transaction is open. A transaction that changed
nothing leaves no trace. Single keystrokes take the untransacted path and record
per edit.

Undo replaces the whole song, so all four channels' audio is stale; the handler
re-renders and hot-swaps every channel rather than the single-channel path used
for ordinary edits.

## Testing note

Store-level tests need `AudioContext` and `localStorage`, because the store
reaches zzfx through the engine barrel and zzfx constructs a context on import.
`test/setup.ts` stubs both. `partializeState` is exported so the "history is
never persisted" property can be asserted directly rather than by reaching into
zustand internals.

[App.tsx:460]: ../../../apps/zzfx-studio/App.tsx
