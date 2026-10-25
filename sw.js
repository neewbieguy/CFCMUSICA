const CACHE_NAME = 'cifrados-v2';
const LOCAL_ASSETS = ['./', './index.html', './manifest.json'];
// Si cambiás la versión de Firebase en index.html, cambiala también acá
const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];
const ESPERA_RED_MS = 3000; // con mala señal, después de 3 s usa lo guardado

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(LOCAL_ASSETS);
        await Promise.allSettled(FIREBASE_SCRIPTS.map((url) => cache.add(url)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchConTimeout(req) {
  return Promise.race([
    fetch(req),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ESPERA_RED_MS))
  ]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const mismoOrigen = url.origin === self.location.origin;
  const esFirebaseScript = FIREBASE_SCRIPTS.includes(req.url);
  if (!mismoOrigen && !esFirebaseScript) return; // Firestore y Auth pasan directo

  // La página: primero la red (así siempre ves la última versión), si falla usa la guardada
  if (req.mode === 'navigate') {
    e.respondWith(
      fetchConTimeout(req)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('./index.html', copia));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // El resto: responde rápido con lo guardado y lo actualiza en segundo plano
  e.respondWith(
    caches.match(req).then((guardado) => {
      const deLaRed = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => guardado);
      return guardado || deLaRed;
    })
  );
});
