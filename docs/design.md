# 设计文档：词汇本 · 多词库学习

- 适用版本：`APP_VERSION = '2026.09.19.2'`
- 产品文件：单文件 `index.html`（约 303 KB，含全部 HTML / CSS / JavaScript）
- 本文只解释**为什么**；具体实现以 `index.html` 为准，文档与代码冲突时以代码为准。

---

## 1. 总览与运行方式

「词汇本 · 多词库学习」是一个**单文件、零构建、离线可用**的英语词汇应用：导入 `.docx` / `.pdf` / `.txt` 词表，自动匹配内置词典补全音标、词性、中英释义与近反义词，再以卡片形式学习。

### 为什么是单文件

| 约束 | 带来的结果 |
| --- | --- |
| 无框架、无打包器、无 `npm install` | clone 下来双击 `index.html` 即可用，不会随时间产生依赖腐化 |
| 全部 HTML / CSS / JS 都在一个文件里 | 「下载应用本体」只需保存一个文件，离线打开就是完整应用 |
| 解析库只在需要时从 CDN 加载 | 首次导入 `.docx` / `.pdf` 才拉 mammoth / pdf.js；`.txt` 完全不需要网络 |

拆分文件会同时破坏「双击即用」与「下载一个 HTML 就拿到完整应用」这两点，因此不做拆分。

### 运行方式

| 方式 | 说明 |
| --- | --- |
| 在线 | `https://geek-xin.github.io/vocabulary-notebook/`；手机可「添加到主屏幕」当 App |
| 本地双击 | `file://` 打开 `index.html`。本地文件来源统一是 `file://`，换文件名/目录仍读同一份数据 |
| 本地 http | `python3 -m http.server` 之类。**来源变了，书架会是空的**，仅用于验证 |

数据按**来源（origin）**隔离：`file://` 与任意 `http://` 站点各有各的存储。README 因此要求本地副本始终用 `file://` 双击打开。

### 版本号纪律

`APP_VERSION`（格式 `YYYY.MM.DD.N`）是本地副本判断自己是否过期的**唯一依据**，每次发版必须手动改这一行。与它并列的常量还有 `APP_ORIGIN`、`APP_UPDATE_URL`、`APP_FILE_NAME`、`APP_IGNORED_KEY`。

---

## 2. 数据模型与三级存储

### 数据模型

```js
book = { id, title, createdAt, words: [word, ...] }
word = { word, pos, phonetic, meaningEn, meaningCn, synonyms[], antonyms[], example }
```

| 字段 | 说明 |
| --- | --- |
| `id` | `makeId()` 生成，形如 `b` + 时间戳 base36 + 随机后缀 |
| `title` | 导入时取文件名去掉 `.docx` / `.pdf` / `.txt` 扩展名；重名用 `uniqueTitle()` 加后缀 |
| `createdAt` | 毫秒时间戳 |
| `meaningCn` | 缺省填 `'—'`；这是「词典没命中」在 UI 上的表现 |
| `synonyms` / `antonyms` | 字符串数组，可为空 |

**载入时一律净化**：`normalizeWord` 丢弃没有合法 `word` 的项并补默认值；`normalizeBook` 丢弃没有标题、或净化后没有任何有效词的整本书。因此「导入成功但没出现词汇本」通常意味着解析出的词条全部无效，而不是存储坏了。

### 三级存储降级

`storage` 对象把三种后端封装成同一组 `get` / `set` / `label`：

| 优先级 | 后端 | 触发条件 | 特点 |
| --- | --- | --- | --- |
| 1 | IndexedDB | 默认 | 库名 `vocabulary_notebook`，对象仓库 `kv`（`DB_VERSION = 1`）；配额远大于 localStorage，移动端 WebView 更稳 |
| 2 | localStorage | `indexedDB` 不存在、打开失败/被阻塞、或 **2.5 秒**内没成功 | 同步、简单，容量小 |
| 3 | 内存 | localStorage 写入探测失败 | 刷新即丢，界面会提示「仅本次会话」 |

