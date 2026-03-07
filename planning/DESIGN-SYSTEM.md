# ZzFXM Chiptune Tracker — Visual Design System

## Design References

Inspired by two professional DAWs, hybridized for our use case:

- **Renoise** — vertical tracker grid, monospace note columns (Note/Inst/Vol/FX), color-coded track headers, row numbers with beat highlighting, orange cursor, dark background with high-contrast text
- **Bitwig Studio** — modular panel architecture (header/body/detail/footer zones), color-coded clips and track lanes, responsive track headers that scale with available space, dual-view patterns (arranger + clip launcher), expression lanes in drum editor

Our app takes **Renoise's tracker grid as the primary editing metaphor** but wraps it in **Bitwig's modular panel layout system** for responsive flexibility across web and mobile.

---

## Tech Stack (Updated)

- **React Native** + **React Native Web** — cross-platform, web-first
- **React Native Skia** (via `@shopify/react-native-skia`) — GPU-accelerated canvas rendering for the tracker grid, waveform displays, and instrument visualizations
  - Web: renders via CanvasKit (WASM, ~2.9MB gzipped)
  - Note: 16 WebGL context limit per page — use a single large Skia Canvas for the grid, not per-cell canvases
- **ZzFX** + **ZzFXM** — inlined directly as JS function definitions
- **Expo** — recommended for project scaffolding with Skia web support template
- No Tailwind (not applicable in RN) — use StyleSheet + Skia drawing primitives

---

## Layout Architecture

### Orientation Modes

The app provides **two distinct layouts** that activate based on viewport:

```
LANDSCAPE (width > height, or width >= 768px)
+------------------------------------------------+
|  HEADER BAR (transport + config)               |
+----------+----------------------------+--------+
|  PATTERN |   TRACKER GRID             | INST   |
|  SEQ     |   (Skia Canvas)            | PANEL  |
|  (left)  |                            | (right)|
+----------+----------------------------+--------+
|  DETAIL BAR (generation controls + status)     |
+------------------------------------------------+

PORTRAIT (width < height, or width < 768px)
+---------------------------+
|  HEADER BAR (compact)     |
+---------------------------+
|  PATTERN SEQUENCE STRIP   |
+---------------------------+
|                           |
|  TRACKER GRID             |
|  (Skia Canvas, full w)    |
|                           |
+---------------------------+
|  TAB BAR                  |
|  [Grid|Inst|Gen|Config]   |
+---------------------------+
|  ACTIVE TAB PANEL         |
|  (instruments/gen/config) |
+---------------------------+
```

### Panel Sizing Strategy (Bitwig-inspired)

- **Panels are proportional**, not fixed-pixel — use flex ratios
- **Track headers shrink/grow** with available width (Bitwig technique): show full label at wide sizes, abbreviate at narrow
- **Grid cell size scales** to fit viewport: minimum readable size is 11px per character width, maximum is 16px
- Pattern sequence strip is always visible in both orientations — it's the top-level navigation

### Responsive Breakpoints

| Breakpoint | Layout | Grid Columns Visible | Notes |
|------------|--------|---------------------|-------|
| < 480px | Portrait | 2 channels (swipeable) | Mobile phone |
| 480-768px | Portrait | 4 channels (compact) | Large phone / small tablet |
| 768-1024px | Landscape | 4 channels + instruments | Tablet landscape |
| > 1024px | Landscape | 4 channels + full panels | Desktop / large tablet |

On narrow viewports where not all 4 channels fit, use **horizontal swipe** on the Skia canvas to pan between channels, with a channel indicator strip showing which are visible.

---

## Color System

### Base Palette

Derived from Renoise's dark-background tracker aesthetic with Bitwig's track-color differentiation:

```
Background & Surfaces
  --bg-primary:       #0C0C0E    (main background, near-black)
  --bg-surface:       #141418    (panel backgrounds)
  --bg-elevated:      #1C1C22    (raised elements, headers)
  --bg-grid-row:      #111115    (default grid row)
  --bg-grid-row-alt:  #0E0E12    (alternating rows — every beat group)
  --bg-grid-beat:     #18181E    (beat highlight — every 8 rows)
  --bg-cursor:        #2A1A0A    (active cursor row, warm dark amber)

Borders & Dividers
  --border-subtle:    #222228    (panel dividers)
  --border-track:     #2A2A32    (between track columns)
  --border-focus:     #E8740E    (focused element — Renoise orange)

Text
  --text-primary:     #D4D4D8    (main text, note names)
  --text-secondary:   #78787E    (row numbers, empty cells "---")
  --text-dim:         #44444A    (placeholder, disabled)
```

### Track Colors (Channel Identity)

Each channel gets a distinct hue, used for track headers, note text, and clip blocks:

