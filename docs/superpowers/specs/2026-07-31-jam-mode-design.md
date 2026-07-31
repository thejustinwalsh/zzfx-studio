# Jam Mode — Design

Give the tracker a live half: loop patterns instead of the whole song, launch a
different pattern per channel while it plays, record notes into whichever
pattern the grid is showing, and turn a performance into an arrangement.

This spec is the design only. Nothing in it is implemented.

## Scope

In scope:

- A `linear` / `jam` mode switch beside the pattern list. `linear` is today's
  behaviour, unchanged.
- A clip engine: per-pattern audio buffers and a lookahead scheduler that swaps
  them on a pattern boundary.
- Per-channel launching — bass holds pattern A while lead moves to C.
- Splitting "the pattern being edited" from "the pattern being played".
- Explicit pattern creation and deletion, capped at 8.
- A record arm that overdubs into the pattern the grid is showing.
- Capture: turn a jam into `patterns` + `sequence`, reviewed on a finalize
  screen, saved as a new song or over the current one.
- Wiring the Launchpad's existing SESSION grid to real launching.

Non-goals:

- A separate arrangement editor. Capture replaces it; hand-reordering
  `sequence` stays a possible later addition.
- Per-clip lengths. Every pattern is 32 rows and stays that way.
- Clip-level automation, follow actions, scene names.
- MIDI out. It shares the scheduler but is its own piece of work.

## Why this is not a small feature

Playback today has no concept of a pattern:

```
song.sequence [A B C A B D]
     └─► renderSongBuffers(song) ─► 4 buffers, the WHOLE song, ~30s each
              └─► AudioGraph.play() ─► 4 looping BufferSources
                   nothing changes until everything is re-rendered
```

One buffer is one frozen arrangement. Launching a pattern is not a control on
top of this; the engine has to learn to play patterns instead of songs.

## Fixed constraints

These are not preferences. They come from the format and the platform, and they
shaped every decision below.

**ZzFXM's sequence is scene-level.** `zzfxm(instruments, patterns, sequence, BPM)`
where `sequence[i]` selects one pattern, and a pattern holds all four channels.
Per-channel arrangements cannot be written down directly. This is the export
format game developers consume, so it is not negotiable.

**Every pattern is exactly 32 rows.** This is what makes per-channel launching
affordable: all clips share one loop phase, so there is one clock, no drift, and
launches always land phase-locked.

**Share links are near the practical URL ceiling.** Measured on generated songs:

```
short   2 patterns →  582 chars
long    4 patterns →  739 chars        ~185 chars per additional pattern
epic    4 patterns →  756 chars

 8 patterns ≈ 1,480 chars   safe in every browser, proxy and unfurler
26 patterns ≈ 4,800 chars   past the ~2,000-char universally-safe limit
```

The 8-pattern cap is what keeps share links pasteable anywhere. It also matches
the Launchpad's 8 grid rows and the existing `PatternLabel = 'A'…'H'`.

**`PatternLabel` and the share codec currently disagree.** The type allows 8
patterns; `shareCodec` accepts up to 26. Resolve toward 8, the constraint that
has reasons behind it.

## Prior art

Renoise — the project's stated reference — has no session view. It is linear,
always. Its live control is the **Pattern Matrix**: rows are sequence slots,
columns are tracks, and each cell can be muted independently while playing. One
document, no modes, nothing to reconcile.

Ableton's session view is the opposite: a second document that must be captured
into the first.

This design sits between them. It borrows Ableton's launching but keeps
Renoise's single document — there is no session document, only a transport that
can loop patterns instead of the sequence.

## State

Four additions to the store. No second document.

```ts
mode:    'linear' | 'jam'
editing: PatternLabel          // the grid — where notes land
playing: (number | null)[]     // per channel → pattern index, null = silent
queued:  (number | null)[]     // per channel → what starts at the next boundary
armed:   boolean               // record
```

`linear` ignores `playing`/`queued` entirely and behaves exactly as today, so
nothing regresses.

The important line is the first two. Today `activePattern` is both "what I am
editing" and "what is playing". Jam mode is precisely the statement that **those
may differ** — which is what lets you build a new pattern while the others keep
going. Framed this way it is one extra piece of state, not a dual-document
problem.

## Engine

**Rendering.** `renderClip(song, pattern) → 4 stereo buffers`, one pattern long.
Cached per `(pattern, channel)` and invalidated when that cell's notes change.
Cost is 4×8 buffers of ~3.5s — a few hundred KB, rendered once.

**Scheduling.** Replace the looping `BufferSource` with an explicit lookahead
scheduler:

```
every 25ms, look 200ms ahead:
  while nextBoundary < now + LOOKAHEAD:
    for ch in 0..3:
      if queued[ch] !== null:
        playing[ch] = queued[ch]
        queued[ch] = null
      source.start(nextBoundary) with buffer[playing[ch]][ch]
    nextBoundary += clipDuration
```

One clock, one phase, four channels. Quantisation is the pattern boundary — 32
rows, two bars of 4/4. A 1-bar option can be added later without changing the
design.

This scheduler is also what MIDI out needs, so it is not throwaway work.

## Recording

Record arms; notes from any source — keyboard, MIDI, Launchpad — land in
`editing` at the row nearest the playhead, using the existing `quantizeToRow`.

**Notes go to the pattern the grid is showing, which may not be the pattern you
can hear.** This is deliberate. The tracker idiom is that the grid is where
notes go, it never surprises you, and undo already covers a bad take. Creating a
pattern is a separate explicit act — a `+` in the pattern list or a button on
the device — so no gesture silently spends one of the eight slots.

