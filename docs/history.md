# 版本历史

版本号对应 `index.html` 里的 `APP_VERSION`，格式 `YYYY.MM.DD.N`，按发版时间倒序（最新在上）。
每条写清：改了什么、为什么、如何验证。

> 本文件在 2026.10.01 重写：此前记录里大量内容属于**内置词典时代**（731 词、联网兜底、精确匹配策略），
> 与当前「全在线词典」的实现矛盾，故整体清除后从当前版本重新记录。

---

## 2026.10.01.3 —— 修分享页遗漏与 CI 版本号兜底

本轮没有新功能，只修了两处**真实缺陷**，都是前几轮改动留下的尾巴。

### 1. 分享出去的卡片挂着永远显示「—」的例句区块

2026.10.01.1 把例句区块改成「无值时整块隐藏」，但当时**只改了主应用的 `renderWord`**，
没改 `buildShareScript` 里那份独立的渲染脚本。

后果：分享出去的文件（`buildShareHtml` 克隆 `studyView`，带着 `frontExampleBox`）每张卡都显示
一个空的「例句 —」区块，与主应用表现不一致。

修复：给分享页的 `render` 补上同样的隐藏逻辑。已用 iframe 真实渲染分享页验证。

### 2. CI 版本号兜底会构建出对不上的版本

手动触发 `workflow_dispatch` 且不填版本号时，兜底逻辑读的是 `package.json` 的 `version`。
但 npm 的 semver 规定只能有三段，`set-version.mjs` 写入 `2026.10.01.2` 时实际落盘为 `2026.10.1` ——
于是会构建出与 `APP_VERSION` 对不上的包，而 `APP_VERSION` 恰恰是应用判断新旧的唯一依据。

修复：兜底改为直接读 `index.html` 的 `APP_VERSION`（版本号的唯一事实来源）；
并在 `set-version.mjs` 里注明 `package.json` 的 version 只是构建工具链元数据。

### 验证

| 项目 | 结果 |
| --- | --- |
| 分享页自包含性 | 45 KB、0 个外部 `script`/`link` 引用、内嵌词条与音标 |
| 分享页真实渲染（iframe） | 单词、音标、释义、计数正确，点击可翻转 |
| 分享页例句隐藏 | `frontExampleBox.hidden === true`、`backExample.hidden === true` |
| CI 兜底逻辑 | 实测读出正确版本，`versionCode` 计算正确 |
| 死代码排查 | 80 个顶格函数全部有引用 |

### 一次差点造成损失的操作（记录备查）

改分享页时用「整体读出 → 改字符串 → 整体写回」的方式编辑 `index.html`，
但 `read` 默认只返回前 2000 行，而文件已有 4200 行 —— 写回时把后 2200 行**截断了**。
`git checkout -- index.html` 完整恢复（与 HEAD 无差异），随后改用定点替换完成修改。

教训：**大文件不要用「读全文再写回」的方式改**，一律用定点替换；
真要整体处理，也必须先确认读到的行数与文件实际行数一致。

---


## 2026.10.01.1 —— 移除内置词典，释义全部改为在线

### 背景

内置词典 731 条、183.7 KB，占 `index.html` 的 55%。两个长期问题：

1. **覆盖率永远不够**：任何真实词表都会大量未命中（「真题 1 校园版」91 词只命中 8 个），
   于是又叠了一层联网兜底 —— 两套来源、两套优先级，复杂度翻倍。
2. **维护成本高**：为补词要手工校对音标、释义、例句，词典越补越大，命中率提升却有限。

### 改动

- 删除 `defaultWordsData`（731 条）与 `getDefaultWordMap()`；`index.html` **330 KB → 152 KB**。
- 导入路径只剩一条：提取词条 → 一律建空卡 → 后台在线补全。不再有「命中/未命中」分支。
- 音标改由 Datamuse 提供，新增 `arpabetToIpa()` 做 ARPAbet → IPA 转换。
- 例句区块在无值时整块隐藏（`frontExampleBox` / `backExample`）。
- 清空静态 HTML 里写死的 `price` / `/praɪs/` 占位内容。

### 音标转换：重音符号的位置

映射是一对一的，真正的坑在**重音符号放哪**。它属于整个音节，要放在**音节首**：
直接放在元音前会得到 `/prˈaɪs/`，正确的是 `/ˈpraɪs/`。

按「最大音节首」原则（`onsetOf()` + 合法辅音簇表）把元音之间的辅音簇切给下一音节，
再把符号放到该音节开头。词首辅音簇整体归本音节，因为英语没有以 `/str/` 这类三辅音结尾的音节。

实现中实际踩到并修掉的两个问题：

