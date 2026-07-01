const CACHE = 'savva-hq-v4';
const ASSETS = ['./', './index.html', './manifest.json', './styles.css', './app.js'];

// Never let the service worker cache live API calls — these must always
// reflect what's actually happening (recovery score, calendar events), and
// a single accidentally-cached response would otherwise be served forever.
const NEVER_CACHE_HOSTS = [
  'api.prod.whoop.com',
  'api.anthropic.com',
  'googleapis.com',
  'accounts.google.com',
  'vercel.app',
  'gstatic.com'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Network-first for the app shell: always try to fetch the latest deployed
// version first, only falling back to the cache when offline. This is the
// opposite of the old cache-first behavior, which kept serving the version
// of index.html cached at first install no matter how many times the site
// was redeployed.
self.addEventListener('fetch', e => {
  if (NEVER_CACHE_HOSTS.some(host => e.request.url.includes(host))) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
