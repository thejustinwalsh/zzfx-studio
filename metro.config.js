const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable package exports and set condition names so Metro resolves
// zustand to its CJS build (the ESM build uses import.meta which Metro doesn't support)
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['require', 'react-native', 'browser', 'default'];

module.exports = config;
