# 版本历史

版本号对应 `index.html` 里的 `APP_VERSION`，格式 `YYYY.MM.DD.N`，照发版时间倒序排列（最新在上）。每条写清：改了什么、为什么、如何验证。

---

## 2026.09.30.1 —— 多端交付：PWA + iOS / Android / HarmonyOS + Release 自动更新

### 背景

应用此前只有一种分发形态：浏览器访问线上页面，或把 `index.html` 下载成单文件离线用。
用户提出要「增加 app，支持 iOS、Android、鸿蒙，也支持当前 HTML 部署，将编译好的包提交 GitHub Release，
程序需要自动检查更新」。

关键约束：**产品本体的单文件、零构建形态不能破坏**。因此所有原生端都做成「壳」——
原生工程只负责承载同一个 `index.html`，不复制业务逻辑。

### 方案：一份本体，四种壳

| 形态 | 承载方式 | 产物 |
| --- | --- | --- |
| Web / PWA | 浏览器 + manifest + Service Worker | GitHub Pages（沿用 legacy 构建，未改动） |
| Android | Capacitor 8 壳（`androidScheme: https`） | `*-android.apk` |
| iOS | Capacitor 8 壳（SPM） | `*-ios-unsigned.ipa` |
| HarmonyOS NEXT | ArkTS `Web` 组件加载 `$rawfile(index.html)` | `*-harmony-unsigned.hap` |

旧版鸿蒙（HarmonyOS 4 及以前）兼容 Android APK，直接复用 Android 产物，不额外维护一套工程。

**派生而非复制**：`www/`（Capacitor webDir）与 `harmony/**/rawfile/index.html` 都由脚本从根
`index.html` 生成，并列入 `.gitignore`。仓库里永远只有一份应用本体，不存在「两份 HTML 漂移」的问题。

### 更新通道：两条，Release 优先

1. **首选** `GET /repos/geek-xin/vocabulary-notebook/releases/latest`，读 `tag_name` 与 `assets`；
2. **回退** 抓线上 `index.html` 读 `APP_VERSION`。

必须回退的场景：GitHub API 未认证限流（60 次/小时/IP，返回 403）、仓库尚无 Release（404）、离线、8 秒超时。
回退再失败时，只有**手动**检查才提示失败，自动检查全程静默。

自动检查的覆盖范围是本次的一个关键决策点：`isLocalCopy()` 在原生壳内返回 `false`（壳确实不是「本地副本」），
若直接沿用它做门槛，**壳内会永远收不到更新提示**——而壳正是移动端的主要分发形态。
因此单独引入 `shouldAutoCheck() { return isNativeShell() || isLocalCopy(); }`，
线上 Web 端仍然跳过（那里由 Service Worker 负责更新）。

壳内的忽略策略也与 Web 端不同：**不落盘** `APP_IGNORED_KEY`，忽略只对当次会话生效。
理由是壳内用户既不能刷新页面也不能替换文件，提示条是唯一的更新入口；持久化忽略会让用户随手一关就永久失联。

### 发版：打 tag 即发布

`node scripts/set-version.mjs 2026.10.01.1` 一处写入五处（`index.html` / `package.json` /
Android `build.gradle` / iOS `pbxproj` / 鸿蒙 `app.json5`），随后打 tag 触发
`.github/workflows/release.yml`：并行构建三端 + 汇总 Web 产物 → 发布同一个 Release。
CI 会校验 `APP_VERSION` 与 tag 一致，不一致直接失败。

### 踩过的坑

- **`.gitignore` 行尾注释不生效**：`www/   # 说明` 会被当成包含空格和 `#` 的模式，导致 `www/` 根本没被忽略。改为注释单独成行。
- **`sdkmanager` 的缓存路径**：它把缓存写 `~/.android/cache`，在受限沙箱下写不进去，报出的却是
  「Failed to download any source lists / IO exception while downloading manifest」这种指向网络的假故障。
  必须显式设 `ANDROID_USER_HOME`。Gradle 同理需要 `GRADLE_USER_HOME`。
- **JSON5 引号键**：鸿蒙 `app.json5` 里是 `"versionCode": 1`（键带引号），最初的正则匹配不到，
  发版时会**静默失配**。已改为容忍两种写法。
- **`@capacitor/assets` 拖入 sharp**：安装时要下载 libvips 二进制，超时即整包失败。
  图标改用 Python + Pillow 生成（`scripts/gen-icons.py`），去掉该依赖。
