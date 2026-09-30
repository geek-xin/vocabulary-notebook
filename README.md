# 词汇本 · 多词库学习

> 一个**单文件、零构建**的英语词汇学习应用。导入 `.docx` / `.pdf` / `.txt` 词表，自动联网补全释义，卡片式记忆；数据只存在本机。

在线使用：**https://geek-xin.github.io/vocabulary-notebook/**

最新版本：[v2026.10.01.2](https://github.com/geek-xin/vocabulary-notebook/releases/latest)

支持 **Web / PWA**、**Android**、**iOS**、**HarmonyOS**（旧版鸿蒙 + NEXT）四种形态，安装包由 GitHub Actions 自动构建并发布到 [Releases](https://github.com/geek-xin/vocabulary-notebook/releases)。应用启动时会**自动检查更新**。

| 形态 | 获取方式 |
| --- | --- |
| Web / PWA | 打开上面的网址；手机浏览器「添加到主屏幕」即可当 App 用 |
| Android | [Releases](https://github.com/geek-xin/vocabulary-notebook/releases) 下载 `*-android.apk`，允许安装未知来源后安装 |
| 旧版鸿蒙（HarmonyOS 4 及以前） | 同上，直接安装 Android APK |
| iOS | Releases 下载 `*-ios-unsigned.ipa`，用 Xcode / AltStore / Sideloadly **自行签名**后安装 |
| HarmonyOS NEXT | Releases 下载 `*-harmony-unsigned.hap`，需在 DevEco Studio 配置签名后安装 |

> **各端数据相互独立。** 词汇本存在浏览器/WebView 的本地存储里，按来源隔离：网页版、下载的单文件、Android 包、iOS 包、鸿蒙包各有一份数据，互不同步。升级安装包不会丢数据，但换端需要自行导出。详见 [docs/multi-platform.md](docs/multi-platform.md)。

---

## 特性

| 特性 | 说明 |
| --- | --- |
| 多词库书架 | 每个导入的文件生成一个独立词汇本，卡片网格展示，支持删除、分享 |
| 卡片式学习 | 点击卡片翻面查看释义；左右方向键切换上一张 / 下一张；点击页码可跳转 |
| 全在线释义 | **不内置词库**，从文档提取英文词条后全部联网补全音标、词性、中英释义与近反义词 |
| 离线不阻塞 | 没网或接口失败时保持空卡，导入照常完成；下次联网自动回填 |
| 深浅色主题 | 一键切换深色 / 浅色外观；没手动选过时跟随系统，选过就记住 |
| 文档导入 | 支持 `.docx`（mammoth）、`.pdf`（pdf.js）与 `.txt` 纯文本词表，可一次多选批量导入；`.txt` 自动识别 GBK 等编码且无需联网 |
| 英式发音 | 接入有道发音接口，点击喇叭播放英式读音 |
| 学习进度 | 每个词汇本独立记忆上次阅读到的页码，重新打开自动回到原位 |
| 页码跳转 | 点击计数器直接输入页码跳转 |
| 纯本地存储 | 词汇本数据只保存在你的浏览器里，不上传任何服务器 |
| 可安装 PWA | 带 manifest 与 Service Worker，可「添加到主屏幕」；断网也能打开，已补全的释义仍可查看 |
| 本地副本与更新 | 首页右下角常驻显示版本号，可下载应用本体成单个 HTML 使用，也可手动检查更新 |
| 自动检查更新 | 启动时自动查 GitHub Releases；本地副本与原生壳内都会检查并提示新版本 |

## 快速开始

**方式一：在线使用**

打开 https://geek-xin.github.io/vocabulary-notebook/ 即可，手机浏览器同样适用，可「添加到主屏幕」当 App 用。

**方式二：本地打开**

```bash
git clone https://github.com/geek-xin/vocabulary-notebook.git
cd vocabulary-notebook
open index.html        # macOS；Windows 直接双击 index.html
```

无需 `npm install`，无需构建步骤。

## 导入词表

点击首页「导入词汇本」按钮，选择一个或多个 `.docx` / `.pdf` / `.txt` 文件，每个文件会生成一个独立词汇本。

- `.docx` / `.pdf`：从文档里提取英文词条
- `.txt`：纯文本词表，一行一个词条；自动识别 UTF-8 / UTF-8 BOM / UTF-16 / **GBK** 编码，且不需要联网加载解析库

导入时应用会从文档中提取英文词条，然后**全部联网补全**释义（应用不内置任何词库）：

- **中文释义与词性**来自有道词典的联想接口（JSONP）；
- **英文释义、近反义词与音标**来自 Datamuse API（CORS）。

刚导入时所有卡片都是空的（释义显示 `—`），联网补全完成后自动填上。结果按词缓存，二次打开不再请求；**没网或接口失败时保持空卡，不影响导入**，下次联网会自动回填。补全只填空白字段，不会覆盖已有内容。

想彻底关闭联网补全，在浏览器控制台执行 `localStorage.setItem('vn_online_dict_v1', '0')` 后刷新即可（改回 `'1'` 重新开启）。

> ⚠️ **关闭后没有任何本地兜底**：因为释义全部来自在线词典，关掉它意味着**所有卡片都是空的**。这个开关只适合在受限网络下临时禁用外部请求。

### 音标与例句的现状

| 字段 | 现状 |
| --- | --- |
| 音标 | 由 Datamuse 的 ARPAbet 音素转成 IPA，是**美式**发音的机械转换结果，未经人工校对 |
| 例句 | **没有来源，卡片上不显示例句区块** |

例句确实没有可用的免费跨域来源：数据最全的有道 `jsonapi`（含 IPA 音标与双语例句）既没有 CORS 头、加 `callback` 还返回 403，浏览器无法调用；`api.dictionaryapi.dev` 在目标网络不可达。将来若接上可用来源，例句区块会自动恢复显示。

## 数据存储

采用三级降级策略，尽可能保证数据不丢：

1. **IndexedDB** —— 首选，配额远大于 localStorage，移动端 WebView 更稳
2. **localStorage** —— IndexedDB 不可用时自动降级
3. **内存模式** —— 前两者都不可用时启用，此模式下刷新页面数据会丢失，应用会弹出提示

旧版本存在 `localStorage` 中的词汇本会在首次打开时**自动迁移**到 IndexedDB。

联网补全的释义按词缓存在同一套存储里（键 `vn_dict_cache_v1`），缓存上限 4000 条、有效期 180 天，二次补全零请求。

> 数据完全保存在本机浏览器，换设备或清理浏览器数据不会同步，请注意自行备份。

## 技术说明

整个应用是**一个 `index.html` 文件**，内含全部 HTML / CSS / JavaScript，无框架、无打包器、无依赖安装。

外部依赖仅在需要时从 CDN 按序回退加载（jsDelivr → BootCDN → staticfile → cdnjs）：

- `mammoth` —— 解析 `.docx`
- `pdf.js` —— 解析 `.pdf`
- 有道词典发音接口 —— 提供英式读音
- 有道词典 suggest 接口 —— 提供中文释义与词性（JSONP）
- Datamuse API —— 提供英文释义、近反义词与音标（CORS）

音频与联网补全都只在对应操作发生时请求，**不联网时应用照常导入、翻卡、查看已有释义**，只是新词的释义补不上。

音频播放前会做一次「音频解锁」，以兼容夸克、微信等对自动播放限制较严的环境。

### 更新检查

首页右下角常驻版本号，旁边是主题切换、检查更新、下载三个按钮（`v2026.10.01.2`）：

- **下载**：把**应用本体**（不含词汇本数据）存成 `vocabulary-notebook.html`。用 `file://` 直接打开这份副本即可使用（释义同样来自联网补全），但**本地副本的书架是空的**——词汇本存在原站点的浏览器存储里，不会随文件走。原生壳内该按钮改为打开 Release 页（应用在安装包里，覆盖不了自身）。
- **检查更新**：手动查有没有新版本，结果会明确告知（已是最新 / 发现新版本 / 检查失败）。

更新检查走**两条通道**：

1. **首选** GitHub Releases API —— 读最新 Release 的 tag 与附件；
2. **回退** 抓线上 `index.html` 读 `APP_VERSION` —— GitHub API 限流（未登录 60 次/小时/IP）、离线或接口异常时自动启用。

**自动检查**在启动 1.5 秒后静默执行，覆盖本地副本（`file://`）与原生壳（Android / iOS / 鸿蒙）；线上 Web 端由 Service Worker 接管更新。失败不打扰；只有手动检查才会明确报错。

**更新不会丢词汇本。** 词汇本存在按来源划分的本地存储里，替换 HTML 文件本身动不到它。本地副本请**始终用 `file://` 双击打开**：本地文件的来源统一是 `file://`，换文件名、换目录都读得到同一份数据；但如果改用本地 http 服务打开，来源变了，书架就会是空的。

### 发版提醒

`index.html` 里的 `APP_VERSION`（格式 `YYYY.MM.DD.N`）是判断版本新旧**唯一依据**，必须与 git tag 对应。发版时不要手改多处，用统一脚本：

```bash
node scripts/set-version.mjs 2026.10.02.1   # 同步 index.html / package.json / Android / iOS / 鸿蒙
git commit -am "chore(release): v2026.10.02.1"
git tag v2026.10.02.1 && git push origin main --tags   # 打 tag 触发三端构建 + Release
```

CI 会校验 `APP_VERSION` 与 tag 一致，不一致直接失败，避免发出对不上的版本。

## 目录结构

```
vocabulary-notebook/
├── index.html              # ★ 应用本体（单文件，含全部逻辑与样式，唯一事实来源）
├── manifest.json           # PWA 清单
├── sw.js                   # Service Worker：离线外壳 + 更新通道
├── icons/                  # 图标（由 scripts/gen-icons.py 生成）
├── capacitor.config.json   # Android / iOS 共用壳配置
├── package.json            # Capacitor 工具链（仅构建期依赖，不影响 Web 使用）
├── scripts/                # 图标生成 / 资源同步 / 本地服务 / 版本写入 / 语法与 SW 测试
├── android/                # Android 工程（旧版鸿蒙亦可安装）
├── ios/                    # iOS 工程（产出未签名 ipa）
├── harmony/                # HarmonyOS NEXT 工程（Web 组件套壳）
├── .github/workflows/      # release.yml：打 tag 自动构建三端并发布
├── README.md
├── LICENSE                 # CC BY-NC 4.0
└── docs/
    ├── README.md             # 文档索引与维护约定
    ├── design.md             # 当前架构与关键设计决策
    ├── multi-platform.md     # 多端交付设计
    └── history.md            # 按版本记录的变更与验证
```

`www/` 与 `harmony/**/rawfile/index.html` 都是**派生产物**，由脚本从根 `index.html` 生成，不进版本库。

## 自行构建安装包

Web 端无需构建，其余各端命令见各自 README：

```bash
npm install
node scripts/sync-web.mjs            # index.html → www/
npx cap sync android                 # 同步到 Android 工程
cd android && ./gradlew assembleDebug   # 产出 APK

npx cap sync ios                     # iOS 需 macOS + Xcode
./ios/build-unsigned-ipa.sh          # 产出未签名 ipa

./harmony/scripts/sync-rawfile.sh    # 同步到鸿蒙工程
cd harmony && hvigorw assembleHap    # 需 DevEco 命令行工具
```

详细的工程说明、签名方式与**各端验证边界**见 [docs/multi-platform.md](docs/multi-platform.md)、[android/README.md](android/README.md)、[ios/README.md](ios/README.md)、[harmony/README.md](harmony/README.md)。

## 浏览器兼容

面向现代浏览器（Chrome / Safari / Edge / Firefox 及主流移动端 WebView）。使用到 IndexedDB、Web Audio、`speechSynthesis` 等特性，IE 不支持。

## 许可证

[CC BY-NC 4.0](LICENSE) © 2026 geek-xin

允许署名前提下的非商业性分享与演绎，**禁止商业用途**。完整法律条款见 [LICENSE](LICENSE)。
