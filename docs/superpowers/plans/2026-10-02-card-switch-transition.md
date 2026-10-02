# 切换卡片词汇时的过渡动画 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 学习页的四个切换入口（随机 / 顺序 / ← → 方向键 / 页码跳转）在切换卡片时播放方向感知的过渡动画：旧卡滑出淡出、新卡从反方向滑入淡入。

**Architecture:** 不动 `renderWord`（3 处非切换路径必须保持瞬间替换），新增 `switchTo(index, direction)` 用 Web Animations API 播两拍动画，两拍之间在卡片不可见时换内容。用 `.card.switching { transition: none }` 屏蔽原有 0.6s 翻面过渡，避免与动画抢 `transform`。

**Tech Stack:** 单文件 `index.html`（原生 JS + DOM，无构建）、Web Animations API、Node 脚本做语法校验、Playwright 做浏览器验证。

**Spec:** `docs/superpowers/specs/2026-10-02-card-switch-transition-design.md`

---

## 关于测试的说明

这个仓库是**单文件零构建**应用，DOM 逻辑没有单元测试框架，现有 `npm test` 只做两件事：
`check-inline-js.mjs`（用 `vm.Script` 校验 index.html 内联脚本语法）与 `test-sw.mjs`（假 SW 环境跑 sw.js）。

因此本计划**不伪造单元测试**，改用两层真实可执行的验证：

1. **每步都跑** `npm run check:js`（语法闸门，改完就过）。
2. **Task 6 统一做浏览器端到端验证**（Playwright 驱动真实页面），覆盖六个场景。

计划里给出的代码是**完整可粘贴的最终代码**，不是伪代码。

**行号会漂移**：本计划的插入点一律用**锚点内容**描述（「在 X 这一行之后插入」），
不要依赖行号。文中引用的行号仅表示写计划时的位置，供快速定位。

---

## 文件结构

| 文件 | 责任 | 改动 |
| --- | --- | --- |
| `index.html` | 唯一事实来源：全部应用逻辑与样式 | 主实现 |
| `docs/design.md` | 当前架构与设计取舍 | 更新「7. 学习页交互与发音 → 卡片」 |
| `docs/history.md` | 变更历史 | 追加本次条目 |

`www/` 与 `android/`、`ios/` 下的副本是 `scripts/sync-web.mjs` 的派生产物（已被 .gitignore 排除），**不手动改**。

---

## Task 1: 关闭切换期间的翻面过渡（CSS）

**Files:**
- Modify: `index.html` —— 在 `.card.flipped { transform: rotateY(180deg); }` 这一行之后插入

- [ ] **Step 1: 插入 `.card.switching` 规则**

在 `index.html` 中找到这一行：

```css
.card.flipped { transform: rotateY(180deg); }
```

在它**之后**插入：

```css
/* 切换卡片期间：临时关掉翻面过渡。
   切换动画由 Web Animations API 驱动，而 CSS 里 animation 会整体接管
   该属性的过渡；若不关掉，第 143 行的 0.6s transition 会与动画抢
   transform，出现拖尾。动画结束后由 JS 摘掉这个 class。 */
.card.switching { transition: none; }
```

- [ ] **Step 2: 语法闸门**

```bash
npm run check:js
```

期望：`✓ index.html 内联脚本语法检查通过`。这一步只改 CSS，必然通过，作用是确认没误伤文件结构。

- [ ] **Step 3: 提交**

```bash
git add index.html
git commit -m "style: 切换卡片期间关闭翻面过渡"
```

---

## Task 2: 新增 switchTo 与方向常量（核心逻辑）

**Files:**
- Modify: `index.html` —— 在 `function renderWord(index) { ... }` 整个函数**之后**、`/* ===== 4. 有道英式发音 ===== */` 注释块**之前**插入

- [ ] **Step 1: 插入切换动画实现**

在 `index.html` 中找到 `renderWord` 函数结尾（紧跟其后的注释块是）：

```js
/* =========================================================
   4. 有道英式发音
```

在这个注释块**之前**插入：

