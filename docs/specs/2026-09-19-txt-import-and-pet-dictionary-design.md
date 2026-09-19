# 设计文档：纯文本词表导入 + PET 词典补全

- 日期：2026-09-19
- 状态：已确认，待实现
- 作者：geek-xin

## 一、背景

用户提供了一份 PET 词表 `PET 2.txt`：**GBK 编码、无 BOM、353 行、每行一个纯英文词条**
（含 `have to`、`from around the world` 这类多词短语，`on one’s own` 含弯引号 U+2019）。
期望应用能直接导入这份文本。

现状有三处不满足：

1. 导入入口只认 `.docx` / `.pdf`，`.txt` 在 `fileKind()` 就被判为「不是 .docx / .pdf 文件」；
2. 即便放行，现有链路按 `readArrayBuffer` 读进来直接当 HTML 交给 `parseWordList`，
   没有文本解码环节，GBK 或 UTF-16 文件会解出乱码；
3. 内置词典 298 条与这份词表**只重叠 3 条**（`apart from`、`disappointed`、`attitude`），
   另外 350 条会以「有词无义」的空卡形式出现，导入后无法学习。

本设计解决这三点。不涉及存储结构、不新增存储键。

## 二、范围

| 项 | 结论 |
| --- | --- |
| 新增可导入格式 | `.txt`（纯文本词表） |
| 编码支持 | UTF-8（含 BOM）、UTF-16 LE/BE（含 BOM 与无 BOM 兜底）、GBK |
| 解析方式 | 复用现有 `parseWordList`，仅新增一个「纯文本」宽容开关 |
| 词典 | 内置词典由 298 条增至 **648 条**（新增 350 条，跳过已存在的 3 条） |
| 数据影响 | 无。不改 IndexedDB 结构、不改已存词汇本 |
| 外部依赖 | `.txt` 导入**不需要**任何 CDN 库，离线与 `file://` 下同样可用 |
| 版本号 | `APP_VERSION` 由 `2026.09.18.1` → `2026.09.19.1` |

## 三、交付物一：`.txt` 导入

### 3.1 文件识别

`fileKind(file)` 增加一条：扩展名 `.txt`，或 MIME 为 `text/plain` → 返回 `'txt'`。

`sniffKind(buf)` **不改**，即不对未知扩展名的文件做「内容像不像文本」的嗅探。
理由：老式 `.doc` 是 OLE2 二进制，宽松的文本嗅探会把它误判为文本，最终报出
「解析到 0 个词条」这种误导性结果；宁可让它落到明确的格式错误分支。

未知格式的报错文案由「不是 .docx / .pdf 文件」改为「不是 .docx / .pdf / .txt 文件」。

### 3.2 文本解码（新增 `decodeTextBuffer`）

`.txt` 走的是字节流，必须显式解码。按下列顺序判定，首个成功者胜出：

| 顺序 | 判据 | 处理 |
| --- | --- | --- |
| 1 | BOM `EF BB BF` | 按 UTF-8 解码，剥掉 BOM |
| 2 | BOM `FF FE` | 按 UTF-16LE 解码，剥掉 BOM |
| 3 | BOM `FE FF` | 按 UTF-16BE 解码，剥掉 BOM |
| 4 | 前 4 KB 含 `0x00` 字节 | 按 UTF-16 解码（无 BOM 的 UTF-16 兜底） |
| 5 | 严格 UTF-8（`fatal: true`）可解 | 用 UTF-8 结果 |
| 6 | `TextDecoder('gbk')` 可用 | 用 GBK 结果 |
| 7 | 以上都不行 | 非严格 UTF-8 解码（替换字符兜底，不让导入直接失败） |

第 4 条是必要的：`0x00` 本身是合法 UTF-8，无 BOM 的 UTF-16 文件会「成功地」解出一串
夹着 NUL 的垃圾文本，属于静默出错——比报错更糟。而纯文本词表里出现 NUL 字节没有正当用途。

第 6 条是本设计的关键：`PET 2.txt` 落在这一条上。`TextDecoder('gbk')` 属于
WHATWG Encoding Standard 的必选标签，主流浏览器与移动端 WebView 均支持；
若某个环境确实不支持，则退到第 7 条而非抛错。

### 3.3 解析：复用 + 一个宽容开关

现有 `parseWordList(html)` 已经能正确处理「一行一个纯英文词条」的文本。**实测证据**：
把 `PET 2.txt` 用 GBK 解出后直接送入现有函数，得到 353 行 → **353 条，0 丢失、
0 重复、0 未识别**，走「逐段解析（blocks）」分支。

