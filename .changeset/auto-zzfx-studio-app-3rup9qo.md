---
"@zzfx-studio/app": minor
---

> Branch: claude/tracker-note-entry-def3a5
> PR: https://github.com/thejustinwalsh/zzfx-studio/pull/7

### 8b5533a8a84c80797b0f305a7ef306d7f3018b27
fix: floor how short a drum voice can be
The hat multiplies three envelope stages down (0.4 sustain, 0.35 release,
0.35 decay), so a short archetype roll landed at 18ms and read as a click
rather than a drum. Measured across 750 generated kits, 31% of battle hats
and 28% of boss hats fell under 25ms audible; with the floor both are 0%.

The floor scales the decaying stages up proportionally and only when a roll
falls under the minimum, so rolls that were already long enough are untouched
and kits still vary in length. Attack is excluded on purpose -- stretching it
would soften the transient, which is the point of a hat.

Kick and snare measured 65ms at their shortest and never clicked, so their
floors bind nothing today. They are there so a later archetype or trait
cannot reintroduce the problem silently.

Note this is not a tempo bug, though it shows up most at speed: a ZzFX note
runs attack + decay + sustain + release and none of it scales with BPM, so a
voice that is too short is too short everywhere. There is a separate tempo
issue -- above about 160 BPM the 1/16 row is shorter than the kick and snare,
so zzfxMChannels cuts them with a 99-sample fade -- which lives in the
playback loop and affects every channel, and is left alone here.
Files: apps/zzfx-studio/src/engine/instruments.ts
Stats: 1 file changed, 46 insertions(+)

### cb5223028af70735a8531ea7b7322a0a857f6d1f
feat: restore per-voice drums
Reverts the revert. The drums were removed on bad evidence: the bundle the
browser was running, public/render-worker.js, was a tracked build artifact
two days stale, so every tuning pass after it landed in source and none of
them reached the speakers. What kept bubbling was the Aug 1 build, whose
kick was a sine with slide -14. The fix for that was already written and had
simply never been audible.

A drum note is now voiced by pitch -- kick, snare or hat -- rather than being
the channel's instrument pitch-shifted, which is what made a "kick" at note 1
and a "hat" at note 32 the same timbre at different speeds.

The kick is the one voice that cannot be noise. shape 4 is sin(t**3), whose
phase accelerates without bound; it has no stable pitch, which is exactly why
it reads as noise and why it can never be low. So the kick is a sine, and its
drop uses pitchJump, the only bounded pitch move ZzFX has. slide is pinned to
0 precisely because it is unbounded -- frequency += slide runs forever, always
reaches zero, and negative frequency reads as rising pitch. That is the bubble,
and it is now unreachable: at every note the kick lands on a positive
frequency and stays there.

Snare and hat are relative scalings of whatever archetype was rolled, so kit
variation survives instead of collapsing to one sound, and both cap bitCrush
at 0.02 -- enough for grit, far from the sample-and-hold rate where aliasing
folds a falling pitch into a rising one.
Files: apps/zzfx-studio/src/engine/effects.ts, apps/zzfx-studio/src/engine/index.ts, apps/zzfx-studio/src/engine/instruments.ts, apps/zzfx-studio/src/engine/song.ts, apps/zzfx-studio/test/drums.test.ts, apps/zzfx-studio/test/noteEntry.test.ts
Stats: 6 files changed, 550 insertions(+), 58 deletions(-)

### 6d286fb84ec6f2dcd9de8cca9171fa1dbe8a0b18
fix: stop tracking the render worker bundle
public/render-worker.js is an esbuild bundle of the whole audio engine --
render-worker.ts imports renderSongBuffers, which pulls in song, effects,
instruments and zzfx. It was committed alongside its source from the start,
and its inputs changed across 15 commits while it was rebuilt in 4.

