# 本地 HTML 下载 + 版本更新检查 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在词汇本首页右下角加一个悬浮下载按钮，一键把纯净的应用本体存成 `vocabulary-notebook.html`；本地副本打开时自动检查线上版本，发现更高版本就在按钮上方提示并可一键下载新版。

**Architecture:** 全部改动落在单文件 `index.html` 内：新增 §2.9 区块承载下载与更新检查逻辑，新增一段 CSS 承载悬浮按钮与提示条，HTML 里新增一个 `.fab-stack` 容器。下载走「在线预取页面原文 → 失败/未就绪则回退清理后的 DOM 快照」两条路径，取用完全同步，避免异步丢失用户激活导致浏览器拦截下载。更新检查只在非线上域名（本地副本）执行，抓到的线上原文缓存下来直接复用给「更新」按钮，不重复请求。

**Tech Stack:** 原生 HTML / CSS / JavaScript（无框架、无构建、无依赖安装）；验证用系统 Chrome + `playwright-core`。

---

## 关于「测试」的说明

本项目是**零构建单文件应用，没有测试框架**（README「技术说明」明确写了这一点）。因此本计划里的
「测试」= 一段放在 `/tmp/vn-verify/`（**不进仓库**）的 Playwright 验证脚本，用系统 Chrome 真实
加载页面、真实点击、真实下载，然后断言结果。每个任务都先写脚本、先看到它失败，再改代码让它通过。

设计文档：`docs/specs/2026-09-18-local-html-download-and-update-check-design.md`

工作区根目录（下称 `$WS`）：`/Users/xin/Documents/AI-Worksplace/vocabulary-notebook`

## 文件结构

| 文件 | 职责 | 改动 |
| --- | --- | --- |
| `index.html` | 应用本体，本次全部功能都落在这里 | 修改：常量区、`<style>`、`<body>` 末尾、§2.8 与 §3 之间新增 §2.9 |
| `README.md` | 用户文档 | 修改：「技术说明」补一句发版必须改 `APP_VERSION` |
| `docs/specs/2026-09-18-local-html-download-and-update-check-design.md` | 设计文档 | 修改：同步「预取原文」这一实现细节 |
| `/tmp/vn-verify/*.mjs` | 验证脚本 | 新建，**不进仓库** |

单文件应用不做拆分：本次新增约 200 行，`index.html` 已是 2979 行、结构清晰的单文件，拆文件会
破坏「零构建、双击即用」这一核心定位（拆出去的外部 JS 在 `file://` 下同样能加载，但会让
「下载一个 HTML 就拿到完整应用」这件事失效）。

---

## Task 0: 验证脚手架 + 隔离既有未提交改动

**Files:**
- Create: `/tmp/vn-verify/pw.mjs`

**背景（必读）**：`git status` 显示 `index.html` 有 **258 行新增 / 23 行删除的未提交改动**，
内容属于上一个会话的「首页查询输入 + 卡片三行布局」功能（对应
`docs/specs/2026-09-18-home-search-and-card-layout-design.md`），**不是本次需求的改动**。
单文件应用无法用路径把两者分开提交。开始改代码前必须先把它处理掉，否则本次任何一次
`git add index.html` 都会把别人的在制品混进本次提交。

- [ ] **Step 1: 确认既有改动的归属**

Run:
```bash
cd /Users/xin/Documents/AI-Worksplace/vocabulary-notebook
git diff --stat index.html
git diff index.html | grep -cE "home-search|book-actions|searchInput"
```
Expected: `258 insertions(+), 23 deletions(-)`，第二行输出 `13`（确实是首页搜索 + 卡片布局那批改动）。

- [ ] **Step 2: 向用户确认处理方式（二选一，不可跳过）**

1. **用户自行提交**：用户把既有改动按它自己的设计文档提交或 `git stash`；
2. **授权我代提交**：用 `git add index.html && git commit -m "feat: 首页查询输入与卡片三行布局"` 单独提交，之后再开始本次任务。

在用户明确选择之前，**不要执行任何 `git commit`**。用户选完后，`git status --short` 中
`index.html` 应变为干净状态。

- [ ] **Step 3: 写公共验证脚手架**

Create `/tmp/vn-verify/pw.mjs`:

```js
// 公共脚手架：定位工作区 npx 缓存里的 playwright-core，用系统 Chrome 起浏览器
import { readdirSync, existsSync } from 'node:fs';

const WORKSPACE = '/Users/xin/Documents/AI-Worksplace/vocabulary-notebook';

function findPlaywrightCore() {
  const base = WORKSPACE + '/.npm-cache/_npx';
  for (const dir of readdirSync(base)) {
    const mod = base + '/' + dir + '/node_modules/playwright-core/index.mjs';
    if (existsSync(mod)) return mod;
  }
  throw new Error('找不到 playwright-core，请先在 $WS 下执行 npx playwright --version');
}

const { chromium } = await import('file://' + findPlaywrightCore());

export const APP_FILE = WORKSPACE + '/index.html';
export const APP_URL  = 'https://geek-xin.github.io/vocabulary-notebook/index.html';

export async function launch(viewport) {
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', function (e) { errors.push(String(e)); });
  return { browser, context, page, errors };
}
```

- [ ] **Step 4: 验证脚手架能起来**

Run:
```bash
mkdir -p /tmp/vn-verify
node -e "import('/tmp/vn-verify/pw.mjs').then(async m => { const {browser,page} = await m.launch(); await page.goto('file://' + m.APP_FILE); console.log('title=', await page.title()); await browser.close(); })"
```
Expected: 打印 `title= 词汇本 · 多词库学习`，无报错。（若报「找不到 playwright-core」，先在 `$WS` 下执行 `npx playwright --version`。）

- [ ] **Step 5: 启动本地静态服务（供在线路径的验证使用）**

Run（后台任务，全程保持运行）:
```bash
cd /Users/xin/Documents/AI-Worksplace/vocabulary-notebook && python3 -m http.server 8765
```
Expected: 输出 `Serving HTTP on 0.0.0.0 port 8765 ...`。可用 `curl -sI http://127.0.0.1:8765/index.html` 确认返回 `200`。

- [ ] **Step 6: 提交**

本任务只新增了 `/tmp` 下的脚本，**没有仓库改动，不需要提交**。确认 `git status --short` 里
`index.html` 已按 Step 2 处理完毕即可。

---

## Task 1: 版本与更新检查配置常量

**Files:**
- Modify: `index.html`（常量区，`const STORE_NAME   = 'kv';` 之后）
- Test: `/tmp/vn-verify/t1.mjs`

- [ ] **Step 1: 写失败的验证脚本**

Create `/tmp/vn-verify/t1.mjs`:

