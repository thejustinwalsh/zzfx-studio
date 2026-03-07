importScripts('workbox-v7.4.0/workbox-sw.js');

workbox.setConfig({ modulePathPrefix: 'workbox-v7.4.0/' });
self.__WB_DISABLE_DEV_LOGS = true;

workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);
workbox.core.clientsClaim();

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