Tracking a build output made git authoritative over it. preweb does rebuild
it, but any checkout, merge or reset restored the committed blob on top of
the fresh build. That is how a drum bug survived three correct reverts: the
source was clean, the bundle on disk was two days old, and the app plays
whatever the bundle says. Nothing throws, because the worker was not missing
-- it was wrong, so it simply rendered different audio.

Its sibling from the same preweb line, the workbox runtime, was already
ignored. This gives the worker the same treatment and adds prestart, since
start serves web but had no pre-script and the file is no longer committed
for a fresh clone to fall back on.

The ignore pattern is **/ prefixed deliberately: a pattern containing a
slash anchors to the .gitignore's own directory, so the existing bare
public/workbox-v* form matches only a repo-root public/ and never
apps/zzfx-studio/public/. That line is still wrong and is left alone here.
Files: .gitignore, apps/zzfx-studio/package.json, apps/zzfx-studio/public/render-worker.js
Stats: 3 files changed, 16 insertions(+), 1 deletion(-)

### 4a4938dbc1829ae41f539236ed96ff28c158ec36
fix: the kick drops with pitchJump, because slide cannot stop falling
The foundational reason every previous attempt bubbled, from the ZzFX source
rather than from tuning:

  slide is `frequency += slide` on every sample, with no floor. It always
  reaches zero and keeps going, and a negative frequency is heard as rising
  pitch. Any pitched waveform driven by slide bubbles eventually -- steeper
  merely bubbles sooner. Capping it, scaling it, flooring it: all of those were
  choosing when the bubble happens, not whether.

  shape 4 is sin(t**3), whose phase accelerates without bound. It has no stable
  pitch, which is exactly why it reads as noise, and why the shipped drums never
  bubbled: a zero crossing is inaudible when there is no pitch to hear. It also
  means shape 4 can never be a low sound -- lowering it moves the runaway inside
  the note and it sweeps upward instead.

  pitchJump is `frequency += pitchJump` once, at pitchJumpTime. It is the only
  bounded pitch move in the parameter set.

So the kick is a sine with no slide at all and a single early downward step, a
quarter of its own frequency. A fraction rather than a fixed number of hertz
because the drum range shifts the kick between about 0.53x and 0.71x, and a
step big enough to matter at the top would drive the bottom through zero.

The test asserts the arithmetic rather than measuring the output: at the lowest
note of every archetype, frequency plus step stays above zero. That rules the
crossing out by construction instead of hoping a metric catches it -- and my
metrics could not, which is the other half of why this took so long. A 256
sample window resolves 86Hz, so it was measuring an 86Hz kick with an 86Hz
ruler and reporting its own quantisation as rebounds.
Files: apps/zzfx-studio/src/engine/instruments.ts, apps/zzfx-studio/test/drums.test.ts
Stats: 2 files changed, 66 insertions(+), 31 deletions(-)

### 79fc2aeec82d0e21b830f39f487615076b0310ab
fix: the generator may only put effects on drums that survive one
Measured every effect against every voice and every archetype, over the
audible part of the sound rather than its decayed tail, which is where earlier
measurements went wrong.

  BC  collapses the snare and the hat on every archetype -- it is a
      sample-and-hold, so an effective-sample-rate control, and both voices sit
      near 11kHz where the gentlest usable setting already halves them. It
      rebounds the boomy kick too. There is no drum it is safe on.
  SU  rebounds the crushed kick. DT and ST rebound the boomy one. A rebound is
      the frequency reaching zero and climbing back the other side, heard as a
      bubble rather than a drum.
  PD, SD, VB, TR  are safe on all three voices across all five archetypes.

Those four become DRUM_FX_PALETTE, which the channel pool is built from and
which the Launchpad's DRUMS layout will share, so the pads and the generator
draw on one set of sounds instead of two that disagree. Two vibes asked for BC
by name and now ask for TR.

The kick's slide is also capped at -2 rather than only scaled. To be accurate
about what that fixes: it bounds the worst case on the steepest archetypes, but
with the tail excluded the uncapped version does not rebound audibly, so this
is defensive rather than a fix for something you could hear.

