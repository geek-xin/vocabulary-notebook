# 联网补全成功后才呈现卡片 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 导入的新词汇本在联网补全完成前只显示骨架卡，补全成功后才换成可进入的真实卡片；失败时给出重试与「仍然查看」。

**Architecture:** 在内存中维护 `pendingBooks` 侧表（不持久化），`renderHome` 据此渲染骨架卡；`enrichWords` 新增 `answered` 计数用于判定「是否有词典来源正常应答」，`enrichBooks` 据此决定清空 pending 还是标记失败。

**Tech Stack:** 单文件 `index.html`（原生 JS + DOM，无构建）、Node 脚本做语法/SW 校验、Playwright 做浏览器验证。

**Spec:** `docs/superpowers/specs/2026-10-02-online-import-gating-design.md`

---

## 关于测试的说明

这个仓库是**单文件零构建**应用，DOM 逻辑没有单元测试框架，现有 `npm test` 只做两件事：
`check-inline-js.mjs`（用 `vm.Script` 校验 index.html 内联脚本语法）与 `test-sw.mjs`（假 SW 环境跑 sw.js）。

因此本计划**不伪造单元测试**，改用两层真实可执行的验证：

1. **每步都跑** `npm run check:js`（语法闸门，改完就过）。
2. **Task 6 统一做浏览器端到端验证**（Playwright 驱动真实页面），覆盖三条路径。

计划里给出的代码是**完整可粘贴的最终代码**，不是伪代码。

---

## 文件结构

| 文件 | 责任 | 改动 |
| --- | --- | --- |
| `index.html` | 唯一事实来源：全部应用逻辑与样式 | 主实现 |
| `docs/design.md` | 当前架构与设计取舍 | 更新导入与在线补全章节 |
| `docs/troubleshooting.md` | 故障排查 | 更新「卡片是 `—`」一节 |
| `docs/history.md` | 变更历史 | 追加本次条目 |

`www/` 是 `scripts/sync-web.mjs` 的派生产物（已被 .gitignore 排除），**不手动改**。

---

## Task 1: 骨架卡的样式（CSS）

**Files:**
- Modify: `index.html:701`（在 `.book-del:active` 之后、`.book-empty` 之前插入）
- Modify: `index.html:1158`（浅色主题块内，`.book-empty` 之前插入）

- [ ] **Step 1: 插入深色主题样式**

在 `index.html` 中 `.book-del:active { background: rgba(224, 90, 70, 0.32); color: #ffffff; }` 这一行之后插入：

```css
/* 等待联网补全的骨架卡：不可进入学习页，只展示进度 */
.book-card.is-pending { cursor: default; }
.book-card.is-pending:active { transform: none; }

.book-pending-status {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #8fd0ff;
  font-size: 11px;
}

.book-pending-bar {
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.book-pending-fill {
  display: block;
  width: 0;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #4aa3d8, #8fd0ff);
  transition: width 0.25s ease;
}

.book-pending-btn {
  padding: 5px 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #dbe8f3;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  transition: background 0.15s, border-color 0.15s;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.book-pending-btn:active { background: rgba(255, 255, 255, 0.2); }
```

- [ ] **Step 2: 插入浅色主题覆盖**

在 `index.html` 中 `html[data-theme="light"] .book-empty {` 这一行之前插入：

```css
html[data-theme="light"] .book-pending-bar { background: rgba(20, 50, 80, 0.12); }
html[data-theme="light"] .book-pending-status { color: #1e6f9f; }
html[data-theme="light"] .book-pending-btn {
  border-color: rgba(20, 50, 80, 0.16);
  background: rgba(20, 50, 80, 0.06);
  color: #1b3b57;
}
html[data-theme="light"] .book-pending-btn:active { background: rgba(20, 50, 80, 0.16); }
```

- [ ] **Step 3: 语法闸门**

Run: `npm run check:js`
Expected: `✓ index.html 内联脚本语法检查通过`

- [ ] **Step 4: 提交**

```bash
git add index.html
git commit -m "style: 新增联网补全骨架卡样式（深/浅色）"
```

---

## Task 2: pending 侧表与骨架卡渲染

**Files:**
- Modify: `index.html` 状态区（`const BOOKS_KEY = 'vn_books_v1';` 附近）
- Modify: `index.html:1930-2062`（`renderHome`）

- [ ] **Step 1: 新增 pending 侧表**