- **manifest 文件名**：`manifest.webmanifest` 在 legacy Pages 上的 MIME 没有保证，统一用 `manifest.json`。
  但 `scripts/sync-web.mjs` 的 `ENTRIES` 一度没跟着改，导致 manifest 没进 Android 包——
  这类「两处清单」是跨模块集成的典型漏点。

### 验证

| 项目 | 方式 | 结果 |
| --- | --- | --- |
| 内联 JS 语法 | `node scripts/check-inline-js.mjs` | 2 个内联脚本通过 |
| Service Worker 行为 | `node scripts/test-sw.mjs`（Node 里跑假 SW 作用域） | 22 项断言全通过 |
| PWA 装配 | 本地 http + 真实浏览器 | manifest 被解析、SW `activated`、8 个外壳资源入缓存、离线可开 |
| Android APK | `./gradlew assembleDebug` / `assembleRelease` | 均 BUILD SUCCESSFUL；`aapt2` 实测包名/版本/权限/label 正确 |
| iOS / 鸿蒙工程结构 | `plutil -lint` + JSON5 解析 + 字段比对 | 通过（本机无 Xcode / DevEco，仅静态校验） |
| 版本脚本 | `set-version.mjs` 实跑五处写入 | 五处全部命中 |
| 更新回退通道 | 线上 API 恰好 403 限流 | 静默回退到抓线上页面，仍正确识别新版本 |
| **iOS 未签名 ipa** | **CI macos runner 真实编译** | ✅ 528,905 字节 |
| **HarmonyOS HAP** | **CI + 华为命令行工具真实编译** | ✅ 403,012 字节 |
| **Release 流程** | 打 tag `v2026.09.30.1` 真实触发 | ✅ 四端产物全部发布 |
| **应用内自动检查更新** | 真实旧副本 + 线上 Release | ✅ 弹提示条并下载到 337,853 字节新版本 |

### 已知边界

- **各端数据互相独立**：词汇本存在按 origin 划分的本地存储里，网页版 / 单文件 / Android / iOS / 鸿蒙
  各一份，互不同步。这是浏览器安全模型的必然结果，不是缺陷。
- iOS 与鸿蒙产物**均未签名**，仓库不保存任何证书；需用户自行签名后才能装机。
- 真机安装与运行时行为（WebView 加载、发音、联网补全）**未验证**，本机无设备也无 Xcode / DevEco。
  iOS 与鸿蒙的「可编译」结论来自 CI 真实构建，不是本地静态检查。
- Android 图标与 iOS 图标由 `icons/` 派生，改动品牌图形时需重跑生成脚本。

---

## 2026.09.19.3 —— 联网词典兜底

### 背景

内置词典只有 731 条，任意词表都会遇到「没收录」的词，而这些卡片此前只能永远空着——应用没有任何手工补全入口。用户选择「直接联网、无需触发」，于是做成导入后自动补全。

### 方案：两个来源，只补空字段

| 需要的信息 | 来源 | 通道 |
| --- | --- | --- |
| 中文释义 + 词性 | 有道 `suggest` 接口 | JSONP（该接口不返回 CORS 头，但支持 `callback`，用 `<script>` 注入） |
| 英文释义 + 近反义词 | Datamuse `api.datamuse.com` | `fetch`（带 CORS，`file://` 的 `null` origin 也回显） |

- 只处理 `meaningCn` 为空 / `'—'` 的词；只填空白字段，**绝不覆盖**内置词典已有内容。
- 导入完成后延迟 800ms 后台执行，**不阻塞导入**；进度用 toast 显示。
- 启动 3s 后还会对已有词汇本做一次后台回填，每次启动上限 400 词。

### 缓存与降级

- 结果按词缓存进 `storage` 的 `vn_dict_cache_v1`：上限 4000 条、TTL 180 天，二次补全零请求。
- **只有至少一个来源正常应答才写缓存**；纯网络失败不缓存，下次仍会重试。
- 已有新鲜缓存的词在选目标时直接跳过，避免回填预算被「补不上」的词吃掉。
- `navigator.onLine === false` 或所有接口失败 → 保持空卡，不弹错误、不阻塞导入。
- 有结果但补不出中文的词，如实计为 remaining，不谎报成功。

### 已知边界

- 联网来源**不提供音标与例句**，这两项仍只有内置词典词条才有。
- 数据最全的 `dict.youdao.com/jsonapi` **既无 CORS 头也不支持 JSONP**，浏览器无法直接调用；`fsearch` 是 XML 且带 `Origin` 时返回 403。`api.dictionaryapi.dev` 在目标网络不可达。三者均未采用。