```js
import { launch, APP_FILE } from './pw.mjs';

const { browser, page, errors } = await launch();
await page.goto('file://' + APP_FILE);
const info = await page.evaluate(() => ({
  version:    typeof APP_VERSION     === 'string' ? APP_VERSION     : null,
  origin:     typeof APP_ORIGIN      === 'string' ? APP_ORIGIN      : null,
  updateUrl:  typeof APP_UPDATE_URL  === 'string' ? APP_UPDATE_URL  : null,
  fileName:   typeof APP_FILE_NAME   === 'string' ? APP_FILE_NAME   : null,
  ignoredKey: typeof APP_IGNORED_KEY === 'string' ? APP_IGNORED_KEY : null
}));
console.log(JSON.stringify(info, null, 2));
console.log('pageerrors:', errors);
await browser.close();

const ok = info.version === '2026.09.18.1'
  && info.origin === 'https://geek-xin.github.io'
  && info.updateUrl === 'https://geek-xin.github.io/vocabulary-notebook/index.html'
  && info.fileName === 'vocabulary-notebook.html'
  && info.ignoredKey === 'vn_update_ignored_version'
  && errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: 运行脚本确认失败**

Run: `node /tmp/vn-verify/t1.mjs`
Expected: FAIL，`version`/`origin`/`updateUrl`/`fileName`/`ignoredKey` 全为 `null`。

- [ ] **Step 3: 加常量**

在 `index.html` 的 `const STORE_NAME   = 'kv';` 之后插入：

```js
/* 应用版本与「下载到本地 / 检查更新」配置
   APP_VERSION 是本地副本判断自己是否过期的唯一依据：
   **每次发布新版本都必须手动改这一行**，格式 YYYY.MM.DD.N */
const APP_VERSION     = '2026.09.18.1';
const APP_ORIGIN      = 'https://geek-xin.github.io';
const APP_UPDATE_URL  = APP_ORIGIN + '/vocabulary-notebook/index.html';
const APP_FILE_NAME   = 'vocabulary-notebook.html';
const APP_IGNORED_KEY = 'vn_update_ignored_version';
```

- [ ] **Step 4: 运行脚本确认通过**

Run: `node /tmp/vn-verify/t1.mjs`
Expected: PASS，且五个值分别是 `2026.09.18.1` / `https://geek-xin.github.io` / `https://geek-xin.github.io/vocabulary-notebook/index.html` / `vocabulary-notebook.html` / `vn_update_ignored_version`，`pageerrors: []`。

- [ ] **Step 5: 提交**

```bash
cd /Users/xin/Documents/AI-Worksplace/vocabulary-notebook
git add index.html
git commit -m "feat: 新增应用版本号与更新检查配置常量"
```

---

## Task 2: 右下角悬浮下载按钮（HTML + CSS）

**Files:**
- Modify: `index.html`（`<style>` 末尾；`</div>` 关闭 `.app-container` 之后、`<div class="toast"` 之前）
- Test: `/tmp/vn-verify/t2.mjs`

- [ ] **Step 1: 写失败的验证脚本**

Create `/tmp/vn-verify/t2.mjs`:

```js
import { launch, APP_FILE } from './pw.mjs';

const { browser, page, errors } = await launch({ width: 1440, height: 900 });
await page.goto('file://' + APP_FILE);
await page.waitForTimeout(600);

// 首页：按钮可见、是 button、位置贴视口右下角
const home = await page.evaluate(() => {
  const fab = document.querySelector('#downloadFab');
  if (!fab) return { exists: false };
  const r = fab.getBoundingClientRect();
  return {
    exists: true,
    visible: r.width > 0 && r.height > 0,
    tag: fab.tagName,
    aria: fab.getAttribute('aria-label'),
    w: r.width, h: r.height,
    rightGap: window.innerWidth - r.right,
    bottomGap: window.innerHeight - r.bottom
  };
});
console.log('home:', JSON.stringify(home));

// 学习页：按钮隐藏（openBook 会移除 home-mode，这里直接模拟该状态）
await page.evaluate(() => document.body.classList.remove('home-mode'));
const study = await page.evaluate(() => {
  const fab = document.querySelector('#downloadFab');
  return { fabWidth: fab.getBoundingClientRect().width };
});
console.log('study fab width:', study.fabWidth);

await page.screenshot({ path: '/tmp/vn-verify/t2-home-1440.png' });
await browser.close();

const ok = home.exists && home.visible && home.tag === 'BUTTON'
  && home.aria === '下载应用 HTML 到本地'
  && Math.abs(home.rightGap - 14) < 2 && Math.abs(home.bottomGap - 14) < 2
  && study.fabWidth === 0 && errors.length === 0;
console.log('pageerrors:', errors);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: 运行脚本确认失败**

Run: `node /tmp/vn-verify/t2.mjs`
Expected: FAIL，`home: {"exists":false}`（元素还不存在）。

- [ ] **Step 3: 加 HTML 结构**

在 `index.html` 里 `.app-container` 的闭合 `</div>` 之后、`<div class="toast" id="toast"...>` 之前插入：

```html
<div class="fab-stack" id="fabStack">
  <button class="download-fab" id="downloadFab" type="button"
          aria-label="下载应用 HTML 到本地">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  </button>
