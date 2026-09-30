# iOS 端（词汇本）

Capacitor 8.5.2 壳工程，Web 本体是仓库根目录的 `index.html`。
包名 `com.geekxin.vocabularynotebook`，应用名「词汇本」，最低 iOS 15.0。

> **本机没有 Xcode（`xcode-select` 指向 CommandLineTools，没有可用的 `xcodebuild`），
> 因此本工程从未在本机做过真实编译验证。** 本文只保证工程结构正确、plist/JSON 语法正确、
> 脚本语法正确。真正的编译发生在 GitHub Actions 的 `macos` runner 上。

---

## 1. 目录结构

```
ios/
├── App/
│   ├── App.xcodeproj/project.pbxproj      # 工程文件（MARKETING_VERSION / CURRENT_PROJECT_VERSION 可被覆盖）
│   ├── App/
│   │   ├── Info.plist                     # 显示名、版本变量、文件共享、ATS
│   │   ├── AppDelegate.swift / SceneDelegate.swift
│   │   ├── Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png   # 1024x1024，无 alpha
│   │   └── public/                        # cap sync 生成的 Web 资源（.gitignore）
│   └── CapApp-SPM/Package.swift           # Capacitor 8 用 SPM，不是 CocoaPods
├── build-unsigned-ipa.sh                  # CI 用：产出未签名 ipa
├── ExportOptions.plist                    # 自备证书时 xcodebuild -exportArchive 用
└── README.md
```

**没有 Podfile**：Capacitor 8 的 iOS 模板改用 Swift Package Manager
（`ios/App/CapApp-SPM/Package.swift` 里 `capacitor-swift-pm` 8.5.2），
所以 `pod install` 不适用。

---

## 2. 同步 Web 资源

`index.html` 是唯一事实来源，不要手改 `ios/App/App/public/`：

```bash
node scripts/sync-web.mjs && npx cap sync ios
```

---

## 3. 三种安装方式

### 方式 A：Xcode 直连签名（推荐，最省事）

前提：macOS + Xcode、Apple ID（免费账号即可，免费证书 7 天有效）。

1. `npx cap sync ios`
2. `open ios/App/App.xcodeproj`（或 `npx cap open ios`）
3. 选中 **App** target → **Signing & Capabilities** → 勾选 *Automatically manage signing*，
   Team 选你自己的账号；Bundle Identifier 若与别人的证书冲突，改成 `com.<你的名字>.vocabularynotebook`。
4. 用数据线连上 iPhone（首次需在手机上「信任此电脑」），顶部设备选你的手机，点 ▶️ Run。
5. 手机上到 **设置 → 通用 → VPN与设备管理** 信任该开发者证书。

### 方式 B：AltStore / Sideloadly 自签（无需 Mac，Windows 也能用）

用 CI 产出的**未签名 ipa**：

