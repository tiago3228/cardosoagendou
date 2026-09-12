/**
 * Minimal service worker — its only job is to make the app installable
 * (browsers require a registered worker with a fetch handler before offering
 * "Install app"). No caching, so the panel is always fresh.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* pass-through: let the network handle every request */
});