因此不新写解析器，只加一个可选参数：

```js
function parseWordList(html, opts)
// opts.plain === true 时启用「纯文本词表」语义
```

改动点仅在 B 路（逐段解析）的 else 分支：

| 来源 | 采纳整行的条件 |
| --- | --- |
| `.docx` / `.pdf`（不变） | 含中文，或 ≤2 词且 ≤20 字符，或 ≤4 词且 ≤30 字符；且整行 ≤80 字符；且匹配 `PARSE_LOOSE` |
| `.txt`（新增） | 去掉行首编号与标点后**以字母开头**即整行收下，不限词数、不限长度、不要求匹配 `PARSE_LOOSE` |

放宽的原因是纯文本词表**不存在**「这段是正文还是词条」的歧义——一行就是一个词条。
不放宽则会丢掉 `be keen on (doing sth)` 这类带括号或偏长的短语（现有 `PARSE_LOOSE`
不允许括号），并被计入「未识别」。

A/B 两路的合并规则（`runA.result.length >= runB.result.length` 时取 A）**保持不变**。
该规则恰好覆盖纯文本的两种极端：整份文件只有一行、词条用「1. 2. 3.」内联编号时，
A 路（整篇扫描）条数更多且切分正确；其余情况 B 路条数更多，取 B 路。

`parseWordList.lastStats` 的统计口径不变，导入报告、重复合并、未识别清单自动继续生效。

### 3.4 导入流程接入

`importFiles()` 的三分支由两条变三条：

```js
if (kind === 'pdf')       { /* 不变 */ }
else if (kind === 'docx') { /* 不变 */ }
else if (kind === 'txt')  { parsed = parseWordList(decodeTextBuffer(buf), { plain: true }); }
```

`.txt` 分支不调用 `ensureLib`，因此不需要 mammoth / pdf.js，网络受限时也能导入。

### 3.5 文案

| 位置 | 现状 | 改为 |
| --- | --- | --- |
| 导入按钮 | 导入词汇本（.docx / .pdf） | 导入词汇本（.docx / .pdf / .txt） |
| 空状态提示 | 选择 .docx 或 .pdf 文件（可多选） | 选择 .docx、.pdf 或 .txt 文件（可多选） |
| 格式错误 | 不是 .docx / .pdf 文件 | 不是 .docx / .pdf / .txt 文件 |

`<input type="file">` 的 `accept` 属性**保持不设置**：微信、夸克等 WebView 对 `accept`
的处理差异较大，加上后可能出现「文件在手机里但选择器里看不见」，而现在的无 `accept`
行为配合导入报告已经够用。

## 四、交付物二：PET 词典补全

### 4.1 条目格式

沿用 `defaultWordsData` 现有字段，在数组末尾追加一段带注释的 PET 章节：

```js
const defaultWordsData = [
  /* ...既有 298 条... */

  /* ---- PET 词表补全（2026-09-19，源自 PET 2.txt，共 350 条）---- */
  { word: "postpone", pos: "v.", phonetic: "/pəˈspəʊn/", meaningEn: "to arrange for something to happen at a later time", meaningCn: "推迟；延期", synonyms: ["delay","put off"], antonyms: ["advance"], example: "They postponed the meeting until Friday." },
  /* ... */
];
```

查找逻辑（`getDefaultWordMap`）与卡片渲染**均不改动**：词典以 `word` 的小写形式为键，
新增条目直接进入同一张表。

字段约束：

| 字段 | 约束 |
| --- | --- |
| `word` | 与 `PET 2.txt` 中的原文**逐字符一致**（含弯引号、连字符、大小写、省略号） |
| `pos` | `n.` `v.` `adj.` `adv.` `prep.` `conj.` `pron.` `num.` `int.` `phrase`，可用 `/` 组合；多词短语一律 `phrase` |
| `phonetic` | 英式 IPA，斜杠包裹；多词短语给整个短语的音标 |
| `meaningEn` | 英文，≤12 词，不含中文 |
| `meaningCn` | 中文，多义项用「；」分隔 |
| `synonyms` / `antonyms` | 小写英文，各 0–4 个，可为 `[]` |
| `example` | 英文例句，包含该词条 |

音标统一取英式，与应用播放的英式发音一致。

生成方式：按每批 30 条切成 12 批，由 12 个并行子智能体各自产出一份严格 JSON，
再统一校验并合入 `index.html`。**校验为准入条件**：353 行原文必须 100% 命中且字段非空。

