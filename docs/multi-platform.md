# 多端交付设计

> 描述 PWA / Android / iOS 三端的承载方式、发版流程与验证边界。
> 应用内部架构见 [design.md](design.md)。

## 1. 目标

词汇本原本是一个**单文件、零构建**的 Web 应用，只能通过浏览器访问。现在同时具备：

1. **可安装的 PWA** —— iOS「添加到主屏幕」、Android 浏览器安装；
2. **两端原生安装包** —— Android APK、iOS ipa；
3. **打 tag 即发版** —— GitHub Actions 自动构建并发布 GitHub Release；
4. **应用内自动检查更新** —— 启动时查 GitHub Releases，发现新版本给出提示与下载入口。

## 2. 核心约束

| 约束 | 说明 |
| --- | --- |
| 单一事实来源 | 应用本体始终是根目录的 `index.html`。`www/` 是**派生产物**，由 `scripts/sync-web.mjs` 同步，不进版本库 |
| 不引入前端构建 | 仍然没有打包器、没有转译。`index.html` 双击即用（`file://`） |
| 版本号唯一 | `index.html` 的 `APP_VERSION`（`YYYY.MM.DD.N`）与 git tag（`v2026.10.02.1`）必须对应 |
| 数据不随包走 | 词汇本存在浏览器/WebView 的本地存储里。换安装包不丢数据，但**换包名或换 origin 会丢**（见 §6） |

## 3. 总体结构

```
vocabulary-notebook/
├── index.html                  # ★ 唯一事实来源（Web 应用本体）
├── manifest.json               # PWA 清单
├── sw.js                       # Service Worker（离线外壳 + 更新通道）
├── icons/                      # 由 scripts/gen-icons.py 生成
├── capacitor.config.json       # Android / iOS 共用壳配置
├── package.json                # Capacitor 工具链（仅构建期依赖）
├── scripts/
│   ├── gen-icons.py            # 生成 PWA/iOS/Android 图标
│   ├── sync-web.mjs            # index.html → www/（Capacitor webDir）
│   ├── serve.mjs               # 本地 http 服务，验证 PWA
│   ├── set-version.mjs         # 一处写入四处版本号
│   ├── check-inline-js.mjs     # 内联脚本语法检查
│   ├── test-sw.mjs             # Service Worker 行为测试
│   └── test-share.mjs          # 分享通道选择测试（Android 壳 / Web / 桌面）
├── android/                    # Capacitor Android 工程
├── ios/                        # Capacitor iOS 工程
└── .github/workflows/release.yml   # 打 tag → 构建三端 → 发布 Release
```

## 4. 各端实现方式

### 4.1 Web / PWA

- `manifest.json`：`display: standalone`、`start_url: ./index.html`、192/512/maskable 图标。
- `sw.js`：预缓存 8 项应用外壳，`index.html` 走 **network-first**（否则更新会被缓存卡住），
  其余同源静态资源 cache-first；跨域（CDN、有道、Datamuse）与非 http(s) scheme 一律放行。
  单个外壳资源抓取失败不会让整个安装失败。
- 注册条件：仅 `https:` 与 `localhost` / `127.0.0.1` 的 `http:` 下注册；
  `file://` 与原生 WebView 内不注册。
- iOS 专属 meta：`apple-mobile-web-app-capable`、`apple-mobile-web-app-title`、`apple-touch-icon`。
- 安装时**不**写死 `skipWaiting`：新 SW 先停在 waiting，等页面发现更新并提示用户后，
  由页面 `postMessage({ type: 'SKIP_WAITING' })` 再接管，避免用户正在学习时被强制刷新。

### 4.2 Android

Capacitor 8 壳，`webDir = www`。包名 `com.geekxin.vocabularynotebook`，应用名「词汇本」，
`androidScheme: https`（因此 WebView 内 origin 是 `https://localhost`）。
`minSdkVersion 24`、`compileSdkVersion / targetSdkVersion 36`。

旧版鸿蒙（HarmonyOS 4 及以前）兼容 Android APK，因此这份 APK 在旧鸿蒙上也能安装，
但这不作为独立目标承诺（见 §4.4）。

**原生插件**：`AppUpdaterPlugin`（应用内升级）、`SharePlugin`（系统分享）。
后者存在的原因是 **Android WebView 不实现 Web Share API** —— 壳内 `navigator.share`
是 undefined，分享必须由原生 `ACTION_SEND` 拉起。详见 [design.md](design.md) §9.2。

### 4.3 iOS

Capacitor 8 壳（SPM）+ Xcode 工程，`iosScheme: capacitor`（origin 为 `capacitor://localhost`）。
仓库内**不含证书**，CI 产出**未签名 ipa**；
用户自行用 Xcode 或 AltStore/Sideloadly 签名安装。

### 4.4 为什么没有鸿蒙端

鸿蒙端曾在 2026.09.30.1 加入，2026.10.01.5 移除。原因：

- HarmonyOS NEXT 不兼容 Android APK，需要维护一套**独立的 ArkTS 工程**和**另一套工具链**（DevEco / hvigor / ohpm）；
- CI 侧依赖第三方 2.1 GB SDK，构建链路长且脆弱（曾因上游 500 导致发版缺产物）；
- 维护成本与用户量不成比例。

旧版鸿蒙（HarmonyOS 4 及以前）**仍可直接安装 Android APK**，只是不再作为独立目标承诺。

## 5. 更新检查（Release 通道）

应用启动后（延迟 1.5s）与用户点击「检查更新」时执行：