在 `index.html` 中 `const BOOKS_KEY    = 'vn_books_v1';` 这一行之后插入：

```js
/* 导入后正在等待联网补全的词汇本：id -> { status: 'loading' | 'failed', done, total }
   ⚠️ 只存在于内存，**绝不持久化**。理由：若持久化，离线用户重开应用会永远看不到
   自己已经导入并落盘的数据 —— 那是数据可用性事故，而不是「严格」。 */
const pendingBooks = Object.create(null);
```

- [ ] **Step 2: 抽出垃圾桶图标常量**

把 `renderHome` 里 `del.innerHTML = '<svg ...>...</svg>';` 的那段字符串提成模块级常量。
在 `pendingBooks` 声明之后插入：

```js
const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
  ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polyline points="3 6 5 6 21 6"></polyline>' +
  '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
  '<path d="M10 11v6M14 11v6"></path>' +
  '<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';
```

然后把 `renderHome` 中的 `del.innerHTML = ...` 整段替换为：

```js
    del.innerHTML = TRASH_SVG;
```

- [ ] **Step 3: 在 renderHome 中分流渲染**

在 `renderHome` 的 `visible.forEach(function (entry) {` 之后、`const book = entry.book;` 之后插入：

```js
    // 正在等待联网补全的词汇本：先出骨架卡，补全成功后才换成真实卡片
    const pending = pendingBooks[book.id];
    if (pending) { renderPendingCard(book, pending); return; }
```

- [ ] **Step 4: 实现骨架卡渲染与局部刷新**

在 `renderHome` 函数之后（`function showHome() {` 之前）插入：

```js
/* 骨架卡：等待联网补全期间的临时形态。
   刻意不提供「进入学习页」与「分享」——补全前进去只会看到一屏空卡，
   分享出去的也是空释义。保留删除，让用户能撤销本次导入。 */
function renderPendingCard(book, state) {
  const card = document.createElement('div');
  card.className = 'book-card is-pending';
  card.dataset.id = book.id;
  card.dataset.pending = '1';

  const title = document.createElement('div');
  title.className = 'book-title';
  title.textContent = book.title;
  card.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'book-meta';

  const count = document.createElement('span');
  count.className = 'book-count';
  count.textContent = book.words.length + ' 词';
  meta.appendChild(count);

  const status = document.createElement('span');
  status.className = 'book-pending-status';
  meta.appendChild(status);
  card.appendChild(meta);

  const bar = document.createElement('div');
  bar.className = 'book-pending-bar';
  const fill = document.createElement('span');
  fill.className = 'book-pending-fill';
  bar.appendChild(fill);
  card.appendChild(bar);

  const actions = document.createElement('div');
  actions.className = 'book-actions';

  if (state.status === 'failed') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'book-pending-btn';
    retry.textContent = '重试';
    retry.addEventListener('click', function (e) {
      e.stopPropagation();
      retryPendingBook(book.id);
    });
    actions.appendChild(retry);

    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'book-pending-btn';
    view.textContent = '仍然查看';
    view.addEventListener('click', function (e) {
      e.stopPropagation();
      dismissPendingBook(book.id);
    });
    actions.appendChild(view);
  } else {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'book-del';
    del.setAttribute('aria-label', '删除词汇本 ' + book.title);
    del.dataset.del = book.id;
    del.innerHTML = TRASH_SVG;
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteBook(book.id);
    });
    actions.appendChild(del);
  }

  card.appendChild(actions);
  applyPendingProgress(card, state);
  bookGrid.appendChild(card);
}

// 把状态写进已存在的骨架卡 DOM；进度回调每几百毫秒来一次，整页重绘会闪
function applyPendingProgress(card, state) {
  if (!card || !state) return;
  const status = card.querySelector('.book-pending-status');
  const fill = card.querySelector('.book-pending-fill');
  const failed = state.status === 'failed';
  if (status) {
    status.textContent = failed
      ? '联网补全失败'
      : ('联网补全中 ' + state.done + ' / ' + state.total);
  }
  if (fill) {
    const pct = failed ? 100 : (state.total ? Math.round(state.done / state.total * 100) : 0);
    fill.style.width = pct + '%';
  }
}

function refreshPendingCard(id) {
  const card = bookGrid.querySelector('.book-card[data-id="' + id + '"]');
  if (card) applyPendingProgress(card, pendingBooks[id]);
}
```

- [ ] **Step 5: 语法闸门**

