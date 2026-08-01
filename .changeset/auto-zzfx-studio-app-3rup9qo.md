---
"@zzfx-studio/app": minor
---

> Branch: claude/tracker-note-entry-def3a5
> PR: https://github.com/thejustinwalsh/zzfx-studio/pull/7

### d7d96e52408afc7ec8fd43c844ee195aab883f20
fix: Enter never reached the grid, and the cursor grew the row
Enter did nothing on a cell you had just clicked, which the help modal
documents as working. React Native Web's PressResponder handles Enter and
Space on every Pressable and calls stopPropagation() unconditionally; the
cells are Pressables, so the grid's bubble-phase window listener never saw the
key. Removing accessibilityRole earlier did not help because the role only
gates the spacebar preventDefault two lines above, not the stopPropagation.

Listening in the capture phase fixes it — capture runs on the way down, before
the responder can swallow anything. Capture also means the listener sees keys
before a text field does, so it now skips editable targets rather than
stealing them; verified that typing a note letter into the song name still
reaches the input and enters no note.

Separately, styles.cellCursor added borderWidth: 1 to an auto-height cell, so
the row grew two pixels whenever the cursor landed on it and the grid shifted
as you arrowed around. The fields now reserve a transparent border and the
cursor changes only its colour. Measured: cursor and plain cells both 19.5px,
reflow 0.
Files: apps/zzfx-studio/src/components/PatternGrid.tsx
Stats: 1 file changed, 22 insertions(+), 3 deletions(-)

### d8354a5f7a694c6e14786ad895777ff9962a98c4
fix: address review on #7
Stale song snapshots: the regenerate handlers read the song, awaited a render,
then committed -- overwriting any edit made during the render, and recording
the overwrite in the undo history as though the user had done it. They commit
before rendering now, matching how note edits already worked.

Also: the global Ctrl/Cmd+Z no longer steals undo from the song-name field; an
unmount mid-drag closes its undo transaction instead of folding the next edit
into it; drumVoiceInstrument pads short arrays rather than leaving holes ZzFX
reads as undefined; the embed snippet escapes the title and URL; unpackSong
constrains the decoded shape and caps the inflated payload; setEffect skips a
write that changes nothing; failed clipboard copies are reported; and two
share tests that accepted every outcome now assert a shape.

Split out of the MIDI branch so this PR carries its own review fixes.
Files: apps/zzfx-studio/App.tsx, apps/zzfx-studio/package.json, apps/zzfx-studio/src/components/ExportModal.tsx, apps/zzfx-studio/src/components/HelpModal.tsx, apps/zzfx-studio/src/components/PatternGrid.tsx, apps/zzfx-studio/src/engine/instruments.ts, apps/zzfx-studio/src/engine/share.ts, apps/zzfx-studio/src/engine/shareCodec.ts, apps/zzfx-studio/src/store.ts, apps/zzfx-studio/test/share.test.ts, pnpm-lock.yaml
Stats: 11 files changed, 141 insertions(+), 65 deletions(-)

### b3633a8d0f252e56ed717de135f15a600131a9c1
fix: kick, snare and hat were the same sound
All three drums were one shape-4 instrument differing only in note value,
and note value only scales the frequency parameter. ZzFX shape 4 is
Math.sin(t**3): t cubed races away, so the waveform is broadband within a
few samples and frequency barely colours it. The drums differed only in a
parameter their own waveform ignores.

Measured on the rendered output — one instrument, three note values:

  KCK  note  1   185 Hz base   130 ms   centroid 11063 Hz
  SNR  note 14   393 Hz base   130 ms   centroid 11263 Hz
  HAT  note 32  1111 Hz base   130 ms   centroid 11180 Hz

Same length, same peak, spectra within 2% of each other. Turning the
noise parameter to zero barely moved it, so noise masking was not the
cause.

Each voice now gets its own timbre. Kick is a sine with a hard downward
sweep, so it is pitched rather than noisy. Hat keeps shape 4 with a very
short envelope and no sweep, since hats do not pitch-drop. Snare uses a
saw body driven by the noise parameter rather than shape 4 — two shape-4
voices measure identically no matter their frequency, so keeping a
pitched core is what puts the snare below the hat instead of on top of
it. After:

  KICK   230 ms  centroid    84 Hz
  SNARE  170 ms  centroid  5359 Hz
  HAT     41 ms  centroid 11329 Hz     HAT/SNARE 2.11x, was 0.99x

Routing generalises the mechanism effects already used: a note asks for a
variant instrument when it carries an effect and, on the drum channel,
always. Voice is applied before any effect so the effect modifies the
drum it is attached to.

