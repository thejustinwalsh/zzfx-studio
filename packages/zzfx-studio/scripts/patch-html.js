#!/usr/bin/env node

// Patches the Expo-exported index.html for Neutralino:
// Adds neutralino.js client library + init script

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const htmlPath = join(import.meta.dirname, '..', 'resources', 'index.html');
let html = readFileSync(htmlPath, 'utf-8');

// Add Neutralino client library + init script in <head>
html = html.replace(
  '</head>',
  '\n  <script src="/js/neutralino.js"></script>\n  <script src="/js/init.js"></script>\n  </head>'
);

writeFileSync(htmlPath, html);
console.log('Patched index.html for Neutralino');