Run: `npm run check:js`
Expected: `✓ index.html 内联脚本语法检查通过`

- [ ] **Step 6: 提交**

```bash
git add index.html
git commit -m "feat: 书架支持联网补全中的骨架卡"
```

---

## Task 3: 骨架卡不可进入学习页

**Files:**
- Modify: `index.html:2210-2221`（`bookGrid` 的 click / keydown）

- [ ] **Step 1: 拦截 click**

把 `bookGrid` 的 click 处理器结尾：

```js
  const card = closestEl(e.target, '.book-card');
  if (card) openBook(card.dataset.id);
```

替换为：

```js
  const card = closestEl(e.target, '.book-card');
  if (!card) return;
  // 等待联网补全的骨架卡不可进入：补全前点进去只有一屏空卡
  if (card.dataset.pending === '1') return;
  openBook(card.dataset.id);
```

- [ ] **Step 2: 拦截 keydown**

把 keydown 处理器结尾：

```js
  const card = closestEl(e.target, '.book-card');
  if (!card) return;
  e.preventDefault();
  openBook(card.dataset.id);
```

替换为：

```js
  const card = closestEl(e.target, '.book-card');
  if (!card) return;
  if (card.dataset.pending === '1') return;
  e.preventDefault();
  openBook(card.dataset.id);
```

- [ ] **Step 3: 删除词汇本时清理 pending 状态**

在 `deleteBook` 中 `books = next;` 之后插入：

```js
  delete pendingBooks[id];
```

- [ ] **Step 4: 语法闸门**

Run: `npm run check:js`
Expected: `✓ index.html 内联脚本语法检查通过`

- [ ] **Step 5: 提交**

```bash
git add index.html
git commit -m "feat: 骨架卡不可进入学习页，删除时清理 pending 状态"
```

---

## Task 4: enrichWords 汇报「是否真的有来源应答」

**Files:**
- Modify: `index.html:3983-4001`（`lookupOnline` 的 merged 对象）
- Modify: `index.html:4021-4069`（`enrichWords`）

- [ ] **Step 1: 在合并结果里记录 answered**

在 `lookupOnline` 的 `merged` 对象里，`miss: ...` 之前插入一行：

```js
      // 至少一个来源在 HTTP 层正常应答（哪怕没查到该词）：用于判定「补全是否真的失败」
      answered: !!(r[0].ok || r[1].ok),
```

- [ ] **Step 2: enrichWords 统计 answered**

在 `enrichWords` 中 `let filled = 0;` 之后插入：

```js
  let answered = 0;
```

在缓存命中分支：

```js
    const cached = onlineDict.cache[String(words[i].word).toLowerCase()];
    if (cached && Date.now() - (cached.ts || 0) < DICT_CACHE_TTL) {
      if (!cached.miss && applyOnlineEntry(words[i], cached)) filled++;
      continue;
    }
```

改为：

```js
    const cached = onlineDict.cache[String(words[i].word).toLowerCase()];
    if (cached && Date.now() - (cached.ts || 0) < DICT_CACHE_TTL) {
      // 新鲜缓存意味着上次确实有来源应答过（无论查没查到），算作 answered
      answered++;
      if (!cached.miss && applyOnlineEntry(words[i], cached)) filled++;
      continue;
    }
```

在 worker 内：

```js
        try { r = await lookupOnline(words[idx].word); } catch (e) { r = null; }
        if (r && !r.miss && applyOnlineEntry(words[idx], r)) filled++;
```

改为：

```js
        try { r = await lookupOnline(words[idx].word); } catch (e) { r = null; }
        if (r && r.answered) answered++;
        if (r && !r.miss && applyOnlineEntry(words[idx], r)) filled++;
```

把返回值：

```js
  return { total: targets.length, filled: filled, remaining: remaining };
```

改为：

```js
  return { total: targets.length, filled: filled, remaining: remaining, answered: answered };
```

- [ ] **Step 3: 语法闸门**

Run: `npm run check:js`
Expected: `✓ index.html 内联脚本语法检查通过`

- [ ] **Step 4: 提交**

```bash
git add index.html
git commit -m "feat: enrichWords 汇报是否有词典来源正常应答"
```

---

## Task 5: 导入流程改为「补全成功才呈现」

