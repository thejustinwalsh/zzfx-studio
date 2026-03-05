import { registerRootComponent } from 'expo';
import React from 'react';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

function AppWithSkia() {
  return React.createElement(WithSkiaWeb, {
    getComponent: () => import('./App'),
    fallback: null,
  });
}

registerRootComponent(AppWithSkia);