存储键只有两个：`vn_books_v1`（词汇本数组）与 `vn_progress_v1`（每本书上次读到的页码）。`saveBooks` 写入失败（如 `QuotaExceededError`）会明确返回失败并提示，不静默吞掉。

### 旧数据迁移

早期版本把词汇本存在 `localStorage`。`migrateLegacyStorage` 在启动时执行：仅当 IndexedDB 可用、且 IndexedDB 里还没有书籍时，把旧的 `vn_books_v1` / `vn_progress_v1` 复制过去。**检测「IndexedDB 为空」是必要的**，否则每次启动都会用旧键覆盖新数据。

---

## 3. 导入与解码流水线

```
选择文件 → readArrayBuffer → fileKind（扩展名/MIME）→ 失败则 sniffKind（魔数）
        → 按类型分派：pdf / docx（按需加载 CDN 库）| txt（纯本地解码）
        → parseWordList → normalize → 追加词汇本
```

### 类型识别

| 函数 | 判据 |
| --- | --- |
| `fileKind(file)` | 扩展名 `.pdf` / `.docx` / `.txt`，或 MIME 含 `pdf` / `wordprocessingml` / `msword` / `text/plain` |
| `sniffKind(buf)` | 文件头 `%PDF` → `pdf`；`PK\x03\x04`（zip）→ `docx` |

**不对未知扩展名做内容嗅探**：老式 `.doc` 是 OLE2 二进制，宽松的「像不像文本」判断会把它误判成文本，最终报出「解析到 0 个词条」这类误导性结果；宁可让它落到明确的格式错误分支。`.pdf` / `.docx` 失败时报「不是 .docx / .pdf / .txt 文件」。

### 按需加载解析库

`ensureLib` 依次尝试多个 CDN，任一成功即返回；全部失败才报「解析库加载失败（网络受限）」，每个脚本 20 秒超时。

| 库 | CDN 顺序 |
| --- | --- |
| mammoth 1.4.16 | jsDelivr → BootCDN → staticfile → cdnjs |
| pdf.js 3.11.174 | jsDelivr → BootCDN → cdnjs（无 staticfile 源） |
| pdf.js worker | jsDelivr → BootCDN → cdnjs |

国内网络下 jsDelivr 可能不可达，故按序兜底；每个文件独立尝试，前一个失败不影响后一个。

### 纯文本解码 `decodeTextBuffer`

`.txt` 是字节流，必须先解码。按下列顺序，首个成功者胜出：

| 顺序 | 判据 | 处理 | 为什么 |
| --- | --- | --- | --- |
| 1 | BOM `EF BB BF` | UTF-8，剥 BOM | BOM 明确指定编码 |
| 2 | BOM `FF FE` | UTF-16LE，剥 BOM | 同上 |
| 3 | BOM `FE FF` | UTF-16BE，剥 BOM | 同上 |
| 4 | 前 4 KB 含 `0x00` | 按 UTF-16LE 解，解完还含 NUL 才放弃 | NUL 本身是合法 UTF-8，无 BOM 的 UTF-16 会「成功」解出夹 NUL 的垃圾，属静默出错，比报错更糟 |
| 5 | 严格 UTF-8（`fatal: true`）可解 | 用 UTF-8 | 多数正常文本 |
| 6 | `TextDecoder('gbk')` 严格可解 | 用 GBK | 覆盖 GBK 词表（如 `PET 2.txt`） |
| 7 | 都不行 | 宽松 UTF-8（替换字符） | 保证导入不直接失败 |

`.txt` 分支**不调用** `ensureLib`，所以网络受限或 `file://` 下同样能导入。解码函数缺失时（老浏览器无 `TextDecoder`）给出明确报错。

### 导入行为

- 文件**串行**解析（手机端内存更稳）；一批文件各自生成一个词汇本。
- 书名取文件名去掉扩展名；重名追加后缀。
- 导入报告由纯函数 `formatImportReport(stats)` 拼装，不碰 DOM，便于单独断言；计数合成一行，小节只留短标题，不暴露「整篇扫描 / 逐段解析」这类内部细节。
- `<input type="file">` **不设** `accept`：部分移动端 WebView 加上后会出现「文件在手机里但选择器里看不到」。