### 验证（系统 Chrome + Playwright）

| 场景 | 结果 |
| --- | --- |
| 导入 6 个内置词典没有的词（serendipity 等） | 6/6 补出中文释义，6/6 有英文释义，4/6 有近义词，0 console 报错 |
| 刷新后 | 6/6 释义仍在（已落盘），无重复请求 |
| 离线导入 | `navigator.onLine === false`，0 词被补，0 报错 |
| 离线导入后联网刷新 | 启动回填把 6/6 补齐 |
| 导入 91 词「真题 1 校园版」（内置词典全覆盖） | 91/91 命中内置词典，0 次联网缓存写入（纯 no-op） |
| 主脚本 `node --check` | 语法通过 |

---

## 2026.09.19.2 —— 补齐 83 条词典 + 深浅色主题

### 用户报告

导入「真题 1 校园版.txt」后，生成的卡片**没有中文释义，也没有近义词**，用户怀疑解析器有 bug。

### 诊断：解析器没坏，是词典覆盖不够

用 Node harness 从 `index.html` 里抽出 `parseWordList` 与整本词典，对真实 `.txt` 跑一遍：

| 指标 | 结果 |
| --- | --- |
| 解析条数 | 91 |
| `duplicates` / `rejected` / `unused` | 0 / 0 / 0 |
| `stats.mode` | `blocks`（逐段解析） |

即解析器把 91 行**完整、干净**地全部提取出来了。真正的原因是词典覆盖：648 条的内置词典里，这 91 个词头只命中 8 个（`complaint`、`software`、`immediately`、`prevent`、`be likely to`、`depend on`、`reply`、`despite`），其余 **83 个词头没有词条**，于是渲染成「只有单词、没有释义和近反义词」的空卡。

### 修复：把缺失的 83 个词头补进词典

- 为这 83 个词头逐条生成完整词条（词性、英式音标、中英释义、近反义词、例句），追加进 `defaultWordsData`。
- 多词短语的 `word` **保留源文件拼写**（例如 `do sb.a favor`、`be into sth`），因为 `getDefaultWordMap` 是按 `word` 小写后的**精确键**匹配；改写词形反而会匹配不上。
- 词典规模 `648 → 731`。

### 刻意不做：模糊 / 词干 / 后缀回退匹配

评估过给匹配加回退，但前缀匹配会产生危险的假阳性：`per → permit`、`operate → opera`、`temper → temperature`、`lately → latest`、`sign → sign up`。最终取舍是**精确匹配 + 更大的词典**，而不是更宽松的匹配。理由见 `design.md`「内置词典与匹配策略」。

### 同版本并入：深浅色主题

- 深色为默认；浅色是挂在 `html[data-theme="light"]` 上的 CSS 覆盖块。
- `<head>` 里一段极小的内联脚本在首帧前写 `data-theme`（读 `localStorage` 的 `vn_theme_v1`，没有就读 `prefers-color-scheme`），避免先闪深色再变浅。
- 控制器（§2.10）在用户没手动切换前跟随系统；用户手动切换后写入显式选择，系统主题变化不再覆盖。
- 两个切换入口：首页 fab 行的 `#themeFab`、学习页顶栏的 `.theme-toggle`；同时更新 `<meta name="theme-color">`。
- 分享页是静态快照、不带主题脚本，因此 `buildShareHtml` 会**移除** `.theme-toggle`，避免留下一个点不动的按钮。

### 验证

**纯函数 / Node harness（不进仓库）**

| 断言 | 结果 |
| --- | --- |
| 真实 `.txt` 解析出 91 条 | PASS |
| 91 条中 `meaningCn` 为空的数量 | 0 |
| 91 条中没有近义词的数量 | 0 |
| 词典长度 | 731 |

**端到端（系统 Chrome + Playwright，16/16 通过）**

词典规模；深色系统偏好下默认深色；切浅色再切回；选择在刷新后保持；`.txt` 导入生成 1 个词汇本；首张卡为 `sign` 且有音标与中文释义；翻面后近义词渲染；91 张卡片全部有释义与近义词；无 console / page 报错。

---

## 2026.09.19.1 —— 纯文本词表导入 + PET 词典补全

