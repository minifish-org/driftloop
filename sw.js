// driftloop service worker.
//
// Strategy: cache-first for everything. App-shell files are precached on
// install so the page boots offline after one successful visit. Cross-
// origin assets (the js-synthesizer CDN bundle, the SoundFont, Magenta.js
// and the MelodyRNN checkpoint) are cached on first fetch via the runtime
// handler — they're large and the user may never opt into RNN, so it's
// not worth precaching them.

const CACHE = 'driftloop-v21';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './public/icons/icon.svg',
  './vendor/js-synthesizer/libfluidsynth.js',
  './vendor/js-synthesizer/js-synthesizer.js',
  // The SoundFont is NOT precached — it lives upstream on GitHub
  // (raw.githubusercontent.com) rather than in this deploy. The runtime
  // fetch handler below caches it on first request like any other GET.
  './src/ui/app.js',
  './src/synth/fluid.js',
  './src/synth/scheduler.js',
  './src/composer/theory.js',
  './src/composer/voicing.js',
  './src/composer/rhythm.js',
  './src/composer/genres/index.js',
  './src/composer/genres/lofi.js',
  './src/composer/genres/ambient.js',
  './src/composer/genres/jazz.js',
  './src/composer/genres/classical.js',
  './src/composer/lead/index.js',
  './src/composer/lead/rnn.js',
  './src/composer/progression.js',
  './src/composer/section.js',
  './version.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    // Cache successful (200) and opaque (no-cors) responses. The latter
    // lets us cache CDN assets we can't introspect — we still serve them
    // back later as opaque, which is fine for <script> and binary data.
    if (resp && (resp.status === 200 || resp.type === 'opaque')) {
      cache.put(request, resp.clone()).catch(() => {});
    }
    return resp;
  } catch (err) {
    // Offline and not cached. Surface the failure — nothing we can do.
    throw err;
  }
}