---

## 4. `parseWordList` 双路解析与 `plain` 模式

`parseWordList(html, opts)` 先经 `htmlToBlocks` 把 HTML 压成按行分隔的纯文本（`<br>` 与块级闭合标签转换行，其余标签转空格，还原 `&nbsp;` / `&amp;` 等实体），再同时跑两种策略，**取条数更多的那个作底，并把另一路多出来的词条并进去**（按小写单词去重）。

| 策略 | 做法 | 擅长的输入 |
| --- | --- | --- |
| A：整篇扫描 | 把全部文本拼成一行，用 `scanNumbered`（`NUMBERED_RE`）找所有行内编号，按编号切块 | 词条用「1. 2. 3.」内联编号、或内容跨段落/表格 |
| B：逐段解析 | 逐行处理；行内有编号则按编号切，否则整行作为候选 | Word 自动编号的列表项（`<li>` 里没有可见序号） |

### 默认模式（`.docx` / `.pdf`）

B 路的单行候选要被收下，必须同时满足：整行 ≤ 80 字符、匹配 `PARSE_LOOSE`（只允许字母/数字/撇号/点/斜杠/连字符/&` 与空格，**不允许括号**），且看起来像词条（含中文，或 ≤2 词且 ≤20 字符，或 ≤4 词且 ≤30 字符）。这是为了在「正文段落」与「词条」之间做取舍。

### `plain` 模式（`.txt`）

纯文本词表**不存在**「这段是正文还是词条」的歧义——一行就是一个词条。因此 `plain: true` 时，去掉行首编号与标点后只要以字母开头就**整行收下**：不限词数、不限长度、允许括号。不放宽会丢掉 `be keen on (doing sth)` 这类短语，并被误计入「未识别」。A/B 的合并规则在两种模式下一致。

### 统计

`parseWordList.lastStats` 记录 `mode`、`markers`、`inlineCount`、`blockCount`、`mergedExtra`、`duplicates`、`rejected`、`unused`，供导入报告与「未识别」清单使用。**已被任一路收下的行不会算作未识别**。

---

## 5. 内置词典与匹配策略

- `defaultWordsData` 目前 **731 条**，字段与数据模型一致（`pos`、英式 IPA 音标、中英释义、近反义词、例句）。多词短语 `pos` 一律 `phrase`。
- 查找由 `getDefaultWordMap()` 提供：以 `word` **小写后的精确字符串**为键，惰性建表。
- 命中就复制词条；未命中则保留原词，其余字段留空、`meaningCn` 置 `'—'`，等待人工补充。
- 词典只用于**导入时**补全，不会写回存储。

### 为什么只做精确匹配

曾评估给匹配加前缀/词干/后缀回退，但它会带来危险的假阳性：

| 输入 | 回退可能命中 | 问题 |
| --- | --- | --- |
| `per` | `permit` | 词形相近、语义无关 |
| `operate` | `opera` | 误命中另一个词 |
| `temper` | `temperature` | 名/动词语义不同 |
| `lately` | `latest` | 拼写相近、词性不同 |
| `sign` | `sign up` | 单词被冠以短语释义 |

因此明确取舍为：**精确匹配 + 更大、更全的词典**。词典不足时补词典，而不是放宽匹配。

### 2026.09.19.2 的补词

「真题 1 校园版.txt」的 91 个词头里只有 8 个在旧词典中，其余 83 个渲染成空卡。补齐这 83 条后词典由 648 增至 731。短语词头**保留源文件拼写**（如 `do sb.a favor`、`be into sth`），因为精确键匹配要求键与原文逐字符一致。

### 联网兜底（2026.09.19.3）

精确匹配的代价是必然有词查不到。为避免这些词永远空着，导入后会自动联网补全 `meaningCn` 为空 / `'—'` 的词：

| 信息 | 来源 | 通道 |
| --- | --- | --- |
| 中文释义、词性 | 有道 `suggest` | JSONP（接口无 CORS 头，但支持 `callback`） |
| 英文释义、近反义词 | Datamuse `api.datamuse.com` | `fetch`（CORS，含 `null` origin） |

设计要点：

- **只补空字段**：内置词典与已填内容优先，联网数据永不覆盖。
- **不阻塞导入**：导入完成 800ms 后后台执行；启动 3s 后对已有词汇本再做一次后台回填（每次上限 `DICT_BACKFILL_MAX = 400` 词）。
- **按词缓存** `vn_dict_cache_v1`（上限 4000、TTL 180 天），二次补全零请求；缓存里已有结果的词在选目标时跳过。
- **只缓存「有应答」的结果**：两个来源都是网络失败时不落缓存，下次仍会重试；拿不到中文的词如实计入 remaining。
- **离线 / 失败降级**：`navigator.onLine === false` 或接口全挂时保持空卡，不弹错误、不影响导入。
- **能力边界**：联网来源只给文字释义，**不提供音标与例句**；这两项仍只有内置词典词条才有。
- 不用数据最全的 `dict.youdao.com/jsonapi`：它既无 CORS 头也不支持 `callback`，浏览器无法直接调用；`fsearch` 是 XML 且带 `Origin` 时 403；`api.dictionaryapi.dev` 在目标网络不可达。


---

## 6. 深色 / 浅色主题

- **深色是默认**；浅色是挂在 `html[data-theme="light"]` 上的 CSS 覆盖块，只覆盖「外壳」颜色（页面背景、容器、标题、搜索框、卡片、按钮等）。单词卡片在两种主题下都保持浅色纸张质感。
- **首帧前必须定好主题**：`<head>` 里一段极小的内联脚本读 `localStorage` 的 `vn_theme_v1`，没有合法值就跟随 `prefers-color-scheme`，然后立刻写 `document.documentElement` 的 `data-theme`。放在 `<head>` 内联执行是为了避免「先闪一下深色再变浅色」。
- **控制器（§2.10）** 维护 `themeFollowsSystem`：用户没手动切换前跟随系统（监听 `matchMedia` 的 `change`）；手动切换后把显式选择写入 `vn_theme_v1`，系统变化不再覆盖。切换即 `toggleTheme` → `applyTheme` → `syncThemeUi`。
- **两个入口**：首页 fab 行的 `#themeFab`，学习页顶栏的 `.theme-toggle`。`syncThemeUi` 同步两者的 `aria-label` / `title`，并按主题把 `<meta name="theme-color">` 在 `#0f1724`（深）与 `#eef4fb`（浅）之间切换。
- **分享页例外**：`buildShareHtml` 生成的是静态快照，不带主题脚本，所以会**移除** `.theme-toggle`，避免留下一个点不动的按钮。下载的应用本体则是完整应用，主题资源照常保留。

