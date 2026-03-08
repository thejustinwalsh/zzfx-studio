# zzfx-studio

[![npm](https://img.shields.io/npm/v/zzfx-studio)](https://www.npmjs.com/package/zzfx-studio)
[![license](https://img.shields.io/npm/l/zzfx-studio)](./LICENSE)

ZzFX Studio is an algorithmic chiptune tracker that generates 4-channel retro songs instantly using pure math -- no samples, no AI. Built for indie game devs who need quick retro audio for game jams and chiptune hobbyists who enjoy the creative process. Available as a PWA, desktop app (`npx zzfx-studio`), or global install (`npm i -g zzfx-studio`).

## Quick Start

Run it right now, no install needed:

```sh
npx zzfx-studio
```

Or install globally:

```sh
npm i -g zzfx-studio
zzfx-studio
```

Or use the PWA -- no install at all:

**[thejustinwalsh.github.io/zzfx-studio](https://thejustinwalsh.github.io/zzfx-studio)**

## Supported Platforms

| Platform | Architecture |
|---|---|
| macOS | ARM64 (Apple Silicon), x64 (Intel) |
| Linux | x64, ARM64 |
| Windows | x64 |

The correct binary is automatically selected when you install via npm. Platform packages are optional dependencies -- if your platform isn't supported, the install won't fail, you just won't get the desktop binary.

## How It Works

The desktop app wraps the web app using [Neutralino.js](https://neutralino.js.org/) -- a lightweight alternative to Electron that uses the system's native webview. The result is a tiny binary that launches fast and doesn't ship a whole browser.

The music generation is entirely algorithmic: Euclidean rhythms, probability-weighted pattern templates, and scale-constrained note selection. All audio is synthesized in real-time using [ZzFX](https://github.com/KilledByAPixel/ZzFX) and [ZzFXM](https://github.com/keithclark/ZzFXM).

## Repository

[github.com/thejustinwalsh/zzfx-studio](https://github.com/thejustinwalsh/zzfx-studio)

## License

[MIT](./LICENSE)
