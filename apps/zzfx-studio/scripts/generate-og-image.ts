/**
 * Renders public/og-image.png — the card that appears when a link to the app
 * is shared.
 *
 * It is generated rather than screenshotted so it can be re-run when the UI
 * changes. The previous hand-captured image went stale the moment the grid
 * header changed, and nothing caught it.
 *
 *   pnpm run og
 */
import { statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const W = 1200;
const H = 630;

const C = {
  bg: '#0C0C0E',
  surface: '#141418',
  elevated: '#1C1C22',
  row: '#111115',
  rowAlt: '#0E0E12',
  beat: '#18181E',
  cursor: '#2A1A0A',
  borderSubtle: '#222228',
  borderTrack: '#2A2A32',
  textPrimary: '#D4D4D8',
  textSecondary: '#78787E',
  textDim: '#44444A',
  accent: '#E8740E',
  ch: ['#4ADE80', '#38BDF8', '#FACC15', '#F87171'],
};

const FONT = 'JetBrains Mono';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const parts: string[] = [];
const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);
const stroke = (x: number, y: number, w: number, h: number, col: string) =>
  parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" fill="none" stroke="${col}"/>`);
const line = (x1: number, y1: number, x2: number, y2: number, col: string) =>
  parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1"/>`);
const text = (
  s: string, x: number, y: number, fill: string, size: number,
  opts: { weight?: number; anchor?: 'start' | 'middle' | 'end'; spacing?: number } = {}
) =>
  parts.push(
    `<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT}" font-size="${size}" ` +
    `font-weight="${opts.weight ?? 400}" text-anchor="${opts.anchor ?? 'start'}"` +
    (opts.spacing ? ` letter-spacing="${opts.spacing}"` : '') +
    `>${esc(s)}</text>`
  );

// --- backdrop ---------------------------------------------------------------
rect(0, 0, W, H, C.bg);

// --- header -----------------------------------------------------------------
text('ZZFX STUDIO', 40, 60, C.accent, 32, { weight: 700, spacing: 2 });
text('ALGORITHMIC CHIPTUNE TRACKER', 40, 86, C.textSecondary, 14, { spacing: 1.5 });
text('THE RELENTLESS VALOR', W - 40, 60, C.textPrimary, 22, { weight: 700, anchor: 'end' });
text('BATTLE / E MINOR / 149 BPM / EPIC', W - 40, 86, C.textDim, 14, { anchor: 'end' });
line(0, 112, W, 112, C.borderTrack);

// --- sequence strip ---------------------------------------------------------
const SEQ = ['A', 'B', 'C', 'A', 'B', 'C', 'D', 'A', 'B', 'D'];
SEQ.forEach((label, i) => {
  const x = 40 + i * 46;
  const y = 132;
  const on = i === 1 || i === 4 || i === 8;
  rect(x, y, 38, 30, on ? C.cursor : C.elevated);
  stroke(x, y, 38, 30, on ? C.accent : C.borderSubtle);
  text(label, x + 19, y + 21, on ? C.accent : C.textSecondary, 15, { weight: 700, anchor: 'middle' });
});

// --- per-channel panels -----------------------------------------------------
const NAMES = ['LEAD', 'HARM', 'BASS', 'DRUM'];
const SHAPES = ['SAW', 'SQR', 'SQR', 'NSE'];
const PW = 272;
const PY = 188;
const PH = 86;
NAMES.forEach((name, i) => {
  const x = 40 + i * (PW + 12);
  rect(x, PY, PW, PH, C.surface);
  stroke(x, PY, PW, PH, C.borderSubtle);
  rect(x, PY, PW, 3, C.ch[i]);
  text(name, x + 12, PY + 28, C.ch[i], 13, { weight: 700 });
  text(SHAPES[i], x + PW - 12, PY + 28, C.textDim, 11, { anchor: 'end' });
  // A decay envelope: attack spike, then a long fall.
  const pts = [`${x + 12},${PY + 74}`, `${x + 26},${PY + 42}`, `${x + PW - 14},${PY + 70}`];
  parts.push(
    `<polyline points="${pts.join(' ')}" fill="none" stroke="${C.ch[i]}" stroke-width="1.5"/>`
  );
  rect(x + 12, PY + 78, PW - 24, 4, C.elevated);
  rect(x + 12, PY + 78, (PW - 24) * (0.35 + i * 0.15), 4, C.ch[i]);
});