---

## 7. 学习页交互与发音

### 卡片

- **正面**：单词、词性、音标、英文释义、中文释义、例句。
- **背面**：近义词与反义词（`renderChips`；为空时显示 `—`）。
- 翻面：点击卡片；键盘 Space / Enter（`#flashcard` 的 `keydown`）。
- 若点击前手指**纵向移动超过 8px**，视为页面滚动，本次点击不翻面——避免滑动时误触发翻面。左右方向键 / 上一张下一张按钮切换卡片，另有随机按钮。
- 点击「`n / total`」计数器可就地输入页码跳转：Enter 确认、Escape 取消、失焦按当前值确认；输入是数字且夹在 `[1, total]` 内。

### 进度

每本书的页码存在 `vn_progress_v1`（`getLastIndex` / `setLastIndex`）。重新打开同一本书自动回到上次位置；删除词汇本时同步清掉它的进度项。

### 发音

- 使用有道接口：`https://dict.youdao.com/dictvoice?audio=<word>&type=1`，`type=1` 为**英式**发音，与词典音标统一。
- **绝不设置** `audio.crossOrigin`：一旦设置会触发 CORS 检查，导致加载失败（代码里有注释锁定这一点）。
- 播放前在首次 `touchstart` 时做一次音频解锁，兼容夸克、微信等对自动播放限制较严的 WebView；播放中 `speakWord` 用 `pronouncing` 标志防重入。

