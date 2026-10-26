/* Poum Tchak : cache hors ligne.
   Les fichiers de l'appli sont gardés dès la première visite ; les polices et
   le reste sont gardés au fil des chargements. Une nouvelle version remplace
   l'ancienne au lancement suivant. */
const V = 'poum-tchak-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.allSettled(CORE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // La page elle-même : le réseau d'abord, pour voir les mises à jour tout de suite.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(V);
      try {
        const net = await fetch(req);
        if (net && net.ok) cache.put('./index.html', net.clone());
        return net;
      } catch (err) {
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          new Response('Hors ligne.', { status: 504, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Le reste (polices, icônes) : le cache d'abord, rafraîchi en arrière-plan.
  e.respondWith((async () => {
    const cache = await caches.open(V);
    const hit = await cache.match(req, { ignoreSearch: false });
    const net = fetch(req).then(resp => {
      if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);
    if (hit) return hit;
    const resp = await net;
    return resp || new Response('', { status: 504 });
  })());
});
