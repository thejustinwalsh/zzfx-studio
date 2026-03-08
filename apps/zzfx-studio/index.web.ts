import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
if (process.env.EXPO_PUBLIC_DISABLE_SW !== '1') {
  const { registerServiceWorker } = require('./src/sw-register');
  registerServiceWorker();
}

// Load JetBrains Mono as a web font + style scrollbars
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const fontWoff2 = require('./assets/JetBrainsMono-Regular.woff2');
  const fontTtf = require('./assets/JetBrainsMono-Regular.ttf');
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'JetBrains Mono';
      src: url('${fontWoff2}') format('woff2'),
           url('${fontTtf}') format('truetype');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.04) transparent; }
    *::-webkit-scrollbar { width: 4px; height: 4px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.04); }
    *::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.04); }
  `;
  document.head.appendChild(style);
}

import App from './App';
registerRootComponent(App);
