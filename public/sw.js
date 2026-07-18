/* SafeNest AI service worker
 * - /model/ i /assets/ : cache-first (nepromenljivi fajlovi) → ponovna
 *   otvaranja aplikacije i modela su TRENUTNA, radi i offline
 * - navigacija (index.html) : network-first → uvek sveža verzija aplikacije,
 *   keš samo kao offline rezerva
 */
const CACHE = "safenest-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;

  const isImmutable =
    url.pathname.includes("/model/") || url.pathname.includes("/assets/");

  if (isImmutable) {
    // cache-first
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (e.request.mode === "navigate") {
    // network-first (sveža verzija), keš kao offline rezerva
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
  }
});
