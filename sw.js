// Reassembles texlive-extra.data (~324MB) from <100MB chunks committed to
// the repo (GitHub blocks single files over 100MB). The BusyTeX engine
// requests one file at this URL; we intercept that request and synthesize
// the response by concatenating the parts, so the engine never knows the
// file was split.
const TARGET_SUFFIX = "/busytex-assets/texlive-extra.data";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if (url.endsWith(TARGET_SUFFIX)) {
    event.respondWith(reassemble(url));
  }
});

async function reassemble(url) {
  const manifest = await fetch(url + ".manifest.json").then((r) => r.json());
  const base = url.slice(0, url.lastIndexOf("/") + 1);

  const buffers = await Promise.all(
    manifest.parts.map((name) => fetch(base + name).then((r) => r.arrayBuffer()))
  );

  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    combined.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  return new Response(combined, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(total),
    },
  });
}
