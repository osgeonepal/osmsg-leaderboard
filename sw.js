// Service worker powered by Workbox (Google). https://developer.chrome.com/docs/workbox/
importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js");
const { registerRoute } = workbox.routing;
const { CacheFirst, StaleWhileRevalidate, NetworkFirst } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

workbox.core.skipWaiting();
workbox.core.clientsClaim();

// App shell (HTML + JS) — fast, fall back to cache.
registerRoute(
    ({ request }) => request.mode === "navigate" || ["script", "style", "worker"].includes(request.destination),
    new StaleWhileRevalidate({ cacheName: "osmsg-shell" })
);

// OSMSG API — try network, then cached copy.
registerRoute(
    ({ url }) => url.hostname === "osmsg.osgeonepal.org" && url.pathname.startsWith("/api/"),
    new NetworkFirst({
        cacheName: "osmsg-api",
        networkTimeoutSeconds: 10,
        plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    })
);

// CDNs (fonts, lucide, tailwind, avatars) — long-lived cache.
registerRoute(
    ({ url }) => ["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "cdn.tailwindcss.com",
        "storage.googleapis.com", "github.com", "avatars.githubusercontent.com"].includes(url.hostname),
    new CacheFirst({
        cacheName: "osmsg-cdn",
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
    })
);
