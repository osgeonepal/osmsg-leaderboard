// Service worker powered by Workbox (Google). https://developer.chrome.com/docs/workbox/
importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js");
const { registerRoute } = workbox.routing;
const { CacheFirst, StaleWhileRevalidate, NetworkFirst } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

workbox.core.skipWaiting();
workbox.core.clientsClaim();

registerRoute(
    ({ request }) => request.mode === "navigate" || ["script", "style", "worker"].includes(request.destination),
    new StaleWhileRevalidate({ cacheName: "osmsg-shell" })
);

const API_HOSTS = ["osmsg-1.onrender.com", "osmsg.osgeonepal.org"];
registerRoute(
    ({ url }) => API_HOSTS.includes(url.hostname) && url.pathname.startsWith("/api/"),
    new NetworkFirst({
        cacheName: "osmsg-api",
        networkTimeoutSeconds: 10,
        plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    })
);

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
