// Service worker registration with update detection.
// Exposes a hook for React components to show update UI.

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

let waitingWorker: ServiceWorker | null = null;
let newVersion: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const cb of listeners) cb();
}

async function fetchNewVersion(): Promise<string | null> {
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return data.version ?? null;
    }
  } catch {}
  return null;
}

async function onUpdateFound(worker: ServiceWorker) {
  waitingWorker = worker;
  newVersion = await fetchNewVersion();
  notify();
}

export function registerServiceWorker() {
  if (Platform.OS !== 'web' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      if (reg.waiting) {
        onUpdateFound(reg.waiting);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdateFound(newWorker);
          }
        });
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

export function applyUpdate() {
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }
}

export function dismissUpdate() {
  waitingWorker = null;
  newVersion = null;
  notify();
}

export function useServiceWorkerUpdate(): { hasUpdate: boolean; version: string | null } {
  const [state, setState] = useState({ hasUpdate: !!waitingWorker, version: newVersion });

  useEffect(() => {
    const handler = () => setState({ hasUpdate: !!waitingWorker, version: newVersion });
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  return state;
}