---

## 8. 首页与查询

### 书架卡片

每张卡片三行：标题 / 数量+时间（搜索命中时追加「命中 K 词」）/ 分享+删除按钮。下方是右下角 fab 行（版本号 + 主题 + 检查更新 + 下载）。

几个必须保留的布局结论：

| 结论 | 原因 |
| --- | --- |
| 卡片**不设** `min-height` | 固定/过小的值会裁掉两行标题；过大的值会在按钮下方留大片空白。让内容决定高度 |
| `.book-title` 不加 `min-height`，但加 `margin-bottom: -0.175em` | `line-height: 1.35` 会在文字下留半行距；用等量负外边距抵消，使三行视觉间距都等于卡片的 `gap: 10px` |
| `.book-grid` 保留 `grid-auto-rows: max-content`（`align-items: start`） | 首页网格是**定高滚动容器**。行高为 `auto` 时，带 `overflow: hidden` 的卡片自动最小高度为 0，行被压到只剩 padding，整行卡片重叠（实测行距 −71.8px）；`max-content` 让行始终按内容撑开，超出交给网格滚动 |

### 查询

查询框 `.home-search` 放在 `#bookGrid` **之外**：`renderHome()` 重绘网格时不会丢失输入焦点与光标。匹配大小写不敏感、去首尾空格，满足任一条件即显示：书名包含关键词，或某词条的 `word` / `meaningCn` 包含关键词（`countWordHits`）。空查询显示全部。

| 状态 | 反馈 |
| --- | --- |
| 过滤中 | 计数徽标「匹配 M / 共 N 个词汇本」，命中卡片第二行显示「命中 K 词」 |
| 有查询 | 显示「×」清除按钮；输入框内按 Esc 也可清除 |
| 无结果 | 显示空态与「清除查询」按钮；「还没有词汇本」的原空态不变 |

### fab 行的位置

版本号/检查更新/下载这一行**不是** `position: fixed` 贴视口角落，而是作为首页 flex 流的最后一项 `align-self: flex-end`。原因：贴视口角落时，在窄屏（约 <950px）会真实压住下方居中的 `.home-tip` 文案；进入文档流后任何宽度都不可能重叠，按钮仍是页面右下角位置，只是从「窗口右下角」变成「内容区右下角」。更新提示条插在这一行**上方**，因此出现/消失不会顶动按钮。

---

## 9. 分享

`shareBook(id)` 把一本词汇本打包成一个独立 HTML 文件，通过系统分享发出：

- `buildShareHtml(book)` 克隆学习页视图，**移除返回按钮和 `.theme-toggle`**（静态快照没有主题脚本），内联当前 `<style>` 的全部文本，并把该书的 `WORDS` 序列化进一段脚本。
- 分享内容优先用 `navigator.share` 分享 `File`（当 `navigator.canShare` 支持时），否则退回分享纯文本（`buildShareText`）。
- **系统分享必须在点击的同一任务里同步调用**：异步会丢失用户激活（transient activation），分享框不弹出。
- 文件名由 `safeFileName(book.title)` 生成。

---

## 10. 下载应用本体与更新检查

### 下载：取文两条路径

```
在线（http/https）：页面加载后空闲时 prefetchSelfHtml() 抓 location 原文 → selfHtmlText
file://：浏览器禁止 fetch 自身 → 回退 snapshotSelfHtml()，即脚本执行时的 pristineHtml
点击下载：同步取 selfHtmlText || snapshotSelfHtml() → downloadHtml() 存成 vocabulary-notebook.html
```

- **取用必须同步**：如果在 `fetch` 的 Promise 回调里才触发 `<a download>`，就跨了任务边界、丢失用户激活，Safari 等浏览器会直接拦截下载。因此改为空闲预取、点击时同步取用；未就绪就走快照，两条路径产出功能等价。
- `pristineHtml` 是 §2.9 区块的**第一条语句**抓的 `document.documentElement.outerHTML`，且脚本位于 `</body>` 之前。此刻页面上还没有任何用户数据。

### 为什么是初始原文，而不是「克隆 DOM 再清理」

