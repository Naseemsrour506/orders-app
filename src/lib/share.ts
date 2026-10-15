// קורא את מה ששותף מווטסאפ ונשמר על ידי ה-service worker.
const CACHE = "share-inbox";

export interface SharedItem {
  id: string;
  title: string;
  text: string;
  url: string;
  files: File[];
}

export async function readShare(id: string): Promise<SharedItem | null> {
  if (!("caches" in window)) return null;
  const cache = await caches.open(CACHE);
  const metaRes = await cache.match(`/share-inbox/${id}/meta`);
  if (!metaRes) return null;
  const meta = (await metaRes.json()) as {
    id: string;
    title: string;
    text: string;
    url: string;
    files: { key: string; name: string; type: string }[];
  };
  const files: File[] = [];
  for (const f of meta.files) {
    const r = await cache.match(f.key);
    if (r) files.push(new File([await r.blob()], f.name, { type: f.type || r.headers.get("Content-Type") || "" }));
  }
  return { id: meta.id, title: meta.title, text: meta.text, url: meta.url, files };
}

export async function clearShare(id: string) {
  if (!("caches" in window)) return;
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) {
    if (new URL(req.url).pathname.startsWith(`/share-inbox/${id}/`)) await cache.delete(req);
  }
}

/** הטקסט ששותף, כולל קישור אם יש */
export function sharedText(s: SharedItem): string {
  return [s.title, s.text, s.url].filter(Boolean).join("\n").trim();
}
