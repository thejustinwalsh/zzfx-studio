#!/usr/bin/env node

// Builds all platform packages:
// 1. Expo web export → resources/
// 2. neu update (downloads binaries + client library to resources/js/)
// 3. Copy init.js into resources/js/
// 4. Patch HTML for Neutralino (add script tags)
// 5. neu build → dist/ with binaries + resources.neu
// 6. Distribute into platform package dirs

import { mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkgDir = join(__dirname, '..');
const appDir = join(pkgDir, '..', '..', 'apps', 'zzfx-studio');
const resourcesDir = join(pkgDir, 'resources');
const platformsDir = join(pkgDir, 'platforms');
const distDir = join(pkgDir, 'dist', 'zzfx-studio');

const PLATFORMS = [
  { dir: 'darwin-arm64', binary: 'zzfx-studio-mac_arm64',     out: 'zzfx-studio' },
  { dir: 'darwin-x64',  binary: 'zzfx-studio-mac_x64',        out: 'zzfx-studio' },
  { dir: 'linux-x64',   binary: 'zzfx-studio-linux_x64',      out: 'zzfx-studio' },
  { dir: 'linux-arm64',  binary: 'zzfx-studio-linux_arm64',    out: 'zzfx-studio' },
  { dir: 'win32-x64',   binary: 'zzfx-studio-win_x64.exe',    out: 'zzfx-studio.exe' },
];

// Step 1: Build web resources
console.log('Building web resources...');
execSync('pnpm run build:worker', { cwd: appDir, stdio: 'inherit' });
execSync(`EXPO_PUBLIC_DISABLE_SW=1 npx expo export --platform web --output-dir ${resourcesDir}`, {
  cwd: appDir,
  stdio: 'inherit',
});

// Step 2: neu update (downloads binaries + client library to resources/js/)
console.log('Downloading Neutralinojs binaries and client library...');
execSync('npx @neutralinojs/neu update', { cwd: pkgDir, stdio: 'inherit' });

// Step 3: Copy init.js into resources/js/
copyFileSync(join(pkgDir, 'src', 'init.js'), join(resourcesDir, 'js', 'init.js'));

// Step 4: Patch HTML
console.log('Patching HTML...');
execSync(`node ${join(__dirname, 'patch-html.js')}`, { stdio: 'inherit' });

// Step 5: neu build
console.log('Building Neutralinojs app...');
execSync('npx @neutralinojs/neu build', { cwd: pkgDir, stdio: 'inherit' });

// Step 6: Distribute into platform packages
for (const { dir, binary, out } of PLATFORMS) {
  const platDir = join(platformsDir, dir);
  const binDir = join(platDir, 'bin');

  console.log(`Populating ${dir}...`);

  mkdirSync(binDir, { recursive: true });

  // Copy platform binary
  const srcBinary = join(distDir, binary);
  const destBinary = join(binDir, out);
  copyFileSync(srcBinary, destBinary);
  if (!out.endsWith('.exe')) {
    chmodSync(destBinary, 0o755);
  }

  // Copy resources.neu next to binary
  copyFileSync(join(distDir, 'resources.neu'), join(binDir, 'resources.neu'));
}

console.log('All platform packages built.');
