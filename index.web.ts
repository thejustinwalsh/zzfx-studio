import { registerRootComponent } from 'expo';
import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';

// Style scrollbars — thin dark track, no ugly hover expansion
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.04) transparent; }
    *::-webkit-scrollbar { width: 4px; height: 4px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.04); }
    *::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.04); }
  `;
  document.head.appendChild(style);
}
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: '#0C0C0E', // colors.bgPrimary
  },
});

function SkiaFallback() {
  return React.createElement(View, { style: styles.fallback });
}

function AppWithSkia() {
  return React.createElement(WithSkiaWeb, {
    getComponent: () => import('./App'),
    fallback: React.createElement(SkiaFallback),
  });
}

registerRootComponent(AppWithSkia);
