# Android 端

> Capacitor 8 壳，承载根目录的 `index.html`。产出可直接安装的 APK。
>
> 旧版鸿蒙（HarmonyOS 4 及以前）兼容 Android APK，因此这份产物在旧鸿蒙上也能装，
> 但本项目**不再提供 HarmonyOS NEXT 的独立产物**（原因见 [../docs/multi-platform.md](../docs/multi-platform.md) §4.4）。

## 工程信息

| 项 | 值 |
| --- | --- |
| 包名 | `com.geekxin.vocabularynotebook` |
| 应用名 | 词汇本 |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 |
| WebView 域 | `https://localhost`（`androidScheme: https`） |
| 权限 | 仅 `INTERNET` |

`versionCode` / `versionName` 由 `node scripts/set-version.mjs` 统一写入，不要手改。

## 构建

```bash
# 1. 把 index.html 同步到 www/，再同步进 Android 工程
node scripts/sync-web.mjs
npx cap sync android

# 2. 构建
cd android && ./gradlew assembleDebug      # 调试包，可直接 adb install
cd android && ./gradlew assembleRelease    # 未签名发布包
```

产物路径：

```
android/app/build/outputs/apk/debug/app-debug.apk                # 调试签名
android/app/build/outputs/apk/release/app-release-unsigned.apk   # 未签名
```

### 本机构建的前置条件

1. **JDK 21**（`JAVA_HOME` 指向 JDK 21）。
2. **Android SDK**，含 `platforms;android-36`、`build-tools;36.0.0`、`platform-tools`。
3. `android/local.properties` 写入 `sdk.dir=<SDK 绝对路径>`（该文件已 gitignore）。

> ⚠️ **受限环境下的坑**：`sdkmanager` 默认把缓存写 `~/.android/cache`，Gradle 默认写 `~/.gradle`。
> 若这些目录不可写，会报出**指向网络的假故障**（`Failed to download any source lists`、
> `IO exception while downloading manifest`），实际原因是本地路径不可写。显式指定即可：
>
> ```bash
> export ANDROID_USER_HOME="$PWD/.android-user"
> export GRADLE_USER_HOME="$PWD/.gradle-home"
> ```

## 安装

**Android**

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

或把 APK 传到手机，在「设置 → 安全 → 允许安装未知来源应用」后点击安装。

**旧版鸿蒙（HarmonyOS 4 及以前）**

可以直接安装本 APK：

1. 下载 `*-android.apk` 并传到手机；
2. 设置 → 安全 → 更多安全设置 → 允许安装未知来源应用；
3. 用文件管理器点击 APK 安装；若提示「纯净模式」拦截，需在设置中临时关闭纯净模式。

> HarmonyOS NEXT（5.0 及以后）**不兼容 Android APK**，本项目也不再提供对应产物。

## 签名（固定密钥，务必不要换）

**Android 只允许同签名的 APK 互相覆盖安装。** 签名不一致时系统直接拒绝
（`INSTALL_FAILED_UPDATE_INCOMPATIBLE`），用户只能卸载重装 —— 而卸载会连词汇本数据一起清掉。

因此 CI 用**固定密钥**签名，密钥存在仓库 Secrets 里：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | PKCS12 密钥库的 base64 |
| `ANDROID_KEYSTORE_PASSWORD` | 密钥库口令 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 密钥口令（PKCS12 下**必须与库口令相同**） |

`app/build.gradle` 读取这些环境变量还原密钥并配置 `signingConfigs.release`。
本机没有这些变量时自动跳过签名，`assembleDebug` 照常可用。

```bash
# 本机做一次「和 CI 一样」的签名构建
export ANDROID_KEYSTORE_BASE64="$(base64 -i release.p12)"
export ANDROID_KEYSTORE_PASSWORD=...
export ANDROID_KEY_ALIAS=vocabulary-notebook
export ANDROID_KEY_PASSWORD=...   # 与 store 口令相同
./gradlew assembleRelease

# 校验签名
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

> ⚠️ **不要更换密钥库**，否则已安装用户无法升级。若确实必须更换，需提前通知用户导出数据后重装。
>
> ⚠️ PKCS12 不支持「库口令」与「密钥口令」不同：`keytool` 转换时会忽略 `-destkeypass`，
> 若两个 Secret 填了不同的值，Gradle 会报 `Given final block not properly padded`。

### 历史遗留问题

2026.10.01.6 及更早的版本用 `assembleDebug` 出包，每次 CI 在全新 runner 上生成新的
`debug.keystore`，**每次发版签名都不同**，用户根本无法升级（问题即由此暴露）。
这类旧包与新包签名不兼容，需要卸载重装。

## 应用内升级

原生插件 `AppUpdaterPlugin` 负责「下载新版 APK → 拉起系统安装器」，让用户不必跳浏览器：

1. JS 侧从 Release 的 assets 里挑出 `.apk`（`pickApkAsset`）；
2. 调 `getStatus` 检查是否已授予「安装未知应用」权限；
3. 未授权 → `openInstallPermissionSettings` 引导去设置页（Android 8.0+ 的硬性要求）；
4. 已授权 → `downloadAndInstall` 下载到 cache，经 FileProvider 拉起安装界面。

插件只在 Android 壳内存在；Web 与 iOS 上 `nativeUpdater()` 返回 null，自动走原有逻辑。

相关权限：`REQUEST_INSTALL_PACKAGES`。
## 图标

mipmap 各密度图标由根 `icons/` 派生：

```bash
python3 android/tools/gen-android-icons.py
```

改动品牌图形后需重跑该脚本。

## 验证边界

| 项目 | 状态 |
| --- | --- |
| `assembleDebug` / `assembleRelease` | ✅ 本机真实构建通过 |
| `aapt2 dump badging` 核对包名/版本/权限/label | ✅ 已核对 |
| APK 内含 `assets/public/index.html`、`manifest.json`、`sw.js` | ✅ 已核对 |
| `adb install` 真机安装 | ❌ 无设备，未验证 |
| 真机 WebView 运行时行为（导入、发音、联网补全） | ❌ 无设备，未验证 |
| 旧版鸿蒙实机安装 | ❌ 无设备，未验证（APK 兼容旧鸿蒙，但未在真机验证） |