The song format is untouched. Patterns still store 1/14/32 on channel 3
and instruments stays at four entries, so saving, loading, sharing and
import are unaffected and old songs render better for free. Export does
change: songToZzfxm now emits the extra drum instruments and channels,
which is what makes exported code sound like the app.
Files: apps/zzfx-studio/App.tsx, apps/zzfx-studio/src/engine/index.ts, apps/zzfx-studio/src/engine/instruments.ts, apps/zzfx-studio/src/engine/song.ts
Stats: 4 files changed, 133 insertions(+), 45 deletions(-)

### b9369e9841d70a291645d5e7f15e01556b84648f
refactor: adopt the compiler-safe Reanimated API, and lint autofixes
Reanimated's `.value` accessor is a mutation React Compiler cannot see
past, which is why it reported 22 immutability errors across every
animated component. Reanimated ships `.get()`/`.set()` precisely for
this. Converting the 30 shared-value accesses takes immutability from 22
errors to 7. Only genuine shared values were touched — textarea nodes,
style keys, Object.values and NoteEffect.value all read `.value` too.

Also applies eslint --fix, which cleared 25 issues across 7 files, and
takes the mobile header breakpoint to 460. Three buttons stop physically
fitting at 413, but between there and 460 they fit while crowding the
note data, so the extra room is deliberate.

The mini player's spectrum now measures the box it is given rather than
computing a height. It had both a flex child and manual arithmetic, and
the two disagreed — the slack showed up as dead space above and below the
bars. Rows gap at 7px so the spectrum is evenly inset.

Remaining, deliberately not swept in one pass: 23 react-hooks/refs,
7 immutability, 5 set-state-in-effect, 2 purity, and 21 exhaustive-deps
warnings. The refs family is the same class as the duration bug — refs
read or written during render — and wants fixing per component rather
than mechanically.
Files: apps/zzfx-studio/App.tsx, apps/zzfx-studio/index.web.ts, apps/zzfx-studio/src/components/AnimatedPressable.tsx, apps/zzfx-studio/src/components/ExportModal.tsx, apps/zzfx-studio/src/components/PatternGrid.tsx, apps/zzfx-studio/src/components/PulsingView.tsx, apps/zzfx-studio/src/components/TrackerGrid.tsx, apps/zzfx-studio/src/components/UpdateBanner.tsx, apps/zzfx-studio/src/components/WaveformPreview.tsx, apps/zzfx-studio/src/components/WaveformPreview.web.tsx, apps/zzfx-studio/src/platform/file-io.ts, apps/zzfx-studio/src/platform/is-neu.ts, apps/zzfx-studio/src/screens/EmbedPlayer.tsx
Stats: 13 files changed, 73 insertions(+), 66 deletions(-)

### c0742782294cc287b14a9132e6e6ae9127a0b188
feat: mini player, selected by height rather than by URL
A share link and an embed link are now the same link. Below the height
where the studio can show four rows of pattern data it stops being a
studio, so a short frame renders the mini player instead. The embed
snippet just fixes the iframe size; ?embed=1 remains as an override for
embedding a deliberately large player.

The breakpoint is derived, not guessed: 399px of fixed chrome measured
off the running app, plus four rows at 19.5px, so 477px. Eight rows is
the comfortable target at 555px. A phone in landscape falls below the
floor and gets the player, which is right — the studio could not fit a
single row there.

The player is WinAmp in this project's language: identicon and title,
gradient wordmark linking out, transport with a large timecode, terse
vibe/key/bpm readouts, a full-width spectrum on its own row, and a
position bar with the channel legend. It reflows for the frame it is
given, dropping the settings line, legend and readouts as room runs out.

The spectrum shares the studio's colour treatment rather than
approximating it — buildOscColorTable moved out of App.tsx so both call
the same code instead of two copies that drift.

Volume is per-graph. The player builds its own AudioGraph, so its master
gain cannot touch the studio's.

Without a share code the player shows the current session rather than
claiming the link is empty, which is what happens when you simply make
the studio window short. Initialisation is skipped only when the URL
carries someone else's song, so rendering a shared link never generates
or persists anything into the visitor's storage.

GitHub Pages sends no X-Frame-Options and no frame-ancestors CSP, so
framing works; verified against the live site.

Two bugs found while verifying: resizing an iframe from the parent
changes innerHeight without firing a resize event inside the frame, so
the branch needs a ResizeObserver rather than a resize listener; and the
identicon was sized to the font size instead of the cap height.
Files: apps/zzfx-studio/App.tsx, apps/zzfx-studio/src/components/ExportModal.tsx, apps/zzfx-studio/src/engine/audioGraph.ts, apps/zzfx-studio/src/engine/index.ts, apps/zzfx-studio/src/engine/share.ts, apps/zzfx-studio/src/screens/EmbedPlayer.tsx, apps/zzfx-studio/src/utils/oscColors.ts, apps/zzfx-studio/test/share.test.ts
Stats: 8 files changed, 925 insertions(+), 90 deletions(-)