```js
/* =========================================================
   3.5 切换卡片的过渡动画
   ---------------------------------------------------------
   四个切换入口（随机 / 顺序 / ← → 方向键 / 页码跳转）走 switchTo；
   进入学习页、联网补全后刷新、启动回填后刷新仍直接调 renderWord ——
   那三处不是用户主动切换，瞬间替换才是对的。

   两拍动画：退出（卡片不可见）→ 换内容 → 进入。
   换内容发生在卡片不可见的那一瞬间，所以看不到文字跳变。
   ========================================================= */
const SWITCH_OUT_MS = 130;   // 退出拍
const SWITCH_IN_MS  = 220;   // 进入拍
const SWITCH_SHIFT  = 8;     // 位移量：卡片宽度的 8%

const DIR_NEXT = 1;    // 向前：旧卡向左滑出，新卡从右侧滑入
const DIR_PREV = -1;   // 向后：旧卡向右滑出，新卡从左侧滑入

let switching = false;       // 是否正在播切换动画
let switchAnim = null;       // 当前动画对象，用于连按时取消

/* Web Animations API 不受 CSS 的 prefers-reduced-motion 媒体查询管辖，
   必须在 JS 里自行判定（文件别处已用 matchMedia，用法一致）。 */
function prefersReducedMotion() {
  return !!(window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* 收尾：取消动画、摘掉 .switching、恢复翻面过渡可用。
   先 cancel 再摘 class —— 让 transform 在过渡被禁用时就落回原位，避免回弹。
   回调先置 null，防止 cancel 触发 onfinish/oncancel 重入。 */
function cancelSwitch() {
  if (switchAnim) {
    const anim = switchAnim;
    switchAnim = null;
    anim.onfinish = null;
    try { anim.cancel(); } catch (e) {}
  }
  flashcard.classList.remove('switching');
  switching = false;
}

/* 切换到 index。
   direction 取 DIR_NEXT / DIR_PREV；传 0 表示不播动画。 */
function switchTo(index, direction) {
  const data = wordsData[index];
  if (!data) return;

  // 先算「要不要播动画」：目标页即当前页（如单张卡上绕回自身）、无方向、减弱动效 → 不播
  const animated = index !== currentIndex && !!direction && !prefersReducedMotion();

  // 上一次还没播完：直接作废它，本次瞬间替换（连按不卡顿、不重叠）
  const wasSwitching = switching;
  if (wasSwitching) cancelSwitch();

  currentIndex = index;

  if (!animated || wasSwitching) {
    renderWord(currentIndex);
    return;
  }

  switching = true;
  flashcard.classList.add('switching');

  const out = direction === DIR_NEXT ? -1 : 1;    // 退出方向（向左为负）
  const fromRotate = isFlipped ? 180 : 0;         // 在背面时，退出拍顺带转回正面

  const outAnim = flashcard.animate(
    [
      { transform: 'translateX(0%) rotateY(' + fromRotate + 'deg)', opacity: 1 },
      { transform: 'translateX(' + (out * SWITCH_SHIFT) + '%) rotateY(0deg)', opacity: 0 }
    ],
    { duration: SWITCH_OUT_MS, easing: 'ease-in', fill: 'forwards' }
  );
  switchAnim = outAnim;

  outAnim.onfinish = function () {
    if (switchAnim !== outAnim) return;   // 已被取消或被新的切换取代

    // 卡片此刻完全不可见：换内容，并把翻转态归零
    if (isFlipped) {
      flashcard.classList.remove('flipped');
      isFlipped = false;
    }
    renderWord(currentIndex);

    const inAnim = flashcard.animate(
      [
        { transform: 'translateX(' + (-out * SWITCH_SHIFT) + '%) rotateY(0deg)', opacity: 0 },
        { transform: 'translateX(0%) rotateY(0deg)', opacity: 1 }
      ],
      { duration: SWITCH_IN_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
    );
    switchAnim = inAnim;

    inAnim.onfinish = function () {
      if (switchAnim !== inAnim) return;
      cancelSwitch();
    };
  };
}
```

- [ ] **Step 2: 语法闸门**