1. `onsetOf([])` 返回 1 而非 0，元音相邻时符号错位（`career` 得到 `/kˈəɪr/`）。
2. `ER` 最初按英式处理，与 Datamuse 的**美式**发音不符；改为卷舌音后
   `career` → `/kərˈɪr/`、`furniture` → `/ˈfɜːrnɪtʃər/` 才正确。

### 顺带修掉一个真实 bug

`enrichWords()` 原先把「缓存里有新鲜结果」当成「无需处理」直接 `continue`，
**从不把缓存写进词条**。后果：同一个词第二次导入（或换个词汇本导入）时，
缓存明明有数据，卡片却永远空着。

内置词典时代这个问题被掩盖（多数词命中词典、不走联网路径），去掉词典后会让大量卡片无故空白。
现在命中缓存会直接 `applyOnlineEntry()` 填卡 —— 缓存只省网络请求，不省「写入」这一步。

### 能力边界

- **没有例句来源**：可跨域的免费接口都不提供；有道 `jsonapi` 有例句但无 CORS 且加 `callback` 返回 403。
- **音标是美式近似值**，机械转换、未经人工校对。
- **关闭联网开关后没有本地兜底**，所有卡片都会是空的。

### 验证

| 场景 | 结果 |
| --- | --- |
| `lookupYoudao("price")` | 词性 `n./v.`、中文释义正常 |
| `lookupDatamuse("price")` | 英文释义 + 4 个近义词 + 音标 `/ˈpraɪs/` |
| `lookupOnline("serendipity")` | 中英释义齐全、音标 `/sɛrənˈdɪpɪtiː/` |
| 导入 3 词并补全 | 空卡 → 全部填上 |
| 缓存命中 | 第二次导入同一词由缓存填充（修复前为空） |
| 关闭联网后导入 | 导入成功、卡片保持空、不抛错 |
| 线上站点实测 | 导入 `price` / `serendipity` 全部补全，0 console 报错 |

音标转换另用 12 个真实 ARPAbet 串做离线断言（price / serendipity / successful / theatre /
reduce / career / furniture / competition / countryside / instruction / describe / special），
以及空输入与未知音素两个边界，全部符合预期。

---

## 2026.09.30.1 —— 多端交付：PWA + iOS / Android / HarmonyOS + Release 自动更新

### 背景

应用此前只有一种分发形态：浏览器访问线上页面，或把 `index.html` 下载成单文件离线用。
新增需求是支持 iOS / Android / 鸿蒙原生安装包，并把编译产物发布到 GitHub Release，
同时让程序能自动检查更新。

关键约束：**产品本体的单文件、零构建形态不能破坏**。因此所有原生端都做成「壳」——
原生工程只承载同一个 `index.html`，不复制业务逻辑。

### 方案：一份本体，四种壳

| 形态 | 承载方式 | 产物 |
| --- | --- | --- |
| Web / PWA | 浏览器 + manifest + Service Worker | GitHub Pages（沿用 legacy 构建） |
| Android | Capacitor 8 壳（`androidScheme: https`） | `*-android.apk` |
| iOS | Capacitor 8 壳（SPM） | `*-ios-unsigned.ipa` |
| HarmonyOS NEXT | ArkTS `Web` 组件加载 `$rawfile(index.html)` | `*-harmony-unsigned.hap` |

旧版鸿蒙（HarmonyOS 4 及以前）兼容 Android APK，直接复用 Android 产物，不额外维护工程。

**派生而非复制**：`www/`（Capacitor webDir）与 `harmony/**/rawfile/index.html` 都由脚本从根
`index.html` 生成并 gitignore。仓库里永远只有一份应用本体，不存在「两份 HTML 漂移」。

### 更新通道：两条，Release 优先

1. **首选** GitHub Releases API，读 `tag_name` 与 `assets`；
2. **回退** 抓线上 `index.html` 读 `APP_VERSION`。

必须回退的场景：未认证限流（403）、仓库尚无 Release（404）、离线、8 秒超时。
回退再失败时，只有**手动**检查才提示失败，自动检查全程静默。

自动检查的覆盖面是关键决策点：`isLocalCopy()` 在原生壳内返回 `false`（壳确实不是「本地副本」），
若直接沿用它做门槛，**壳内会永远收不到更新提示** —— 而壳正是移动端的主要分发形态。
因此单独引入 `shouldAutoCheck() { return isNativeShell() || isLocalCopy(); }`，
线上 Web 端仍然跳过（那里由 Service Worker 负责更新）。

壳内的忽略策略也不同：**不落盘** `APP_IGNORED_KEY`，忽略只对当次会话生效。
理由是壳内用户既不能刷新页面也不能替换文件，提示条是唯一的更新入口；
持久化忽略会让用户随手一关就永久失联。

