// Service worker: שיתוף מווטסאפ, עבודה בלי קליטה, והתראות.
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const SHARE = "share-inbox";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("shell-") && key !== SHELL) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// ווטסאפ שולח POST עם הטקסט והקבצים. שומרים אותם ומעבירים את האפליקציה למסך /share.
async function receiveShare(request) {
  const form = await request.formData();
  const cache = await caches.open(SHARE);
  const files = form.getAll("files").filter((f) => f && typeof f !== "string" && f.size > 0);
  const id = Date.now().toString(36);
  const meta = {
    id,
    title: form.get("title") || "",
    text: form.get("text") || "",
    url: form.get("url") || "",
    files: files.map((f, i) => ({ key: `/share-inbox/${id}/${i}`, name: f.name || `file-${i}`, type: f.type || "" })),
  };
  for (let i = 0; i < files.length; i++) {
    await cache.put(meta.files[i].key, new Response(files[i], { headers: { "Content-Type": files[i].type || "application/octet-stream" } }));
  }
  await cache.put(`/share-inbox/${id}/meta`, new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
  return Response.redirect(`/share?id=${id}`, 303);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== "GET") return;

  // ניווט: קודם רשת, ובלי קליטה את מעטפת האפליקציה השמורה.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // קבצי האפליקציה (עם hash בשם): מהמטמון, ואם אין, מהרשת ושומרים.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "הזמנות", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      dir: "rtl",
      lang: "he",
      data: { url: data.url },
      tag: data.url,
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