</div>
```

- [ ] **Step 4: 加 CSS**

在 `index.html` 的 `<style>` 内、`.toast {` 规则**之前**插入：

```css
/* 右下角悬浮区：下载按钮 + 更新提示条（提示条在按钮上方，出现时不顶动按钮） */
.fab-stack {
  display: none;
  position: fixed;
  right: max(14px, env(safe-area-inset-right));
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 900; /* 低于 toast(999) 与弹窗遮罩(1000)，弹窗打开时被盖住 */
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
body.home-mode .fab-stack { display: flex; }

.download-fab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: #cfe1f2;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}
.download-fab svg { width: 16px; height: 16px; }
.download-fab:active { background: rgba(255, 255, 255, 0.2); color: #ffffff; }
.download-fab:focus-visible {
  outline: none;
  border-color: rgba(255, 217, 102, 0.42);
  box-shadow: 0 0 0 3px rgba(255, 217, 102, 0.16);
}

@media (hover: hover) and (pointer: fine) {
  .download-fab:hover { background: rgba(255, 255, 255, 0.16); color: #ffffff; transform: translateY(-1px); }
}

@media (max-width: 640px) {
  .download-fab { width: 34px; height: 34px; }
  .download-fab svg { width: 15px; height: 15px; }
}
```

- [ ] **Step 5: 运行脚本确认通过**

Run: `node /tmp/vn-verify/t2.mjs`
Expected: PASS，`rightGap` 与 `bottomGap` 都约等于 14，学习页 `fabWidth: 0`，`pageerrors: []`。

- [ ] **Step 6: 人工看一眼截图**

打开 `/tmp/vn-verify/t2-home-1440.png`，确认按钮是右下角一个半透明圆形小按钮，风格与页面一致。

- [ ] **Step 7: 提交**

```bash
cd /Users/xin/Documents/AI-Worksplace/vocabulary-notebook
git add index.html
git commit -m "feat: 首页右下角新增下载按钮（HTML + 样式）"
```

---

## Task 3: 生成纯净的应用本体并下载

**Files:**
- Modify: `index.html`（§2.8 分享结束后、`/* 3. 渲染 */` 之前新增 §2.9 的第一部分）
- Test: `/tmp/vn-verify/t3-file.mjs`、`/tmp/vn-verify/t3-http.mjs`

- [ ] **Step 1: 写失败的验证脚本（file:// 快照路径）**

Create `/tmp/vn-verify/t3-file.mjs`:

```js
import { launch, APP_FILE } from './pw.mjs';
import { readFileSync } from 'node:fs';

const { browser, context, page, errors } = await launch();

// 先种一个词汇本，用来证明下载副本不会带上已渲染的卡片 DOM
await context.addInitScript(() => {
  localStorage.setItem('vn_books_v1', JSON.stringify([{
    id: 'seed1', title: '种子词汇本', createdAt: Date.now(),
    words: [{ word: 'price', pos: 'n.', phonetic: '/praɪs/', meaningEn: 'the amount',
              meaningCn: '价格', synonyms: ['cost'], antonyms: [], example: 'The price is high.' }]
  }]));
});

await page.goto('file://' + APP_FILE);
await page.waitForSelector('.book-card', { timeout: 5000 });
console.log('首页卡片数（快照前）:', await page.locator('.book-card').count());

const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('#downloadFab')
]);
console.log('文件名:', download.suggestedFilename());
const file = await download.path();
const html = readFileSync(file, 'utf8');
console.log('字节数:', html.length);
console.log('toast:', await page.locator('#toast').textContent());
await page.waitForTimeout(300);

// 断言 1：文件名与基本结构
const nameOk = download.suggestedFilename() === 'vocabulary-notebook.html';
const headOk = html.startsWith('<!DOCTYPE html>');
const hasVersion = html.includes('APP_VERSION');
const hasStyle = html.includes('<style>');
// 断言 2：源码里书架网格是空的，学习页带 hidden，body 没有运行时类
const gridEmpty = /id="bookGrid"[^>]*>\s*<\/div>/.test(html);
const studyHidden = /id="studyView"[^>]*hidden/.test(html);
const bodyClean = /<body(?![^>]*class=)/.test(html);
console.log({ nameOk, headOk, hasVersion, hasStyle, gridEmpty, studyHidden, bodyClean });
console.log('pageerrors:', errors);
await browser.close();

const ok = nameOk && headOk && hasVersion && hasStyle && gridEmpty && studyHidden && bodyClean
  && errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: 运行脚本确认失败**

Run: `node /tmp/vn-verify/t3-file.mjs`
Expected: FAIL，点了按钮没有任何下载事件（`waitForEvent('download')` 超时）或断言失败。

- [ ] **Step 3: 写第二个验证脚本（http 原文路径）**

这个脚本验证「页面从 http 提供时，下载到的是服务器原文」——判据是原始 HTML 里带有的
全文标记（`2.8 分享：把词汇本打包成一个独立 HTML 文件`），它在 DOM 快照里也存在，所以再加一条
更强的判据：**原文里的 `id="bookGrid"` 位置与快照不同**（快照里 `#bookGrid` 必然清空）。
为了区分两条路径，脚本改为直接检查 `selfHtmlText` 这个预取变量是否被填充。

Create `/tmp/vn-verify/t3-http.mjs`:

```js
import { launch } from './pw.mjs';

const { browser, page, errors } = await launch();
await page.goto('http://127.0.0.1:8765/index.html');
await page.waitForSelector('.book-empty, .book-card');
await page.waitForFunction(() => typeof selfHtmlText === 'string' && selfHtmlText.length > 1000,
  null, { timeout: 8000 }).catch(() => {});
const prefetched = await page.evaluate(() => selfHtmlText.length);
console.log('预取到的原文字节数:', prefetched);

const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('#downloadFab')
]);
const { readFileSync } = await import('node:fs');
const html = readFileSync(await download.path(), 'utf8');
console.log('下载字节数:', html.length);
const sameAsPrefetch = await page.evaluate(t => t === selfHtmlText, html);
console.log('与预取原文一致:', sameAsPrefetch);
console.log('pageerrors:', errors);
await browser.close();

const ok = prefetched > 100000 && sameAsPrefetch && errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 4: 在 §2.8 之后插入 §2.9 的第一部分**

在 `index.html` 里 `function shareBook(id) { ... }` 的结束大括号之后、`/* =========================================================\n   3. 渲染` 之前插入：

```js
/* =========================================================
   2.9 下载应用本体 / 检查更新
   ---------------------------------------------------------
   - 首页右下角按钮把应用本体存成本地 HTML，离线可用
   - 本地副本打开时检查线上版本，有新版就在按钮上方提示
   - 下载取文两条路径：在线预取页面原文优先，失败则回退清理后的 DOM 快照
   - 取用必须同步：异步会丢失用户激活，部分浏览器会拦截下载
   ========================================================= */
const downloadFab = document.getElementById('downloadFab');
const fabStack    = document.getElementById('fabStack');

let selfHtmlText  = '';   // 在线时预取到的页面原文；为空则回退快照
let remoteHtmlText = '';  // 检查更新时抓到的线上原文，供「更新」按钮直接复用

function downloadHtml(text, fileName) {
  const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

// file:// 下浏览器禁止 fetch 自身，只能把当前文档清理成「初始状态」再序列化
function snapshotSelfHtml() {
  const clone = document.documentElement.cloneNode(true);
  const q = function (sel) { return clone.querySelector(sel); };

  const body = q('body');
  if (body) body.className = '';

  const grid = q('#bookGrid');
  if (grid) grid.innerHTML = '';

  const home = q('#homeView');
  if (home) home.removeAttribute('hidden');
  const study = q('#studyView');
  if (study) study.setAttribute('hidden', '');

  const title = q('#appTitle');
  if (title) title.textContent = '词汇本';
  const count = q('#bookCount');
  if (count) count.textContent = '共 0 个词汇本';
  const tip = q('#homeTip');
  if (tip) tip.textContent = '点击词汇本开始学习 · 数据保存在本机浏览器，重新打开依然可见';

  ['#confirmModal', '#reportModal'].forEach(function (sel) {
    const el = q(sel);
    if (el) el.setAttribute('hidden', '');
  });

  const toast = q('#toast');
  if (toast) { toast.className = 'toast'; toast.textContent = ''; }

  const pill = q('#updatePill');
  if (pill && pill.parentNode) pill.parentNode.removeChild(pill);

  // 搜索框的输入是 DOM property 而非 attribute，序列化不会带出，无需清理
  return '<!DOCTYPE html>\n' + clone.outerHTML;
}

// 在线时预取页面原文，点击时同步取用
function prefetchSelfHtml() {
  if (location.protocol === 'file:') return;
  fetch(location.href.split('#')[0]).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }).then(function (text) {
    if (text && text.indexOf('<!DOCTYPE') === 0) selfHtmlText = text;
  }).catch(function (e) {
    console.warn('预取页面原文失败，下载时改用快照:', e);
  });
}

function downloadAppHtml() {
  try {
    const html = selfHtmlText || snapshotSelfHtml();
    downloadHtml(html, APP_FILE_NAME);
    showToast('已下载 ' + APP_FILE_NAME);
  } catch (e) {
    console.warn('下载应用失败:', e);
    showToast('下载失败：' + ((e && e.message) ? e.message : '未知错误'), 5000);
  }
}

if (downloadFab) downloadFab.addEventListener('click', downloadAppHtml);
prefetchSelfHtml();
```

- [ ] **Step 5: 运行两个脚本确认通过**

Run: `node /tmp/vn-verify/t3-file.mjs`
Expected: PASS，且 `首页卡片数（快照前）: 1`（证明下载时页面上确实有渲染好的卡片），而 `gridEmpty: true`（证明副本里没有带上它）。

Run: `node /tmp/vn-verify/t3-http.mjs`
Expected: PASS，`预取到的原文字节数` 大于 100000，`与预取原文一致: true`。

- [ ] **Step 6: 同步设计文档**

设计文档第四节写的是「点击时 fetch，失败回退」，实现改成了**预取 + 同步取用**。把
`docs/specs/2026-09-18-local-html-download-and-update-check-design.md` 第四节「取文策略」段落
改为：

```markdown
```
buildSelfHtml():
  1) 页面加载后（仅 http/https）预取 location.href 去掉 # 后的地址，缓存原文文本
  2) 点击下载时同步取用缓存；缓存尚未就绪或预取失败，回退 snapshotSelfHtml()
```

取用必须**同步**：`fetch` 的 Promise 回调里再触发 `<a download>` 会丢失用户激活，
部分浏览器（Safari）会直接拦截下载。预取在页面加载后空闲时进行，用户点击时通常早已就绪；
万一没就绪就用快照——两条路径产出的文件功能等价。
```

- [ ] **Step 7: 提交**

```bash
cd /Users/xin/Documents/AI-Worksplace/vocabulary-notebook
git add index.html docs/specs/2026-09-18-local-html-download-and-update-check-design.md
git commit -m "feat: 下载纯净的应用本体到本地"
```

---

## Task 4: 版本比较与自动检查

**Files:**
- Modify: `index.html`（§2.9 内追加）
- Test: `/tmp/vn-verify/t4.mjs`

- [ ] **Step 1: 写失败的验证脚本**

Create `/tmp/vn-verify/t4.mjs`:

```js
import { launch, APP_FILE, APP_URL } from './pw.mjs';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(APP_FILE, 'utf8');
const higher = SOURCE.replace("'2026.09.18.1'", "'2099.01.01.1'");

async function check(label, routeBody, expectVersion) {
  const { browser, page, errors } = await launch();
  let hits = 0;
  await page.route(APP_URL, route => {
    hits++;
    if (routeBody === 'timeout') return;             // 永不响应，触发 8 秒超时
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: routeBody });
  });
  await page.goto('file://' + APP_FILE);
  await page.waitForTimeout(routeBody === 'timeout' ? 9500 : 2500);
  const pending = await page.evaluate(() => pendingUpdateVersion);
  const pill = await page.locator('#updatePill').count();
  console.log(label, { hits, pending, pill, errors: errors.length });
  await browser.close();
  if (hits !== 1) throw new Error(label + ': 检查请求次数应为 1，实际 ' + hits);
  if (pending !== expectVersion) throw new Error(label + ': pending 应为 ' + expectVersion + '，实际 ' + pending);
  if (errors.length) throw new Error(label + ': 页面报错 ' + errors.join('; '));
}