```bash
npm run check:js
```

期望：`✓ index.html 内联脚本语法检查通过`。

- [ ] **Step 3: 提交**

```bash
git add index.html
git commit -m "feat: 新增卡片切换的两拍过渡动画"
```

---

## Task 3: 四个切换入口改走 switchTo

**Files:**
- Modify: `index.html` —— 四处事件处理器

> 方向语义（spec 4.4）：顺序切换**恒为向前**、方向键**按自身方向**、
> 页码跳转与随机切换**按目标页与当前页的大小比较**。
> 顺序切换在最后一张绕回第 1 张时目标页序号更小，若按大小比较会被判成「向后」，
> 与按钮语义矛盾 —— 所以它显式传 `DIR_NEXT`。

- [ ] **Step 1: 随机切换按钮**

把这段：

```js
document.getElementById('randomBtn').addEventListener('click', function () {
  if (wordsData.length < 2) return;
  let newIndex;
  do {
    newIndex = Math.floor(Math.random() * wordsData.length);
  } while (newIndex === currentIndex);
  currentIndex = newIndex;
  renderWord(currentIndex);
});
```

替换为：

```js
document.getElementById('randomBtn').addEventListener('click', function () {
  if (wordsData.length < 2) return;
  let newIndex;
  do {
    newIndex = Math.floor(Math.random() * wordsData.length);
  } while (newIndex === currentIndex);
  // 随机没有前后概念，按目标页与当前页的大小比较定方向
  switchTo(newIndex, newIndex > currentIndex ? DIR_NEXT : DIR_PREV);
});
```

- [ ] **Step 2: 顺序切换按钮**

把这段：

```js
document.getElementById('nextBtn').addEventListener('click', function () {
  currentIndex = (currentIndex + 1) % wordsData.length;
  renderWord(currentIndex);
});
```

替换为：

```js
document.getElementById('nextBtn').addEventListener('click', function () {
  // 恒为向前：最后一张绕回第 1 张时目标页序号更小，但按钮语义仍是「下一张」
  switchTo((currentIndex + 1) % wordsData.length, DIR_NEXT);
});
```

- [ ] **Step 3: 页码跳转**

在 `startCounterEdit` 的 `finish` 函数里，把这段：

```js
      const n = parseInt(input.value, 10);
      if (isFinite(n)) {
        currentIndex = Math.min(wordsData.length, Math.max(1, n)) - 1;
        renderWord(currentIndex);
        return;
      }
```

替换为：

```js
      const n = parseInt(input.value, 10);
      if (isFinite(n)) {
        const target = Math.min(wordsData.length, Math.max(1, n)) - 1;
        // 跳到后面的页码 → 向前；跳到前面 → 向后；跳到当前页 → 不播
        switchTo(target, target === currentIndex ? 0 : (target > currentIndex ? DIR_NEXT : DIR_PREV));
        return;
      }
```

- [ ] **Step 4: ← → 方向键**

把这段：

```js
  if (e.key === 'ArrowRight') {
    currentIndex = (currentIndex + 1) % wordsData.length;
    renderWord(currentIndex);
  } else if (e.key === 'ArrowLeft') {
    currentIndex = (currentIndex - 1 + wordsData.length) % wordsData.length;
    renderWord(currentIndex);
  }
```

替换为：

```js
  if (e.key === 'ArrowRight') {
    switchTo((currentIndex + 1) % wordsData.length, DIR_NEXT);
  } else if (e.key === 'ArrowLeft') {
    switchTo((currentIndex - 1 + wordsData.length) % wordsData.length, DIR_PREV);
  }
```

- [ ] **Step 5: 语法闸门**

```bash
npm run check:js
```

期望：`✓ index.html 内联脚本语法检查通过`。

- [ ] **Step 6: 确认没有漏改的入口**

```bash
grep -n "renderWord(" index.html
```

期望只剩 **4 处**：
- `function renderWord(index) {` —— 定义
- 进入学习页那处（`renderWord(currentIndex);` 单独一行）
- 联网补全后刷新那两处（`if (!studyView.hidden) renderWord(currentIndex);`）
- `switchTo` 内部那处换内容

