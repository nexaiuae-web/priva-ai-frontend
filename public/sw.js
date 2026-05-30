/* PRIVA AI — background upload sync (resilient retries when connectivity returns) */

const PENDING_CACHE = "priva-pending-uploads-v1";
const SYNC_TAG = "priva-upload-sync";

self.addEventListener("install", (event) => {
  console.log("[SW] install");
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  console.log("[SW] activate");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "PRIVA_TRACK_UPLOAD") return;
  console.log("[SW] tracking upload:", data.uploadId, data.filename);
});

self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  console.log("[SW] background sync:", SYNC_TAG);
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "PRIVA_RESUME_UPLOADS" });
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.includes("/api/documents/status/")) return;
  event.respondWith(
    fetch(event.request).catch((error) => {
      console.warn("[SW] status fetch failed:", error.message);
      throw error;
    }),
  );
});
