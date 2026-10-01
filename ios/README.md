# iOS 端

> Capacitor 8 壳（SPM，无 CocoaPods）+ Xcode 工程。仓库内**不含任何证书**，
> CI 产出**未签名 ipa**，需自行签名后安装。

## 工程信息

| 项 | 值 |
| --- | --- |
| Bundle ID | `com.geekxin.vocabularynotebook` |
| 显示名 | 词汇本 |
| 部署目标 | iOS 15.0 |
| 依赖管理 | Swift Package Manager（`ios/App/CapApp-SPM`） |
| WebView 域 | `capacitor://localhost` |

`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` 由 `node scripts/set-version.mjs` 统一写入。

## 构建未签名 ipa

**必须在装有 Xcode 的 macOS 上执行**：

```bash
node scripts/sync-web.mjs
npx cap sync ios

# 用工程里的版本号
./ios/build-unsigned-ipa.sh

# 或显式指定版本（CI 用这种方式）
MARKETING_VERSION=2026.10.01.3 CURRENT_PROJECT_VERSION=20261001 \
  OUTPUT_DIR="$PWD/out" ./ios/build-unsigned-ipa.sh
```

脚本做的事：`xcodebuild -sdk iphoneos CODE_SIGNING_ALLOWED=NO` → 剥掉 `_CodeSignature` 与
`embedded.mobileprovision` → 打成 `Payload/App.app` 并 zip 成 ipa。

产物：`<OUTPUT_DIR>/vocabulary-notebook-<版本>-unsigned.ipa`（默认 `OUTPUT_DIR` 为 `ios/output`）。

### 可用环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MARKETING_VERSION` | 取工程里的值 | `CFBundleShortVersionString` |
| `CURRENT_PROJECT_VERSION` | 取工程里的值 | `CFBundleVersion` |
| `SCHEME` | `App` | 构建 scheme |
| `CONFIGURATION` | `Release` | 构建配置 |
| `DERIVED_DATA` | `ios/build` | 构建中间产物目录 |
| `OUTPUT_DIR` | `ios/output` | ipa 输出目录 |

> 首次构建会联网拉取 `capacitor-swift-pm`（SPM 依赖），需可访问 github.com。

## 安装（未签名 ipa）

**方式一：Xcode 直连签名（推荐，需 Apple ID）**

1. 用 Xcode 打开 `ios/App/App.xcodeproj`；
2. 选中 App target → Signing & Capabilities → 勾选 Automatically manage signing，选自己的 Team；
3. 连接 iPhone，Xcode 直接 Run。

**方式二：AltStore / Sideloadly 自签**

1. 把 `*-unsigned.ipa` 传到电脑；
2. 用 AltStore 或 Sideloadly 载入 ipa，输入 Apple ID 完成重签名并安装；
3. 免费账号签名的 App **7 天后过期**，需重新签名。

**方式三：有开发者证书时用 ExportOptions.plist**

`ios/ExportOptions.plist` 已备好（`method = development`，注释里说明如何切 ad-hoc / app-store）。
需先配置签名，再用 `xcodebuild -exportArchive` 导出。

## 关键 Info.plist 配置

| 键 | 值 | 作用 |
| --- | --- | --- |
| `CFBundleDisplayName` | 词汇本 | 桌面显示名 |
| `CFBundleShortVersionString` | `$(MARKETING_VERSION)` | 由构建参数注入 |
| `CFBundleVersion` | `$(CURRENT_PROJECT_VERSION)` | 由构建参数注入 |
| `NSAppTransportSecurity.NSAllowsArbitraryLoads` | `false` | 应用只访问 https，无需放开明文 |
| `UIFileSharingEnabled` | `true` | 允许通过「文件」App 把 docx/pdf 词表放进文稿目录 |
| `LSSupportsOpeningDocumentsInPlace` | `true` | 支持就地打开外部文件 |

`UIFileSharingEnabled` 对本应用很重要：iOS 无法像桌面那样自由选文件，
用户需要把词表拷进 App 的文稿目录再导入。

## 验证边界

| 项目 | 状态 |
| --- | --- |
| `plutil -lint` 校验 Info.plist / ExportOptions.plist / project.pbxproj | ✅ 通过 |
| `bash -n` 校验打包脚本 | ✅ 通过 |
| 用假 `xcodebuild` 演练打包逻辑（含版本注入、签名材料剥离） | ✅ 通过 |
| **CI 上真实编译出未签名 ipa** | ✅ 463 KB，见 [Releases](https://github.com/geek-xin/vocabulary-notebook/releases) |
| **本机真实编译** | ❌ 本机无 Xcode（`xcode-select -p` 指向 CommandLineTools），未在本机编译过 |
| 真机安装与运行 | ❌ 无设备，未验证 |
| AltStore / Sideloadly 重签名 | ❌ 需真实设备与账号，未验证 |