### 4.2 源文件疑似错误的处理

词条 `word` 一律保留源文件原样（否则导入时匹配不上，反而丢释义），释义按正确词给出，
并在中文释义里标注标准写法：

| 源文件 | 处理 |
| --- | --- |
| `wide life` | 疑似 `wildlife` 的拼写错误。`word` 保留 `wide life`，`meaningCn` 写「野生动物（源文件拼写有误，标准写法 wildlife）」 |
| `have ...in common` | 省略号是占位符。`word` 原样保留，释义为「有共同之处」，例句用 `have a lot in common` |
| `load of` | 常见写法 `loads of`。`word` 原样保留，释义「许多；大量」 |
| `albums` | `album` 的复数。`word` 原样保留，释义「专辑（album 的复数）」 |
| `situate` | 常用 `situated`。`word` 原样保留，释义「使位于；使处于」 |
| `give sb. a lift` | `sb.` 为 somebody 缩写，`word` 原样保留 |
| `on one’s own` | 弯引号 U+2019，`word` 逐字符原样保留 |
| `Spanish` | 首字母大写，`word` 原样保留 |

### 4.3 体积

| 项 | 现在 | 之后 |
| --- | --- | --- |
| `index.html` | 约 168 KB | 约 **250 KB** |
| 内置词典 | 298 条 | 648 条 |

不做压缩存储（如数组表 + 启动展开）。单文件、零构建、纯本地的定位下 250 KB 仍然很小，
而可读的词典条目对后续人工增补更重要。

## 五、不做的事

| 不做 | 原因 |
| --- | --- |
| 内容嗅探未知扩展名 | 会把二进制误判成文本，产出误导性报错 |
| 支持 `.doc` / `.md` / `.csv` | 本轮只需要纯文本词表，等真出现再加 |
| 保留文件内的中文释义 | 本轮 `PET 2.txt` 没有任何中文，无从验证；将来遇到「单词 + 释义」格式的文本再单独设计 |
| 给 `<input>` 加 `accept` | 部分移动端 WebView 会因此看不到文件 |
| 压缩词典存储 | 体积收益不值得牺牲可读性 |
| 改写 docx / pdf 解析路径 | 本轮不碰，靠回归验证保证未被破坏 |

## 六、验证

仓库没有测试框架，沿用既有做法：纯函数用 node 断言，端到端用系统 Chrome + `playwright-core`，
脚本放在 `/tmp/vn-verify/`（**不进仓库**）。

### 6.1 纯函数校验

把 `index.html` 里的 `defaultWordsData`、`decodeTextBuffer`、`parseWordList` 抽出到临时
harness（`new Function` 或 `sed` 截取行区间），对真实 `PET 2.txt` 断言：

1. `decodeTextBuffer` 对 GBK 字节解出含 `on one’s own`（弯引号）的文本，无替换字符；
2. `parseWordList(text, {plain:true})` 返回 **353 条**，`lastStats` 的
   `duplicates/rejected/unused` 全为 0；
3. 353 条**每条**的 `pos`、`phonetic`、`meaningEn`、`meaningCn`、`example` 均非空，
   且 `meaningCn ≠ '—'`；
4. 构造用例确认第 4 条编码分支：UTF-16LE 无 BOM 字节序列能解出正常文本；
5. 回归：`parseWordList(html)` 在**不带** `plain` 时行为不变（用一段含中英对照的
   模拟 docx HTML 断言条数与释义取用不受影响）。

### 6.2 端到端（真实浏览器）

用 `page.setInputFiles('#importFile', '.../PET 2.txt')` 走完整导入路径，断言：

1. 书架出现 1 个词汇本，标题为 `PET 2`；
2. 卡片总数 353，第 1 张正面为 `postpone` 且中文释义非「—」；
3. 卡片翻面后例句非「—」，同义词/反义词区域按数据渲染；
4. 页面无 `pageerror`；
5. 回归：导入一份 `.docx` 仍得到词汇本（走 lib 分支），未被 txt 分支影响。

## 七、交付物清单

| 文件 | 改动 |
| --- | --- |
| `index.html` | `.txt` 识别与解码、`parseWordList` 的 `plain` 开关、350 条词典、文案、版本号 |
| `README.md` | 内置词典 298 → 648 词；导入格式补 `.txt` |
| `docs/specs/2026-09-19-txt-import-and-pet-dictionary-design.md` | 本文档 |
| `docs/plans/2026-09-19-txt-import-and-pet-dictionary.md` | 实施计划与执行记录 |