早期实现克隆当前 DOM，再逐项把运行时状态清回初始态。这套清理漏掉了两处会显示用户数据的地方，实测副本带出了词汇本内容：

| 泄漏点 | 带出的内容 |
| --- | --- |
| `#studyView` 内已渲染的字段 | 单词、音标、中英释义、例句、近反义词 |
| `#confirmText` / `#reportText` | 删除确认框里的词汇本标题；导入报告里的文件名与词条 |

实测：点进过一个词汇本、又打开过删除确认框之后下载，副本里 7 项用户数据全部命中。

逐项补漏只是把下一次遗漏推迟——凡是新加了显示用户数据的元素都会重新泄漏。因此改成抓**脚本执行最早时刻的初始原文**，从根上不可能漏，同时删掉整张清理逻辑，`snapshotSelfHtml()` 退化成「补 DOCTYPE 后原样返回」。

**副本不含词汇本数据**：词汇本只存在浏览器存储里，两条取文路径也都不含用户数据。本地副本的书架因此是空的——这是已确认的取舍。

### 更新检查

| 项 | 自动检查 | 手动检查（图标按钮） |
| --- | --- | --- |
| 触发 | 仅本地副本（`isLocalCopy()`：`file://` 或 origin ≠ `APP_ORIGIN`），首屏后延迟 1.5s | 任何打开方式，用户显式触发 |
| 离线 | `navigator.onLine === false` 时跳过 | 照常发起 |
| 有新版 | 显示提示条 | 提示条 + toast |
| 已最新 | 无反馈 | toast「已是最新版本」 |
| 失败 | 仅 `console.warn` | toast「检查失败，请检查网络后重试」 |
| 已忽略的版本 | 不提示 | 重新提示（主动询问应得到答案） |
| 进行中 | — | 按钮 `disabled` + 图标旋转 |

- 远端版本用 `REMOTE_VERSION_RE` 从线上 `index.html` 文本里读取；`parseVersion` / `compareVersion` 逐段数值比较，**仅当远端高于本地**才提示（本地开发版更新时不会误报）。读不到版本号视为检查失败。请求 8 秒超时（`AbortController`）。
- 一次检查抓到的原文缓存在 `remoteHtmlText`，点「更新」时**直接复用，不重复请求**；缓存意外为空才重新抓。
- 提示条两个动作语义不同：

| 动作 | 行为 |
| --- | --- |
| **更新** | 下载线上最新 HTML（`vocabulary-notebook.html`），toast 说明替换当前文件即可、词汇本数据不会丢失。提示条**只在本次会话隐藏**（内存变量）——旧文件还没被替换，下次打开仍会提示，这是正确的 |
| **×** | 把该版本号写入 `localStorage` 的 `vn_update_ignored_version`，**永久不再提示这个版本**；线上出现更高版本时重新提示 |

「更新」后不做持久忽略，否则「下载了新版却没替换文件」的用户会再也收不到提示。

### 更新不会丢词汇本

更新流程只下载一个文件，不读写任何存储；词汇本存在按 origin 隔离的浏览器存储里，替换 HTML 动不到它。端到端验证会让应用自己存一本书、删掉旧 localStorage 键只留 IndexedDB、触发更新并用新文件替换，再断言书籍完好。**边界**：若改用本地 http 服务打开副本，origin 从 `file://` 变为 `http://localhost:…`，书架会是空的。

---

## 11. 边界与不做的事

### 明确不做

