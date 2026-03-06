# Effects Channels Implementation Plan

## Overview

Add per-note effects to the tracker, authentic to NES/GameBoy era chiptune music. Effects are displayed as a 2-char code + 2-digit hex value in an FX column next to each track's note column. Under the hood, notes with effects are routed to separate physical ZzFXM channels using instrument variants with the effect baked into the ZzFX parameters.

---

## Effect Selection (NES/GB Authentic)

8 effects chosen for authenticity and ZzFX parameter coverage:

| Code | Name | ZzFX Param(s) Modified | NES/GB Equivalent | Value Range |
|------|------|----------------------|-------------------|-------------|
| `SU` | Slide Up | `slide` (+) | NES sweep unit (pulse ch) | `01-FF` speed |
| `SD` | Slide Down | `slide` (-) | NES sweep unit | `01-FF` speed |
| `VB` | Vibrato | `repeatTime` + `tremolo` | Software vibrato | `XY` X=speed Y=depth |
| `DT` | Duty Cycle | `shapeCurve` | Pulse width (12.5/25/50%) | `01-03` preset |
| `ST` | Staccato | `sustain` * factor, `release` * factor | Short envelope | `01-FF` length |
| `PD` | Pitch Drop | `pitchJump` + `pitchJumpTime` | Tom/kick pitch fall | `01-FF` depth |
| `BC` | Bit Crush | `bitCrush` | Lo-fi crunch (authentic-adjacent) | `01-FF` amount |
| `TR` | Tremolo | `repeatTime` + `tremolo` (vol mode) | Volume wobble | `XY` X=speed Y=depth |

### Why These Effects

- **SU/SD** (Slide): The NES 2A03's pulse channels had a hardware sweep unit for automatic pitch slides. This is THE signature NES effect (Mega Man slide-in notes, Zelda item fanfares).
- **VB** (Vibrato): Software-implemented on NES by rapidly modulating the frequency register. Used in every RPG, especially on sustained melody notes.
- **DT** (Duty Cycle): The pulse channels could switch between 12.5%, 25%, and 50% duty cycles. Different widths = different timbres from the same channel. Quintessential GB/NES.
- **ST** (Staccato): Envelope manipulation to cut notes short. Used for rhythmic lead lines, staccato bass hits.
- **PD** (Pitch Drop): Quick downward pitch sweep. Used for percussion-like melodic hits, tom sounds, and dramatic falls.
- **BC** (Bit Crush): While not strictly NES-era, it maps to the lo-fi aesthetic and gives that crunchy chiptune character.
- **TR** (Tremolo): Volume oscillation. Used in dungeon themes and atmospheric sections.

### Effects NOT Included (and why)

