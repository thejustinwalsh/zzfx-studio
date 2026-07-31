// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = defineConfig([
  expoConfig,
  {
    // eslint-config-expo already registers the react-hooks plugin, so only the
    // rules are added here — a pnpm override pins the whole tree to v7, which
    // is the first version carrying the React Compiler diagnostics.
    rules: reactHooks.configs.flat['recommended-latest'].rules,
  },
  {
    ignores: [
      'dist/*',
      '.expo/*',
      // Vendored and generated bundles — not ours to lint.
      'public/workbox-*/*',
      'public/render-worker.js',
    ],
  },
]);