### f6d5b27bc8c94140c5feac17169558d97716a4f1
fix: make link unfurls actually work, and generate the OG card
og:image and twitter:image were relative paths. Crawlers do not resolve
those, so every shared link unfurled with no image at all. They are
absolute now, pointing at tjw.dev/zzfx-studio/ — the CNAME the site
actually serves from, not the github.io host. Adds og:url, og:site_name,
image type and dimensions, alt text, and a canonical link.

The OG card is now generated rather than screenshotted. The previous one
was a screen capture that went stale the moment the grid header changed,
and nothing caught it. scripts/generate-og-image.ts draws the card as SVG
from the same palette the app uses and rasterises it with resvg, using
the JetBrains Mono already in assets, so `pnpm run og` reproduces it
whenever the UI moves on. Half the file size of the capture it replaces.
Files: apps/zzfx-studio/package.json, apps/zzfx-studio/public/index.html, apps/zzfx-studio/public/og-image.png, apps/zzfx-studio/scripts/generate-og-image.ts, pnpm-lock.yaml
Stats: 5 files changed, 324 insertions(+), 9 deletions(-)

### aaad2eb9050316a1ac78a47efe3a71b3f503a5db
feat: put a whole song in a URL
Adds a share link: the song packed to binary, deflated, base64url'd into
?s=, and a share button on the export screen that copies it. Opening such
a link imports the song as a new project and strips the parameter so a
refresh does not keep reimporting it.

Bit-packing rather than compressed JSON. Notes are 0..48 so they ride in
six bits, instrument slots that sit at exactly zero are skipped via a
presence mask, and effects are written as hits instead of 32 mostly-empty
slots. Measured against compressed JSON for the same songs:

  dense 8-pattern    4426 -> 1947   (44%)
  typical 8-pattern  3836 -> 1650   (43%)
  sparse 4-pattern   2186 ->  787   (36%)

Parameters are stored as full doubles, not float32. Float32 cannot hold
261.63 or 0.005, so it would quietly detune a shared song relative to the
original — and after deflate it saves nothing anyway, because round
values leave long zero runs in their mantissas that compress away. The
round trip is asserted byte-for-byte across every vibe, key, scale and
length.

The wire format is transport only. It decodes straight back into an
ordinary Song and nothing else in the app knows it exists. The enum
arrays ARE the format, since indices go on the wire, so a test pins them
against the live types — reordering SCALES would otherwise silently break
every link already shared.

Decoding treats its input as hostile: bounds-checked reads, validated
enum indices, sequence entries checked against patternOrder. Fuzzing
truncated and bit-flipped payloads found a real bug — DecompressionStream
rejects asynchronously, so a corrupt link produced an unhandled rejection
rather than a caught failure.

Uses ?s= rather than #s= on purpose. A hash never reaches the server,
which would rule out link previews and oEmbed permanently; the query
keeps that open. Both behave the same inside an iframe.
Files: apps/zzfx-studio/App.tsx, apps/zzfx-studio/package.json, apps/zzfx-studio/src/components/ExportModal.tsx, apps/zzfx-studio/src/engine/index.ts, apps/zzfx-studio/src/engine/share.ts, apps/zzfx-studio/test/share.test.ts, pnpm-lock.yaml
Stats: 7 files changed, 703 insertions(+), 22 deletions(-)

### 9b98a1757b659de2f2edc42c2e14a71cc4af944c
fix: clicking an effect cell put the cursor on the note
Pressing ENTER on an effect did nothing, because the cursor was never
actually on the effect. handlePointerDown runs before the cell's onPress
and set field: 'note' unconditionally, so a press anywhere in a row —
including squarely on an effect — moved the cursor to the note beside it.
locateCell now reports which sub-field was pressed, and a drag only
starts on a note, since drag manipulates notes only.

Earlier verification missed this because it navigated with arrow keys
rather than clicking, which never exercised the pointer path.

Cells are no longer focusable buttons. accessibilityRole="button" made
RNW emit a real <button>, which the browser activates on ENTER — firing
the cell's own onPress. They are cells in a composite widget that owns
its keyboard model, so the grid takes focus and the cells do not.

Edit mode now fills the cell solid orange with dark text rather than
tinting it, so it reads at a glance.

Replaces the hint bar with a help modal behind a ? button after EXPORT.
The bar sat flush against the window edge and its ends were clipped by
the rounded window corners. The modal draws each binding as a keycap and
documents what the eight effect codes do, including that VB and TR read
their hex digits separately.

Regenerating an instrument now plays it, so you hear what you rolled.
Files: apps/zzfx-studio/App.tsx, apps/zzfx-studio/src/components/HelpModal.tsx, apps/zzfx-studio/src/components/PatternGrid.tsx, apps/zzfx-studio/src/components/index.ts
Stats: 4 files changed, 406 insertions(+), 43 deletions(-)

