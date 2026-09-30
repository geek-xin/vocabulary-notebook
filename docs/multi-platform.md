# 多端交付设计（iOS / Android / HarmonyOS / Web）

> 状态：已实施 · 目标版本 v2026.09.30
> 相关文档：[design.md](design.md)（应用内部架构）、[history.md](history.md)（变更记录）

## 1. 目标

词汇本原本是一个**单文件、零构建**的 Web 应用，只能通过浏览器访问。本次要让它同时具备：

1. **可安装的 PWA** —— iOS「添加到主屏幕」、Android/鸿蒙浏览器安装，离线可用；
2. **三端原生安装包** —— Android APK、iOS ipa、HarmonyOS NEXT HAP；
3. **打 tag 即发版** —— GitHub Actions 自动构建三端产物并发布 GitHub Release；
4. **应用内自动检查更新** —— 启动时查 GitHub Releases，发现新版本给出提示与下载入口。

## 2. 核心约束

| 约束 | 说明 |
| --- | --- |
| 单一事实来源 | 应用本体始终是根目录的 `index.html`。`www/`、`harmony/**/rawfile/index.html` 都是**派生产物**，由脚本同步，不进版本库 |
| 不引入前端构建 | 仍然没有打包器、没有转译。`index.html` 双击即用（`file://`） |
| 版本号唯一 | `index.html` 的 `APP_VERSION`（`YYYY.MM.DD.N`）与 git tag（`v2026.09.30`）必须对应 |
| 数据不随包走 | 词汇本存在浏览器/WebView 的本地存储里。换安装包不丢数据，但**换包名或换 origin 会丢**（见 §6） |

## 3. 总体结构

```
vocabulary-notebook/
├── index.html                  # ★ 唯一事实来源（Web 应用本体）
├── manifest.webmanifest        # PWA 清单
├── sw.js                       # Service Worker（离线外壳 + 更新通道）
├── icons/                      # 由 scripts/gen-icons.py 生成
├── capacitor.config.json       # Android / iOS 共用壳配置
├── package.json                # Capacitor 工具链（仅构建期依赖）
├── scripts/
│   ├── gen-icons.py            # 生成 PWA/iOS/Android 图标
│   ├── sync-web.mjs            # index.html → www/（Capacitor webDir）
│   ├── serve.mjs               # 本地 http 服务，验证 PWA
│   └── set-version.mjs         # 统一写入各端版本号
├── android/                    # Capacitor Android 工程
├── ios/                        # Capacitor iOS 工程
├── harmony/                    # HarmonyOS NEXT ArkTS 工程（Web 组件套壳）
└── .github/workflows/
    ├── release.yml             # 打 tag → 构建三端 → 发布 Release
    └── pages.yml               # main 分支 → 部署 GitHub Pages
```

## 4. 各端实现方式

### 4.1 Web / PWA

- `manifest.webmanifest`：`display: standalone`、`start_url: ./index.html`、192/512/maskable 图标。
- `sw.js`：预缓存应用外壳，`index.html` 走 **network-first**（否则更新会被缓存卡住），其余静态资源 cache-first。
- 注册条件：仅 `https:` 与 `localhost` 下注册；`file://` 与 WebView 内不注册。
- iOS 专属 meta：`apple-mobile-web-app-capable`、`apple-mobile-web-app-title`、`apple-touch-icon`。

### 4.2 Android

Capacitor 壳，`webDir = www`。包名 `com.geekxin.vocabularynotebook`，应用名「词汇本」。
**旧版鸿蒙（HarmonyOS 4 及以前）兼容 Android APK**，因此这一份 APK 同时覆盖 Android 与旧鸿蒙。

### 4.3 iOS

Capacitor 壳 + Xcode 工程。仓库内**不含证书**，CI 产出**未签名 ipa**；用户自行用 Xcode 或 AltStore/Sideloadly 签名安装。

### 4.4 HarmonyOS NEXT

HarmonyOS NEXT 不再兼容 Android APK，因此单独提供 ArkTS 工程：
`Web({ src: $rawfile('index.html') })` 加载内置页面，开启 `domStorageAccess` / `databaseAccess`。
CI 产出**未签名 HAP**，需在 DevEco Studio 中配置签名后才能装机。

## 5. 更新检查（Release 通道）

应用启动后（延迟 1.5s）与用户点击「检查更新」时执行：

1. **首选** `GET https://api.github.com/repos/geek-xin/vocabulary-notebook/releases/latest`
   读取 `tag_name`（`v2026.09.30` → `2026.09.30`）与 `assets`。
2. **回退** 原方案：抓线上 `index.html`，正则取 `APP_VERSION`。
   在 GitHub API 限流（未认证 60 次/小时/IP）、离线、或接口异常时启用。