The sweep test now measures only above -20dB. At 86Hz a 512-sample window
holds one zero crossing, so a single stray crossing at -30dB read as a 43Hz
climb -- which is why this test kept reporting bubbles in silence.
Files: apps/zzfx-studio/src/engine/effects.ts, apps/zzfx-studio/src/engine/instruments.ts, apps/zzfx-studio/test/drums.test.ts
Stats: 3 files changed, 132 insertions(+), 42 deletions(-)

### ead46031129b0fc6f517fd5cb3c182120f2fc893
fix: bit crush was destroying the voices it was aimed at
ZzFX's bitCrush is a sample-and-hold -- one sample recomputed in every
bitCrush*100 -- so it is really an effective-sample-rate control, and its damage
is proportional to pitch. Harmless on a low kick, fatal to a hat, which is
nothing but high frequencies.

Two consequences, both measured.

The generator aimed it at snares: BC: 'snares' in DRUM_EFFECT_TARGETS. At the
shipped value that is a 4.9kHz effective rate, aliasing an 11kHz snare down to
about 1kHz -- not a crunchy snare, a different and much quieter instrument. It
aims at kicks now, which are low enough to take it, and a crushed kick is the
sound this was reaching for anyway.

The crushed archetype carries bitCrush 1.5, a 294Hz effective rate. Its hat
rendered at 0.14x the level of every other archetype's with its pitch
collapsed: one kit in five was broken, which is what "some variants are really
quiet" was. The pitched-noise voices now cap it.

The cap is deliberately at the gentlest step rather than something chosen for
tone. The hold is a whole number of samples, so the ladder is coarse -- 1 is no
crushing at all, 2 is 22kHz, 3 is 14.7kHz -- and measured, hold 2 already takes
a hat from 11.3kHz down to 5.1kHz. There is no value that audibly crushes these
voices without halving their pitch, so the crushed archetype keeps its
character through its other parameters instead.

Crushed hat goes from 0.14x to 0.52x, in line with the 0.59-0.61x the others
sit at. Both new tests fail against the previous behaviour.
Files: apps/zzfx-studio/src/engine/effects.ts, apps/zzfx-studio/src/engine/instruments.ts, apps/zzfx-studio/test/drums.test.ts
Stats: 3 files changed, 72 insertions(+), 3 deletions(-)

### c82803ab3ea5e8ab8267bd685787ed301142ba6e
fix: the kick gets a sine body, because noise cannot be low
Reading ZzFX rather than guessing again: shape 4 is Math.sin(t**3) where t
accumulates every sample, so its instantaneous frequency runs away as t
squared. A high base pitch hits that runaway immediately and sounds like steady
bright noise, which is right for a snare or a hat. A low one hits it during the
note and sweeps upward instead, ending as bright as the hat. Measured, the kick
ran 4134Hz to 11714Hz across its length -- a rising whoosh, and audibly higher
than the hat it should sit an octave under. Lowering a shape-4 drum does not
make it low; it makes it sweep. Every attempt so far was fighting that.

So the kick alone gets a sine body. A kick is pitched: noise has no pitch and
therefore no audible low end, and ZzFX's noise term is scaled by frequency, so
at 90Hz it contributes nothing however high it is set. Crushing does not help
either -- a sine at that pitch measures 163 on peak-to-mean, and 54 with heavy
bitcrush, against 3 for the archetype. There is no setting that is both low and
broadband. Snare and hat stay exactly as they were.

The archetype's own slide is four times too steep for a sine this low: it
drives the frequency through zero and back up the other side, which is what
made the first attempt a bubble. A quarter of it drops without rising. Pitch,
envelope, level and slide all still come from the archetype, so the five still
sound different from each other.

