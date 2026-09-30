/* =========================================================================
   词汇本 · Service Worker
   -------------------------------------------------------------------------
   只做两件事：
     1. 预缓存应用外壳（index.html / manifest.json / icons），断网也能打开；
     2. 给页面留一条「激活新版本」的消息通道。

   缓存策略：
     - index.html 走 **network-first**（用 no-cache 强制向服务器重新校验）。
       这是必须的：HTML 若走 cache-first，用户会被永久卡在旧版本上。
     - 其余同源静态资源走 cache-first（图标是内容寻址式的，可以长期复用）。
     - 跨域请求（CDN 的 mammoth / pdf.js、有道发音与建议、Datamuse）一律不拦截。
     - 非 http(s) 的 scheme（chrome-extension: / blob: / data: / resource:）一律不拦截。

   安装时**不**写死 skipWaiting：新 SW 先停在 waiting 状态，等页面发现更新、
   提示用户之后，由页面 postMessage({ type: 'SKIP_WAITING' }) 再接管，
   避免用户正在学习时被强制刷新。
   ========================================================================= */
"use strict";

/* 缓存名。日常发版不需要动它：index.html 走 network-first，每次联网打开都会
   重新校验并写回缓存。只有需要「强制丢弃全部旧缓存」时才把版本号 +1。 */
const CACHE_VERSION = 1;
const CACHE_PREFIX  = 'vocab-notebook-shell-';
const CACHE_NAME    = CACHE_PREFIX + 'v' + CACHE_VERSION;

/* 外壳里 index.html 的统一缓存键：所有 HTML 导航都读写这一条 */
const INDEX_KEY = './index.html';

const SHELL_ASSETS = [
  INDEX_KEY,
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon-foreground-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.svg'
];

const OFFLINE_HTML =
  '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>词汇本 · 离线</title></head>' +
  '<body style="margin:0;display:flex;align-items:center;justify-content:center;' +
  'min-height:100vh;background:#0f1724;color:#dbe8f3;' +
  'font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif">' +
  '<p style="padding:24px;text-align:center;line-height:1.7">' +
  '当前处于离线状态，且还没有缓存到应用外壳。<br>请联网后重新打开一次。</p></body></html>';

/* ---------------------------------------------------------------- 安装 */
self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE_NAME);
    /* 逐个抓取：单个图标缺失不应该让整个安装失败 */
    await Promise.all(SHELL_ASSETS.map(async function (url) {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res);
      } catch (e) {
        /* 离线安装或单个文件缺失：跳过，之后由 fetch 策略补齐 */
      }
    }));
  })());
});

/* -------------------------------------------------------------- 激活 */
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.map(function (key) {
      if (key !== CACHE_NAME && key.indexOf(CACHE_PREFIX) === 0) return caches.delete(key);
      return Promise.resolve(false);
    }));
    /* 立刻接管已打开的页面，让新的缓存策略马上生效 */
    await self.clients.claim();
  })());
});

/* -------------------------------------------------------- 更新消息通道 */
self.addEventListener('message', function (event) {
  const data = event.data;
  if (!data) return;
  const type = (typeof data === 'string') ? data : data.type;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (type === 'PING' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ type: 'PONG', cache: CACHE_NAME });
  }
});

/* ------------------------------------------------------------ 工具函数 */
function isHttpScheme(url) {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/* 是不是「应用本体」这类 HTML 请求：导航请求，或路径指向目录 / *.html */
function isHtmlRequest(request, url) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  if (/\/index\.html?$/i.test(url.pathname)) return true;
  if (url.pathname.charAt(url.pathname.length - 1) === '/') return true;
  const accept = request.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

/* index.html 的缓存键只在确实是外壳页面时才更新，避免其它 HTML 覆盖它 */
function isShellPath(url) {
  return url.pathname.charAt(url.pathname.length - 1) === '/' || /\/index\.html?$/i.test(url.pathname);
}

/* network-first：先问网络（no-cache 强制重新校验），失败才回落到缓存 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    /* 不能直接把 navigation request 丢给 new Request(...)，只能按 URL 重建 */
    const fresh = new Request(request.url, {
      cache: 'no-cache',
      credentials: 'same-origin',
      redirect: 'follow'
    });
    const res = await fetch(fresh);
    if (res && res.ok) {
      const url = new URL(request.url);
      if (isShellPath(url)) cache.put(INDEX_KEY, res.clone());
    }
    return res;
  } catch (e) {
    const cached = await cache.match(INDEX_KEY);
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/* cache-first：命中就直接返回，未命中再走网络并写回缓存 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

/* ---------------------------------------------------------------- 拦截 */
self.addEventListener('fetch', function (event) {
  const request = event.request;

  /* 只处理 GET：POST / 上传之类原样放行 */
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }

  /* chrome-extension: / blob: / data: / resource: 等一律不碰 */
  if (!isHttpScheme(url)) return;

  /* 跨域（CDN、有道、Datamuse）一律放行，不缓存也不拦截 */
  if (url.origin !== self.location.origin) return;

  /* Range 请求（断点续传）交给网络 */
  if (request.headers.get('range')) return;

  if (isHtmlRequest(request, url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
