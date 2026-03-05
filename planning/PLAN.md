# ZzFXM Chiptune Tracker — Algorithmic Pattern Generation Tool

## Overview

Build a browser-based chiptune music composition tool that looks and feels like a classic tracker but operates like a **generative player piano** — the user selects templates, constraints, and vibes, then the **algorithmic generation engine** produces song sections, instruments, and patterns using Euclidean rhythms, probability-weighted templates, and scale-constrained note selection. Users can regenerate any individual part they don't like. All audio is rendered via **ZzFX + ZzFXM**.

---

## Tech Stack

- **React Native** + **React Native Web** — cross-platform, web-first then mobile
- **React Native Skia** (`@shopify/react-native-skia`) — GPU-accelerated canvas rendering for tracker grid, waveforms, and visualizations
- **Expo** — project scaffolding with Skia web support template
- **ZzFX** + **ZzFXM** — inlined directly as JS function definitions (~1kb each)
- **No external APIs** — all generation is pure client-side JavaScript using proven algorithmic techniques

> See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) for full visual design specification, Skia rendering strategy, and responsive layout architecture.

> **Web target**: Skia renders via CanvasKit (WASM). Note the 16 WebGL context limit per page — we use max 3 canvases.
> **Mobile target**: portrait + landscape layouts, touch-first gestures, same codebase.

---

## Visual Design — Tracker Aesthetic

The UI should evoke a **classic hardware tracker / GameBoy chiptune tool**. Think:

- Dark background (`#0a0a0a` or deep navy), phosphor green or amber monospace text
- Grid-based pattern display — rows x channels, like a real tracker
- Channel columns labeled: `CH1 PULSE` | `CH2 HARM` | `CH3 BASS` | `CH4 DRUM`
- Note cells display note names (`C-4`, `E-4`, `---`) in fixed-width monospace
- Instrument numbers, volume, and effect columns per cell (even if read-only display)
- A transport bar: `[PLAY]` `[STOP]` `[LOOP]` with BPM display
- Pattern blocks shown as a **sequence strip** at the top (A, B, C, D blocks)
- Active row highlighted with a scanline-style cursor during playback
- Section headers in a retro pixel/terminal font style

---

## Song Architecture

### Fixed 4-Channel Layout (GameBoy-style)
```
Channel 0 — PULSE 1   (lead melody, shape=4)
Channel 1 — PULSE 2   (harmony / written-out arpeggios, shape=4)
Channel 2 — TRIANGLE  (bass line, shape=3)
Channel 3 — NOISE     (drums: kick, snare, hi-hat via noise param)
```

### Pattern Length
- Each pattern = **32 rows** at the selected BPM
- Rows advance at `BPM / 4` (quarter note = 8 rows by default)
- Patterns are labeled A-H and arranged in a sequence array

### Song Structure Templates (user picks one to start)
- **Adventure** — `A A B A A C A` (overworld loop feel)
- **Battle** — `A B A B C B` (high energy, repeating intensity)
- **Dungeon** — `A A B B A C` (slower, darker, minor key)
- **Title Screen** — `intro A A B A` (builds from single voice to full arrangement)
- **Boss** — `A B C A B D` (complex, driving, modulates)

---

## Instrument Generation

### The 5 Instrument Slots (fixed roles, generated parameters)

Each instrument is a ZzFX parameter array. The generation engine produces values within **strict chiptune-safe ranges**:

```
[volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
 slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise,
 modulation, bitCrush, delay, sustainVolume, decay, tremolo]
```

| Slot | Role | Shape | Constraints |
|------|------|-------|-------------|
| 0 | Pulse Lead | 4 | attack~0, sustain 0.05-0.15, release 0.05-0.1, shapeCurve 0.5-1 |
| 1 | Harmony/Arp | 4 or 2 | shorter sustain, slight bitCrush 0-2 |
| 2 | Triangle Bass | 3 | freq 55-220, zero attack, clean release |
| 3 | Kick | 0 | noise 0.5-1, freq 60-100, very short decay, slide -0.3 to -0.5 |
| 4 | Snare/HiHat | 0 | noise 1, freq 200-400, decay 0.02-0.06 |

### Instrument Generation Strategy

Instead of external API calls, instruments are generated using **parameter template pools with controlled randomization**:

```js
// Each vibe defines base parameter ranges per instrument slot
const INSTRUMENT_TEMPLATES = {
  adventure: {
    lead:    { volume: [0.6, 0.9], sustain: [0.08, 0.15], shapeCurve: [0.6, 1.0], ... },
    harmony: { volume: [0.4, 0.7], sustain: [0.04, 0.08], bitCrush: [0, 2], ... },
    bass:    { volume: [0.7, 1.0], freq: [55, 130], ... },
    kick:    { noise: [0.5, 0.8], freq: [60, 90], slide: [-0.3, -0.5], ... },
    snare:   { noise: [0.8, 1.0], freq: [200, 350], decay: [0.02, 0.05], ... },
  },
  battle: { ... },
  dungeon: { ... },
};

function generateInstrument(template) {
  return template.map(([min, max]) => min + Math.random() * (max - min));
}
```

Each vibe pre-tunes the parameter ranges so outputs are always musically appropriate. Users can regenerate individual slots to get new variations within the same vibe.

---

## Pattern Generation — The Core Engine

### Generation Philosophy

Adapted from the proven SynthyCraft approach: **no pure randomness anywhere**. Every track uses a combination of:

1. **Genre-aware templates** — structural anchors that define the feel
2. **Probability-weighted variations** — controlled deviation from templates
3. **Euclidean rhythms (Bjorklund algorithm)** — mathematically even hit distribution
4. **Gap-filling reactive logic** — tracks that respond to what other tracks are doing
5. **Scale-constrained note selection** — all melodic content locked to chosen key/scale

### Note Encoding for ZzFXM
- Notes are integers: middle C = `12`, D = `14`, E = `16`, F = `17`, G = `19`, A = `21`, B = `23`
- Each octave adds `12`: C5 = `24`, C3 = `0`
- Rest = `0`
- Channel data format per pattern: `[instrumentIndex, panValue, ...noteIntegers]`

### Scale System

```js
const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const SCALES = {
  major:          [0, 2, 4, 5, 7, 9, 11],
  minor:          [0, 2, 3, 5, 7, 8, 10],
  pentatonic:     [0, 2, 4, 7, 9],
  dorian:         [0, 2, 3, 5, 7, 9, 10],
  mixolydian:     [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor:  [0, 2, 3, 5, 7, 8, 11],
};

// Generate all valid notes in a key across octave range
function getScaleNotes(root, scale, octaveLow = 2, octaveHigh = 5) {
  const rootIdx = CHROMATIC.indexOf(root);
  const intervals = SCALES[scale];
  const notes = [];
  for (let oct = octaveLow; oct <= octaveHigh; oct++) {
    for (const interval of intervals) {
      const noteIdx = (rootIdx + interval) % 12;
      const noteOct = oct + Math.floor((rootIdx + interval) / 12);
      notes.push({ name: `${CHROMATIC[noteIdx]}${noteOct}`, midi: noteOct * 12 + noteIdx });
    }
  }
  return notes;
}
```

### Euclidean Rhythm Engine (Bjorklund Algorithm)

The mathematical backbone for distributing hits evenly across steps:

```js
function euclidean(hits, steps, rotation = 0) {
  if (hits <= 0) return Array(steps).fill(0);
  if (hits >= steps) return Array(steps).fill(1);

  let groups = Array.from({length: hits}, () => [1])
    .concat(Array.from({length: steps - hits}, () => [0]));

  while (true) {
    const remainder = groups.length % hits;
    if (remainder <= 1) break;
    const head = groups.splice(0, hits);
    for (let i = 0; i < remainder; i++) head[i] = head[i].concat(groups.shift());
    groups = head;
  }

  const pattern = groups.flat();
  return rotation > 0
    ? [...pattern.slice(rotation), ...pattern.slice(0, rotation)]
    : pattern;
}
```

### Channel-by-Channel Generation Strategy

#### Channel 3 — NOISE (Drums) — Generated First

Drums are the rhythmic backbone, generated before all other channels so melodic tracks can react to them. Uses the **layered template + probability + Euclidean** approach:

```js
function generateDrumPattern(vibe, rows = 32) {
  const pattern = Array(rows).fill(0);

  // --- KICK (instrument 3) ---
  // Template-based with vibe-specific probability variations
  const kickTemplates = {
    adventure: { base: [0,8,16,24], ghost: 0.15, ghostPositions: [6,14,22,30] },
    battle:    { base: [0,4,8,12,16,20,24,28], ghost: 0.25, ghostPositions: [2,6,10,14,18,22,26,30] },
    dungeon:   { base: [0,12,16,28], ghost: 0.1, ghostPositions: [8,24] },
    boss:      { base: [0,6,8,14,16,22,24,30], ghost: 0.2, ghostPositions: [4,12,20,28] },
  };

  // --- SNARE (instrument 4) ---
  // Probability-weighted distribution (SynthyCraft technique)
  const snareProb = Math.random();
  let snareHits;
  if (snareProb < 0.6)      snareHits = [8, 24];                    // standard backbeat
  else if (snareProb < 0.75) snareHits = [6, 12, 22, 28];           // syncopated
  else if (snareProb < 0.85) snareHits = [8, 14, 24, 30];           // offset
  else if (snareProb < 0.95) snareHits = [8]; if (Math.random() < 0.7) snareHits.push(24); // sparse
  else snareHits = euclidean(3, 32, Math.floor(Math.random() * 8))   // euclidean
    .map((v, i) => v ? i : -1).filter(i => i >= 0);

  // --- HI-HAT ---
  // Gap-filling reactive logic: plays on off-positions where kick AND snare are silent
  // 70% probability per eligible step (avoids collisions)
  const hatPattern = Array.from({length: rows}, (_, i) =>
    kickPattern[i] || snarePattern[i] ? 0 : i % 4 === 2 && Math.random() > 0.3 ? 1 : 0
  );

  // Merge: kick/snare/hat encoded as instrument switches in the noise channel
  return mergePercussion(kickPattern, snarePattern, hatPattern);
}
```

#### Channel 2 — TRIANGLE (Bass) — Generated Second

Uses **Euclidean rhythm for timing** + **scale-constrained note selection**:

```js
function generateBassPattern(key, scale, kickPattern, rows = 32) {
  const scaleNotes = getScaleNotes(key, scale, 2, 3); // bass range: octaves 2-3
  const density = 4 + Math.floor(Math.random() * 6);  // 4-9 hits per 32 rows
  const rhythm = euclidean(density, rows, Math.floor(Math.random() * rows));

  // Pre-select 2-4 notes from the scale (SynthyCraft technique)
  const notePool = [];
  const poolSize = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < poolSize; i++) {
    notePool.push(scaleNotes[Math.floor(Math.random() * scaleNotes.length)]);
  }

  // Always include the root
  const root = scaleNotes.find(n => n.name.startsWith(key));
  if (root && !notePool.includes(root)) notePool[0] = root;

  // 40% chance of octave variation in second half (SynthyCraft technique)
  const octaveShift = Math.random() < 0.4;

  return rhythm.map((hit, i) => {
    if (!hit) return 0; // rest
    let note = notePool[Math.floor(Math.random() * notePool.length)];
    if (octaveShift && i >= rows / 2) {
      // shift octave up or down by 1
      const shifted = note.midi + (Math.random() > 0.5 ? 12 : -12);
      if (shifted >= 24 && shifted <= 48) return shifted;
    }
    return note.midi;
  });
}
```

#### Channel 0 — PULSE 1 (Lead Melody) — Generated Third

Uses **constrained random walk** within the scale + **motif repetition** for musicality:

```js
function generateMelodyPattern(key, scale, bassPattern, vibe, rows = 32) {
  const scaleNotes = getScaleNotes(key, scale, 3, 5); // melody range: octaves 3-5

  // Step 1: Generate a short motif (4-8 notes) using scale-constrained random walk
  const motifLength = 4 + Math.floor(Math.random() * 5);
  let currentIdx = Math.floor(scaleNotes.length / 2); // start in middle of range
  const motif = [scaleNotes[currentIdx].midi];
  for (let i = 1; i < motifLength; i++) {
    // Random walk: move 1-3 scale degrees up or down
    const step = (Math.floor(Math.random() * 3) + 1) * (Math.random() > 0.5 ? 1 : -1);
    currentIdx = Math.max(0, Math.min(scaleNotes.length - 1, currentIdx + step));
    motif.push(scaleNotes[currentIdx].midi);
  }

  // Step 2: Place motif using Euclidean-distributed anchor points
  // Then fill with repetitions, transpositions, and rests
  const density = vibeConfig[vibe].melodyDensity; // e.g. adventure=0.5, battle=0.7, dungeon=0.3
  const rhythm = euclidean(Math.floor(rows * density), rows, Math.floor(Math.random() * 4));

  const pattern = Array(rows).fill(0);
  let motifIdx = 0;
  rhythm.forEach((hit, i) => {
    if (hit) {
      pattern[i] = motif[motifIdx % motif.length];
      motifIdx++;
    }
  });

  return pattern;
}
```

