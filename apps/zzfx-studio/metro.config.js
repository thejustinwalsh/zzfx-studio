const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Enable package exports and set condition names so Metro resolves
// zustand to its CJS build (the ESM build uses import.meta which Metro doesn't support)
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['source', 'require', 'react-native', 'browser', 'default'];

// Add woff2 as a recognized asset extension
config.resolver.assetExts = [...config.resolver.assetExts, 'woff2'];

module.exports = config;