### 发版：打 tag 即发布

`node scripts/set-version.mjs <版本>` 一处写入五处（`index.html` / `package.json` /
Android `build.gradle` / iOS `pbxproj` / 鸿蒙 `app.json5`），随后打 tag 触发
`.github/workflows/release.yml`：并行构建三端 + 汇总 Web 产物 → 发布同一个 Release。
CI 会校验 `APP_VERSION` 与 tag 一致，不一致直接失败。

### 踩过的坑

- **`.gitignore` 行尾注释不生效**：`www/   # 说明` 会被当成含空格和 `#` 的模式，导致 `www/` 根本没被忽略。改为注释单独成行。
- **`sdkmanager` 的缓存路径**：它把缓存写 `~/.android/cache`，在受限沙箱下写不进去，报出的却是
  「Failed to download any source lists / IO exception while downloading manifest」这种指向网络的假故障。
  必须显式设 `ANDROID_USER_HOME`；Gradle 同理需要 `GRADLE_USER_HOME`。
- **JSON5 引号键**：鸿蒙 `app.json5` 里是 `"versionCode": 1`（键带引号），最初的正则匹配不到，
  发版时会**静默失配**。已改为容忍两种写法。
- **`@capacitor/assets` 拖入 sharp**：安装时要下载 libvips 二进制，超时即整包失败。
  图标改用 Python + Pillow 生成（`scripts/gen-icons.py`），去掉该依赖。
- **manifest 文件名**：`manifest.webmanifest` 在 legacy Pages 上的 MIME 没有保证，统一用 `manifest.json`。
  但 `scripts/sync-web.mjs` 的 `ENTRIES` 与 `release.yml` 的资源校验一度没跟着改，导致 manifest 没进 Android 包 ——
  这类「两处清单」是跨模块集成的典型漏点。
- **bash 八进制陷阱**：`$(( 2026 * 10000 + 09 * 100 + 30 ))` 里的 `09` 让 bash 直接报
  `value too great for base`，首次发版 meta job 秒挂。加 `10#` 前缀强制十进制。
- **`android-actions/setup-android@v3` 失效**：在当前 ubuntu 镜像上判定预装 sdkmanager「版本不对」，
  转去装已下架的 `tools` 包并失败。runner 本就预装 Android SDK，改用其自带 sdkmanager 补齐组件。
- **鸿蒙 `hvigor-config.json5` 格式**：`hvigorVersion` 是 DevEco 4.x 的写法，API 12 要求 `modelVersion`，
  且 `hvigor/hvigor-config.json5` 与工程级 `oh-package.json5` 两处必须**完全相等**。

### 验证

| 项目 | 方式 | 结果 |
| --- | --- | --- |
| 内联 JS 语法 | `node scripts/check-inline-js.mjs` | 2 个内联脚本通过 |
| Service Worker 行为 | `node scripts/test-sw.mjs` | 22 项断言全过 |
| PWA 装配 | 本地 http + 真实浏览器 | manifest 被解析、SW `activated`、8 个外壳资源入缓存、离线可开 |
| Android APK | 本机 `./gradlew assembleDebug` / `assembleRelease` | BUILD SUCCESSFUL；`aapt2` 实测包名/版本/权限/label 正确 |
| iOS 未签名 ipa | CI macos runner 真实编译 | 463 KB |
| HarmonyOS HAP | CI + 华为命令行工具真实编译 | 215 KB |
| Release 流程 | 打 tag 真实触发 | 四端产物全部发布 |
| 应用内自动检查更新 | 真实旧副本 + 线上 Release | 弹提示条并下载到新版本 |

### 已知边界

- **各端数据互相独立**：按 origin 划分的本地存储，网页版 / 单文件 / Android / iOS / 鸿蒙各一份，互不同步。
- iOS 与鸿蒙产物**均未签名**，仓库不保存任何证书；需用户自行签名后才能装机。
- 真机安装与运行时行为（WebView 加载、发音、联网补全）**未验证**，本机无设备也无 Xcode / DevEco。
  iOS 与鸿蒙的「可编译」结论来自 CI 真实构建，不是本地静态检查。

---

## 2026.09.19.3 —— 联网词典兜底（已随 2026.10.01.1 移除）

> ⚠️ 本条描述的内置词典与联网兜底双层结构**已在 2026.10.01.1 整体移除**，
> 仅作为历史记录保留，不代表当前实现。当前实现见 [design.md](design.md) §5。

内置词典只有 731 条，任意词表都会遇到「没收录」的词，而这些卡片此前只能永远空着。
用户选择「直接联网、无需触发」，于是做成导入后自动补全：

