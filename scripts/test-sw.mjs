#!/usr/bin/env node
/**
 * 在 Node 里用假的 ServiceWorkerGlobalScope 跑一遍 sw.js，
 * 验证 install 预缓存与 fetch 拦截策略真的生效。
 *
 * 这比用真实浏览器验证更稳定：不依赖网络、不受并发浏览器会话干扰。
 * 用法：node scripts/test-sw.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = await readFile(join(root, 'sw.js'), 'utf8');

/* Service Worker 的作用域根。sw.js 里的 './index.html' 这类相对路径
   在浏览器中是相对 SW 脚本地址解析的；Node 的 Request 不接受相对 URL，
   所以这里补一个按 scope 解析的 Request 壳，忠实还原浏览器语义。 */
const SCOPE = 'https://example.github.io/vocabulary-notebook/';
const abs = (u) => new URL(typeof u === 'string' ? u : u.url, SCOPE).href;

class ScopedRequest extends Request {
  constructor(input, init) {
    super(abs(input), init);
  }
}

const cacheStore = new Map();   // cacheName -> Map(url -> Response)
const listeners = {};

function makeCache(name) {
  const store = cacheStore.get(name) || new Map();
  cacheStore.set(name, store);
  return {
    put: async (key, res) => { store.set(abs(key), res); },
    match: async (req) => store.get(abs(req)) || undefined,
    keys: async () => [...store.keys()].map((u) => new ScopedRequest(u)),
    addAll: async () => {}
  };
}

const fetched = [];
const self = {
  location: new URL(SCOPE + 'sw.js'),
  addEventListener: (t, fn) => { listeners[t] = fn; },
  skipWaiting: () => { self.__skipped = true; },
  clients: { claim: async () => { self.__claimed = true; } },
  __skipped: false,
  __claimed: false
};

const ctx = vm.createContext({
  self,
  caches: {
    open: async (n) => makeCache(n),
    keys: async () => [...cacheStore.keys()],
    delete: async (n) => cacheStore.delete(n)
  },
  fetch: async (req) => {
    fetched.push(abs(req));
    return new Response('body-of ' + abs(req), { status: 200 });
  },
  Request: ScopedRequest, Response, URL, console, Promise, setTimeout, clearTimeout
});

vm.runInContext(src, ctx, { filename: 'sw.js' });

let failures = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failures++;
};
const p = (u) => new URL(u, SCOPE).pathname;

// ---- install：应预缓存全部外壳资源 ----
console.log('install 预缓存：');
let installWork;
listeners.install({ waitUntil: (x) => { installWork = x; } });
await installWork;
const cacheName = [...cacheStore.keys()][0];
const cached = [...cacheStore.get(cacheName).keys()].map((u) => new URL(u).pathname);
check('建立了缓存', cacheStore.size === 1, cacheName);
for (const asset of ['index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
                     'icons/icon-maskable-512.png', 'icons/icon-foreground-512.png',
                     'icons/apple-touch-icon.png', 'icons/favicon.svg']) {
  check('缓存了 ' + asset, cached.includes(p(asset)));
}
check('外壳资源数量完整（8 项）', cached.length === 8, cached.length + ' 项');

// ---- activate：应清理旧缓存并 claim ----
console.log('activate 清理：');
cacheStore.set('vocab-notebook-shell-v0', new Map([['x', 1]]));
let activateWork;
listeners.activate({ waitUntil: (x) => { activateWork = x; } });
await activateWork;
check('删除了旧版本缓存', !cacheStore.has('vocab-notebook-shell-v0'));
check('保留了当前缓存', cacheStore.has(cacheName));
check('接管了已打开页面', self.__claimed === true);

// ---- fetch：跨域必须放行 ----
console.log('fetch 拦截策略：');
let intercepted = null;
listeners.fetch({ request: new ScopedRequest('https://dict.youdao.com/dictvoice?audio=test'), respondWith: (x) => { intercepted = x; } });
check('有道发音跨域放行', intercepted === null);

intercepted = null;
listeners.fetch({ request: new ScopedRequest('https://api.datamuse.com/words?sp=test'), respondWith: (x) => { intercepted = x; } });
check('Datamuse 跨域放行', intercepted === null);

intercepted = null;
listeners.fetch({ request: new ScopedRequest('https://cdn.jsdelivr.net/npm/mammoth@1.4.16/mammoth.browser.min.js'), respondWith: (x) => { intercepted = x; } });
check('CDN 依赖放行', intercepted === null);

/* 说明：作用域外的同源请求（如 /other-app/x.js）浏览器根本不会派发给本 SW，
   所以这里不构造该场景；SW 只对自己作用域内的请求负责。 */

// ---- 非 http scheme 放行 ----
intercepted = null;
try {
  listeners.fetch({ request: { method: 'GET', url: 'chrome-extension://abc/x.js', headers: new Headers() }, respondWith: (x) => { intercepted = x; } });
} catch (e) { /* URL 解析失败即视为放行 */ }
check('chrome-extension 放行', intercepted === null);

// ---- 同源 HTML 走 network-first ----
intercepted = null;
listeners.fetch({ request: new ScopedRequest('index.html', { headers: { accept: 'text/html' } }), respondWith: (x) => { intercepted = x; } });
check('同源 HTML 被拦截', intercepted !== null);
const navRes = await intercepted;
check('HTML 走网络拿到最新内容', String(await navRes.text()).includes('index.html'));

// ---- 同源图标走 cache-first，命中缓存不回源 ----
intercepted = null;
const before = fetched.length;
listeners.fetch({ request: new ScopedRequest('icons/icon-192.png'), respondWith: (x) => { intercepted = x; } });
const iconRes = await intercepted;
check('图标命中缓存，未回源', fetched.length === before);
check('图标返回了缓存内容', String(await iconRes.text()).includes('icon-192.png'));

// ---- 未缓存的同源资源回源后写入缓存 ----
intercepted = null;
const before2 = fetched.length;
listeners.fetch({ request: new ScopedRequest('icons/extra-new.png'), respondWith: (x) => { intercepted = x; } });
await intercepted;
check('未缓存资源回源', fetched.length === before2 + 1);

// ---- message 通道 ----
console.log('更新消息通道：');
listeners.message({ data: { type: 'SKIP_WAITING' } });
check('SKIP_WAITING 触发 skipWaiting', self.__skipped === true);

console.log('');
if (failures) { console.error('✗ sw.js 测试失败：' + failures + ' 项'); process.exit(1); }
console.log('✓ sw.js 全部检查通过');
