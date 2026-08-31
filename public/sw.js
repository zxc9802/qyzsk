/**
 * 内部业务助手 Service Worker。
 *
 * 缓存策略：
 *   - 导航请求：只走网络，失败时返回 /offline.html，避免缓存带会话信息的页面
 *   - 同源静态资源（_next/static、字体、图标）：stale-while-revalidate
 *   - /api/* 永远走网络，命中失败时返回 503 JSON，由前端业务代码自行处理
 *   - 其他跨域请求：不拦截
 *
 * 重要：不缓存页面和 API 响应，避免把内部资料、SSO 跳转或鉴权失败内容留在 Cache Storage。
 */

const VERSION = "v3";
const SHELL_CACHE = `kb-shell-${VERSION}`;
const STATIC_CACHE = `kb-static-${VERSION}`;
const MAX_STATIC_ENTRIES = 60;

const SHELL_ASSETS = [
  "/offline.html",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[sw] precache failed:", url, err);
          })
        )
      );
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((name) => name !== SHELL_CACHE && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.match(/\.(?:woff2?|ttf|otf|eot)$/)) return true;
  if (url.pathname.match(/\.(?:png|jpe?g|gif|svg|webp|avif|ico)$/)) return true;
  return false;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (const key of keys.slice(0, keys.length - maxEntries)) {
    await cache.delete(key);
  }
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match("/offline.html");
    if (offline) return offline;
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
        trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES);
      }
      return response;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || new Response(null, { status: 204 });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({ success: false, message: "当前处于离线状态，请检查网络后重试。" }),
            { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } }
          )
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});
