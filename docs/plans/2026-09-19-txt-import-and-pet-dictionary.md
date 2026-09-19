# 纯文本词表导入 + PET 词典补全 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让词汇本能导入 `.txt` 纯文本词表（一行一个词条，自动识别 GBK 等编码），并把用户提供的
`PET 2.txt` 里 350 个内置词典没有的词条补全为中英释义完整的卡片。

**Architecture:** 全部改动落在单文件 `index.html` 内。导入链路不动结构，只加一段解码函数
（`decodeTextBuffer`）和 `parseWordList` 的一个 `plain` 开关；词典是纯数据追加，查找与渲染零改动。

**Tech Stack:** 原生 HTML / CSS / JavaScript（无框架、无构建、无依赖安装）；验证用 node 纯函数断言 +
系统 Chrome + `playwright-core`。

---

## 关于「测试」的说明

本项目是**零构建单文件应用，没有测试框架**。因此本计划里的「测试」= 两类脚本：

1. `node` 纯函数断言：从 `index.html` 里按函数名字符串抽出 `decodeTextBuffer` / `parseWordList`
   等纯函数，用真实文件字节喂进去断言（脚本 `.tmp/verify-functions.js`，**不进仓库**）；
2. `/tmp/vn-verify/*.mjs`（**不进仓库**）的 Playwright 脚本，用系统 Chrome 真实加载页面、
   真实选文件、真实点击，然后断言结果。

设计文档：`docs/specs/2026-09-19-txt-import-and-pet-dictionary-design.md`

工作区根目录（下称 `$WS`）：`/Users/xin/Documents/AI-Worksplace/vocabulary-notebook`

## 文件结构

| 文件 | 职责 | 改动 |
| --- | --- | --- |
| `index.html` | 应用本体，本次全部功能与数据 | 修改：`fileKind`、新增解码函数、导入分支、`parseWordList` 开关、词典 +350 条、三处文案、`APP_VERSION` |
| `README.md` | 用户文档 | 修改：特性表「298 词」→「648 词」、导入格式补 `.txt`、新增 `.txt` 编码说明 |
| `docs/specs/2026-09-19-txt-import-and-pet-dictionary-design.md` | 设计文档 | 新建 |
| `docs/plans/2026-09-19-txt-import-and-pet-dictionary.md` | 本文件 | 新建 |
| `.tmp/verify-functions.js`、`/tmp/vn-verify/*.mjs` | 验证脚本 | 新建，**不进仓库** |

不拆文件：`index.html` 从 168 KB 增至 257 KB，仍远小于「拆出去就会失去双击即用」的代价。

---

## Task 1: 让 `.txt` 走得进解析器

**Files:** 修改 `index.html`（`fileKind`、`importFiles` 三分类、新增 `decodeTextBuffer`）

- [x] **Step 1: 先确认现有解析器能不能吃纯文本（决定要不要写新解析器）**

  用 `iconv -f GBK` 把 `PET 2.txt` 解成 UTF-8，抽出 `parseWordList` 跑一遍。
  Expected：353 行 → 353 条，`duplicates/rejected/unused` 全为 0。
  实测：**通过**，走「逐段解析（blocks）」分支。→ 结论：不写新解析器。

- [x] **Step 2: `fileKind` 认 `.txt`**

  扩展名 `.txt` 或 MIME `text/plain` → `'txt'`。`sniffKind` 不动（不做内容嗅探，避免 `.doc` 被误判）。

- [x] **Step 3: 新增 `decodeTextBuffer` + `decodeWith` + `hasNulByte`**

  顺序：BOM（UTF-8 / UTF-16LE / UTF-16BE）→ 含 NUL 字节按 UTF-16 兜底 → 严格 UTF-8 → GBK → 非严格 UTF-8。

- [x] **Step 4: `importFiles` 增加 txt 分支**

  `parsed = parseWordList(decodeTextBuffer(buf), { plain: true })`，不调用 `ensureLib`（离线可用）。
  错误文案改为「不是 .docx / .pdf / .txt 文件」。

- [x] **Step 5: 书名去掉扩展名**

  `file.name.replace(/\.(docx|pdf)$/i,'')` → 加 `txt`，否则词汇本会叫 `PET 2.txt`。

## Task 2: `parseWordList` 的 pure-text 宽容分支

**Files:** 修改 `index.html`（`parseWordList`）

- [x] **Step 1: 加 `opts.plain` 参数**

  仅改 B 路 else 分支：`plain` 时去掉行首编号/标点后以字母开头即整行收下，不限词数、不限长度、
  不要求匹配 `PARSE_LOOSE`。A/B 两路合并规则不动。

- [x] **Step 2: 断言宽容分支真的生效且不误伤 docx**

  `be keen on (doing sth)` 在 `plain` 下收下、在默认模式下仍被拒；docx 模拟 HTML 行为不变。

## Task 3: 生成并合入 350 条 PET 词典

**Files:** 修改 `index.html`（`defaultWordsData` 末尾）

- [x] **Step 1: 切批**

  353 行原文去掉已存在的 3 条（`apart from`、`disappointed`、`attitude`）→ 350 条，切 12 批（每批 30，
  末批 20），写成 `.tmp/pet-dict/in-NN.json`，并把 8 个例外词的说明放进 `notes`。

- [x] **Step 2: 12 个并行子智能体各产出一份严格 JSON**

  字段与现有条目一致；`word` 必须与输入逐字符一致（含弯引号 U+2019、省略号、大小写）。