**Files:**
- Modify: `index.html:3303-3322`（`importFiles` 尾部）
- Modify: `index.html:4072-4097`（`enrichBooks`）
- Add: `runEnrichForNewBooks` / `markPendingLoading` / `updatePendingProgress` / `markPendingFailed` / `retryPendingBook` / `dismissPendingBook`

- [ ] **Step 1: importFiles 注册 pending 并立即启动补全**

把 `importFiles` 中：

```js
  if (!await saveBooks(pending)) return;
  books = pending;
  renderHome();

  // 所有词条的释义都来自在线词典：导入完成后静默联网补全（不阻塞导入，失败保持空卡）
  // 推迟一点，先让「已导入」提示显示出来，别被进度提示立刻顶掉
  setTimeout(function () { enrichBooks(added); }, 800);
```

替换为：

```js
  if (!await saveBooks(pending)) return;
  books = pending;

  /* 数据在这一刻已经落盘；骨架卡只是同一个 book 的临时呈现形态。
     新词汇本先以「联网补全中」的骨架卡出现，补全成功后才换成真实卡片。 */
  added.forEach(function (b) { markPendingLoading(b.id, b.words.length); });
  renderHome();
  runEnrichForNewBooks(added);
```

并把紧随其后的导入提示改为带补全语义：

```js
  showToast(msg + (skipped ? '（见报告）' : '') + ' · 联网补全中…', skipped ? 6000 : 3200);
```

- [ ] **Step 2: enrichBooks 按 answered 判定成败**

把整个 `enrichBooks` 函数替换为：

```js
/* 导入后：联网补全新词汇本，成功才把骨架卡换成真实卡片。
   判定见 spec：有任一来源应答即算成功；离线或零应答算失败，交给用户重试或放行。 */
async function enrichBooks(list) {
  if (!list || !list.length) return { ok: false, filled: 0, remaining: 0 };

  // 联网开关关闭 / navigator.onLine === false：直接判失败，不空跑一轮超时
  if (!onlineDictAvailable()) {
    list.forEach(function (b) { markPendingFailed(b.id); });
    return { ok: false, filled: 0, remaining: 0 };
  }

  let total = 0;
  let filled = 0;
  let remaining = 0;
  let answered = 0;

  for (let i = 0; i < list.length; i++) {
    const book = list[i];
    const res = await enrichWords(book.words, 0, function (done, tot) {
      updatePendingProgress(book.id, done, tot);
    });
    total += res.total;
    filled += res.filled;
    remaining += res.remaining;
    answered += res.answered;
  }

  // total === 0 表示没有需要联网的词（全部命中新鲜缓存或本就不缺释义），也算成功
  const ok = answered > 0 || total === 0;

  // 部分补到的内容同样要落盘，失败也不例外
  if (!await saveBooks(books)) return { ok: false, filled: filled, remaining: remaining };

  list.forEach(function (b) {
    if (ok) delete pendingBooks[b.id];
    else markPendingFailed(b.id);
  });

  renderHome();
  if (!studyView.hidden) renderWord(currentIndex);
  return { ok: ok, filled: filled, remaining: remaining };
}

// 新导入词汇本的补全入口：跑完后按结果给出明确提示，绝不静默
async function runEnrichForNewBooks(list) {
  const res = await enrichBooks(list);
  if (!res.ok) {
    showToast('联网补全失败，词汇本已保存，可重试或先查看空卡', 5000);
    return res;
  }
  if (res.filled) {
    showToast('已联网补全 ' + res.filled + ' 词' +
      (res.remaining ? '，仍缺 ' + res.remaining + ' 词' : ''), 4000);
  } else if (res.remaining) {
    showToast('联网词典未收录这 ' + res.remaining + ' 词，卡片保持空白', 4000);
  } else {
    showToast('词汇本已就绪', 2400);
  }
  return res;
}

function markPendingLoading(id, total) {
  pendingBooks[id] = { status: 'loading', done: 0, total: total || 0 };
}

function markPendingFailed(id) {
  const st = pendingBooks[id];
  pendingBooks[id] = { status: 'failed', done: st ? st.done : 0, total: st ? st.total : 0 };
}

function updatePendingProgress(id, done, total) {
  const st = pendingBooks[id];
  if (!st || st.status !== 'loading') return;
  st.done = done;
  st.total = total;
  refreshPendingCard(id);
}

// 失败后重试：重新回到「联网补全中」
async function retryPendingBook(id) {
  const book = books.find(function (b) { return b.id === id; });
  if (!book) return;
  markPendingLoading(id, book.words.length);
  renderHome();
  await runEnrichForNewBooks([book]);
}

// 用户主动放行：接受空卡，正常呈现
function dismissPendingBook(id) {
  delete pendingBooks[id];
  renderHome();
}
```