### 1688f7528bdc6310b33ac3084a7d980fb1472eac
feat: undo/redo, and fix bass tuning at the root
Fixes the C-3 collision properly rather than working around it. ZzFXM
reserves note value 0 as the rest sentinel, and all four channels were
tuned to 261.63 (C4) despite occupying different registers — which forced
the bass into note values 0-11, where C lands on the reserved value and
plays as silence. The earlier guard traded that silence for a tonic an
octave above the rest of the bass line.

The bass instrument is now tuned to C3, so its note values ride above 12
the way ZzFXM's frequency parameter intends. Every bass pitch it could
already play is preserved exactly; only the broken C moves, and it moves
to where it belonged. C3 is derived as C4/2 rather than written as the
rounded 130.81, which is off by 0.07 cents, so the retuning is provably
pitch-preserving instead of merely close.

No persist migration. baseOctaveFromFreq reads a channel's base octave
back from its own instrument, so songs saved under the old tuning keep
sounding as they did and still label correctly. A migration would gain
almost nothing anyway: it preserves pitches by construction, and notes
already lost to the bug are stored as 0, indistinguishable from intended
rests. Regenerating a pattern heals them. Every tuning has exactly one
unreachable note — the C an octave below it — and tuning bass to C3 moves
its hole down to C2, freeing the octave the channel actually plays in.

Undo/redo covers pattern edits and the regenerate buttons. Snapshots hold
whole-song references rather than diffs, which is affordable because
edits are already immutable updates that clone only the touched channel —
an old song shares nearly all its structure with the current one. A drag
writes a note every 12px, so pointerdown/pointerup bracket a transaction
and the whole gesture collapses into one step. Undo restores the pattern
the edit happened in, and re-renders every channel since it replaces the
whole song. History is session-only and excluded from the persisted
payload.
Files: apps/zzfx-studio/App.tsx, apps/zzfx-studio/package.json, apps/zzfx-studio/public/render-worker.js, apps/zzfx-studio/src/components/PatternGrid.tsx, apps/zzfx-studio/src/engine/chords.ts, apps/zzfx-studio/src/engine/index.ts, apps/zzfx-studio/src/engine/instruments.ts, apps/zzfx-studio/src/engine/noteEntry.ts, apps/zzfx-studio/src/engine/scales.ts, apps/zzfx-studio/src/store.ts, apps/zzfx-studio/test/history.test.ts, apps/zzfx-studio/test/noteEntry.test.ts, apps/zzfx-studio/test/setup.ts, docs/superpowers/specs/2026-07-31-tracker-note-entry-design.md
Stats: 14 files changed, 791 insertions(+), 128 deletions(-)

### 161868af0489a8df42b8a0dc84afa40fda4951e1
feat: make the pattern grid editable
Adds keyboard and pointer editing to the pattern grid, which was
display-only.

Keyboard: arrow keys move a cell cursor across eight stops per row (note
and effect per channel). A-G enter notes at the octave register, shift
raises a semitone, delete clears, [ and ] step the octave, enter opens an
inline effect editor driven by arrows and hex digits. Drums answer to
K/S/H mnemonics rather than pitches.

Pointer: horizontal drag steps by scale degree, vertical by octave, with
an axis lock so a diagonal cannot change both at once. An off-scale note
snaps toward the direction of travel, pulling hand-typed accidentals back
into key. Drag uses pointer capture rather than PanResponder — the grid
sits inside a ScrollView, and the responder system awards vertical
gestures to the scroller before they reach a child.

Edits reuse the existing hot-swap path: write, debounce, re-render, then
replaceChannel on the edited channel. Playback never stops, and the
swapped buffer is the audition, so preview only sounds when stopped.

Also fixes a latent encoding bug this exposed. ZzFXM reserves note value
0 as the rest sentinel, but noteToZzfxm(C, 3) computes to exactly 0, and
buildChord voices bass at octave 3 — so every tonic bass root in the key
of C was silent. 40 key/scale/degree combinations were affected. Bass
voicings landing on 0 now shift up an octave.

The grid moves out of App.tsx into its own component, which is what makes
room for the cursor, key handling, and drag recognizer.
Files: .gitignore, apps/zzfx-studio/App.tsx, apps/zzfx-studio/package.json, apps/zzfx-studio/src/components/PatternGrid.tsx, apps/zzfx-studio/src/components/index.ts, apps/zzfx-studio/src/engine/chords.ts, apps/zzfx-studio/src/engine/index.ts, apps/zzfx-studio/src/engine/noteEntry.ts, apps/zzfx-studio/src/store.ts, apps/zzfx-studio/test/noteEntry.test.ts, docs/superpowers/specs/2026-07-31-tracker-note-entry-design.md, pnpm-lock.yaml
Stats: 12 files changed, 1449 insertions(+), 305 deletions(-)
