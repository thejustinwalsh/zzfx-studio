module.exports = {
  globDirectory: 'dist/',
  globPatterns: [
    '**/*.{js,woff2,html}',
    'manifest.json',
    'favicon.ico',
  ],
  globIgnores: [
    'metadata.json',
    'version.json',
    'workbox-v*/**',
  ],
  swSrc: 'src/sw-source.js',
  swDest: 'dist/sw.js',
};
