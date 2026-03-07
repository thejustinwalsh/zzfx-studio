import { defineConfig } from 'tsup';

export default defineConfig([
  // Standard build — zzfx is external (peer dep), transpile-only
  {
    entry: ['src/**/*.ts', '!src/**/*.d.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    bundle: false,
    external: ['zzfx'],
  },
  // Micro build — zzfx bundled inline, minified with terser
  {
    entry: { 'micro.min': 'src/zzfxm.ts' },
    format: ['esm', 'cjs'],
    noExternal: ['zzfx'],
    minify: 'terser',
    terserOptions: {
      compress: { passes: 3 },
      mangle: true,
    },
  },
]);