await check('更高版本', higher, '2099.01.01.1');
await check('相同版本', SOURCE, '');
await check('更低版本', SOURCE.replace("'2026.09.18.1'", "'2020.01.01.1'"), '');
await check('非应用页面', '<html><body>nope</body></html>', '');
await check('请求超时', 'timeout', '');

// 在线访问（http 提供，但 origin 不是线上站点）应仍然检查；
// 只有 origin 等于 APP_ORIGIN 才跳过，这里用本地服务模拟「非线上 origin → 会检查」
console.log('ALL PASS');
```

说明：本脚本用 `page.route` 拦截线上地址伪造远端内容，因此**不需要真实联网**。

- [ ] **Step 2: 运行脚本确认失败**

Run: `node /tmp/vn-verify/t4.mjs`
Expected: FAIL，报 `pending 应为 2099.01.01.1，实际 undefined`（`pendingUpdateVersion` 还不存在）。

- [ ] **Step 3: 追加版本比较与检查逻辑**

在 `index.html` 的 §2.9 内、`if (downloadFab) downloadFab.addEventListener('click', downloadAppHtml);` **之前**插入：

```js
const REMOTE_VERSION_RE = /APP_VERSION\s*=\s*['"]([^'"]+)['"]/;

let pendingUpdateVersion = '';  // 检测到的更高版本号，空串表示没有更新

// 本地副本才需要检查更新：线上访问时用户已经在最新版上
function isLocalCopy() {
  return location.protocol === 'file:' || location.origin !== APP_ORIGIN;
}

function parseVersion(v) {
  return String(v == null ? '' : v).split('.').map(function (n) {
    const x = parseInt(n, 10);
    return isFinite(x) ? x : 0;
  });
}

function compareVersion(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) {
    const p = x[i] || 0, q = y[i] || 0;
    if (p > q) return 1;
    if (p < q) return -1;
  }
  return 0;
}

// 失败一律静默：自动检查是锦上添花，不能打扰学习
function checkUpdate() {
  if (!isLocalCopy()) return;
  if (navigator.onLine === false) return;   // 离线时省掉一次必然失败的请求

  const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;

  fetch(APP_UPDATE_URL, ctrl ? { signal: ctrl.signal } : undefined).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }).then(function (text) {
    if (timer) clearTimeout(timer);
    const m = text.match(REMOTE_VERSION_RE);
    if (!m) return;                                   // 读不到版本号视为检查失败
    const remote = m[1];
    if (compareVersion(remote, APP_VERSION) <= 0) return;
    pendingUpdateVersion = remote;
    remoteHtmlText = text;
  }).catch(function (e) {
    if (timer) clearTimeout(timer);
    console.warn('检查更新失败:', e);
  });
}
```

并在 §2.9 末尾的 `prefetchSelfHtml();` 之后追加：

```js
setTimeout(checkUpdate, 1500);
```

- [ ] **Step 4: 运行脚本确认通过**

Run: `node /tmp/vn-verify/t4.mjs`
Expected: 五行都符合预期（`更高版本` 的 `pending: '2099.01.01.1'`，其余为空串；每行 `hits: 1`、`errors: 0`），最后打印 `ALL PASS`。

- [ ] **Step 5: 确认「部署在线上域名时完全不检查」**

用 Playwright 把应用**伪装成部署在真实线上域名**下（拦截 `https://geek-xin.github.io/...`
的导航并直接返回本地文件内容），此时 `location.origin` 就是 `https://geek-xin.github.io`。
让拦截返回**更高版本**，如果检查逻辑没有正确跳过，`pendingUpdateVersion` 就会被填上。

Create `/tmp/vn-verify/t4-online.mjs`:

```js
import { launch, APP_FILE, APP_URL } from './pw.mjs';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(APP_FILE, 'utf8');
const higher = SOURCE.replace("'2026.09.18.1'", "'2099.01.01.1'");

const { browser, page, errors } = await launch();
let hits = 0;
await page.route('https://geek-xin.github.io/**', route => {
  hits++;
  return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: higher });
});

await page.goto('https://geek-xin.github.io/vocabulary-notebook/index.html');
await page.waitForFunction(() => typeof selfHtmlText === 'string' && selfHtmlText.length > 1000,
  null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(2500);   // 跨过 1500ms 的检查时点

const info = await page.evaluate(() => ({
  origin: location.origin,
  isLocal: isLocalCopy(),
  pending: pendingUpdateVersion,
  prefetchLen: selfHtmlText.length
}));
console.log(info, '| 对线上地址的请求次数:', hits);
console.log('pageerrors:', errors);
await browser.close();

const ok = info.origin === 'https://geek-xin.github.io'
  && info.isLocal === false
  && info.pending === ''        // 关键：线上访问不发检查请求
  && info.prefetchLen > 1000    // 预取照常发生
  && hits === 1                 // 只有预取这一次请求
  && errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
```

