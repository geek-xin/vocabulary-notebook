# 词汇本 · Android

Capacitor 壳工程，把根目录的 `index.html`（唯一事实来源）打包成可安装的 Android APK。

- **包名**：`com.geekxin.vocabularynotebook`
- **应用名**：词汇本（`res/values/strings.xml` 的 `app_name`）
- **minSdk 24 / targetSdk 36**（见 `variables.gradle`）
- **同时覆盖旧版鸿蒙**：HarmonyOS 4 及以前兼容 Android APK，这一份 APK 可直接装（见下文「旧版鸿蒙」）

> 应用本体永远是根目录 `index.html`。`android/app/src/main/assets/public/` 是 `npx cap sync` 的派生产物，**不要手改**，改了会在下次同步时被覆盖。

---

## 1. 前置条件

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| JDK | 21 | `export JAVA_HOME=$(/usr/libexec/java_home -v 21)` |
| Android SDK | platforms;android-36 + build-tools | 需要 `ANDROID_HOME` 指向它 |
| Node.js | 18+ | 仅用于 `npx cap sync` |

### 安装 Android SDK（命令行，无需 Android Studio）

```bash
export ANDROID_HOME="$PWD/.android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
# 关键：sdkmanager 默认把缓存写到 ~/.android，受限环境下会被拒绝，必须显式指定
export ANDROID_USER_HOME="$PWD/.android-user"

mkdir -p "$ANDROID_HOME/cmdline-tools"
# 解压 commandlinetools-*.zip 到 $ANDROID_HOME/cmdline-tools/latest
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

### 告诉 Gradle SDK 在哪

创建 `android/local.properties`（已在 `.gitignore` 中，不进版本库）：

```properties
sdk.dir=/绝对路径/到/.android-sdk
```

---

## 2. 构建

```bash
# 1) 把根 index.html 同步进 www/，再同步进 Android 工程
node scripts/sync-web.mjs
npx cap sync android

# 2) 构建 debug APK
cd android
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME="$PWD/../.android-sdk"
export GRADLE_USER_HOME="$PWD/../.gradle-home"   # 避免写 ~/.gradle
./gradlew assembleDebug --no-daemon
```

**产物路径**

```
android/app/build/outputs/apk/debug/app-debug.apk
```

其他常用目标：

```bash
./gradlew assembleRelease   # -> app/build/outputs/apk/release/app-release-unsigned.apk（未签名）
./gradlew clean
```

### 版本号

`app/build.gradle` 里这两行必须保持字面形式，`scripts/set-version.mjs` 用正则覆盖它们：

```gradle
versionCode 1
versionName "2026.09.30"
```

```bash
node scripts/set-version.mjs 2026.10.01.1   # versionCode -> 20261001
```

---

## 3. 安装到设备

```bash
# USB 调试打开后
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# 或者直接构建并安装
cd android && ./gradlew installDebug
```

卸载：`adb uninstall com.geekxin.vocabularynotebook`

> 升级安装不会丢数据；但**换包名或换 origin 会丢**——词汇存在 WebView 的 `https://localhost` 本地存储里，各端数据互相独立。需要搬运时用应用内的「分享 / 导出」。

---

## 4. 旧版鸿蒙（HarmonyOS 4 及以前）

HarmonyOS 4 及以前的内核兼容 Android 应用，**直接安装上面的 APK 即可**，无需额外转换。

**华为手机安装步骤**

1. 用手机浏览器或「华为分享 / 数据线」把 `app-debug.apk` 传到手机；
2. 打开「设置 → 安全 → 更多安全设置 → 安装外部来源应用」，允许文件管理器 / 浏览器安装应用；
   （部分机型路径为「设置 → 应用和服务 → 安装未知应用」）
3. 点击 APK 文件 → 允许安装 → 完成；
4. 首次启动若提示「未经华为安全检测」，选择「继续安装」即可（这是未走应用市场的正常提示）。

**注意**

- 纯血鸿蒙 **HarmonyOS NEXT（5.0 起）不再兼容 Android APK**，装不上，请改用 `harmony/` 目录下的 ArkTS 工程构建的 HAP。
- 旧鸿蒙上 WebView 内核版本可能偏旧，若页面异常请先升级「华为浏览器 / Android System WebView」组件。

---

## 5. 签名说明

仓库内**不含任何签名材料**（`.gitignore` 排除了 `*.keystore` / `*.jks`），因此：

- **CI 产出未签名 APK**：`app-release-unsigned.apk`，不能直接安装；
- **debug APK 用 Android 默认调试签名**，可直接 `adb install`。

### 自签 release APK

```bash
# 1) 生成 keystore（只需一次，务必备份）
keytool -genkeypair -v -keystore my-release.jks -alias vocabulary \
  -keyalg RSA -keysize 2048 -validity 10000

# 2) 用 SDK 里的 apksigner 签名（zipalign 必须先做）
BT="$ANDROID_HOME/build-tools/36.0.0"
"$BT/zipalign" -f -p 4 app-release-unsigned.apk app-release-aligned.apk
"$BT/apksigner" sign --ks my-release.jks --out app-release.apk app-release-aligned.apk

# 3) 校验
"$BT/apksigner" verify --print-certs app-release.apk
```

### 让 Gradle 直接产出已签名 release

在 `android/app/build.gradle` 的 `android { }` 里加（**keystore 不要提交进仓库**）：

```gradle
signingConfigs {
    release {
        storeFile file(System.getenv("KEYSTORE_PATH") ?: "my-release.jks")
        storePassword System.getenv("KEYSTORE_PASSWORD")
        keyAlias System.getenv("KEY_ALIAS") ?: "vocabulary"
        keyPassword System.getenv("KEY_PASSWORD")
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
    }
}
```

> 签名密钥一旦更换，已安装用户将无法覆盖升级，只能卸载重装（数据会丢）。**发布用 keystore 请长期妥善保管。**

---

## 6. 图标

图标源在根目录 `icons/`，Android 侧由脚本派生：

```bash
python3 android/tools/gen-android-icons.py
```

生成内容（五档密度）：

| 文件 | mdpi | hdpi | xhdpi | xxhdpi | xxxhdpi |
| --- | --- | --- | --- | --- | --- |
| `ic_launcher.png` | 48 | 72 | 96 | 144 | 192 |
| `ic_launcher_round.png` | 48 | 72 | 96 | 144 | 192 |
| `ic_launcher_foreground.png` | 108 | 162 | 216 | 324 | 432 |

自适应图标（Android 8+）由 `res/mipmap-anydpi-v26/ic_launcher.xml` 组合
`@mipmap/ic_launcher_foreground` 与 `@color/ic_launcher_background`（`#0F1724`）。

---

## 7. 本工程改了什么（相对 `cap add android` 的默认产出）

- `AndroidManifest.xml`：加 `screenOrientation="unspecified"`（允许横屏）、`windowSoftInputMode="adjustResize"`；
  确认 `configChanges` 覆盖旋转/分屏/深色模式，避免 WebView 重建丢状态；不声明 `usesCleartextTraffic`（全部 https）。
- `app/build.gradle`：`versionName` 设为 `2026.09.30`，`versionCode 1`，保持可被 `set-version.mjs` 覆盖；release 不配签名。
- `res/values/ic_launcher_background.xml`：自适应图标底色由白色改为 `#0F1724`，与图标主体一致。
- `res/mipmap-*/`：换成 `icons/` 派生的真实图标。
