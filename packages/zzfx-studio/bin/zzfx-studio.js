#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = `@zzfx-studio/platform-${process.platform}-${process.arch}`;

let pkgDir;
try {
  pkgDir = dirname(require.resolve(`${pkg}/package.json`));
} catch {
  console.error(`Unsupported platform: ${process.platform} ${process.arch}`);
  console.error(`Package ${pkg} is not installed.`);
  process.exit(1);
}

const binary = process.platform === 'win32' ? 'zzfx-studio.exe' : 'zzfx-studio';
const binaryPath = join(pkgDir, 'bin', binary);

try {
  execFileSync(binaryPath, [], {
    stdio: 'inherit',
    cwd: join(pkgDir, 'bin'),
  });
} catch (e) {
  if (e.status !== null && e.status !== 0) {
    process.exit(e.status);
  }
}