Tonality was the wrong test and is why two bad kicks passed it. The
discriminator is the pitch trend: a thud falls, a bubble climbs. The new test
compares the first half of the pitch track against the second, and both
rejected kicks fail it -- the shape-4 one also fails a new check that the kick
actually measures lower than the hat, which it did not.
Files: apps/zzfx-studio/src/engine/instruments.ts, apps/zzfx-studio/test/drums.test.ts
Stats: 2 files changed, 74 insertions(+), 18 deletions(-)

### b0fb6c55385d8e584b2a8ec9c7339313d3ba754a
fix: the kick is a low-end thud, not a wash
Lengthening the tail was wrong. A low noise burst stretched to nearly twice the
archetype's length is a wash, not a thump -- audibly a different instrument,
and the reason the kick still sounded wild after the sine body was removed.

It keeps the archetype's own envelope now. The weight comes from being low and
hitting hard instead: 0.65x pitch, a slide steepened 1.25x for the drop, and a
touch more level. Both of those have a ceiling -- shape 4 is sin(t**3), so a
low enough frequency or a steep enough sweep rings as a tone whatever the shape
underneath. Swept both: this sits at a spectral peak-to-mean of 4.1, against
3.5 for the archetype it came from and 112 for the sine-bodied version.

Snare and hat are untouched; they were right.

Two tests changed with the design and one is new. The slide assertion allows a
deepening but no reversal and no runaway, since that is the parameter that
rings. "The kick is a thud, not a wash" bounds its length against its own
archetype and fails on the version this replaces.
Files: apps/zzfx-studio/src/engine/instruments.ts, apps/zzfx-studio/test/drums.test.ts
Stats: 2 files changed, 40 insertions(+), 16 deletions(-)

### 9dc63711ea5a1478357643469bda29923c35c25d
fix: drums vary again instead of bubbling
The kick was given a sine body and a steep downward slide, which is a
descending pure tone -- a bubble, not a drum. Measured against the archetype it
came from: tonality 112 where the archetype sits at 3.5, with the snare at 54.

The other half was worse and less obvious. Every parameter was assigned
outright rather than adjusted, so all five drum archetypes collapsed into the
same three sounds: standard, boomy and metallic kicks all rendered identically,
230ms each, and generating a song stopped varying its drums at all.

Each voice is now a nudge of whatever archetype it was handed -- pitch,
envelope and level -- and never touches shape, curve or slide. Pitch is the one
parameter needing care: shape 4 is sin(t**3), so its broadband character comes
from phase accelerating fast, and taking the frequency far enough down turns
the same shape into an audible sweep. Swept the parameter and it stays
broadband to about 0.65x and goes tonal below; steepening the slide tips it
over on its own. So the kick drops to 0.65x with the archetype's own slide left
alone, and gets its weight from a tail nearly twice as long.

Tonality is now 2.4-3.5 across every voice and archetype, against 2.8-3.6 for
what shipped. The voices separate by envelope instead: about 5x between kick
and hat, which is what the ear uses anyway, since shape 4 measures the same
brightness at any pitch -- the reason the original three sounded alike.

Tests measure spectral peak-to-mean rather than brightness, because a
descending sine and a noise burst can share a centroid and sound nothing alike.
Three of the five fail against the previous implementation, naming the kick's
tonality as the cause.
Files: apps/zzfx-studio/src/engine/instruments.ts, apps/zzfx-studio/test/drums.test.ts
Stats: 2 files changed, 138 insertions(+), 21 deletions(-)

### 6fecfead61a65cd1fac0899ee16cc9b43defaac8
fix: four defects from adversarial review
Stale audio: debouncing only delays the start of a render, so two can be in
flight and they do not finish in order. An earlier render landing last
overwrote the channel with audio from before the newer edit -- the grid showed
one thing while playback played another. Each render now takes a ticket and a
stale result is dropped.

Bass an octave out on older songs: the generator encoded bass against a
constant C3, but a song saved before that retuning still carries a C4 bass
instrument, so regenerating any bass wrote value 12 meaning C3 into an
instrument that plays it as C4. The base octave is now read off the instrument
the song actually has, threaded through every regenerate path.