- [ ] **Step 3: 语法闸门**

Run: `npm run check:js`
Expected: `✓ index.html 内联脚本语法检查通过`

- [ ] **Step 4: 全量测试**

Run: `npm test`
Expected: 两个脚本都通过

- [ ] **Step 5: 提交**

```bash
git add index.html
git commit -m "feat: 联网补全成功后才呈现卡片"
```

---

## Task 6: 浏览器端到端验证（三条路径）

**Files:**
- 不修改仓库文件；用 Playwright 驱动 `http://127.0.0.1:4173/`

- [ ] **Step 1: 启动本地服务**

Run: `node scripts/serve.mjs 4173`（后台）
Expected: `http://127.0.0.1:4173/`

- [ ] **Step 2: 正常联网导入**

在页面里执行（用 `importFiles` 直接喂一个 File，绕开文件选择器）：

```js
localStorage.clear();
const words = 'apple\nbanana\ncherry\n';
await importFiles([new File([words], 'demo.txt', { type: 'text/plain' })]);
document.querySelectorAll('.book-card.is-pending').length;
```

Expected: 立刻为 `1`（骨架卡），状态文案形如 `联网补全中 0 / 3`。
随后等待出现 `.book-card:not(.is-pending)`，且卡片内释义不为 `—`。

- [ ] **Step 3: 断网导入**

```js
localStorage.clear();
Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
const words = 'apple\nbanana\n';
await importFiles([new File([words], 'offline.txt', { type: 'text/plain' })]);
document.querySelector('.book-pending-status').textContent;
```

Expected: `联网补全失败`，且存在「重试」「仍然查看」两个按钮。
点「仍然查看」后出现真实卡片。

- [ ] **Step 4: 词条查不到（部分缺失）**

```js
localStorage.clear();
delete navigator.onLine;   // 恢复真实联网判定
const words = 'apple\nzzqqxxtt\n';
await importFiles([new File([words], 'mixed.txt', { type: 'text/plain' })]);
```

Expected: 补全结束后呈现真实卡片（成功态），`apple` 有释义、`zzqqxxtt` 保持 `—`。

- [ ] **Step 5: 截图留证**

对三条路径各截一张图，人工确认骨架卡与失败态在深色/浅色主题下都正常。

- [ ] **Step 6: 记录结果**

把实测结果写进 `docs/history.md` 的验证边界表。

---

## Task 7: 文档更新

**Files:**
- Modify: `docs/design.md`（导入与在线补全章节）
- Modify: `docs/troubleshooting.md`（「导入成功但卡片是 `—`」一节）
- Modify: `docs/history.md`（追加条目）

- [ ] **Step 1: design.md**

在「导入行为」与在线词典章节补充：导入后新词汇本先呈现为**骨架卡**，联网补全成功才换成真实卡片；
pending 状态**只在内存**，不持久化；成功判定为「任一来源应答」；失败态提供重试与「仍然查看」。

- [ ] **Step 2: troubleshooting.md**

更新「导入成功，但卡片释义显示 `—`」：说明现在补全期间看到的是骨架卡而非空卡；
补全失败时骨架卡会显示「联网补全失败」并提供重试。

- [ ] **Step 3: history.md**

追加本次变更：动机、实现、验证结果与未验证边界（真机 WebView 未验证）。

- [ ] **Step 4: 提交**

```bash
git add docs/
git commit -m "docs: 更新导入与联网补全的文档"
```

---

## 自检

- **Spec 覆盖**：4.1 内存态 → Task 2/5；4.2 流程 → Task 5；4.3 判定 → Task 4/5；4.4 失败态 UI → Task 2/5；4.5 骨架卡交互 → Task 2/3；验证 → Task 6。
- **无占位符**：所有代码步骤都是可直接粘贴的完整实现。
- **类型/命名一致**：`pendingBooks`、`markPendingLoading`、`markPendingFailed`、`updatePendingProgress`、`refreshPendingCard`、`applyPendingProgress`、`renderPendingCard`、`runEnrichForNewBooks`、`retryPendingBook`、`dismissPendingBook`、`TRASH_SVG` 在各任务中定义一次、使用处命名一致。