3. 版本比较沿用 `compareVersion`（按 `.` 分段数值比较）。
4. 有新版 → 弹出更新提示条；Web 端提示下载新 HTML，原生端提示去 Release 页下载对应安装包。

> 自动检查全程静默，失败不打扰；手动检查必须有明确反馈（已是最新 / 发现新版本 / 检查失败）。

## 6. 数据存储与升级路径（重要）

数据存在按 **origin / WebView 域**划分的本地存储（IndexedDB → localStorage → 内存）：

| 运行形态 | origin | 数据是否与网页版互通 |
| --- | --- | --- |
| GitHub Pages | `https://geek-xin.github.io` | — |
| 下载的单文件 HTML | `file://` | 否，独立一份 |
| Android APK / 旧鸿蒙 | `https://localhost`（Capacitor androidScheme） | 否，独立一份 |
| iOS App | `capacitor://localhost` | 否，独立一份 |
| HarmonyOS NEXT | `resource://rawfile` | 否，独立一份 |

**结论：各端数据互相独立，升级安装包不会丢数据，但也不会自动同步。** 这是浏览器安全模型的必然结果，不是缺陷。需要在端间搬运时用应用内的「分享/导出」。

## 7. 发版流程

```bash
# 1. 改 index.html 的 APP_VERSION 为 2026.10.01.1
node scripts/set-version.mjs 2026.10.01.1
# 2. 提交
git commit -am "chore(release): v2026.10.01.1"
# 3. 打 tag 并推送 —— 这一步触发三端构建与 Release
git tag v2026.10.01.1 && git push origin main --tags
```

`release.yml` 会并行构建 Android APK、iOS 未签名 ipa、HarmonyOS HAP，
汇总到同一个 Release 的 assets 里，并把 `index.html` 一并附上。

## 8. 验证边界

本节区分**已经真实跑通的**与**仍未验证的**，两者不要混为一谈。

### 8.1 已实测通过

| 项目 | 方式 | 结果 |
| --- | --- | --- |
| Web / PWA | 本地 http + 真实浏览器 | manifest 被解析、SW `activated`、8 个外壳资源入缓存、离线可开 |
| Service Worker 行为 | `node scripts/test-sw.mjs` | 22 项断言全过（预缓存、network-first、跨域放行、更新通道） |
| Android APK | 本机 `./gradlew assembleDebug` / `assembleRelease` | BUILD SUCCESSFUL；`aapt2` 实测包名、版本、权限、label 正确 |
| **iOS 未签名 ipa** | **GitHub Actions macos runner 真实编译** | ✅ 产出 528,905 字节 ipa |
| **HarmonyOS HAP** | **GitHub Actions + 华为命令行工具真实编译** | ✅ 产出 403,012 字节 HAP |
| Release 流程 | 打 tag `v2026.09.30.1` 真实触发 | ✅ 四端产物全部发布到 Release |
| 应用内自动检查更新 | 真实旧版本副本 + 线上 Release | ✅ 弹提示条、按钮下载到 337,853 字节新版本 |

> iOS 与 HarmonyOS 两端在本机**无法编译**（无 Xcode / 无 DevEco），
> 因此它们的「可编译」结论完全来自 CI 的真实构建，而不是本地静态检查。

### 8.2 更新通道的实测细节

验证时 GitHub API 恰好返回 **403（未认证限流，60 次/小时/IP）**，
这反而验证了最关键的一条：应用**静默回退**到抓线上 `index.html` 读 `APP_VERSION`，
仍然正确识别出新版本并弹出提示条。两条通道都真实走过。

### 8.3 仍未验证

| 项目 | 原因 |
| --- | --- |
| 真机安装与运行 | 本机无 Android/iOS/鸿蒙设备，`adb install`、真机 WebView 行为、发音与联网补全未验证 |
| 旧版鸿蒙实机安装 APK | 无设备 |
| 未签名 ipa / HAP 的重签名与装机 | 需真实证书与设备 |
| iOS「添加到主屏幕」 | 需真机 Safari |
| 鸿蒙 `deviceTypes` 的 `phone` 取值 | 若 CI 报非法，改成 `default` 即可 |

### 8.4 发版时若 CI 失败，优先看这几处

1. `APP_VERSION` 与 tag 不一致 —— CI 会直接失败，跑 `node scripts/set-version.mjs <版本>` 修正。
2. 鸿蒙 `modelVersion` —— `hvigor/hvigor-config.json5` 与工程级 `oh-package.json5` 两处必须**完全相等**。
3. 依赖清单变更 —— 新增需要进包的文件时，记得同时改 `scripts/sync-web.mjs` 的 `ENTRIES`
   和 `release.yml` 里的资源校验列表（首次发版就漏过 `manifest.json`）。