```
Channel 0 — PULSE (Lead)
  --ch0-primary:    #4ADE80    (green — melody notes)
  --ch0-header:     #166534    (dark green — track header bg)
  --ch0-dim:        #22543D    (empty cells in this track)

Channel 1 — PULSE (Harmony)
  --ch1-primary:    #38BDF8    (cyan/sky blue — harmony notes)
  --ch1-header:     #0C4A6E    (dark blue — track header bg)
  --ch1-dim:        #164E63    (empty cells)

Channel 2 — TRIANGLE (Bass)
  --ch2-primary:    #FACC15    (yellow/amber — bass notes)
  --ch2-header:     #713F12    (dark amber — track header bg)
  --ch2-dim:        #654318    (empty cells)

Channel 3 — NOISE (Drums)
  --ch3-primary:    #F87171    (red/coral — drum hits)
  --ch3-header:     #7F1D1D    (dark red — track header bg)
  --ch3-dim:        #5C2020    (empty cells)
```

### Accent Colors

```
  --accent-primary:   #E8740E    (Renoise orange — cursor, focus, CTA buttons)
  --accent-hover:     #F59E0B    (lighter orange — hover states)
  --accent-generate:  #A855F7    (purple — generation/regenerate actions)
  --accent-play:      #22C55E    (green — play state, active playback)
  --accent-stop:      #EF4444    (red — stop, destructive actions)
  --accent-mute:      #6B7280    (gray — muted track overlay)
```

---

## Typography

### Font Stack

```
Primary (tracker grid, note display):
  "Berkeley Mono", "JetBrains Mono", "Fira Code", "SF Mono", monospace

  - MUST be monospace — grid alignment depends on character-width consistency
  - All note columns, row numbers, instrument values rendered in this font
  - In Skia: use matchFontFamilies() with fallback chain

Secondary (UI labels, buttons, panel headers):
  "Inter", "SF Pro", system-ui, sans-serif

  - Used for non-grid UI: panel titles, button labels, config dropdowns
```

### Type Scale

| Element | Size (desktop) | Size (mobile) | Weight | Color |
|---------|---------------|---------------|--------|-------|
| Grid note cell | 13px | 11px | 400 | track color |
| Grid row number | 12px | 10px | 400 | --text-secondary |
| Grid empty cell `---` | 13px | 11px | 400 | --text-dim |
| Track header label | 13px | 11px | 700 | --text-primary |
| Track sub-label (PLAY) | 10px | 9px | 400 | track color |
| Panel title | 14px | 12px | 600 | --text-primary |
| Button label | 12px | 11px | 600 | --text-primary |
| Transport BPM display | 20px | 16px | 700 | --accent-primary |
| Transport position | 16px | 14px | 400 | --text-primary |

---

## Skia Canvas Rendering

### Why Skia for the Grid

The tracker grid is the most performance-sensitive part of the UI. A 4-channel x 32-row grid with sub-columns = ~500+ text elements that must:
- Scroll smoothly during playback cursor animation
- Re-render instantly on pattern changes
- Support touch/drag interaction on mobile
- Scale cleanly across DPR (retina displays)

React Native views would create too many native nodes. A single Skia `<Canvas>` draws the entire grid as a custom render pass.

### Grid Rendering Strategy

```
Single Skia <Canvas> fills the grid panel area.

Drawing layers (back to front):
  1. Background fills — alternating row colors, beat highlights
  2. Cursor row highlight — warm amber overlay on active playback row
  3. Track column dividers — vertical lines between channels
  4. Row numbers — left gutter, monospace, dimmed
  5. Note text — per-cell, colored by channel
  6. Selection overlay — if user selects cells (stretch goal)

Coordinate system:
  - rowHeight = fontSize + 4px padding
  - colWidth = charWidth * maxCharsPerColumn
  - Track header is a separate fixed element above the canvas
  - Canvas scrolls vertically, content offset driven by playback position
```

### Touch / Interaction on Canvas

Since Skia canvas doesn't have native hit-testing:
- Divide canvas into a virtual grid of cells based on `(x / colWidth, y / rowHeight)`
- Touch/click maps to `{ channel, row, subColumn }`
- Long-press on a cell → show regeneration options for that channel
- Swipe left/right on mobile → pan between channels

### Non-Grid Skia Uses

- **Instrument waveform preview** — draw ZzFX waveform shape using Skia Path
- **ADSR envelope visualization** — 4-point line graph per instrument
- **Mini oscilloscope** — real-time waveform during playback (stretch)
- **Pattern sequence blocks** — colored rectangles with pattern label text

---

## Component Architecture

### Header Bar