- [x] **Step 3: 独立校验（不复用子智能体的自检）**

  逐条核对：条数、词序、字段非空、`pos` 白名单、音标斜杠包裹、`meaningEn` 无中文且 ≤12 词、
  `meaningCn` 含中文、`synonyms/antonyms` ≤4 且小写、例句含该词、无重键、与既有 298 条不冲突。

- [x] **Step 4: 合入**

  在 `defaultWordsData` 末尾加注释小节 + 350 行，末行不加逗号（与既有风格一致）。
  Expected：`index.html` 168 KB → 257 KB，词典 298 → 648 条。

## Task 4: 文案与版本号

- [x] 按钮「导入词汇本（.docx / .pdf）」→ 加 `/ .txt`
- [x] 空状态提示同步
- [x] §7 区块头注释同步
- [x] `APP_VERSION` → `2026.09.19.1`

## Task 5: README

- [x] 特性表「内置 **298 词**」→「内置 **648 词**」；「文档导入」行补 `.txt`
- [x] 「导入词表」补 `.txt` 说明（一行一个词条、自动识别 GBK、无需联网）

---

## 执行记录

### 验证结果

**纯函数断言（22 项，全通过）** —— `.tmp/verify-functions.js`

| 断言 | 结果 |
| --- | --- |
| 词典 648 条、无重复键 | PASS |
| GBK 字节直接解码无替换字符、保留弯引号 U+2019 | PASS |
| 解码出 353 行 | PASS |
| `plain` 解析 353 条，重复/拒绝/未识别均为 0 | PASS |
| 每行原文都被收录 | PASS |
| 353 条全部有音标/词性/中英释义/例句 | PASS |
| 353 条音标均以斜杠包裹、中文释义均含中文 | PASS |
| 无 BOM 的 UTF-16LE 正确解码 | PASS |
| UTF-8 BOM 被剥离 | PASS |
| docx 路径回归：条数、命中词典、未命中留空释义不变 | PASS |
| 新增 PET 词条在 docx 路径同样命中 | PASS |
| `plain` 收下带括号短语、默认模式仍拒绝 | PASS |
| 单行内联编号仍能切分 | PASS |

**端到端（`file://` 与 `http://` 各 15 项，全通过）** —— `/tmp/vn-verify/e2e.mjs`

两条路径都断言：版本号 `v2026.09.19.1`、导入后书架 1 个词汇本且标题为 `PET 2`、卡片总数
`1 / 353`、首张卡 `postpone` 且有音标/中文释义/例句、同义词标签已渲染、点击可翻面、无页面报错；
`http://` 额外断言刷新后词汇本仍在；两条路径随后都导入一份手工构造的 `.docx`（Python `zipfile`
拼 `[Content_Types].xml` + `_rels/.rels` + `word/document.xml`），断言变成 2 个词汇本、
docx 解析出 3 个词条且命中内置词典 —— 即 CDN 解析库分支未被 txt 分支破坏。

### 四个关键发现

**1. 现有解析器实测已经 100% 吃下这份纯文本，所以没有新写解析器。** 这是先量后写的收益：
设计里原本准备的「txt 专用解析器」被一条实测数据否掉了，最终只加了 `plain` 开关（4 行）。
反过来说，`plain` 开关也不是多余的：默认模式要求整行 ≤80 字符且匹配 `PARSE_LOOSE`（不允许括号），
`be keen on (doing sth)` 这类词表行会被丢掉。

**2. 子智能体的自检不能当验证，而校验器自身的假阳性比漏报更容易骗过自己。** 自己重写校验脚本后，
第一版误报 8 条、第二版误报 22 条 —— 全是校验器自己的词形匹配缺陷（`be popular with` 的例句写
`is popular with`、`postpone` 的例句写 `postponed`、`enjoy oneself` 写 `enjoy yourself`）。
改成「前缀模糊匹配实词 + 虚词黑名单 + `wide life→wildlife` 白名单」后为 0 问题。
如果当时直接放宽成「不检查」，就会连同真正的缺词一起放过去。

**3. E2E 里唯一的失败是 `/favicon.ico` 404，与本次改动无关，但要按 URL 精确过滤。** 仓库里本就没有
favicon，用 Python 的 `http.server` 起站必然 404。没有笼统地忽略所有 console error，而是用
`consoleMessage.location().url` 只滤掉 favicon，其余 console error 仍然算失败 —— 否则这条断言就废了。

**4. 测试自身的顺序陷阱。** 持久化断言里的 `page.reload()` 会把页面带回书架视图，紧随其后的
「点击卡片翻面」就找不到可见元素（`#flashcard` 存在但 `display:none`）。修法是把翻面断言移到刷新
之前，而不是放宽成 `force: true` —— 后者会让「卡片可见性」这一层彻底失去覆盖。

### 例外词处理结果

| 源文件 | 词典键 | 中文释义 |
| --- | --- | --- |
| `wide life` | `wide life`（原样） | 野生动物（源文件拼写有误，标准写法 wildlife） |
| `have ...in common` | 原样 | 有共同之处 |
| `load of` | 原样 | 许多；大量 |
| `albums` | 原样 | 专辑（album 的复数） |
| `situate` | 原样 | 使位于；使处于 |
| `give sb. a lift` | 原样 | 开车捎某人一程 |
| `on one’s own` | 原样（U+2019） | 独自；靠自己 |
| `Spanish` | 原样（首字母大写） | 西班牙的；西班牙语 |

### 遗留

- 不做未知扩展名的内容嗅探、不支持 `.doc` / `.md` / `.csv`、不给 `<input>` 加 `accept`、
  不压缩词典存储 —— 理由见设计文档「五、不做的事」。
- 本轮未保留文件内的中文释义（`PET 2.txt` 没有中文，无从验证）。
