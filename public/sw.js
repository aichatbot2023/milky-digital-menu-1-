/* SafeNest AI service worker v2
 * NEOBORIV: keširanje je optimizacija, nikad prepreka — svaka greška keš
 * API-ja (iOS ograničenja skladišta, privatni mod, kvota) završava običnim
 * mrežnim zahtevom. respondWith NIKAD ne dobija odbijen promise.
 */
const CACHE = "safenest-v12";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      } catch {
        /* keš nedostupan — nastavi bez čišćenja */
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok) {
      try {
        await cache.put(request, res.clone());
      } catch {
        /* kvota/iOS ograničenje — svejedno vrati odgovor */
      }
    }
    return res;
  } catch {
    return fetch(request);
  }
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    try {
      const cache = await caches.open(CACHE);
      await cache.put(request, res.clone());
    } catch {
      /* keš nedostupan — ignoriši */
    }
    return res;
  } catch {
    try {
      const hit = await caches.match(request);
      if (hit) return hit;
    } catch {
      /* ignoriši */
    }
    return fetch(request);
  }
}

self.addEventListener("fetch", (e) => {
  let url;
  try {
    url = new URL(e.request.url);
  } catch {
    return;
  }
  if (url.origin !== location.origin || e.request.method !== "GET") return;

  if (url.pathname.includes("/model/") || url.pathname.includes("/assets/")) {
    e.respondWith(cacheFirst(e.request));
    return;
  }
  if (e.request.mode === "navigate") {
    e.respondWith(networkFirst(e.request));
  }
});
