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

## 签名

仓库内**不保存任何签名材料**。CI 产出的 release APK 是**未签名**的：

```bash
# 验证未签名状态（会报 DOES NOT VERIFY / Missing META-INF/MANIFEST.MF）
apksigner verify --print-certs app-release-unsigned.apk

# 自行签名
keytool -genkey -v -keystore my.jks -keyalg RSA -keysize 2048 -validity 10000 -alias mykey
zipalign -v 4 app-release-unsigned.apk aligned.apk
apksigner sign --ks my.jks --out signed.apk aligned.apk
```

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