```
+-----------------------------------------------------------------+
|  [PLAY] [STOP] [LOOP]  |  BPM: 120  |  KEY: C  MINOR  |  [GEN]  |
+-----------------------------------------------------------------+

- Transport buttons: icon-only on mobile, icon+label on desktop
- BPM: tappable, opens slider/stepper
- KEY/SCALE: tappable dropdowns
- GEN button: accent-generate purple, primary CTA
```

### Pattern Sequence Strip

```
Horizontal scrollable strip:
  [A] [B] [C] [A] [B] [C] [A]
   ^active

- Each block: 40x32px (desktop), 32x28px (mobile)
- Active pattern: accent-primary border + bright bg
- Each block shows: pattern letter + tiny mini-preview of note density
- Tap to select, long-press for regenerate menu
- Inspired by Renoise's Pattern Sequencer sidebar, but horizontal
```

### Track Headers (above grid, fixed)

```
  | ROW | CH1: LEAD      | CH2: HARMONY   | CH3: BASS      | CH4: DRUMS     |
  |     | Note  Ins Vol  | Note  Ins Vol  | Note  Ins Vol  | Note  Ins Vol  |
  |     | [S] [M] [R]    | [S] [M] [R]    | [S] [M] [R]    | [S] [M] [R]    |

- Color bar at top of each track (Renoise style)
- S = Solo, M = Mute, R = Regenerate (this channel only)
- On mobile: S/M collapse to icons, R moves to long-press menu
- Track name truncates: "LEAD" at narrow, "CH1: PULSE LEAD" at wide
```

### Tracker Grid (Skia)

```
ROW  | CH1: LEAD        | CH2: HARMONY     | CH3: BASS       | CH4: DRUMS
-----|------------------|------------------|-----------------|-------------
 00  | C-4  00  --  --  | E-4  01  --  --  | C-3  02  --     | KCK  03  80
 01  | ---  --  --  --  | G-4  01  --  --  | ---  --  --     | ---  --  --
 02  | E-4  00  --  --  | E-4  01  --  --  | ---  --  --     | HAT  04  40
 03  | ---  --  --  --  | ---  --  --  --  | ---  --  --     | ---  --  --
*04  | G-4  00  --  --  | C-5  01  --  --  | C-3  02  --     | SNR  04  80  ← beat row
 05  | ---  --  --  --  | E-4  01  --  --  | ---  --  --     | ---  --  --
 ...

Note column format (per channel):
  [NOTE]-[OCT]  [INS]  [VOL]  [FX]
   C-4          00     80     ---

- NOTE: 3 chars (C-4, D#3, ---) in track color
- INS: 2 chars (00-04) in dim
- VOL: 2 chars (00-80) in dim, brighter when non-default
- FX: 3 chars (---) for future use

Beat highlighting:
  - Every 8 rows gets slightly brighter bg (--bg-grid-beat)
  - Row 00, 08, 16, 24 are beat anchors
  - Row numbers for beat rows rendered in --text-primary instead of --text-secondary

Playback cursor:
  - Full-width amber highlight bar scrolling down through rows
  - Row above/below cursor slightly lit for "scanline" glow effect
  - When playing, grid auto-scrolls to keep cursor centered
```

### Instrument Panel (right side in landscape, tab in portrait)

```
+-----------------------------------+
|  INSTRUMENTS                      |
+-----------------------------------+
|  [0] PULSE LEAD     [preview] [R] |
|  ┌─ Wave: Pulse ─── ADSR ──────┐  |
|  │  ╱‾‾‾\___                   │  |
|  │  A  D  S  R                 │  |
|  └─────────────────────────────┘  |
|                                   |
|  [1] HARMONY        [preview] [R] |
|  ┌─ Wave: Pulse ─── ADSR ───────┐ |
|  │  ╱‾\__                       │ |
|  └──────────────────────────────┘ |
|                                   |
|  [2] TRI BASS       [preview] [R] |
|  [3] KICK           [preview] [R] |
|  [4] SNARE/HAT      [preview] [R] |
+-----------------------------------+

- Each instrument shows: waveform shape label, mini ADSR graph (Skia)
- [preview] = play a test note
- [R] = regenerate this instrument (purple accent)
- Collapsed view on mobile: just label + preview + regen, no graph
```

### Detail Bar / Generation Panel (bottom)

```
+-----------------------------------------------------------------------------------+
|  VIBE: [Adventure v]  |  Generate: [Full Song] [Pattern] [Channel] [Instruments]  |
+-----------------------------------------------------------------------------------+

- Vibe selector: dropdown with game genre templates
- Generate buttons: segmented control, purple accent
- Shows "last generated" status after action
- On mobile: collapses into a floating action button that opens a bottom sheet
```

---

## Interaction Patterns