1. 到 GitHub Releases 下载 `vocabulary-notebook-<版本>-unsigned.ipa`。
2. 用 [AltStore](https://altstore.io/) 或 [Sideloadly](https://sideloadly.io/) 打开这个 ipa，
   填入自己的 Apple ID 与专用密码（App 专用密码，不是账号密码）。
3. 工具会自动重签名并安装。免费账号同样 7 天过期，AltStore 可自动续签。

> 未签名 ipa 无法直接安装——iOS 只装已签名的包，必须经过重签名这一步。

### 方式 C：有证书时用 ExportOptions.plist 导出

自己已加入 Apple Developer Program，有开发/发布证书：

```bash
# 1. 归档
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -sdk iphoneos -archivePath build/App.xcarchive archive

# 2. 导出 ipa（把 TEAM_ID 换成你的 10 位 Team ID）
xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist ios/ExportOptions.plist \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=TEAM_ID
```

`ios/ExportOptions.plist` 默认 `method = development`，可改成 `ad-hoc`（最多 100 台已注册设备）
或 `app-store`；文件里有逐项注释。

---

## 4. CI 产出的 ipa 是「未签名」的

仓库里**不含任何证书和描述文件**（也不该含）。GitHub Actions 的 macos runner 执行：

```bash
./ios/build-unsigned-ipa.sh
```

脚本做的事：`xcodebuild ... CODE_SIGNING_ALLOWED=NO` 编译 → 把 `.app` 放进
`Payload/` → zip 成 `.ipa`。产物名 `vocabulary-notebook-<版本>-unsigned.ipa`。

所以 CI 产物**不能直接安装**，必须用方式 A/B/C 之一签名。这正是设计如此。

---

## 5. 用 xcodebuild 覆盖版本号

工程里的版本是**变量**，CI 无需改文件即可注入：

| 工程设置 | Info.plist 键 | 工程默认值 |
| --- | --- | --- |
| `MARKETING_VERSION` | `CFBundleShortVersionString` | `2026.09.30` |
| `CURRENT_PROJECT_VERSION` | `CFBundleVersion` | `20260930` |

命令行覆盖（`build-unsigned-ipa.sh` 已内置这两个变量）：

```bash
MARKETING_VERSION=2026.10.01 CURRENT_PROJECT_VERSION=20261001 ./ios/build-unsigned-ipa.sh
```

或者直接给 xcodebuild 传设置：

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
  MARKETING_VERSION=2026.10.01 CURRENT_PROJECT_VERSION=20261001 build
```

批量写入各端版本号仍然用 `node scripts/set-version.mjs 2026.10.01`，
它会用 `/MARKETING_VERSION = [^;]+;/g` 覆盖本工程 —— 所以**不要**改动
`project.pbxproj` 里这两行的格式（`KEY = VALUE;`）。

---

## 6. Info.plist 里几个关键项

| 键 | 值 | 为什么 |
| --- | --- | --- |
| `CFBundleDisplayName` | 词汇本 | 桌面图标名（中文） |
| `CFBundleDevelopmentRegion` | `zh-Hans` | 应用主语言为简体中文，中文名与中文界面才能正确本地化显示 |
| `UIFileSharingEnabled` | `true` | 让 App 的 Documents 出现在「文件」App 与 iTunes 文件共享里 |
| `LSSupportsOpeningDocumentsInPlace` | `true` | 允许「文件」App 直接把 docx/pdf 词表交给本 App 打开 |
| `NSAppTransportSecurity` → `NSAllowsArbitraryLoads` | `false` | 应用只访问 https（词库 CDN、有道发音、GitHub Releases），不需要放开明文 http |
| `UIRequiredDeviceCapabilities` | `arm64` | 模板默认的 `armv7` 已过时；iOS 15+ 全是 64 位 |
| `UISupportedInterfaceOrientations` | 竖屏 + 横屏（iPad 含倒置） | 学习页面横竖屏都可用 |

**导入词表的用法**：用「文件」App 或 AirDrop 把 `.docx` / `.pdf` / `.txt` 词表存到
**我的 iPhone → 词汇本** 目录，然后在应用里点「导入」选择该文件。
（iOS 上 `<input type="file">` 走系统文件选择器，能拿到这些位置的文件。）

---

## 7. 验证边界（诚实说明）

| 项目 | 本机 | 说明 |
| --- | --- | --- |
| `plutil -lint` Info.plist / ExportOptions.plist | ✅ | 已通过 |
| 各 `Contents.json` JSON 语法 | ✅ | 已通过 |
| `bash -n build-unsigned-ipa.sh` | ✅ | 已通过 |
| 图标 1024x1024、无 alpha | ✅ | 已用 Pillow 校验 `mode == RGB` |
| `project.pbxproj` 关键设置 grep | ✅ | MARKETING_VERSION / PRODUCT_BUNDLE_IDENTIFIER / AppIcon 均在 |
| `set-version.mjs` 正则能否命中工程 | ✅ | 只读演练：MARKETING_VERSION / CURRENT_PROJECT_VERSION 各命中 2 处 |
| `build-unsigned-ipa.sh` 端到端流程 | ⚠️ | 用**假 xcodebuild** 跑通全流程：产出 `Payload/App.app`、剥离签名材料、版本覆盖生效 |
| **xcodebuild 真实编译** | ❌ | **本机无 Xcode，从未编译过** |
| **真机/模拟器安装运行** | ❌ | 同上 |
| **未签名 ipa 能否被 AltStore 重签名** | ❌ | 需真实设备与签名工具验证 |