若还出现「`currentIndex = ...` 紧跟 `renderWord(currentIndex);`」的切换写法，说明漏改了入口。

- [ ] **Step 7: 提交**

```bash
git add index.html
git commit -m "feat: 四个切换入口改走过渡动画"
```

---

## Task 4: 切换期间忽略翻转点击（防状态不一致）

**Files:**
- Modify: `index.html` —— `flashcard` 的 `click` 处理器

> **这一步是对 spec 的补充**，请留意：切换动画播放中（约 350ms）用户点卡片，
> 会 toggle `flipped` 但 `transform` 正被动画接管、视觉上「点了没反应」，
> 动画结束后卡片却突然翻面 —— 状态与视觉不一致。
> 加一个守卫即可，代价是切换的 350ms 内点击翻转不生效（合理且无感）。
> **若认为不应扩大改动范围，可整步跳过**，功能不受影响。

- [ ] **Step 1: 加守卫**

把 `flashcard` 的 click 处理器开头：

```js
flashcard.addEventListener('click', function (e) {
  if (touchMoved) { touchMoved = false; return; }
  if (e.target.closest('.audio-btn')) return;
```

改为：

```js
flashcard.addEventListener('click', function (e) {
  if (touchMoved) { touchMoved = false; return; }
  if (e.target.closest('.audio-btn')) return;
  if (switching) return;   // 切换动画播放中：忽略翻转，避免状态与视觉不一致
```

- [ ] **Step 2: 语法闸门 + 提交**

```bash
npm run check:js && git add index.html && git commit -m "fix: 切换动画期间忽略翻转点击"
```

---

## Task 5: 分享页同步同一段切换逻辑

**Files:**
- Modify: `index.html` —— `buildShareScript` 生成的脚本数组

> `buildShareScript`（写计划时在第 2433 行）生成的是一套**自包含**的独立脚本，
> 有自己的 `render(i)` 与切换逻辑。`buildShareHtml` 复制的是整块 `<style>`，
> 所以 Task 1 的 `.card.switching` 会自动带上；**动画由 JS 驱动，只需同步 JS**。
> 注意：分享页里没有 `isFlipped` 变量，翻转态直接读 `flashcard` 的 class。

- [ ] **Step 1: 在 `render` 定义之后插入切换逻辑**

在 `buildShareScript` 的返回数组里，找到这一行（`render` 的定义）：

```js
    'function render(i) { var w = WORDS[i]; ... ',
```

在它**之后**、`'function toggle() { flashcard.classList.toggle("flipped"); }',` 这一行**之前**插入下面这些数组元素（保持原有「每个元素一行、用单引号字符串」的写法）：

```js
    'var SWITCH_OUT_MS = 130, SWITCH_IN_MS = 220, SWITCH_SHIFT = 8, DIR_NEXT = 1, DIR_PREV = -1;',
    'var switching = false, switchAnim = null;',
    'function reducedMotion() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }',
    'function cancelSwitch() { if (switchAnim) { var a = switchAnim; switchAnim = null; a.onfinish = null; try { a.cancel(); } catch (e) {} } flashcard.classList.remove("switching"); switching = false; }',
    'function switchTo(i, dir) { if (!WORDS[i]) return; var animated = i !== idx && !!dir && !reducedMotion(); var was = switching; if (was) cancelSwitch(); idx = i; if (!animated || was) { render(idx); return; } switching = true; flashcard.classList.add("switching"); var out = dir === DIR_NEXT ? -1 : 1; var fromRotate = flashcard.classList.contains("flipped") ? 180 : 0; var outAnim = flashcard.animate([{ transform: "translateX(0%) rotateY(" + fromRotate + "deg)", opacity: 1 }, { transform: "translateX(" + (out * SWITCH_SHIFT) + "%) rotateY(0deg)", opacity: 0 }], { duration: SWITCH_OUT_MS, easing: "ease-in", fill: "forwards" }); switchAnim = outAnim; outAnim.onfinish = function () { if (switchAnim !== outAnim) return; flashcard.classList.remove("flipped"); render(idx); var inAnim = flashcard.animate([{ transform: "translateX(" + (-out * SWITCH_SHIFT) + "%) rotateY(0deg)", opacity: 0 }, { transform: "translateX(0%) rotateY(0deg)", opacity: 1 }], { duration: SWITCH_IN_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }); switchAnim = inAnim; inAnim.onfinish = function () { if (switchAnim !== inAnim) return; cancelSwitch(); }; }; }',
```