Run: `node /tmp/vn-verify/t4-online.mjs`
Expected: PASS，`pending: ''`、`hits: 1`。

- [ ] **Step 6: 提交**

```bash
cd /Users/xin/Documents/AI-Worksplace/vocabulary-notebook
git add index.html
git commit -m "feat: 本地副本自动检查线上版本"
```

---

## Task 5: 更新提示条与「更新 / 忽略」两个动作

**Files:**
- Modify: `index.html`（`<style>` 末尾追加提示条样式；§2.9 追加提示条逻辑）
- Test: `/tmp/vn-verify/t5.mjs`

- [ ] **Step 1: 写失败的验证脚本**

Create `/tmp/vn-verify/t5.mjs`:

```js
import { launch, APP_FILE, APP_URL } from './pw.mjs';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(APP_FILE, 'utf8');
const v1 = SOURCE.replace("'2026.09.18.1'", "'2099.01.01.1'");
const v2 = SOURCE.replace("'2026.09.18.1'", "'2099.01.02.1'");

async function open(body) {
  const h = await launch();
  await h.page.route(APP_URL, route =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body }));
  await h.page.goto('file://' + APP_FILE);
  await h.page.waitForSelector('#updatePill', { timeout: 6000 });
  return h;
}

// 1) 提示条出现在按钮上方（DOM 顺序在按钮之前）
let h = await open(v1);
const order = await h.page.evaluate(() => {
  const stack = document.getElementById('fabStack');
  return Array.from(stack.children).map(n => n.id || n.className);
});
const text = await h.page.locator('#updatePill .update-pill-text').textContent();
const btnBox = await h.page.locator('#downloadFab').boundingBox();
const pillBox = await h.page.locator('#updatePill').boundingBox();
console.log('fabStack 子元素顺序:', order, '| 文案:', text);
console.log('提示条在按钮上方:', pillBox.y + pillBox.height <= btnBox.y + 1);
await h.page.screenshot({ path: '/tmp/vn-verify/t5-pill.png' });
await h.browser.close();

// 2) 点「更新」：下载线上原文 + toast + 提示条消失
h = await open(v1);
const [dl] = await Promise.all([
  h.page.waitForEvent('download'),
  h.page.click('#updatePill .update-pill-btn')
]);
const updated = readFileSync(await dl.path(), 'utf8');
const toastText = await h.page.locator('#toast').textContent();
console.log('更新下载含新版本号:', updated.includes("'2099.01.01.1'"), '| toast:', toastText);
console.log('提示条已消失:', await h.page.locator('#updatePill').count() === 0);
console.log('未写入忽略记录:', await h.page.evaluate(() => localStorage.getItem('vn_update_ignored_version')) === null);
await h.browser.close();

// 3) 点「×」：写入忽略记录；重新打开不再提示；出现更高版本时再次提示
h = await open(v1);
await h.page.click('#updatePill .update-pill-close');
const ignored = await h.page.evaluate(() => localStorage.getItem('vn_update_ignored_version'));
console.log('忽略记录:', ignored, '| 提示条已消失:', await h.page.locator('#updatePill').count() === 0);
await h.page.reload();
await h.page.waitForTimeout(2500);
console.log('重开后仍提示同一版本:', await h.page.locator('#updatePill').count() > 0);
await h.page.unroute(APP_URL);
await h.page.route(APP_URL, route =>
  route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: v2 }));
await h.page.reload();
await h.page.waitForSelector('#updatePill', { timeout: 6000 });
console.log('出现更高版本时重新提示: true');
await h.browser.close();

console.log('DONE —— 请对照上面的打印逐条核对');
```

注意：第 3 步里 `localStorage` 在 `file://` 下由同一个浏览器上下文共享，所以 `reload` 后忽略记录仍在；
不同 `launch()` 之间是**独立的浏览器上下文**，忽略记录不会互相污染。

- [ ] **Step 2: 运行脚本确认失败**

Run: `node /tmp/vn-verify/t5.mjs`
Expected: FAIL，`waitForSelector('#updatePill')` 超时（提示条还不存在）。

- [ ] **Step 3: 加提示条 CSS**

在 `index.html` 的 `<style>` 内、Task 2 添加的 `.download-fab` 规则组**之后**插入：

```css
.update-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(72vw, 260px);
  padding: 7px 8px 7px 12px;
  border: 1px solid rgba(255, 217, 102, 0.34);
  border-radius: 999px;
  background: rgba(12, 20, 30, 0.92);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: #e6eef7;
  font-size: 12.5px;
  line-height: 1.35;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
  animation: fab-pill-in 0.24s ease both;
}
.update-pill-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #ffd966; }
.update-pill-text { flex: 1 1 auto; min-width: 0; }
.update-pill-btn {
  flex: none;
  padding: 4px 10px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 217, 102, 0.18);
  color: #ffd966;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.update-pill-btn:active { background: rgba(255, 217, 102, 0.4); }
.update-pill-btn:focus-visible,
.update-pill-close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(255, 217, 102, 0.25);
}
.update-pill-close {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #8fa6ba;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.update-pill-close:active { background: rgba(255, 255, 255, 0.14); color: #ffffff; }

@keyframes fab-pill-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) { .update-pill { animation: none; } }

@media (hover: hover) and (pointer: fine) {
  .update-pill-btn:hover { background: rgba(255, 217, 102, 0.3); }
  .update-pill-close:hover { background: rgba(255, 255, 255, 0.12); color: #ffffff; }
}
```

- [ ] **Step 4: 加提示条逻辑**

在 `index.html` 的 §2.9 内、`function checkUpdate() {` **之前**插入：

```js
let updatePillEl   = null;
let updatePillMute = false;   // 点过「更新」后本次会话不再显示（旧文件还没被替换）

function ignoredVersion() {
  try { return localStorage.getItem(APP_IGNORED_KEY) || ''; } catch (e) { return ''; }
}

function ignoreVersion(v) {
  // file:// 下 localStorage 可能不可用，失败就只在本次会话内不提示
  try { localStorage.setItem(APP_IGNORED_KEY, v); } catch (e) {}
}

function clearUpdatePill() {
  if (updatePillEl && updatePillEl.parentNode) updatePillEl.parentNode.removeChild(updatePillEl);
  updatePillEl = null;
}

function showUpdatePill(version) {
  if (!fabStack || updatePillEl || updatePillMute) return;

  const pill = document.createElement('div');
  pill.className = 'update-pill';
  pill.id = 'updatePill';
  pill.innerHTML =
    '<span class="update-pill-dot" aria-hidden="true"></span>' +
    '<span class="update-pill-text"></span>' +
    '<button class="update-pill-btn" type="button">更新</button>' +
    '<button class="update-pill-close" type="button" aria-label="关闭更新提示">×</button>';
  // 版本号来自远端页面，必须用 textContent 写入，不能拼进 innerHTML
  pill.querySelector('.update-pill-text').textContent = '发现新版本 ' + version;

  pill.querySelector('.update-pill-btn').addEventListener('click', updateToLatest);
  pill.querySelector('.update-pill-close').addEventListener('click', function () {
    ignoreVersion(version);
    updatePillMute = true;
    clearUpdatePill();
  });

  // 插在按钮之前，与视觉上的「提示条在上、按钮在下」一致
  fabStack.insertBefore(pill, downloadFab);
  updatePillEl = pill;
}

// 用检查时已抓到的原文直接下载，不重复请求；做了缓存丢失的兜底
function updateToLatest() {
  const finish = function (text) {
    downloadHtml(text, APP_FILE_NAME);
    showToast('新版本已下载，请用它替换当前文件', 6000);
    updatePillMute = true;
    clearUpdatePill();
  };
  if (remoteHtmlText) { finish(remoteHtmlText); return; }

  fetch(APP_UPDATE_URL).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }).then(finish).catch(function (e) {
    console.warn('下载新版本失败:', e);
    showToast('下载新版本失败，请检查网络后重试', 5000);
  });
}
```

