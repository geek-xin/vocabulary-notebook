# 设计文档：本地 HTML 下载 + 版本更新检查

- 日期：2026-09-18
- 状态：已确认，待实现
- 作者：geek-xin

## 一、背景

词汇本是**零构建单文件应用**：全部 HTML / CSS / JS 都在 `index.html` 里。但应用本身没有
「保存到本地」的入口——用户想把应用存到本机离线使用，只能靠浏览器菜单「另存为」，容易存下
一份带运行时痕迹、打开后状态错乱的副本。

同时，一旦用户把应用存到本地，这份副本就与线上彻底脱钩：线上修了 bug、加了功能，本地副本
不会有任何察觉，用户可能长期停留在旧版本。

本次改动提供两个能力：

1. 首页右下角一个悬浮小按钮，一键把**纯净的应用本体**下载到本地；
2. 本地副本打开时自动检查线上版本，发现更高版本就在右下角提示，并可直接下载新版。

## 二、范围

| 项 | 结论 |
| --- | --- |
| 下载内容 | **只下载应用本体**（`index.html` 原文），不内嵌任何词汇本数据 |
| 下载后本地书架 | 为空。数据存在原站点 IndexedDB 里，不随文件走，这是本方案已确认的取舍 |
| 按钮位置 | 仅**首页**右下角悬浮，学习页不显示 |
| 更新检测目标 | 线上 `index.html`（绝对地址写死在源码常量里） |
| 版本判定 | 源码里手动维护的 `APP_VERSION` 常量，与线上副本读出的值做数值比较 |
| 数据结构 | 无改动。不新增存储键（更新提示的「已忽略版本」记录除外，见 5.5），不改动已存词汇本 |
| 现有分享功能 | 不改动 |

**非目标**：不把词汇本数据内嵌进下载副本；不做 Service Worker / 自动覆盖本地文件；不改学习页；
不引入构建步骤或额外文件（不新增 `version.json` 之类）。

## 三、交付物一：右下角下载按钮

### 结构

在 `.app-container` 之后、`.toast` 附近新增一个固定定位的竖列容器：

```html
<div class="fab-stack" id="fabStack">
  <!-- 更新提示条由 JS 动态插入，位于按钮上方 -->
  <button class="download-fab" id="downloadFab" type="button"
          aria-label="下载应用 HTML 到本地">
    <svg …下载图标…></svg>
  </button>
</div>
```

提示条在按钮**上方**、同一列内（`flex-direction: column; align-items: flex-end; gap: 8px`），
因此提示条出现或消失**不会顶动按钮的位置**。DOM 顺序上提示条插在按钮**之前**
（`fabStack.insertBefore(pill, downloadFab)`），与视觉上的上下关系一致。

### 显示范围

用 CSS 门控，不改视图切换逻辑：

```css
.fab-stack { display: none; position: fixed; … }
body.home-mode .fab-stack { display: flex; }
```

`renderHome()` 会加 `body.home-mode`，`openBook()` 会移除它，所以按钮天然只在书架页出现，
且首次渲染前不会闪现在错误位置。

### 尺寸与视觉

| 项 | 值 |
| --- | --- |
| 按钮 | 圆形 36px（`≤640px` 为 34px），图标 16px |
| 位置 | `right: max(14px, env(safe-area-inset-right))`，`bottom: max(14px, env(safe-area-inset-bottom))` |
| 层级 | `z-index: 900`——低于 toast（999）与弹窗遮罩（1000），弹窗打开时自动被盖住 |
| 配色 | 沿用玻璃拟态：`rgba(255,255,255,0.08)` 背景、1px 半透明描边、`backdrop-filter: blur(10px)`、`color: #cfe1f2` |
| 按下/悬停 | `:active` 加深背景；`@media (hover: hover) and (pointer: fine)` 下 hover 轻微提亮并上浮 1px |
| 焦点 | `:focus-visible` 用主题黄 `rgba(255, 217, 102, 0.42)` 描边，与搜索框聚焦态一致 |
| 提示 | `aria-label="下载应用 HTML 到本地"`；`title` 带当前版本，如 `下载应用 HTML（当前 2026.09.18.1）` |

`title` 里带版本号是让用户零成本地知道本地版本，不在界面上额外占位置。该 `title` 由 JS 在
初始化时写入（`APP_VERSION` 是脚本常量，静态 HTML 里写死会与常量脱节）。

### 与首页底部文案的关系

首页底部有一行居中的小字（`.home-tip`）。在窄屏（如 375px）下，右下角按钮有压到这行文案的
风险。处理原则：**先截图实测，确实相碰再让位**——给 `.home-tip` 加右侧留白把文字让开，
不凭猜测提前改布局。