| 不做 | 原因 |
| --- | --- |
| 模糊 / 词干 / 前缀 / 后缀回退匹配 | 会产生 `per→permit`、`operate→opera`、`temper→temperature`、`lately→latest`、`sign→sign up` 这类危险假阳性；取舍是精确匹配 + 更大词典 + 联网兜底 |
| 对未知扩展名做内容嗅探 | 会把 OLE2 的 `.doc` 等二进制误判成文本，产出误导性报错 |
| 支持 `.doc` / `.md` / `.csv` | 目前只需要纯文本词表，等真实需求出现再加 |
| 保留文件内的中文释义 | `.txt` 词表目前没有中文，无从验证；将来遇到「单词 + 释义」格式再单独设计 |
| 给 `<input type="file">` 加 `accept` | 部分移动端 WebView 会因此看不到文件 |
| 压缩词典存储（如数组表启动展开） | 体积收益不值得牺牲可读性；可读词条便于人工增补 |
| 设置 `audio.crossOrigin` | 会触发 CORS 检查导致发音加载失败 |
| 分享页保留主题切换按钮 | 静态快照不带主题脚本，按钮会点不动 |
| Service Worker / 自动覆盖本地文件 | 更新语义是「下载新文件供用户替换」，不静默改写用户磁盘 |
| 把词汇本数据内嵌进下载副本 | 数据属于浏览器存储，不随文件走；内嵌会带来泄漏与体积问题 |
| 引入构建步骤或额外文件（如 `version.json`） | 破坏「单文件、双击即用、离线可用」的核心定位 |
| 用有道 `jsonapi` / `fsearch` / `dictionaryapi.dev` 做兜底 | `jsonapi` 无 CORS 也不支持 JSONP；`fsearch` 是 XML 且带 `Origin` 时 403；`dictionaryapi.dev` 在目标网络不可达。可用的是有道 `suggest`（JSONP）与 Datamuse（CORS） |
| 联网结果覆盖内置词典 | 内置词典是人工校对过的；联网数据只填空字段，永不覆盖 |
| 联网补全提供音标 / 例句 | 现有免费且可跨域的来源不提供，宁缺毋滥；无音标时发音按钮仍可用 |
| 手工补全 UI | 本轮按用户选择只做自动联网兜底；卡片仍不可手工编辑 |

### 需要记住的取舍

- **下载副本书架为空**：数据按 origin 隔离，不随文件走。本地副本务必用 `file://` 打开。
- **更新不碰数据**：更新只下载文件，不读写存储。
- **空卡是正常的**：词典未命中时保留原词、释义为 `—`，不是解析失败；之后由联网兜底尽量补，能补多少算多少。判定「解析是否成功」看导入报告里的解析条数与未识别数，而不是卡片是否有释义。
- **联网兜底只补空字段、且可离线**：内置词典与已填内容优先；离线或接口失败时完全跳过，不阻塞导入。
- **首屏不依赖脚本渲染内容**：主题、首页、学习页都在脚本就绪后立即渲染；分享快照与下载副本都必须能独立打开。

---

## 12. 验证约定与教训

项目是零构建单文件应用，**没有测试框架**。沿用的验证方式是：纯函数用 Node 断言（把函数从 `index.html` 里抽出来喂真实数据），端到端用系统 Chrome + `playwright-core` 真实加载、真实点击、真实下载。脚本放在 `/tmp` 或已忽略的目录，**不进仓库**。

几条踩过的坑，写在代码之外以免重犯：

| 教训 | 说明 |
| --- | --- |
| 子智能体的自检不能当验证 | 生成词典时由多个子智能体各自产出并自检，仍必须用独立校验器逐条核对；自检只是「我以为对了」 |
| 校验器自身的假阳性比漏报更会骗过自己 | 首版校验器误报 8 条、第二版误报 22 条，全是它自己的词形匹配缺陷；直接放宽成「不检查」会连同真正的缺词一起放过 |
| 警惕「假通过」断言 | 曾断言「两个按钮同尺寸」，但检查时首页未渲染、两者都是 `0×0`，`0 === 0` 让断言通过；要等目标真正可见并断言具体尺寸 |
| 测试自身的顺序陷阱 | 持久化断言里的 `page.reload()` 会把页面带回书架视图，紧随其后的「点击卡片翻面」就找不到可见元素；修法是把翻面断言移到刷新之前，而不是放宽成 `force: true` |
| 过滤 console 错误要按 URL | 唯一与改动无关的失败是 `/favicon.ico` 404；用 `consoleMessage.location().url` 只滤掉它，其余 console error 仍算失败 |
| 先量后写 | 纯文本导入先实测现有解析器已 100% 吃下文件，于是只加 `plain` 开关，没有新写解析器 |