- [ ] **Step 2: 分享页三个入口改走 `switchTo`**

把这三行：

```js
    'document.getElementById("nextBtn").addEventListener("click", function () { idx = (idx + 1) % WORDS.length; render(idx); });',
    'document.getElementById("randomBtn").addEventListener("click", function () { if (WORDS.length < 2) return; var n; do { n = Math.floor(Math.random() * WORDS.length); } while (n === idx); idx = n; render(idx); });',
```

替换为：

```js
    'document.getElementById("nextBtn").addEventListener("click", function () { switchTo((idx + 1) % WORDS.length, DIR_NEXT); });',
    'document.getElementById("randomBtn").addEventListener("click", function () { if (WORDS.length < 2) return; var n; do { n = Math.floor(Math.random() * WORDS.length); } while (n === idx); switchTo(n, n > idx ? DIR_NEXT : DIR_PREV); });',
```

再把方向键那一行里的切换部分：

```js
    'document.addEventListener("keydown", function (e) { ... if (e.key === "ArrowRight") { idx = (idx + 1) % WORDS.length; render(idx); } else if (e.key === "ArrowLeft") { idx = (idx - 1 + WORDS.length) % WORDS.length; render(idx); } });',
```

改为：

```js
    'document.addEventListener("keydown", function (e) { ... if (e.key === "ArrowRight") { switchTo((idx + 1) % WORDS.length, DIR_NEXT); } else if (e.key === "ArrowLeft") { switchTo((idx - 1 + WORDS.length) % WORDS.length, DIR_PREV); } });',
```

（`...` 处保持该行原有的前半段不动，只替换箭头键分支。）

页码跳转在分享页里同样处理：把 `startCounterEdit` 那行生成代码中

```js
idx = Math.min(WORDS.length, Math.max(1, n)) - 1; render(idx);
```

改为：

```js
var t = Math.min(WORDS.length, Math.max(1, n)) - 1; switchTo(t, t === idx ? 0 : (t > idx ? DIR_NEXT : DIR_PREV));
```

- [ ] **Step 3: 语法闸门**

```bash
npm run check:js
```

> 注意：`check-inline-js.mjs` 只校验 `index.html` 里的内联脚本，
> 而分享页脚本是**运行时字符串拼接**出来的，语法错误在生成前查不出来。
> 因此 Task 6 的验证里**必须实际导出一份分享页并打开它**。

- [ ] **Step 4: 提交**

```bash
git add index.html
git commit -m "feat: 分享页同步卡片切换过渡动画"
```

---

## Task 6: 浏览器端到端验证

**Files:** 无代码改动（验证步骤；发现问题回到对应 Task 修）

- [ ] **Step 1: 跑完整测试**

```bash
npm test
```

期望：内联脚本语法检查通过 + sw 测试通过。

- [ ] **Step 2: 起本地服务**

```bash
node scripts/serve.mjs
```

默认 `http://127.0.0.1:4173`。用 Playwright 打开该地址。

- [ ] **Step 3: 导入一个词表并进入学习页**

导入 3 个以上词条（例如 `apple`、`banana`、`cherry`），等联网补全完成、点进学习页。

- [ ] **Step 4: 逐项验证并记录结果**