| 需要的信息 | 来源 | 通道 |
| --- | --- | --- |
| 中文释义 + 词性 | 有道 `suggest` | JSONP |
| 英文释义 + 近反义词 | Datamuse | `fetch`（CORS） |

- 只处理 `meaningCn` 为空 / `'—'` 的词；只填空白字段，绝不覆盖内置词典已有内容。
- 导入完成后延迟 800ms 后台执行，不阻塞导入；启动 3s 后对已有词汇本再做一次后台回填。
- 结果按词缓存（`vn_dict_cache_v1`，上限 4000、TTL 180 天）。
- **只有至少一个来源正常应答才写缓存**；纯网络失败不缓存，下次仍会重试。
- 联网来源**不提供音标与例句**，这两项当时只有内置词典词条才有。

### 验证

| 场景 | 结果 |
| --- | --- |
| 导入 6 个内置词典没有的词 | 6/6 补出中文释义，6/6 有英文释义，4/6 有近义词，0 console 报错 |
| 导入 91 词「真题 1 校园版」 | 91/91 命中内置词典，0 次联网缓存写入（纯 no-op） |
| 断网导入 | 保持空卡，不弹错误，导入正常完成 |

---

## 2026.09.19.2 —— 补齐 PET 词典与深浅色主题

> ⚠️ 本条涉及的**内置词典已在 2026.10.01.1 移除**；深浅色主题仍然有效。

- **深浅色主题**：一键切换，没手动选过时跟随系统；首帧由 `<head>` 内联脚本写入 `data-theme` 避免闪烁。
  切换时同步更新 `<meta name="theme-color">`。
- **PET 词典补全**：内置词典 `298 → 648`（新增 350 条），词头逐字符保留源文件拼写
  （含弯引号 U+2019、大小写、省略号等）。

### 验证

| 场景 | 结果 |
| --- | --- |
| 深浅色切换与持久化 | 手动选择后刷新保持；未选择时跟随系统 |
| 词典条目数 | 298 → 648，无重复词头 |

---

## 2026.09.19.1 —— 纯文本词表导入 + 真题词典补全

### 背景

「真题 1 校园版.txt」共 91 行，旧版解析器只提取出少数几条，大量词条丢失。

### 诊断

先排查解析器，用一个纯函数化的校验脚本逐行核对，确认**解析器把 91 行完整、干净地全部提取出来了**。
真正的原因是词典覆盖：648 条的内置词典里这 91 个词头只命中 8 个
（`complaint`、`software`、`immediately`、`prevent`、`be likely to`、`depend on`、`reply`、`despite`），
其余 **83 个词头没有词条**，于是渲染成「只有单词、没有释义和近反义词」的空卡。

> 这个结论直接引出了后来的两条演进：先补词典（2026.09.19.2），再彻底改为在线查询（2026.10.01.1）。

### 改动

- 新增 `.txt` 纯文本词表导入，`decodeTextBuffer` 自动识别 UTF-8 / BOM / UTF-16 / **GBK**。
- `parseWordList` 增加 `plain` 模式：一行即一个词条，不走编号切分。
- 补齐 83 条真题词头。

### 验证

| 场景 | 结果 |
| --- | --- |
| 「真题 1 校园版.txt」导入 | 91/91 词条全部提取 |
| GBK 编码的 .txt | 正确解码，无乱码 |
| UTF-8 BOM / UTF-16 | 正确识别 |

---

## 2026.09.18.1 —— 本地副本、版本号与更新检查

### 背景

应用以单文件分发后，用户手上的副本无法感知线上新版本，也没有便捷的更新途径。

### 改动

- 首页右下角常驻版本号，新增「检查更新」与「下载」两个按钮。
- **下载**取应用本体（不含词汇本数据）存成 `vocabulary-notebook.html`。
- **检查更新**抓线上 `index.html` 正则读 `APP_VERSION` 比对。
- 本地副本打开时自动静默检查一次，失败不打扰；发现新版本在按钮上方提示并支持一键更新。

### 关键修复：副本不再携带词汇本内容

最初用「克隆 DOM 再清理」生成副本，会把已渲染的词汇本卡片带进去。
改为取**脚本执行时的 DOM 原文**（`pristineHtml`）—— 那一刻还没有任何用户数据进入页面，
副本天然干净，无需逐项清理。

### 验证

| 场景 | 结果 |
| --- | --- |
| 下载副本后打开 | 书架为空，不含原站词汇本 |
| 线上有新版本时打开本地副本 | 提示条出现，点「更新」下载到新版本 |
| 离线打开本地副本 | 静默失败，不打扰 |