// --- tracker grid -----------------------------------------------------------
const GY = 296;
const ROW_H = 26;
const ROWS = 13;
const COL_X = [96, 372, 648, 924];
const COL_W = 268;

text('OCT4', 40, GY + 19, C.accent, 13, { weight: 700 });
NAMES.forEach((name, i) => {
  text(name, COL_X[i], GY + 19, C.ch[i], 14, { weight: 700 });
  text('M S R', COL_X[i] + COL_W - 16, GY + 19, C.textDim, 11, { anchor: 'end' });
});
line(0, GY + 28, W, GY + 28, C.borderTrack);

const NOTES = [
  ['E-4', 'C-5', 'G-5', '---', 'G-4', 'E-5', '---', 'E-5', 'A-4', 'D-5', '---', 'D-5', 'F#5'],
  ['---', '---', '---', '---', '---', '---', '---', '---', '---', 'B-4', '---', '---', '---'],
  ['B-3', 'A-3', '---', '---', 'E-4', 'A-3', '---', '---', 'E-4', 'B-3', '---', 'F#4', 'B-3'],
  ['---', 'KCK', '---', 'HAT', 'KCK', '---', 'HAT', '---', '---', 'KCK', '---', 'HAT', 'KCK'],
];
const FX: Record<number, Record<number, string>> = {
  0: { 9: 'ST80' },
  3: { 9: 'PDA0' },
};

for (let r = 0; r < ROWS; r++) {
  const y = GY + 29 + r * ROW_H;
  const isBeat = r % 4 === 0;
  const isPlayhead = r === 12;
  rect(0, y, W, ROW_H, isPlayhead ? C.cursor : isBeat ? C.beat : r % 2 ? C.rowAlt : C.row);
  if (isPlayhead) rect(0, y, 3, ROW_H, C.accent);

  text((r + 7).toString(16).toUpperCase().padStart(2, '0'), 40, y + 18,
    isPlayhead ? C.accent : isBeat ? C.textSecondary : C.textDim, 13);

  for (let ch = 0; ch < 4; ch++) {
    const note = NOTES[ch][r];
    text(note, COL_X[ch], y + 18, note === '---' ? C.textDim : C.ch[ch], 14,
      { weight: isPlayhead ? 700 : 400 });
    const fx = FX[ch]?.[r];
    text(fx ?? '----', COL_X[ch] + 54, y + 18, fx ? C.ch[ch] : C.textDim, 14);
  }
}
for (const x of COL_X) line(x - 24, GY + 28, x - 24, H, C.borderTrack);

// Let the grid run off the bottom edge rather than stopping dead.
parts.push(
  `<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="${C.bg}" stop-opacity="0"/>` +
  `<stop offset="1" stop-color="${C.bg}" stop-opacity="1"/></linearGradient></defs>` +
  `<rect x="0" y="${H - 96}" width="${W}" height="96" fill="url(#fade)"/>`
);

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  parts.join('') +
  `</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: {
    fontFiles: [resolve(root, 'assets/JetBrainsMono-Regular.ttf')],
    loadSystemFonts: true,
    defaultFontFamily: FONT,
  },
});

const out = resolve(root, 'public/og-image.png');
writeFileSync(out, resvg.render().asPng());

console.log(`og-image.png  ${W}x${H}  ${Math.round(statSync(out).size / 1024)} KB`);
