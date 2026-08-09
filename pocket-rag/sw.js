/* Service worker: makes the app installable and usable with no network.

   Two tiers. The shell — a few tens of kilobytes of HTML and JavaScript — is
   precached at install, so the app opens instantly and offline from the very
   first visit. The parser and embedding libraries named in vendor.json are
   ~2.9 MB, so they are filled in *after* activation, in the background, rather
   than being made a condition of installing.

   Model weights are cached by transformers.js and WebLLM themselves, so this
   deliberately does not touch huggingface.co — duplicating hundreds of
   megabytes in a second cache would be worse than useless on a phone. */
const VERSION = 'pocket-rag-v2';
const SHELL = [
  './', './index.html', './app.js', './vendor.js', './vendor.json',
  './worker-embed.js', './worker-llm.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];

/* The same local-first rule vendor.js applies, applied here. */
async function libraryURLs(){
  try {
    const cat = await (await fetch('./vendor.json', { cache: 'reload' })).json();
    let have = {};
    try {
      const r = await fetch('./vendor/manifest.json', { cache: 'no-store' });
      if (r.ok) have = (await r.json()).libs || {};
    } catch (e) {}
    return Object.entries(cat.libs)
      .filter(([, lib]) => lib.precache)
      .map(([key, lib]) => have[key] ? './vendor/' + lib.file : lib.cdn);
  } catch (e) { return []; }
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map(u => c.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
    const c = await caches.open(VERSION);
    const urls = await libraryURLs();
    /* Not awaited into the activate lifetime on purpose — the page should not
       wait on 2.9 MB before it is controlled. */
    Promise.allSettled(urls.map(async u => {
      if (await caches.match(u)) return;
      return c.add(new Request(u, { cache: 'reload', mode: 'cors' }));
    })).catch(() => {});
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('huggingface.co') || url.hostname.endsWith('hf.co')) return;
  const sameOrigin = url.origin === location.origin;
  const isCDN = url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !isCDN) return;

  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      if (res && (res.ok || res.type === 'opaque')) {
        const c = await caches.open(VERSION);
        c.put(e.request, res.clone()).catch(()=>{});
      }
      return res;
    } catch (err) {
      const fallback = await caches.match('./index.html');
      if (e.request.mode === 'navigate' && fallback) return fallback;
      throw err;
    }
  })());
});