| 项目 | 预期 |
| --- | --- |
| 顺序切换按钮 | 旧卡向左滑出、新卡从右滑入；方向始终向前 |
| 最后一张点顺序切换 | 绕回第 1 张时**仍向前滑**（不反向） |
| → 方向键 | 向前滑 |
| ← 方向键 | 向后滑（旧卡向右滑出、新卡从左滑入） |
| 停在背面时切换 | 退出拍顺带转回正面，新卡正面滑入，无背面残影 |
| 页码跳转到更后的页 | 向前滑 |
| 页码跳转到更前的页 | 向后滑 |
| 随机切换 | 按目标页与当前页大小比较定方向 |
| 只有 1 个词时点顺序切换 | 无动画，卡片正常重绘（不抖） |
| 连按 → 方向键 5 次以上 | 卡片始终可见、词条即时刷新、无空白、无两张卡重叠 |
| 切换后点卡片翻转 | 翻面正常（说明 `.switching` 已摘掉、过渡已恢复） |
| 深色 / 浅色主题 | 动画观感均正常 |
| console | 0 errors / 0 warnings |

- [ ] **Step 5: 验证减弱动效**

在 Playwright 里以 `prefers-reduced-motion: reduce` 打开页面，确认切换**无动画**、词条正常更新。

- [ ] **Step 6: 导出分享页并打开**

用「分享」导出词汇本 HTML，在浏览器里打开导出文件，确认：
- 四个入口的切换动画同样生效；
- 卡片翻转、发音等原有功能正常；
- console 0 errors。

> 这一步是分享页脚本**唯一的语法与行为防线**（它不经 `check:js` 校验）。

- [ ] **Step 7: 记录验证结果**

把上表的实测结果整理进 `docs/history.md` 的本次条目（沿用现有「| 项目 | 结果 |」表格写法，
并注明未验证边界：真机 WebView 无设备，未验证）。

---

## Task 7: 更新文档

**Files:**
- Modify: `docs/design.md`（「7. 学习页交互与发音 → 卡片」一节）
- Modify: `docs/history.md`（追加本次条目）

- [ ] **Step 1: 更新 design.md**

在 `docs/design.md` 的「### 卡片」一节里，把这段：

```markdown
点击卡片翻转（正面：单词/词性/音标/中英释义；背面：音标·词性/近反义词/例句）。
左右方向键切换上/下一张。空字段统一显示 `—`。
```

改为：

```markdown
点击卡片翻转（正面：单词/词性/音标/中英释义；背面：音标·词性/近反义词/例句）。
左右方向键切换上/下一张。空字段统一显示 `—`。

切换卡片有方向感知的过渡动画：旧卡滑出淡出、新卡从反方向滑入淡入，合计约 350ms。
顺序切换恒为向前（含最后一张绕回第 1 张），方向键按自身方向，随机与页码跳转按目标页与当前页的大小比较。
在背面时切换会在退出拍顺带转回正面，与滑动合并为一次动画。
动画由 Web Animations API 驱动（`switchTo`），切换期间用 `.card.switching` 关闭原有翻面过渡；
`prefers-reduced-motion: reduce` 时退化为瞬间替换。
进入学习页、联网补全后刷新、启动回填后刷新不走动画，保持瞬间替换。
```

- [ ] **Step 2: 追加 history.md 条目**

在 `docs/history.md` 的版本历史顶部追加一条，沿用现有结构（`### 问题` / `### 改动` / `### 验证`）。
标题形如 `## <版本号> —— 切换卡片词汇时的过渡动画`，其中版本号需与 `index.html` 里的
`APP_VERSION` 一致 —— 若本次要发版，先跑：

```bash
npm run version 2026.10.02.2
```

> 该脚本一处写入 `index.html` / `package.json` / Android / iOS 的版本号。
> `docs/history.md` 的条目是按版本号组织的，**不发版就不要编造版本号**，与用户确认后再定。

- [ ] **Step 3: 提交**

```bash
git add docs/design.md docs/history.md
git commit -m "docs: 补充切换卡片过渡动画的说明与变更记录"
```

---

## 收尾检查

- [ ] `npm test` 通过。
- [ ] `grep -n "renderWord(" index.html` 的结果与 Task 3 Step 6 的预期一致。
- [ ] `git status` 干净，`www/` 未被手工修改。
- [ ] 若需发版：`node scripts/sync-web.mjs` 同步派生产物（该目录不进版本库）。