### 交互

点击 → 生成纯净 HTML（见第四节）→ 触发下载 → toast「已下载 vocabulary-notebook.html」。

## 四、交付物二：生成纯净的应用本体

### 取文策略：fetch 优先，快照兜底

```
buildSelfHtml():
  1) 取 location.href 去掉 # 后的地址，fetch 它，读 response.text()
     —— 拿到与服务器逐字节一致的原文，最干净
  2) 上面任一步失败（file:// 下浏览器禁止 fetch 自身、离线、被拦截），
     回退 snapshotSelfHtml()
  3) 两条路径都失败 → toast 报错，不产生文件
```

采用这个策略的原因：在线访问（GitHub Pages / 本地 http 服务）时，下载到的就是**线上那份原文**，
不会有任何运行时痕迹；只有在 `file://` 下打开本地副本、又要点按钮重新下载时，才走兜底路径。
备选方案「只用 `outerHTML`」被否决——它会把 `home-mode` 类、已渲染的卡片 DOM、`hidden` 状态、
toast 文案全带进副本，清理逻辑多且容易残留 bug。

### 快照清理规则（`snapshotSelfHtml()`）

克隆 `document.documentElement` 后，按下列规则把运行时状态清回初始态，再序列化：

| 位置 | 处理 |
| --- | --- |
| `<body>` | 移除 `home-mode` 等运行时类 |
| `#bookGrid` | 清空（`renderHome()` 会在新副本里重新渲染） |
| `#homeView` / `#studyView` | 恢复为 `homeView` 可见、`studyView` 带 `hidden` |
| `#appTitle` | 恢复默认「词汇本」 |
| `#bookCount` / `#homeTip` | 恢复默认文案 |
| `#searchInput` | 清空 `value` |
| 确认框 / 导入报告弹窗 | 恢复 `hidden` |
| `#toast` | 清空文本并移除 `show` |
| 更新提示条 | 移除（新副本打开时会重新检查） |

`<script>` 内容在克隆中完整保留，因此副本的功能与原件一致。

### 下载实现

`downloadHtml(text, fileName)`：`Blob`（`text/html;charset=utf-8`）→
`URL.createObjectURL` → 临时 `<a download>` 触发点击 → `URL.revokeObjectURL`。
文件名固定 `vocabulary-notebook.html`（比 `index.html` 更容易在下载目录里认出来）。

## 五、交付物三：更新检查与提示

### 5.1 版本号常量

脚本顶部常量区（与 `DB_NAME` 等并列）新增：

```js
const APP_VERSION = '2026.09.18.1';   // 发版时必须手动改这一行
```

格式 `YYYY.MM.DD.N`。**每次发布新版本都要改这一行**，这是本方案唯一的纪律成本；若忘记改，
本地副本不会收到更新提示。README 的「技术说明」里补一句发版提醒。

### 5.2 触发条件与时机

只有**本地副本**才检查：

```
location.protocol === 'file:' || location.origin !== 'https://geek-xin.github.io'
```

此外：

- `navigator.onLine === false` 时直接跳过，省一次必然失败的请求；
- 首屏渲染完成后延迟 **1.5 秒**执行，不阻塞首屏、不与导入初始化抢网络；
- 在线访问时**完全不发**检查请求（用户已经在最新版上）。

一次检查 = 一次对 `https://geek-xin.github.io/vocabulary-notebook/index.html` 的 `GET`，
约 150KB。成本可接受，原因是：它命中浏览器 HTTP 缓存（线上 `cache-control: max-age=600`），
且**抓到的文本会被缓存下来直接用于「更新」下载，不会重复请求**。

之所以不做「只取文件头几个字节」的优化：`Range` 请求头不在 CORS 安全清单里，会触发预检，
而 GitHub Pages 不响应 `OPTIONS`，此路不通。

### 5.3 版本比较

`parseVersion(s)` 按 `.` 拆段转数字数组，`compareVersion(a, b)` 逐段数值比较（缺位按 0 处理）。
**仅当远端 > 本地**才提示——本地开发版比线上新时不会误报。

线上 HTML 里的版本号用正则读取：`/APP_VERSION\s*=\s*['"]([^'"]+)['"]/`。读不到（正则不匹配、
返回的不是应用页面、被网关改写）视为检查失败，静默处理。

### 5.4 提示条

发现更高版本时，在下载按钮上方插入持久提示条：

```
[● 发现新版本 2026.09.19.1]  [更新]  [×]
```