并把 `checkUpdate()` 里这两行：

```js
    pendingUpdateVersion = remote;
    remoteHtmlText = text;
```

替换为：

```js
    const ignored = ignoredVersion();
    if (ignored && compareVersion(remote, ignored) <= 0) return;  // 用户已忽略这个版本
    pendingUpdateVersion = remote;
    remoteHtmlText = text;
    showUpdatePill(remote);
```

- [ ] **Step 5: 运行脚本确认通过**

Run: `node /tmp/vn-verify/t5.mjs`
Expected: 逐条核对——提示条在按钮上方；文案为 `发现新版本 2099.01.01.1`；点「更新」下载到的文件含
`'2099.01.01.1'`、toast 为「新版本已下载，请用它替换当前文件」、提示条消失、`localStorage` 里**没有**
忽略记录；点「×」写入 `2099.01.01.1`、重开不再提示、换成 `2099.01.02.1` 后重新提示。

- [ ] **Step 6: 回归 Task 4 的检查逻辑**

Run: `node /tmp/vn-verify/t4.mjs`
Expected: `ALL PASS`（提示条逻辑没有破坏检测逻辑）。

- [ ] **Step 7: 提交**

```bash
cd /Users/xin/Documents/AI-Worksplace/vocabulary-notebook
git add index.html
git commit -m "feat: 发现新版本时在下载按钮上方提示并支持一键更新"
```

---

## Task 6: 视觉核对与层级验证

**Files:**
- Modify: `index.html`（仅在发现重叠时改 `.home-tip`）
- Test: `/tmp/vn-verify/t6.mjs`

- [ ] **Step 1: 写验证脚本**

Create `/tmp/vn-verify/t6.mjs`:

```js
import { launch, APP_FILE, APP_URL } from './pw.mjs';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(APP_FILE, 'utf8');
const higher = SOURCE.replace("'2026.09.18.1'", "'2099.01.01.1'");

function overlap(a, b) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x ||
           a.y + a.height <= b.y || b.y + b.height <= a.y);
}

for (const vp of [{ width: 375, height: 700 }, { width: 1440, height: 900 }]) {
  const h = await launch(vp);
  await h.context.addInitScript(() => {
    localStorage.setItem('vn_books_v1', JSON.stringify([{
      id: 'seed1', title: '种子词汇本', createdAt: Date.now(),
      words: [{ word: 'price', pos: 'n.', phonetic: '/praɪs/', meaningEn: 'a', meaningCn: '价格',
                synonyms: [], antonyms: [], example: 'The price is high.' }]
    }]));
  });
  await h.page.route(APP_URL, route =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: higher }));
  await h.page.goto('file://' + APP_FILE);
  await h.page.waitForSelector('#updatePill', { timeout: 6000 });

  const geo = await h.page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return {
      fab:  box(document.getElementById('downloadFab')),
      pill: box(document.getElementById('updatePill')),
      tip:  box(document.getElementById('homeTip')),
      vw: window.innerWidth, vh: window.innerHeight
    };
  });
  const inside = b => b.x >= 0 && b.y >= 0 && b.x + b.width <= geo.vw && b.y + b.height <= geo.vh;
  console.log(vp.width + 'px', {
    按钮在视口内: inside(geo.fab),
    提示条在视口内: inside(geo.pill),
    按钮与首页文案重叠: overlap(geo.fab, geo.tip),
    提示条与首页文案重叠: overlap(geo.pill, geo.tip)
  });
  await h.page.screenshot({ path: `/tmp/vn-verify/t6-${vp.width}.png` });

  // 弹窗打开时按钮应被遮罩盖住
  await h.page.click('.book-del');
  await h.page.waitForSelector('#confirmModal:not([hidden])');
  const covered = await h.page.evaluate(() => {
    const fab = document.getElementById('downloadFab');
    const r = fab.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!el && !!el.closest('.modal-backdrop');
  });
  console.log(vp.width + 'px 弹窗打开时按钮被遮罩盖住:', covered);
  await h.browser.close();
}
```

- [ ] **Step 2: 运行脚本并读结果**

Run: `node /tmp/vn-verify/t6.mjs`
Expected: 两种宽度下按钮与提示条都在视口内、弹窗打开时被遮罩盖住。

- [ ] **Step 3: 处理与首页底部文案的重叠（仅当上一步报重叠）**

如果 375px 下 `按钮与首页文案重叠` 或 `提示条与首页文案重叠` 为 `true`，在 `index.html` 的
`@media (max-width: 640px)` 块内给首页文案让出右侧空间：

```css
  /* 右下角悬浮按钮占位，避免压住这行提示文案 */
  .home-tip { padding-right: 44px; }
```

改完重跑 `node /tmp/vn-verify/t6.mjs`，确认两种宽度下重叠均为 `false`，并**打开
`/tmp/vn-verify/t6-375.png` 肉眼确认**文案没有因为留白而显得明显偏移。若偏移难看，改用
`text-align: left; padding-left: 4px;` 的替代方案，两个方案都要以截图为准。

- [ ] **Step 4: 提交**

```bash
cd /Users/xin/Documents/AI-Worksplace/vocabulary-notebook
git add index.html
git commit -m "style: 窄屏下为右下角悬浮按钮让出首页提示文案空间"
```
（若 Step 3 没有触发改动，本任务无提交，直接进入 Task 7。）

---

## Task 7: 下载副本的回归验证

**Files:**
- Test: `/tmp/vn-verify/t7.mjs`

**目的**：证明「下载下来的那个文件」是一个功能完整的应用，而不是一个只有样子的壳。

- [ ] **Step 1: 写验证脚本**

Create `/tmp/vn-verify/t7.mjs`:

```js
import { launch } from './pw.mjs';
import { copyFileSync, statSync } from 'node:fs';

// 1) 从 http 提供的页面下载一份副本
let h = await launch();
await h.page.goto('http://127.0.0.1:8765/index.html');
await h.page.waitForSelector('.book-empty, .book-card');
const [dl] = await Promise.all([
  h.page.waitForEvent('download'),
  h.page.click('#downloadFab')
]);
const COPY = '/tmp/vn-verify/downloaded.html';
copyFileSync(await dl.path(), COPY);
console.log('副本已保存:', COPY, '字节数:', statSync(COPY).size);
await h.browser.close();

// 2) 用 file:// 打开副本，跑一遍真实使用流程
h = await launch({ width: 375, height: 700 });
await h.context.addInitScript(() => {
  localStorage.setItem('vn_books_v1', JSON.stringify([{
    id: 'seed1', title: '种子词汇本', createdAt: Date.now(),
    words: [{ word: 'price', pos: 'n.', phonetic: '/praɪs/', meaningEn: 'the amount',
              meaningCn: '价格', synonyms: ['cost'], antonyms: [], example: 'The price is high.' }]
  }]));
});
await h.page.goto('file://' + COPY);
const emptyShelf = await h.page.locator('.book-empty').count();
console.log('空书架文案（种子数据在 localStorage，属正常）:', emptyShelf);

await h.page.waitForSelector('.book-card');
console.log('卡片数:', await h.page.locator('.book-card').count());

// 进学习页
await h.page.click('.book-card');
await h.page.waitForSelector('#studyView:not([hidden])');
console.log('学习页单词:', await h.page.locator('#frontWord').textContent());

// 返回首页 + 搜索过滤
await h.page.click('#backBtn');
await h.page.waitForSelector('#homeView:not([hidden])');
await h.page.fill('#searchInput', 'price');
await h.page.waitForTimeout(200);
console.log('搜索 price 后卡片数:', await h.page.locator('.book-card').count());
await h.page.fill('#searchInput', 'zzz-not-exist');
await h.page.waitForTimeout(200);
console.log('搜索无结果时空态:', await h.page.locator('.book-empty').count());

// 分享功能仍可用（本地副本上生成单本 HTML）
const shareHtml = await h.page.evaluate(() => buildShareHtml(books[0]));
console.log('分享 HTML 含单词:', shareHtml.includes('price'), '| 长度:', shareHtml.length);
console.log('pageerrors:', h.errors);
await h.browser.close();
```

- [ ] **Step 2: 运行脚本并核对**

Run: `node /tmp/vn-verify/t7.mjs`
Expected: 副本保存成功且字节数与 `index.html` 同量级；`学习页单词: price`；`搜索 price 后卡片数: 1`；
`搜索无结果时空态: 1`；`分享 HTML 含单词: true`；`pageerrors: []`。

若 `pageerrors` 非空，说明下载副本被快照清理逻辑破坏，回到 Task 3 的 `snapshotSelfHtml()` 排查，
修完重跑本任务。

- [ ] **Step 3: 提交**

本任务只跑验证，**无仓库改动**。确认上一步全部符合预期即可。

---

## Task 8: 文档与收尾

**Files:**
- Modify: `README.md`
- Modify: `docs/specs/2026-09-18-local-html-download-and-update-check-design.md`（状态改为「已实现」）

- [ ] **Step 1: README 补发版提醒**

在 `README.md` 的「技术说明」一节末尾（`音频播放前会做一次「音频解锁」…` 那段之后）追加：

```markdown
### 发版提醒

`index.html` 里的 `APP_VERSION`（格式 `YYYY.MM.DD.N`）是**本地副本判断自己是否过期的唯一依据**。
每次发布新版本时必须手动更新这一行，否则已经下载到本地的副本不会收到更新提示。
```

- [ ] **Step 2: README 特性表补一行**

在 `README.md` 的「特性」表格里，「纯本地存储」一行之后追加：

```markdown
| 本地副本与更新 | 首页右下角可把应用本体下载成单个 HTML 离线使用；本地副本打开时自动检查线上新版本并提示更新 |
```

- [ ] **Step 3: 设计文档状态改为已实现**

把 `docs/specs/2026-09-18-local-html-download-and-update-check-design.md` 开头的：

```markdown
- 状态：已确认，待实现
```

改为：

```markdown
- 状态：已实现
```

- [ ] **Step 4: 跑一遍全部验证脚本**

Run:
```bash
node /tmp/vn-verify/t1.mjs && node /tmp/vn-verify/t2.mjs && \
node /tmp/vn-verify/t3-file.mjs && node /tmp/vn-verify/t3-http.mjs && \
node /tmp/vn-verify/t4.mjs && node /tmp/vn-verify/t4-online.mjs && \
node /tmp/vn-verify/t5.mjs && node /tmp/vn-verify/t7.mjs
```
Expected: 每个脚本最后都打印 `PASS`（`t5` 打印 `DONE` 且逐条符合预期）。

- [ ] **Step 5: 提交**

```bash
cd /Users/xin/Documents/AI-Worksplace/vocabulary-notebook
git add README.md docs/specs/2026-09-18-local-html-download-and-update-check-design.md
git commit -m "docs: 补充发版必须更新 APP_VERSION 的说明"
```

- [ ] **Step 6: 停掉本地静态服务**

把 Task 0 Step 5 启动的后台 `python3 -m http.server 8765` 停掉。

---

## 自检结果

**1. 规格覆盖**——设计文档每一节都能对应到任务：

| 设计文档章节 | 对应任务 |
| --- | --- |
| 三、右下角下载按钮（结构 / 显示范围 / 尺寸视觉 / 交互） | Task 2、Task 3 Step 4 |
| 三、与首页底部文案的关系（实测后再决定） | Task 6 Step 2–3 |
| 四、fetch 优先 + 快照兜底 | Task 3（含设计文档同步） |
| 四、快照清理规则 | Task 3 Step 4 `snapshotSelfHtml()` |
| 五.1 版本号常量 | Task 1 |
| 五.2 触发条件与时机 | Task 4 Step 3（`isLocalCopy()` / `onLine` / 1500ms） |
| 五.3 版本比较 | Task 4 Step 3（`parseVersion` / `compareVersion` / 正则） |
| 五.4 提示条 | Task 5 Step 3–4 |
| 五.5 两个动作语义不同 | Task 5 Step 4 + Step 5 断言 |
| 五.6 失败一律静默 | Task 4 Step 1（超时 / 非应用页面用例） |
| 六、代码落点 | Task 1、3、4、5 |
| 七、验收标准 1–12 | Task 2（1）、Task 3（2、3）、Task 7（4、11、12）、Task 4/5（5、6、7、8）、Task 4 Step 5（9）、Task 6（10） |
| 八、验证方式 | 各任务的验证脚本 |
| README 发版提醒 | Task 8 |

**2. 占位符扫描**：无 TBD / TODO / 「稍后补充」；每个改代码的步骤都给了可直接粘贴的完整代码；
每处「若…则…」的分支（Task 6 Step 3）都给了两个具体方案而不是含糊描述。

**3. 命名一致性**：全文统一使用的标识符为 `APP_VERSION` / `APP_ORIGIN` / `APP_UPDATE_URL` /
`APP_FILE_NAME` / `APP_IGNORED_KEY` / `REMOTE_VERSION_RE` / `selfHtmlText` / `remoteHtmlText` /
`pendingUpdateVersion` / `updatePillEl` / `updatePillMute` / `downloadHtml()` / `snapshotSelfHtml()` /
`prefetchSelfHtml()` / `downloadAppHtml()` / `isLocalCopy()` / `parseVersion()` / `compareVersion()` /
`ignoredVersion()` / `ignoreVersion()` / `clearUpdatePill()` / `showUpdatePill()` / `updateToLatest()` /
`checkUpdate()`，与各任务代码块中出现的完全一致。元素 id 统一为 `fabStack` / `downloadFab` /
`updatePill`。

**已知的两处实现与设计文档的偏差**（均在计划中被显式同步）：

1. 第四节由「点击时 fetch」改为「预取 + 同步取用」——原因是异步触发下载会丢失用户激活
   （Task 3 Step 6 负责同步设计文档）。