#### Channel 1 — PULSE 2 (Harmony/Arpeggios) — Generated Last

Reacts to the melody channel. Fills in harmony notes and written-out arpeggios:

```js
function generateHarmonyPattern(key, scale, melodyPattern, rows = 32) {
  const scaleNotes = getScaleNotes(key, scale, 3, 5);
  const pattern = Array(rows).fill(0);

  // Find sustained melody notes (where melody plays for 2+ rows)
  // Fill those gaps with arpeggiated chord tones
  for (let i = 0; i < rows; i++) {
    if (melodyPattern[i] > 0) {
      // Find chord tones: 3rd and 5th above the melody note
      const root = melodyPattern[i];
      const third = findScaleDegreeAbove(root, 2, scaleNotes); // 2 scale degrees up = 3rd
      const fifth = findScaleDegreeAbove(root, 4, scaleNotes); // 4 scale degrees up = 5th

      // Arpeggio: write out as fast note sequence (1-2 rows per note)
      if (Math.random() < 0.6 && i + 3 < rows) {
        const arpPattern = [root, third, fifth, third]; // up-down arp
        for (let j = 0; j < 4 && i + j < rows; j++) {
          pattern[i + j] = arpPattern[j];
        }
        i += 3; // skip ahead past the arp
      } else {
        // Simple harmony: just the third or fifth
        pattern[i] = Math.random() > 0.5 ? third : fifth;
      }
    }
  }

  return pattern;
}
```

### Vibe-Specific Configuration

Each vibe template controls the algorithmic parameters — density, probability weights, scale preference, and BPM range:

```js
const VIBE_CONFIG = {
  adventure: {
    bpmRange: [110, 135],
    preferredScales: ['major', 'mixolydian', 'pentatonic'],
    melodyDensity: 0.5,
    bassDensity: [4, 7],
    drumIntensity: 'medium',
    kickTemplate: 'fourOnFloor',
    fxChance: 0.2,
  },
  battle: {
    bpmRange: [140, 170],
    preferredScales: ['minor', 'harmonicMinor', 'dorian'],
    melodyDensity: 0.7,
    bassDensity: [6, 9],
    drumIntensity: 'high',
    kickTemplate: 'driving',
    fxChance: 0.4,
  },
  dungeon: {
    bpmRange: [80, 105],
    preferredScales: ['minor', 'dorian'],
    melodyDensity: 0.3,
    bassDensity: [3, 5],
    drumIntensity: 'sparse',
    kickTemplate: 'halfTime',
    fxChance: 0.15,
  },
  titleScreen: {
    bpmRange: [95, 120],
    preferredScales: ['major', 'pentatonic'],
    melodyDensity: 0.4,
    bassDensity: [3, 6],
    drumIntensity: 'light',
    kickTemplate: 'fourOnFloor',
    fxChance: 0.1,
  },
  boss: {
    bpmRange: [150, 180],
    preferredScales: ['harmonicMinor', 'minor', 'dorian'],
    melodyDensity: 0.8,
    bassDensity: [7, 10],
    drumIntensity: 'intense',
    kickTemplate: 'syncopated',
    fxChance: 0.5,
  },
};
```

### Generation Order (Dependency Chain)

Generation follows a strict order so each layer can react to what came before:

```
1. Drums    → structural backbone (kick template + probability snare + reactive hats)
2. Bass     → Euclidean rhythm + scale notes, avoids kick collisions
3. Melody   → constrained random walk + motif, reacts to bass movement
4. Harmony  → gap-fills around melody with arpeggios and chord tones
```

This is **instant** — no API calls, no loading spinners, no network latency. Generation completes in <10ms.

### Generation Granularity — Regenerable Units
Each of these can be independently regenerated:
1. **Full song** — regenerate everything
2. **Instrument set** — new sounds, same notes
3. **Single pattern** (A, B, C...) — regenerate one block
4. **Single channel within a pattern** — e.g. just the bass line
5. **Song sequence** — same patterns, new arrangement order

---

## UI Components

### 1. Setup Panel (left sidebar or top bar)
- **Vibe selector**: dropdown — Adventure / Battle / Dungeon / Title / Boss
- **Key selector**: C, D, E, F, G, A, B (root note)
- **Mode selector**: Major / Minor / Dorian / Mixolydian / Pentatonic / Harmonic Minor
- **BPM slider**: 80-180
- **Generate Full Song** button (primary CTA) — instant, no loading state needed