Deflate bomb: the 1 MiB cap was applied after buffering the whole stream, which
is no defence -- the allocation it exists to prevent had already happened. The
read is bounded as it streams. The test asserts the read stops early rather
than measuring memory, because ArrayBuffers are external and never appear in
heapUsed; it fails when the bound is removed.

Compiler rules in the grid: the octave clamp set state synchronously in an
effect, and it destroyed the chosen register -- crossing into the bass and back
left you clamped rather than where you started. It derives now. The edit mode
reset did the same and is likewise derived, keyed to the pattern it opened in.
The drag context was published by writing a ref during render, which can hand
the pointer handler closures from a render React discarded; it moves to an
effect. PatternGrid is now free of compiler errors.
Files: apps/zzfx-studio/App.tsx, apps/zzfx-studio/src/components/PatternGrid.tsx, apps/zzfx-studio/src/engine/chords.ts, apps/zzfx-studio/src/engine/shareCodec.ts, apps/zzfx-studio/src/engine/song.ts, apps/zzfx-studio/test/share.test.ts
Stats: 6 files changed, 174 insertions(+), 38 deletions(-)

### 37e06c57b73c7b18735f060083593f3746aec670
feat: notes get an editor too, and kill the grid-wide focus ring
Enter on a note did nothing -- only effects had an editor -- so the keyboard
could not nudge a pitch at all and the pointer drag was the only way. Enter now
opens the note on the same two axes the drag uses: left and right walk the
scale, up and down move by octave. Drums follow the same axes, stepping between
voices and their pitch variants, exactly as dragging a drum cell does. Typing a
letter still enters that note directly and closes the editor, so the quick path
is never blocked.

editingEffect becomes editing: CursorField | null, so the two modes cannot both
be open and each cell knows when it is the one being edited.

The focus ring was mine from the previous commit: moving focus off the cells
and onto the container moved the browser's outline with it, drawing a box round
the whole grid. The suppression moves to the container, where focus now lives.

Help modal updated to match -- it already claimed ENTER worked.
Files: apps/zzfx-studio/src/components/HelpModal.tsx, apps/zzfx-studio/src/components/PatternGrid.tsx
Stats: 2 files changed, 90 insertions(+), 17 deletions(-)

### 060cf2538f4702cd2709dcf59e45642ae6765470
fix: grid cells are not buttons
Enter on an effect cell flashed orange and reverted, and the cursor jumped.
Driving the app with real trusted key events -- rather than JS-constructed
ones, which never take DOM focus and so never reproduced it -- gave the
mechanism:

  keydown CAP  target=fx cell  active=fx cell
    ★ cell restyled                      editor opens
    ↳ stopPropagation(keydown)           RNW PressResponder swallows the key
  keyup   CAP
    ★ cell restyled                      onPress fires on KEYUP, reverting it

Two failures, not one. Every cell was a Pressable, so every cell was an
independently focusable, keyboard-activatable control: it took DOM focus on
click, RNW's PressResponder called stopPropagation on Enter and Space, and
then fired the cell's own onPress on keyup -- which ran setEditingEffect(false)
and setCursor. Earlier attempts fixed the swallowed keydown and never saw the
keyup, because the flash looked like the editor failing to open.

A tracker grid is one keyboard widget with an internal cursor, not 256
buttons. The cells are plain Views now and the container is the single
focusable element. The cells' onPress handlers were pure duplication anyway --
handlePointerDown already places the cursor from coordinates, including
choosing note or effect via locateCell.

Verified with real key events: Enter opens the editor, ArrowUp cycles the
code, ArrowRight steps the value, Escape closes it leaving the cursor put, and
clicking still lands on exactly one cell.
Files: apps/zzfx-studio/src/components/PatternGrid.tsx
Stats: 1 file changed, 11 insertions(+), 24 deletions(-)

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