| 项 | 说明 |
| --- | --- |
| 视觉 | 玻璃拟态 + 主题黄圆点 `#ffd966` 表意「有新东西」，圆角胶囊 |
| 宽度 | `max-width: min(72vw, 260px)`，窄屏文案自动换行，不溢出屏幕 |
| 出现动画 | 淡入 + 上移 8px，`prefers-reduced-motion` 下取消 |
| 无障碍 | 「更新」「关闭」均为真实 `<button>`；关闭按钮 `aria-label="关闭更新提示"` |

### 5.5 两个动作的语义不同（关键）

| 动作 | 行为 |
| --- | --- |
| **更新** | 用 5.2 已抓取的文本直接调用 `downloadHtml()` 下载最新 HTML（缓存文本意外为空时重新 fetch），toast「新版本已下载，请用它替换当前文件」。提示条**只在本次会话隐藏**（内存变量），旧文件没被替换，下次打开仍会提示——这是正确的 |
| **×** | 把该版本号写入 `localStorage`（键 `vn_update_ignored_version`），**永久不再提示这个版本**；线上出现更高版本时重新提示 |

「更新」后不做持久忽略，是因为持久忽略会让「下载了新版却没替换文件」的用户再也收不到提示。

### 5.6 失败一律静默

离线、超时（`AbortController` 8 秒）、跨域被拒、正则读不到版本号、`localStorage` 不可用
（`file://` 下 Safari 可能禁用，`try/catch` 降级为仅本次会话记住）——全部只 `console.warn`，
不弹任何提示。自动检查是锦上添花，不能打扰学习。

## 六、代码落点

| 位置 | 内容 |
| --- | --- |
| 常量区 | `APP_VERSION` / `APP_UPDATE_URL` / `APP_DOWNLOAD_NAME` / `APP_IGNORED_KEY` |
| 新增 §2.9 区块（紧随 §2.8 分享之后） | `downloadHtml()`、`snapshotSelfHtml()`、`buildSelfHtml()`、`downloadAppHtml()`、`parseVersion()`、`compareVersion()`、`checkUpdate()`、`showUpdatePill()`、`clearUpdatePill()`、`dismissUpdateVersion()` |
| HTML | `.fab-stack` + `.download-fab` |
| 初始化末尾 | 绑定按钮点击；`setTimeout(checkUpdate, 1500)` |

## 七、验收标准

1. 首页右下角出现圆形下载按钮，学习页不出现；按钮位置不被更新提示条顶动。
2. 点击按钮下载得到 `vocabulary-notebook.html`，内容以 `<!DOCTYPE html>` 开头，含 `<style>`
   与完整脚本。
3. 下载的副本**不含**运行时痕迹：没有已渲染的词汇本卡片 DOM，`<body>` 上无 `home-mode` 类，
   `#studyView` 带 `hidden`。
4. 用 `file://` 打开下载下来的副本：空书架正常显示，导入词汇本、学习、分享等原有流程可用。
5. 本地副本（如 `file://` 打开）在 1.5 秒后自动检查线上版本；线上版本更高时，下载按钮上方
   出现「发现新版本 … · 更新 · ×」提示条。
6. 线上版本不高于本地、或检查失败（离线 / 超时 / 读不到版本号）时，**不出现任何提示**，
   仅控制台告警。
7. 点「×」后重新打开该本地副本，不再提示同一版本。
8. 点「更新」下载到线上最新 HTML，toast 提示需要替换本地文件；当前页面提供的仍是旧版本。
9. 从线上站点访问时（origin 为 `https://geek-xin.github.io`），不发起任何版本检查请求。
10. 375px 窄屏与 1440px 桌面下，按钮与更新提示条均不溢出视口、不与首页底部文案、卡片、
    toast 重叠；弹窗打开时按钮被遮罩盖住。
11. 键盘可聚焦下载按钮与提示条上的两个按钮，焦点样式可见。
12. 现有分享、导入、搜索过滤、学习流程不受影响。

## 八、验证方式

项目为零构建单文件应用、无测试框架，采用系统 Chrome + Playwright 实测：

1. **下载链路**：监听 `download` 事件捕获产物，校验文件名与内容（含 `APP_VERSION`、不含
   卡片 DOM、`#studyView` 带 `hidden`）。
2. **更新提示**：用 `page.route()` 拦截线上地址，返回一份伪造的高版本 HTML，验证提示条出现、
   「×」后重开不再提示、「更新」确实下载出新版本；再拦截为相等/更低版本，验证不提示。
3. **失败静默**：拦截为超时或非应用页面，验证无任何提示且无报错弹窗。
4. **视觉**：375px 与 1440px 下截图，逐一核对第 10 条；确认与 `.home-tip` 是否相碰，
   相碰则给该行加右侧留白后复测。
5. **回归**：在下载下来的副本上重跑导入、学习、搜索、分享流程。
