# HarmonyOS NEXT 端

> HarmonyOS NEXT（5.0 / API 12+）**不再兼容 Android APK**，因此单独提供 ArkTS 工程：
> 用 ArkWeb 的 `Web` 组件加载内置的 `index.html`。
> 旧版鸿蒙请用 [../android/README.md](../android/README.md) 的 APK。

## 工程信息

| 项 | 值 |
| --- | --- |
| Bundle Name | `com.geekxin.vocabularynotebook` |
| 应用名 | 词汇本 |
| 模型 | Stage 模型 |
| compatibleSdkVersion | `5.0.0(12)` |
| runtimeOS | `HarmonyOS` |
| WebView 域 | `resource://rawfile` |

`versionCode` / `versionName` 由 `node scripts/set-version.mjs` 统一写入 `AppScope/app.json5`。

## 工程结构

```
harmony/
├── AppScope/
│   ├── app.json5                          # 应用级配置（bundleName / 版本 / 图标）
│   └── resources/base/                    # 应用级资源（名称、图标）
├── entry/
│   ├── src/main/
│   │   ├── module.json5                   # 模块配置、权限、Ability 声明
│   │   ├── ets/entryability/EntryAbility.ets   # 入口 Ability
│   │   ├── ets/pages/Index.ets            # Web 组件壳页面
│   │   └── resources/
│   │       ├── base/element/              # 字符串、颜色
│   │       ├── base/media/                # 图标、启动图
│   │       ├── base/profile/main_pages.json
│   │       └── rawfile/index.html         # ★ 派生产物，由脚本同步，勿手改
│   ├── build-profile.json5
│   ├── hvigorfile.ts
│   └── oh-package.json5
├── hvigor/hvigor-config.json5             # hvigor 版本配置
├── build-profile.json5                    # 工程级构建配置
├── hvigorfile.ts
├── oh-package.json5
└── scripts/sync-rawfile.sh                # 从根 index.html 同步到 rawfile
```

> 工程内**不包含** `hvigorw` / `hvigor-wrapper.js`。现代 HarmonyOS NEXT 工程不提交这两个文件，
> `hvigorw` 由 DevEco Studio 或命令行工具提供。这样也避免了 wrapper 与 `modelVersion` 版本不匹配。

## 同步应用本体

`entry/src/main/resources/rawfile/index.html` 是**派生产物**，唯一事实来源是仓库根的 `index.html`：

```bash
./harmony/scripts/sync-rawfile.sh
```

CI 在构建前会自动执行这一步，不要手改 rawfile 里的文件。

## 构建

### 方式一：DevEco Studio

用 DevEco Studio 打开 `harmony/` 目录，配置签名后直接 Build。

### 方式二：命令行（CI 用这个）

需要先安装华为命令行工具（`command-line-tools`），并把 `bin` 加入 `PATH`：

```bash
cd harmony
ohpm install --all
hvigorw clean --no-daemon
hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon
```

产物路径：

```
harmony/entry/build/default/outputs/default/entry-default-unsigned.hap
```

因为仓库内不配置签名，产物是**未签名 HAP**。

## 签名与安装

未签名 HAP **无法直接安装**，需要：

1. 用 DevEco Studio 打开工程；
2. File → Project Structure → Signing Configs，勾选 Automatically generate signature（需登录华为开发者账号）；
3. 重新 Build 得到已签名 HAP，再通过 `hdc install` 或 DevEco 直接运行到设备。

DevEco 会自动填充 `build-profile.json5` 里的 `signingConfigs` 与 `products[0].signingConfig`。

## 关键配置约束

### `modelVersion` 两处必须完全相等

`hvigor/hvigor-config.json5` 与工程级 `oh-package.json5` 的 `modelVersion` 必须**完全一致**，
否则 hvigor 在 `modelVersionCheck` 阶段直接报错退出。当前两处都是 `"5.0.0"`。

> `hvigorVersion` 是 DevEco 4.x（API 9 时代）的旧字段，**HarmonyOS NEXT 已不接受**。
> 若 CI 报 modelVersion 相关错误，把两处同时改成工具配套版本即可。

### 版本号写法是脚本契约

`AppScope/app.json5` 里的 `versionCode` / `versionName` 必须写成**无引号 key**：

```json5
versionCode: 20261001,
versionName: "2026.10.01.2",
```

`set-version.mjs` 的正则要求冒号紧跟 key。写成 `"versionCode":` 会**匹配不上且只 warn 不报错**，
导致静默发错版本号。

### Web 组件配置

`entry/src/main/ets/pages/Index.ets` 用：

```ets
Web({ src: $rawfile('index.html'), controller: this.controller })
  .domStorageAccess(true)   // localStorage / sessionStorage
  .databaseAccess(true)     // IndexedDB 相关存储能力
  .fileAccess(true)
  .onlineImageAccess(true)
  .mixedMode(MixedMode.All)
```

这三项存储能力必须开启，否则词汇本数据无法持久化。返回键通过 `onBackPress` +
`controller.accessBackward()` 优先回退 Web 历史。

### 权限

`module.json5` 声明两个权限，均用于联网补全释义：

- `ohos.permission.INTERNET`
- `ohos.permission.GET_NETWORK_INFO`

## 验证边界

| 项目 | 状态 |
| --- | --- |
| JSON5 可解析性 | ✅ `python3 scripts/check-harmony-json5.py` 通过 |
| 文件齐全性、资源引用一致性、`modelVersion` 相等性 | ✅ 已用校验脚本核对 |
| rawfile 与根 `index.html` 逐字节一致 | ✅ 已核对 |
| **CI 上真实编译出 HAP** | ✅ 215 KB，见 [Releases](https://github.com/geek-xin/vocabulary-notebook/releases) |
| **本机真实编译** | ❌ 本机无 DevEco Studio、无鸿蒙 SDK，**从未执行过 `hvigorw assembleHap`** |
| ArkTS 严格模式是否通过编译器 | ⚠️ 仅在 CI 编译中间接验证 |
| 未签名 HAP 的实际装机 | ❌ 需真实签名与设备，未验证 |
| 真机 WebView 运行时行为 | ❌ 无设备，未验证 |

### 其他已知不确定项

- `deviceTypes` 写的是 `["phone", "tablet", "2in1"]`。`phone` 取自华为官方样例与真实工程，
  但若 CI 报非法，改成 `default` 即可。
- 图标直接复用根 `icons/` 的 PWA 图标，未做鸿蒙专用分层切图。
