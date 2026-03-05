## Design Context

### Users
Indie game devs needing quick retro audio for game jams/prototypes AND chiptune hobbyists who enjoy the creative process. Both value speed and musical output quality. Context: they're in flow — building a game or exploring sounds — and want instant, usable results without friction.

### Brand Personality
**Raw. Lo-fi. Punk.**
This is a tool with attitude — DIY energy, underground aesthetic, unapologetically dense. It respects the craft of tracker music without being precious about it. The interface should feel like something you'd find on a demoscene BBS, not in an app store.

### Aesthetic Direction
- **Visual tone**: Dark, dense, information-rich. High contrast monospace text on near-black. Channel colors as identity markers. Orange accent for focus/cursor (Renoise heritage).
- **References**: Renoise (tracker grid, color-coded channels, row highlighting), Bitwig (modular panel layout, responsive track headers). The intersection of professional music tools and 8-bit constraints.
- **Anti-references**:
  - NO modern SaaS: no rounded cards, friendly gradients, whitespace-heavy layouts, or "clean" aesthetic
  - NO skeuomorphic retro kitsch: no fake LCD screens, pixel art borders, CRT scan lines, or nostalgia cosplay
  - NO minimal/stark: no sparse layouts — every pixel should earn its place with useful information
- **Theme**: Dark mode only. The color palette is defined in `planning/DESIGN-SYSTEM.md`.

### Accessibility
- Color-blind safe: channel colors (green/cyan/yellow/red) must be distinguishable across all color vision types. Use secondary indicators (shape, position, text labels) alongside color.
- WCAG AA contrast ratios for all text.
- Keyboard navigation for core workflows.

### Design Principles
1. **Density is a feature** — Pack information tight like a real tracker. Empty space is wasted space. The grid IS the app.
2. **Instant everything** — No loading states, no spinners, no transitions. Click and it's done. Generation is synchronous, playback starts immediately.
3. **Color = identity** — Green/cyan/yellow/red channels are always recognizable at a glance. Reinforce with text labels for color-blind users.
4. **Respect the tool** — This is a musical instrument, not a toy. No decorative elements. Every UI element serves a function.
5. **Raw over polished** — Prefer sharp edges, hard cuts, and direct feedback over smooth animations and gentle transitions. Punk, not pop.