1. **首选** `GET https://api.github.com/repos/geek-xin/vocabulary-notebook/releases/latest`
   读取 `tag_name`（`v2026.10.02.1` → `2026.10.02.1`）与 `assets`。
2. **回退** 抓线上 `index.html`，正则取 `APP_VERSION`。
   在 GitHub API 限流（未认证 60 次/小时/IP）、离线、或接口异常时启用。
3. 版本比较按 `.` 分段数值比较。
4. 有新版 → 弹出更新提示条；Web 端提示下载新 HTML，原生端提示去 Release 页下载安装包
   （Android 壳内走应用内下载安装，见 [../android/README.md](../android/README.md)）。

> 自动检查全程静默，失败不打扰；手动检查必须有明确反馈（已是最新 / 发现新版本 / 检查失败）。
> 自动检查覆盖本地副本与原生壳；线上 Web 端由 Service Worker 接管。详见 [design.md](design.md) §10。

## 6. 数据存储与升级路径（重要）

数据存在按 **origin / WebView 域**划分的本地存储（IndexedDB → localStorage → 内存）：

| 运行形态 | origin | 数据是否与网页版互通 |
| --- | --- | --- |
| GitHub Pages | `https://geek-xin.github.io` | — |
| 下载的单文件 HTML | `file://` | 否，独立一份 |
| Android APK | `https://localhost`（Capacitor androidScheme） | 否，独立一份 |
| iOS App | `capacitor://localhost` | 否，独立一份 |

**结论：各端数据互相独立，升级安装包不会丢数据，但也不会自动同步。**
这是浏览器安全模型的必然结果，不是缺陷。需要在端间搬运时用应用内的「分享」。

## 7. 发版流程

```bash
# 1. 统一写入版本号（index.html / package.json / Android / iOS）
node scripts/set-version.mjs 2026.10.02.1
# 2. 提交
git commit -am "chore(release): v2026.10.02.1"
# 3. 打 tag 并推送 —— 这一步触发三端构建与 Release
git tag v2026.10.02.1 && git push origin main --tags
```

`release.yml` 的 job 依赖：`meta` → `web` / `android` / `ios` → `release`。
三端并行构建，汇总到同一个 Release 的 assets 里：

| job | 产物 |
| --- | --- |
| `web` | `index.html` + `manifest.json` + `sw.js` + `icons/` |
| `android` | `vocabulary-notebook.apk`（已签名，构建后用 `apksigner verify` 校验） |
| `ios` | `vocabulary-notebook.ipa`（未签名） |

CI 会校验 `APP_VERSION` 与 tag 一致，不一致直接失败。
`release` job 的条件是 `always() && meta == success && web == success` ——
Android / iOS 任一端失败仍会发布，避免一个平台拖住其余平台的可用产物。

## 8. 验证边界

本节区分**已经真实跑通的**与**仍未验证的**，两者不要混为一谈。

### 8.1 已实测通过

| 项目 | 方式 | 结果 |
| --- | --- | --- |
| Web / PWA | 本地 http + 真实浏览器 | manifest 被解析、SW `activated`、8 个外壳资源入缓存、离线可开 |
| Service Worker 行为 | `node scripts/test-sw.mjs` | 23 项断言全过 |
| 分享通道选择 | `node scripts/test-share.mjs` | 26 项断言全过（Android 壳 / Web / 桌面三种环境） |
| Android APK | 本机 `./gradlew clean assembleDebug` / `assembleRelease` | BUILD SUCCESSFUL；`aapt2` 实测包名、版本、权限、label 正确；`classes.dex` 内含 `SharePlugin` |
| **iOS 未签名 ipa** | **GitHub Actions macos runner 真实编译** | ✅ 产出约 465 KB ipa |
| Release 流程 | 打 tag 真实触发 | ✅ 三端产物全部发布 |
| 应用内自动检查更新 | 真实旧版本副本 + 线上 Release | ✅ 弹提示条并下载到新版本 |

> iOS 在本机**无法编译**（无 Xcode），其「可编译」结论完全来自 CI 的真实构建，
> 而不是本地静态检查。

### 8.2 更新通道的实测细节

验证时 GitHub API 曾恰好返回 **403（未认证限流）**，这反而验证了最关键的一条：
应用**静默回退**到抓线上 `index.html` 读 `APP_VERSION`，仍然正确识别出新版本并弹出提示条。
两条通道都真实走过。

### 8.3 仍未验证

| 项目 | 原因 |
| --- | --- |
| 真机安装与运行 | 本机无 Android/iOS 设备，`adb install`、真机 WebView 行为、发音与联网补全未验证 |
| **Android 系统分享面板** | 无设备。已验证「选对通道、入参正确、APK 含插件」，但分享面板能否拉起、微信能否收到文件需真机确认 |
| 未签名 ipa 的重签名与装机 | 需真实证书与设备 |
| iOS「添加到主屏幕」 | 需真机 Safari |

### 8.4 发版时若 CI 失败，优先看这几处

1. `APP_VERSION` 与 tag 不一致 —— CI 会直接失败，跑 `node scripts/set-version.mjs <版本>` 修正。
2. 依赖清单变更 —— 新增需要进包的文件时，记得同时改 `scripts/sync-web.mjs` 的 `ENTRIES`
   和 `release.yml` 里的资源校验列表。
3. Android 签名 —— 四个 `ANDROID_*` Secret 缺失或口令不一致会让 `assembleRelease` 失败，
   详见 [troubleshooting.md](troubleshooting.md)。