The rejected alternatives: auto-creating on an empty slot makes one gesture do
two things depending on state you may not be looking at; copy-on-every-take
exhausts eight slots fastest and forces the cap up.

## Capture and finalize

A jam log is per-slot, per-channel. `sequence` is one index per slot. Collapsing
one into the other is the whole problem:

```
jam                     slot   0    1    2    3
  LEAD                         A    A    C    C
  HARM                         A    B    B    B
  BASS                         A    A    A    C
  DRUM                         A    A    A    A

ZzFXM sequence               [ 0,   ?,   ?,   ? ]
                                ↑    ↑
                           all A     "A-lead + B-harm + A-bass + A-drum"
                                     — no such pattern exists
```

Capture materialises a pattern per distinct column-combination. Lossless, but it
mints patterns, and a two-minute jam is ~34 slots yielding perhaps 10–15 distinct
combinations. Against a cap of 8, curation is required.

The algorithm:

```
1. group slots by their (LEAD,HARM,BASS,DRUM) combination
2. rank by how many slots each combination occupies
3. keep the top 8 → these become patterns A–H
4. remap each dropped combination to the kept one differing in the fewest channels
```

Ranking by usage means what you played most survives, which is almost always what
you meant. The remap metric is "how many of the four channels differ" — no
tuning, no magic.

The finalize screen shows the result before committing anything:

```
FINALIZE JAM                          34 slots · 12 combinations · 8 fit

  ▪▪▪▪   A   14 slots   keep
  ▪▪·▪   B    6 slots   keep
  ·▪▪▪   C    5 slots   keep
  …
  ▪··▪       1 slot     → B   (differs in DRUM only)
  ·▪·▪       1 slot     → C   (differs in LEAD only)

  4 combinations remapped · 4 of 34 slots will sound different

              [ SAVE AS NEW SONG ]   [ OVERWRITE ]   [ KEEP JAMMING ]
```

**Dropping means remapping, not deleting.** Deleting slots would punch holes in
the middle of a performance and shorten the song unpredictably. Remapping keeps
the arrangement's length and shape, and the screen states exactly how many slots
will sound different. Cutting a combination instead is a per-row toggle, not the
default.

**Save as new song is the default.** The hybrid patterns land in the new song and
the original keeps its clean hand-made A/B/C. Overwrite replaces `patterns` and
`sequence` as a single undo step.

**Keep jamming is a first-class exit.** If the summary says 12 combinations and
you wanted 6, the honest move is to play it tighter, not to accept a lossy merge.

The cap therefore never blocks a performance. Launch as freely as you like; the
reckoning happens once, at the end, where it is visible.

## Interface

```
┌ SEQUENCE ──────────────── [LINEAR|JAM] ─┐     transport gains ● RECORD
│                                          │
│  linear:  A B C A B D  (as today)        │     jam:   ch→  L  H  B  D   ▸
│                                          │            A    ▪  ▪  ▪  ▪   ▸
│                                          │            B    ·  ▪  ·  ▪   ▸
│                                          │            +
└──────────────────────────────────────────┘
   ▪ has notes   ▸ launch the row   bright = playing   pulsing = queued
```

The mode switch changes the transport's appearance, not only its behaviour —
`play` means end-to-end in linear and loop-the-clips in jam, and that difference
must be visible.

On the Launchpad, SESSION already has this exact geometry: column = channel,
row = pattern, right-hand column launches the row, and the queued-pulse spec is
implemented. That slice is mostly wiring.

Beyond 8 patterns is not a concern; the cap is 8 and the device shows 8 rows.

## Testing

The scheduler carries the risk, so it takes an injected clock: feed it
`currentTime` values and assert which buffer was scheduled at which time. No
audio, no device, no timing flake. The cases that will actually break:

- a launch lands on the next boundary, not the current one
- two launches before a boundary — last one wins
- a launch inside the lookahead window must not land in the window already
  scheduled
- a note edit invalidates exactly one `(pattern, channel)` cache entry
- stopping mid-clip and restarting resumes phase-locked

Capture is pure and tests directly: a fixed jam log in, a known `patterns` and
`sequence` out, including the over-cap remapping case with its slot counts.

## Slices

Each is separately shippable, in this order:

| # | Slice | Note |
|---|---|---|
| 1 | **Clip engine** — per-clip render, cache, lookahead scheduler | First. The only real risk, and the only piece that cannot be validated by reading code. Buildable against existing generated patterns |
| 2 | Pattern CRUD — add, duplicate, delete; reconcile the 8-vs-26 mismatch | Useful in linear mode on its own |
| 3 | JAM UI — mode switch, clip grid, `editing`/`playing` split | Makes the engine usable without hardware |
| 4 | Record — arm, overdub into `editing` | |
| 5 | Capture and finalize | |
| 6 | Launchpad SESSION wiring | Scaffolding already in place |

Slice 1 first because if bar-quantised swapping does not feel good in the hand,
slices 2–6 all change shape.

## Deferred

- **More than 8 distinct combinations in a jam** is handled by remapping. If
  that proves too lossy in practice, the options are a 1-bar quantise (fewer
  slots, fewer combinations) or raising the cap and accepting longer share URLs.
  Worth seeing happen before designing for it.
- **Hand-reordering `sequence`** — capture makes it optional rather than
  required.
- **1-bar launch quantise** — the scheduler supports it; the default stays the
  pattern boundary until there is a reason to change.