### 2. Pattern Sequence Strip
- Horizontal row of labeled blocks: `[A] [B] [C] [A] [B] [C] [A]`
- Click a block to view/edit that pattern in the grid below
- Each block has a regenerate button
- Active block highlighted during playback

### 3. Tracker Grid (main view)
Displays the currently selected pattern as a classic tracker grid:

```
ROW  | CH1:PULSE        | CH2:HARM         | CH3:BASS    | CH4:DRUM
-----|------------------|------------------|-------------|----------
 00  | C-4  0  ---  --- | E-4  1  ---  --- | C-3  2  --- | KCK  3
 01  | ---  -  ---  --- | G-4  1  ---  --- | ---  -  --- | ---  -
 02  | E-4  0  ---  --- | E-4  1  ---  --- | ---  -  --- | HAT  4
...
```

- Fixed-width monospace cells
- Instrument number shown per note
- Color coding: melody=green, harmony=cyan, bass=yellow, drums=red
- Playback cursor scrolls through rows

### 4. Instrument Panel
- Shows all 5 instrument slots with generated parameter arrays
- Labels: PULSE LEAD / HARMONY / TRI BASS / KICK / SNARE
- Each has a regenerate button
- Show key params visually: waveform shape label, ADSR as tiny bar indicators
- Play preview button per instrument

### 5. Transport Controls
```
[PLAY]  [STOP]  [LOOP: ON]   BPM: [120]   KEY: [C]  MODE: [Major]
```

---

## Constraints & Guardrails for Generation

Hard limits enforced by all generation functions:

- All note values: integers `0-48` (0 = rest, 12 = C3 up to 48 = C7)
- All ZzFX frequency params: `55-880` Hz
- All ZzFX time params (attack/sustain/release/decay): `0-2.0` seconds
- Volume: `0.1-1.0`
- Randomness: `0-0.05` (keep it tight for musical use)
- Shape: integer `0-4`
- Noise: `0-1`
- bitCrush: `0-4` (higher = more lo-fi crunch)
- Each pattern array must have exactly **34 values** (instrument index + pan + 32 notes)
- Sequence array values must be valid indices into the patterns object
- All melodic notes must belong to the selected scale (enforced at generation time)
- Drum patterns must respect vibe-specific density constraints

---

## State Shape

```js
{
  config: { vibe, key, scale, bpm },
  instruments: [ ...5 zzfx arrays ],
  patterns: { A: [...4 channels], B: [...], C: [...], ... },
  sequence: [0, 1, 0, 2, ...],  // pattern indices
  activePattern: 'A',
  playbackRow: null,             // null = stopped, int = playing
  isLooping: true,
}
```

Note: no `isGenerating` state needed — all generation is synchronous and instant.

---

## Key Implementation Notes

1. **Inline ZzFX + ZzFXM** — copy the minified source directly into the component, evaluated once on mount via `new Function()` or just defined as module-level constants
2. **AudioContext unlock** — wrap first play in a user-gesture handler (click), required by browsers
3. **Playback cursor** — use `setInterval` synced to `(60000 / bpm / 8)` ms per row (8 rows per beat)
4. **Pattern regeneration** should preserve the other patterns — only update the one being regenerated
5. **Instrument preview** — call `zzfxP` directly with a short test note when previewing
6. **ZzFXM render is synchronous and CPU-heavy** — do it in a `setTimeout` to not block the UI thread, show a spinner
7. **Generation is dependency-ordered** — drums first, then bass, then melody, then harmony. Each channel reacts to what was already generated. This produces musically coherent output without needing an external model.

---

## Stretch Goals (implement if space allows)

- **Export** — copy ZzFXM song array to clipboard as JS code
- **Swing/groove** — offset every other row's timing slightly for lo-fi feel
- **Pattern mutation** — "mutate" button that makes a small variation of a pattern (shift a few notes by 1-2 scale degrees, add/remove a couple hits) rather than full regen
- **Visual waveform** — show a tiny oscilloscope view per channel during playback using Web Audio analyser
- **WAV export** — render full song to WAV using manual RIFF header construction (SynthyCraft technique)
- **Density/complexity sliders** — per-channel control over Euclidean hit count and probability thresholds

---

*Target: a single self-contained `.jsx` artifact. The user should be able to generate a complete 4-channel GameBoy-style song in 1 click and play it back immediately — zero network calls, zero latency, pure algorithmic generation.*