- **Arpeggio** (0xy): Already handled by the harmony channel's arpeggio generation.
- **Echo/Delay**: Not authentic to NES/GB hardware (no delay line). Our existing `echoed` trait handles this at the instrument level.
- **FM Wobble**: Not NES/GB authentic (that's FM synthesis territory).

---

## Data Model Changes

### New Types (`types.ts`)

```typescript
// Effect codes — 2-char uppercase identifiers
type EffectCode = 'SU' | 'SD' | 'VB' | 'DT' | 'ST' | 'PD' | 'BC' | 'TR';

// A single note's effect
interface NoteEffect {
  code: EffectCode;
  value: number;  // 0x00-0xFF (displayed as 2-digit hex)
}

// Per-channel effects for one pattern (parallel to the 32 notes in ChannelData)
type ChannelEffects = (NoteEffect | null)[];  // length 32, null = no effect

// Effects for all 4 channels in one pattern
type PatternEffects = [ChannelEffects, ChannelEffects, ChannelEffects, ChannelEffects];
```

### Song Type Extension

```typescript
interface Song {
  config: SongConfig;
  instruments: ZzFXSound[];
  patterns: Record<PatternLabel, Pattern>;
  patternRoles: Record<PatternLabel, SectionRole>;
  patternEffects: Record<PatternLabel, PatternEffects>;  // NEW
  sequence: number[];
  patternOrder: PatternLabel[];
}
```

### Why Parallel Arrays (Not Inline)

The effects data is stored as a parallel array rather than encoded into ChannelData because:
1. ChannelData's format `[inst, pan, ...32 notes]` is dictated by ZzFXM's renderer
2. Effects don't exist in ZzFXM — they're a logical-layer concept that gets expanded at render time
3. Parallel arrays keep the existing generation pipeline untouched
4. Easy to serialize/deserialize independently

---

## Architecture: Logical-to-Physical Channel Expansion

### The Problem

ZzFXM allows only ONE instrument per channel per pattern. A note with `SU 40` (slide up) needs a different ZzFX parameter array than a clean note. We can't change instruments mid-channel.

### The Solution

At render time (`songToZzfxm`), expand logical channels to physical channels:

```
LOGICAL VIEW (what the user sees):
  CH0: LEAD    — C-4 SU40, D-4 ----, E-4 VB36, ...
  CH1: HARM    — E-4 ----, G-4 ----, ...
  CH2: BASS    — C-3 ----, C-3 SD20, ...
  CH3: DRUM    — KCK ----, --- ----, HAT ----, ...

PHYSICAL CHANNELS (what ZzFXM renders):
  ph0: lead_clean     — C-4, D-4, 0, ...        (instrument 0)
  ph1: lead_slideUp   — 0, 0, 0, ...             (instrument 4 = inst0 + SU)
  ph2: lead_vibrato   — 0, 0, E-4, ...           (instrument 5 = inst0 + VB)
  ph3: harm_clean     — E-4, G-4, ...            (instrument 1)
  ph4: bass_clean     — C-3, 0, ...              (instrument 2)
  ph5: bass_slideDown — 0, C-3, ...              (instrument 6 = inst2 + SD)
  ph6: drums           — KCK, 0, HAT, ...        (instrument 3)
```

### Expansion Algorithm

```
songToZzfxm(song):
  1. For each logical channel (0-3):
     a. Collect all unique effect codes used across all patterns
     b. For each unique effect+value combo, create an instrument variant:
        - Clone the base instrument params
        - Apply the effect's ZzFX param modifications
     c. Assign each variant a physical instrument index

  2. For each pattern:
     a. For each logical channel:
        - Create a "clean" physical channel (notes without effects)
        - For each unique effect used, create a physical channel with
          only the notes that have that effect
        - All physical channels for one logical channel share the same pan

  3. Return expanded instruments[] and patterns[][] arrays
```

### Effect-to-ZzFX Parameter Mapping

```typescript
function applyEffect(baseParams: ZzFXSound, effect: NoteEffect): ZzFXSound {
  const p = [...baseParams];
  const v = effect.value;

  switch (effect.code) {
    case 'SU': // Slide Up
      p[8] = (v / 255) * 8;      // slide: 0 to +8
      break;
    case 'SD': // Slide Down
      p[8] = -(v / 255) * 8;     // slide: 0 to -8
      break;
    case 'VB': // Vibrato (XY: X=speed 1-F, Y=depth 1-F)
      p[12] = 200 + (15 - (v >> 4)) * 60;  // repeatTime: faster = smaller
      p[19] = ((v & 0xF) / 15) * 0.5;       // tremolo depth
      break;
    case 'DT': // Duty Cycle
      p[7] = v === 1 ? 0.25 : v === 2 ? 0.5 : 1.0;  // shapeCurve presets
      break;
    case 'ST': // Staccato
      const factor = 1 - (v / 255) * 0.85;  // shorten by up to 85%
      p[4] *= factor;  // sustain
      p[5] *= factor;  // release
      break;
    case 'PD': // Pitch Drop
      p[10] = -(v / 255) * 20;    // pitchJump: 0 to -20
      p[11] = 0.01 + (v / 255) * 0.03;  // pitchJumpTime
      break;
    case 'BC': // Bit Crush
      p[15] = (v / 255) * 3;      // bitCrush: 0 to 3
      break;
    case 'TR': // Tremolo (XY: X=speed 1-F, Y=depth 1-F)
      p[12] = 150 + (15 - (v >> 4)) * 50;  // repeatTime
      p[19] = ((v & 0xF) / 15) * 0.7;       // tremolo depth (heavier for vol)
      break;
  }

  return p;
}
```

### Deduplication

To avoid creating redundant physical channels, we deduplicate by effect code (not value). Notes with `SU 40` and `SU 80` in the same channel DO need different instruments, but notes with identical effect+value can share one. In practice, the generator should use a small palette of values per effect to keep channel count manageable.

**Budget**: Max ~3 effect variants per logical channel = max 16 physical channels total. ZzFXM handles this fine.

---

## Generation Rules

### When Effects Are Applied

Effects are assigned during pattern generation based on:

1. **`fxChance` per vibe** (already exists in `VibeConfig`):
   - adventure: 0.2 (20% of notes get effects)
   - battle: 0.4
   - dungeon: 0.15
   - titleScreen: 0.1
   - boss: 0.5

2. **Section role modifiers**:
   - verse: 1.0x fxChance
   - contrast: 1.2x
   - bridge: 0.5x (sparser, breathing room)
   - breakdown: 0.3x (minimal effects)
   - climax: 1.5x (maximum expression)

3. **Per-channel effect pools** (which effects suit which channel):

| Channel | Allowed Effects | Rationale |
|---------|----------------|-----------|
| Lead (0) | SU, SD, VB, DT, ST, PD | Full palette — leads carry most expression |
| Harmony (1) | VB, DT, ST | Subtle — don't compete with lead |
| Bass (2) | SD, ST, PD | Limited — bass stays grounded |
| Drums (3) | none | Drums are already instrument variants (kick/snare/hat). No effects needed. |

4. **Phrase-position rules** (which notes get which effects):

```
PHRASE START (row 0, 8, 16, 24):
  → 40% chance: SU (scoop into the note — classic NES lead technique)
  → 20% chance: PD (dramatic pitch drop entrance)

PHRASE END (row 7, 15, 23, 31):
  → 40% chance: SD (slide down to rest — resolution)
  → 20% chance: ST (staccato cutoff before next phrase)

SUSTAINED NOTES (held 2+ rows):
  → 50% chance: VB (vibrato on held notes — the most natural use)
  → 20% chance: TR (tremolo on pads)

ANY NOTE (random assignment):
  → based on fxChance: DT, BC, ST
  → vibe-weighted: battle favors BC/ST, dungeon favors VB/TR
```

5. **Vibe-specific effect weighting**:

```typescript
const VIBE_FX_WEIGHTS: Record<VibeName, Partial<Record<EffectCode, number>>> = {
  adventure: { SU: 3, SD: 2, VB: 4, DT: 2, ST: 1, PD: 1 },
  battle:    { SU: 2, SD: 1, VB: 1, DT: 3, ST: 4, PD: 3, BC: 3 },
  dungeon:   { SU: 1, SD: 2, VB: 5, DT: 1, ST: 1, TR: 4 },
  titleScreen: { SU: 2, VB: 4, DT: 2, ST: 1 },
  boss:      { SU: 3, SD: 2, VB: 2, DT: 3, ST: 3, PD: 4, BC: 2 },
};
```

### Value Generation

Effect values are NOT random across 0x00-0xFF. Each effect uses a small curated palette of values to keep things musical and to minimize physical channel proliferation:

```typescript
const FX_VALUE_PALETTES: Record<EffectCode, number[]> = {
  SU: [0x20, 0x40, 0x60],           // mild, medium, heavy slide up
  SD: [0x20, 0x40, 0x60],           // mild, medium, heavy slide down
  VB: [0x24, 0x36, 0x48],           // slow-shallow, med-med, fast-deep
  DT: [0x01, 0x02, 0x03],           // 12.5%, 25%, 50% duty
  ST: [0x40, 0x80, 0xC0],           // quarter, half, three-quarter cut
  PD: [0x30, 0x60, 0x90],           // mild, medium, deep drop
  BC: [0x30, 0x60, 0xA0],           // subtle, medium, heavy crush
  TR: [0x24, 0x36, 0x48],           // slow-shallow, med-med, fast-deep
};
```

---

## UI Changes

### Grid Column Layout

Current format per channel column: `C-4` (just the note name, 3 chars)

New format: `C-4 SU40` (note + space + 2-char effect + 2-digit hex value = 9 chars)

Note display uses canonical tracker format (always 3 chars):
- Naturals padded with dash: `C-4`, `D-4`, `G-5`
- Sharps use `#`: `C#4`, `D#4`, `G#5`
- Rest: `---`
- No flats — trackers are sharps-only by convention

When no effect: `C-4 ----` (dashes for empty effect slot)

Rest rows: `--- ----`

### Visual Styling

- Effect codes render in a **dimmer color** than the note (e.g., `textSecondary` or a desaturated version of the channel color) so the notes remain the primary visual anchor
- When an effect IS present, the code renders in the channel's primary color and the value in a slightly dimmer shade
- This creates a natural visual hierarchy: **NOTE** > **FX CODE** > **FX VALUE**

### TrackerGrid Changes

The grid currently renders in two modes:
1. **Skia canvas** (`TrackerGrid.tsx`) — used for design system showcase, currently with demo data
2. **React Native Views** (`App.tsx` lines 657-712) — the actual live grid

Both need updating. The character width per column increases from ~3 chars to ~9 chars.

### Column Width Calculation

```
Current: "C-4" = 3 chars → ~25px per column
New:     "C-4 SU40" = 8 chars → ~68px per column
         "--- ----" = 8 chars (empty state)
```

With 4 channels + row numbers: `36 + (68 * 4) = 308px` minimum width. Fits comfortably.

---

## Implementation Steps

### Phase 1: Data Model & Types
1. Add `EffectCode`, `NoteEffect`, `ChannelEffects`, `PatternEffects` types to `types.ts`
2. Add `patternEffects` to `Song` interface
3. Add effect constants: `EFFECT_CODES`, `FX_VALUE_PALETTES`, `VIBE_FX_WEIGHTS`
4. Update `store.ts` to handle `patternEffects` in state

### Phase 2: Effect Generation
1. Create `src/engine/effects.ts`:
   - `generateEffectsForChannel(channelIndex, notes, config, role): ChannelEffects`
   - `generatePatternEffects(pattern, config, role): PatternEffects`
   - Phrase-position aware assignment
   - Vibe-weighted effect selection
   - Value palette selection
2. Wire into `song.ts`:
   - `generatePatternForRole` returns `PatternEffects` alongside `Pattern`
   - `regenerateChannel` preserves/regenerates effects
3. Add `applyEffect(baseParams, effect): ZzFXSound` utility

### Phase 3: Render Pipeline (songToZzfxm expansion)
1. Update `songToZzfxm` to expand logical → physical channels:
   - Scan all patterns for unique effect combos per logical channel
   - Generate instrument variants
   - Split notes into clean + effect physical channels
2. Update `zzfxMChannels` call sites to handle variable channel counts
3. Update `AudioGraph` to handle N channels (currently hardcoded to 4 in some places)

### Phase 4: UI Display
1. Update `App.tsx` grid rendering:
   - Add effect display next to note names
   - Format: `{noteName} {effectCode}{effectValue}` or `{noteName} ----`
   - Color effects dimmer than notes
2. Update column widths to accommodate wider cells
3. Update `TrackerGrid.tsx` (Skia version) similarly

### Phase 5: Serialization
1. Update `songToCode` / `songToClipboard` to include effect expansion in output
2. Update `songToJson` to serialize `patternEffects`
3. Update `codeToSong` / JSON import to handle effects (with backward compat for songs without effects)

### Phase 6: Oscilloscope / Visualization
1. Update `oscColorTable` computation in `App.tsx` to account for effect-modified instruments when computing envelope/frequency data for the oscilloscope display

---

## Backward Compatibility

- Songs without `patternEffects` are valid — treat as all-null effects
- `songToZzfxm` with no effects produces identical output to current behavior
- Existing instrument generation is unchanged — effects are additive
- Export format version bumps from `v: 1` to `v: 2`, with `v: 1` import defaulting to no effects

---

## Channel Budget Analysis

Worst case with effects:
- Lead: 1 clean + 3 effect variants = 4 physical channels
- Harmony: 1 clean + 2 effect variants = 3 physical channels
- Bass: 1 clean + 2 effect variants = 3 physical channels
- Drums: 1 channel (no effects)
- **Total: 11 physical channels**

ZzFXM handles this fine — it uses a dynamic channel loop. The main cost is more `zzfxG` calls at render time (one per unique instrument+note combo), but these are cached.

Typical case (adventure vibe, 20% fxChance):
- Lead: 1 clean + 1-2 effect variants = 2-3 physical channels
- Harmony: 1 clean + 0-1 effect variants = 1-2 physical channels
- Bass: 1 clean + 0-1 effect variants = 1-2 physical channels
- Drums: 1 channel
- **Total: 5-8 physical channels** — very manageable

---

## Files Modified

| File | Changes |
|------|---------|
| `src/engine/types.ts` | Add effect types, effect constants |
| `src/engine/effects.ts` | **NEW** — effect generation, application, vibe weights |
| `src/engine/song.ts` | Wire effects into generation pipeline, expand in `songToZzfxm` |
| `src/engine/instruments.ts` | Add `applyEffect()` (or put in effects.ts) |
| `src/engine/index.ts` | Re-export new types and functions |
| `src/engine/serialize.ts` | Serialize/deserialize patternEffects |
| `src/engine/audioGraph.ts` | Handle N channels instead of 4 |
| `src/store.ts` | Add patternEffects to state |
| `src/components/TrackerGrid.tsx` | Add FX column rendering |
| `App.tsx` | Display effects in grid, update column widths |