- **`.txt` 导入**：`fileKind` 认扩展名 `.txt` / MIME `text/plain`；新增 `decodeTextBuffer` 按 BOM → NUL（UTF-16 兜底）→ 严格 UTF-8 → GBK → 宽松 UTF-8 的顺序解码，因此 GBK 编码的 `PET 2.txt`（353 行）可直接导入。`.txt` 分支不加载任何 CDN 库，离线与 `file://` 下都可用。
- **`parseWordList` 新增 `plain` 开关**：纯文本一行即一个词条，去掉行首编号与标点后以字母开头就整行收下，不限词数/长度、允许括号。实测现有解析器本就能 100% 吃下该文件（353 → 353，0 丢失），所以只加开关，没有新写解析器。
- **PET 词典补全**：内置词典 `298 → 648`（新增 350 条，跳过已存在的 3 条）。词头逐字符保留源文件拼写（含弯引号 U+2019、大小写、省略号等），释义按正确词给出。
- **文案与版本**：导入按钮/空状态补 `.txt`，`APP_VERSION → 2026.09.19.1`；`<input>` 仍不设 `accept`（部分移动端 WebView 会因此看不到文件）。
- **验证**：Node 纯函数断言 22 项全通过（含 GBK 解码保留弯引号、无 BOM UTF-16LE、`plain` 收带括号短语而默认模式仍拒绝、docx 路径回归）；`file://` 与 `http://` 端到端各 15 项通过。

---

## 2026.09.18.1 —— 本地 HTML 下载 + 更新检查；首页查询 + 卡片三行布局

同一天的两批改动合并到同一个版本号。

### 本地 HTML 下载与更新检查

- 首页右下角常驻版本号 + 「检查更新」+「下载」两个图标按钮：下载把**纯净的应用本体**存成 `vocabulary-notebook.html`；本地副本打开时自动检查线上版本，发现更高版本在按钮上方出现「更新 / ×」提示条。
- 取文两条路径：在线时预取页面原文（`selfHtmlText`）优先，`file://` 下回退到脚本执行最早时刻抓取的 DOM 原文（`pristineHtml`）。取用**必须同步**，否则会丢失用户激活（transient activation），Safari 等会拦截下载。
- **一次真实的数据泄漏**：早期实现「克隆 DOM 再逐项清理运行时状态」，漏了 `#studyView` 里已渲染的词条字段与 `#confirmText` / `#reportText` 两个弹窗文本；实测在打开过词汇本、又打开过删除确认框后下载，副本带出 7 项用户数据。修法不是补漏，而是改为抓脚本执行时的初始 DOM 原文，从根上不可能漏，并删掉整张清理逻辑。详见 `design.md` 第 10 节。
- 更新检查：`REMOTE_VERSION_RE` 从线上 `index.html` 读 `APP_VERSION`，`compareVersion` 数值比较；自动检查只在本地副本、离线跳过、失败静默；手动检查任何打开方式都执行且有明确反馈。「更新」用已抓取的线上原文直接下载（不重复请求），只在本次会话静默；「×」写入 `localStorage` 的 `vn_update_ignored_version`，永久忽略该版本。
- **更新不会丢词汇本**：更新只是下载一个文件，不读写存储。

### 首页查询输入 + 卡片三行布局

- 首页导入按钮下方新增查询框（在 `#bookGrid` 之外，重绘不失焦），按**书名**或**词条单词 / 中文释义**实时过滤；计数徽标显示「匹配 M / 共 N 个词汇本」，卡片第二行显示「命中 K 词」，无结果显示空态与「清除查询」。
- 卡片由两行改为三行：标题 / 数量+时间 / 分享+删除按钮。
- **两个失败的卡片高度方案**：固定/过小的 `min-height` 会裁掉两行标题；过大的 `min-height` 会在按钮下方留大片空白。结论是不设 `min-height`，让内容决定高度。
- **必须保留 `grid-auto-rows: max-content`**：首页网格是定高滚动容器，行高为 `auto` 时带 `overflow: hidden` 的卡片会让行被压缩到只剩 padding，导致整行卡片重叠（实测行距 −71.8px）；`max-content` 让行按内容撑开，恢复正常的 14px 行距。
- 首页大标题改为项目名「词汇本 · 多词库学习」。

---

## 更早（2026-09-18）

- 在 `vocabulary-notebook/` 初始化独立 git 仓库，`vocabulary-notebook.html` 重命名为 `index.html`，新增 `README.md` / `LICENSE`（CC BY-NC 4.0）/ `.gitignore`，并开源为 public 仓库。
- 同一时期另建了个人主页仓库 `geek-xin.github.io`（**不在本仓库内**），用于集中展示作者与项目。
