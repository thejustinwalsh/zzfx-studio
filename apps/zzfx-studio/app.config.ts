import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: 'ZzFX Studio',
  slug: 'zzfx-studio',
  version: '0.1.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0C0C0E',
  },
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0C0C0E',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
    output: 'single',
  },
  experiments: {
    baseUrl: process.env.EXPO_BASE_URL || '',
    // babel-preset-expo wires babel-plugin-react-compiler in when this is set.
    // Note it runs with panicThreshold 'NONE' in production, so a component it
    // cannot compile is skipped silently — the react-hooks lint rules are how
    // you find out which ones.
    reactCompiler: true,
  },
});