2. 第四节新增了「预取未就绪时用快照」这一分支——两条路径产出的文件功能等价，
   不会破坏验收标准 2、3。

## 执行记录

计划写完后按 Task 0 → Task 8 顺序执行，实际发生的偏差记录如下。

**Task 0 追加了一步**：工作区 `.npm-cache/` 在计划执行途中被清空（`.cp*`、`__vn-*.html` 一并消失），
原计划的脚手架依赖它定位 `playwright-core`。改为在 `/tmp/vn-verify/` 下用
`npm install playwright-core --cache /tmp/vn-npm-cache` 装一份，`pw.mjs` 直接引绝对路径，
不再依赖工作区。`npm install` 需要 `--cache` 指向临时目录，因为 `/Users/xin/.npm` 无写权限。

**Task 2 的断言在 Task 6 之后被改写**：原断言是「按钮贴视口右下角 14px」。Task 6 实测发现该定位
在窄屏真实压住 `.home-tip` 文案，于是改成「进入首页 flex 流、贴卡片底部右侧」，断言相应改为
「在卡片内 / 右边缘与 `#homeView` 内容区对齐 / 在提示文案下方」。设计与理由已同步到设计文档
第三节「与首页底部文案的关系（实测后改成进入文档流）」。

**Task 4 Step 5 的验证脚本修过一次**：最初用 `page.route('https://geek-xin.github.io/**')` 计数，
把顶层页面导航也算了进去（得到 2 次）。改为只统计 `route.request().resourceType() === 'fetch'`
的请求后为 1 次，符合预期。

**Task 4 Step 5 的首次 Task 4 脚本报错**：`page.evaluate(() => pendingUpdateVersion)` 在变量
尚未定义时抛 `ReferenceError` 而不是返回 `undefined`——这正是「先看它失败」那一步看到的现象，
实现后即通过。

**Task 6 增加了一个宽度扫描脚本 `t6-sweep.mjs`**：在 320 / 375 / 414 / 480 / 640 / 768 / 900 /
1024 / 1280 / 1440 / 1920px 共 11 个宽度下，带提示条测量按钮、提示条与 `.home-tip`、`.bookGrid`、
卡片的位置关系，全部无重叠、无横纵溢出。设计文档里「任何宽度下都不可能重叠」这句话由此实测支撑，
而不是仅靠 flex 布局的推理。

**Task 8 收尾时自查发现计划漏了一条验收标准**：设计文档第三节写了按钮的 `title` 要带当前版本号
（`下载应用 HTML（当前 2026.09.18.1）`），但计划 Task 2 的 HTML 片段与接线步骤都把它漏了，
实现后按验收标准逐条核对时才发现。已补上 `downloadFab.title = ...` 并把断言加进 `t2.mjs`。

**Task 8 补了一个 `t8-a11y.mjs`**，覆盖两条此前没有脚本支撑的验收标准：

- 验收标准 1 的「按钮位置不被更新提示条顶动」：实测有无提示条时按钮的 `y`/`bottom` 完全相同
  （817 / 853）——因为提示条是插在按钮**上方**的同列 flex 项，而整列锚定在卡片底部，
  多出来的高度由可伸缩的卡片网格吸收；
- 验收标准 11 的键盘可达与焦点可见：Tab 能聚焦到按钮（`:focus-visible` 描边实测为
  `rgba(255, 217, 102, 0.42)`），提示条上的「更新」「×」都是真实 `<button>` 且关闭按钮带
  `aria-label="关闭更新提示"`。

验证脚本全部位于 `/tmp/vn-verify/`，不进仓库。截至 Task 8，`t1`、`t2`、`t3-file`、`t3-http`、
`t4`、`t4-online`、`t5`、`t6`、`t6-sweep`、`t7`、`t8-a11y` 全部通过。

## 第二轮：用户追加的五项要求

计划执行完后，用户又提了五项要求。因为每项都是单点改动、各自有验证脚本，没有再写一份计划文档，
直接按「先写失败测试 → 实现 → 跑通」执行，设计文档同步更新。

| 要求 | 处理 | 验证脚本 |
| --- | --- | --- |
| 把版本号显示出来 | 右下角常驻灰色 `v2026.09.18.1`，由 JS 从 `APP_VERSION` 写入 | `t10-version.mjs` |
| 增加一个按钮检查新版本 | 与下载按钮同尺寸的圆形图标按钮（循环箭头），检查中图标旋转；手动检查有明确反馈，且能突破「已忽略该版本」 | `t10-version.mjs` |
| 下载不要把词汇本下载下来 | **这是真漏洞**，见下 | `t9-leak.mjs` |
| 更新时不要覆盖本地词汇本 | 本就安全，补端到端验证 + 文案 + README | `t11-update-keeps-books.mjs` |
| 精简导入报告描述 | 去内部细节、合并计数、短标题；拼装抽成纯函数 | `t12-report.mjs`、`t13-import-e2e.mjs` |

### 第二轮的三个关键发现

**1. 「下载不要把词汇本下载下来」是真漏洞，不是误解。** 原实现用「克隆 DOM + 逐项清理运行时
状态」做兜底，漏了 `#studyView` 里已渲染的词条字段与 `#confirmText`/`#reportText` 两个弹窗文本。
实测：点进过一个词汇本、又打开过删除确认框之后下载，副本里**7 项用户数据全部命中**（标题、单词、
中英释义、例句、近义词、反义词）。修法不是补漏，而是改成在脚本执行的最早时刻抓一份
`document.documentElement.outerHTML`——那时还没有任何用户数据进入 DOM，从根上不可能漏，
同时删掉整张清理逻辑。修前修后都用同一个脚本盯着。

**2. 一个「假通过」的断言。** `t10` 起初写「检查更新按钮与下载按钮同尺寸」，测量时首页尚未渲染
（`.fab-stack` 还是 `display:none`），两个按钮都是 `0x0`，`0 === 0` 让断言通过。加上等待
`body.home-mode` 并断言具体尺寸 `36x36` 后才真正有意义。

**3. 一条测试自身的缺陷。** `t10` 里「伪装成线上域名」的用例把**顶层导航也返回成新版本**，
于是运行中的页面自己的 `APP_VERSION` 也变成了新版，手动检查当然报「已是最新」。改成顶层导航
返回原版本、只有脚本发起的请求返回新版本后，用例才真正测到了手动检查。

### 第二轮补充的验证脚本

- `t9-leak.mjs`：`file://` 与 http 两条路径分别断言副本不含词汇本内容（7 项标记全部检查）；
- `t10-version.mjs`：版本号常驻、图标按钮语义与尺寸、手动检查的四种结果、进行中状态、
  突破已忽略；
- `t11-update-keeps-books.mjs`：**关键是先删掉旧 localStorage 键只留 IndexedDB**，
  否则每次导航都会靠旧键重新迁移，会掩盖真实的数据丢失；
- `t12-report.mjs`：`formatImportReport()` 纯函数逐字断言；
- `t13-import-e2e.mjs`：手工造一个最小 `.docx`（`/tmp/vn-verify/sample.docx`，用 Python 的
  `zipfile` 拼 `[Content_Types].xml` + `_rels/.rels` + `word/document.xml`），走**真实导入**
  验证报告弹窗与 toast。样本里放了一行超长句（>80 字符）来触发「未识别」分支——
  起初放的中文行与数字行都没触发，去看了解析器规则才造对。