### Generation Flow
1. User selects vibe + key + scale + BPM
2. Taps "Generate Full Song" — instant (<10ms), no spinner needed
3. Grid populates, first pattern selected
4. User taps play — playback begins with cursor animation
5. User can tap any pattern block to view it
6. Long-press a channel header → "Regenerate Channel" (keeps other channels)
7. Tap [R] on a pattern block → regenerate that pattern only

### Playback
- Cursor animates at `(60000 / BPM / 8)` ms per row
- Grid auto-scrolls to keep cursor in center third of viewport
- Active pattern block in sequence strip pulses with --accent-play border
- When reaching end of sequence: loop (if enabled) or stop

### Mobile Touch Gestures
- **Tap cell** → select/highlight
- **Swipe grid horizontally** → pan between channels (when not all fit)
- **Swipe pattern strip** → scroll through pattern sequence
- **Long-press channel header** → regenerate options
- **Pinch grid** → zoom in/out (adjust rowHeight/charSize) — stretch goal

---

## Animation

Keep animations minimal and purposeful — this is a tool, not a toy:

- **Playback cursor**: smooth vertical translate, 60fps via Skia animation
- **Pattern switch**: instant swap, no transition (trackers are immediate)
- **Generation**: brief flash of --accent-generate on affected cells (100ms)
- **Button press**: opacity 0.7 on press, snap back on release
- **Mute/Solo**: track dims instantly to 40% opacity when muted

---

## Iconography

Use simple geometric icons, no icon library needed — draw with Skia paths or use Unicode:

| Action | Icon | Notes |
|--------|------|-------|
| Play | filled right triangle | --accent-play green |
| Stop | filled square | --accent-stop red |
| Loop | circular arrows | --text-primary when off, --accent-play when on |
| Regenerate | circular arrow (single) | --accent-generate purple |
| Solo | "S" in circle | Track color when active, dim when off |
| Mute | "M" in circle | --accent-mute when active |
| Instrument preview | small speaker | Track color |

---

## Skia Canvas Constraint: WebGL Context Limit

Browsers limit to **16 active WebGL contexts** per page. Since each Skia `<Canvas>` creates one:

- **1 canvas** for the tracker grid (the big one)
- **1 canvas** for waveform/ADSR visualizations in the instrument panel
- **1 canvas** for pattern sequence mini-previews (optional)
- Total: **3 canvases max** — well within the 16 limit

If needed, use `__destroyWebGLContextAfterRender` on non-animated canvases (instrument panel) to free contexts.

---

## File Structure (Proposed)

```
src/
  app/
    App.tsx                    -- root layout, orientation detection
    screens/
      TrackerScreen.tsx        -- main screen, composes all panels
  components/
    layout/
      HeaderBar.tsx            -- transport + config controls
      PatternSequenceStrip.tsx -- horizontal pattern navigation
      DetailBar.tsx            -- vibe selector + generation buttons
    grid/
      TrackerGrid.tsx          -- Skia canvas wrapper + touch handling
      gridRenderer.ts          -- pure Skia draw functions for the grid
      gridLayout.ts            -- cell sizing, column widths, responsive calc
    instruments/
      InstrumentPanel.tsx      -- list of 5 instrument slots
      WaveformPreview.tsx      -- Skia ADSR/waveform mini graph
    controls/
      TransportButton.tsx
      ChannelHeader.tsx
      VibeSelector.tsx
  engine/
    generation/
      euclidean.ts             -- Bjorklund algorithm
      drums.ts                 -- drum pattern generation
      bass.ts                  -- bass pattern generation
      melody.ts                -- melody generation
      harmony.ts               -- harmony generation
      instruments.ts           -- ZzFX parameter generation
      song.ts                  -- full song assembly + sequence
    music/
      scales.ts                -- scale definitions + note generation
      notes.ts                 -- note encoding for ZzFXM
    audio/
      zzfx.ts                  -- inlined ZzFX source
      zzfxm.ts                 -- inlined ZzFXM source
      playback.ts              -- AudioContext, sequencer loop
      preview.ts               -- instrument preview playback
    vibes.ts                   -- vibe template configurations
  state/
    store.ts                   -- app state (config, patterns, playback)
  theme/
    colors.ts                  -- color constants
    typography.ts              -- font config
    layout.ts                  -- breakpoints, panel ratios
```

---

## Summary: Design Principles

1. **Tracker-first** — the grid IS the app. Everything else supports it.
2. **Instant generation** — no loading states. Click → result. Pure client-side.
3. **Color = identity** — green/cyan/yellow/red instantly tells you which channel.
4. **Dark background, high contrast** — readable in any environment.
5. **Responsive, not adaptive** — same app, fluid layout, two orientations.
6. **Skia for performance** — canvas rendering where DOM would choke.
7. **Touch-native** — gestures designed for fingers first, mouse works too.
