# 词汇本 · HarmonyOS NEXT 端

HarmonyOS NEXT（API 12+）ArkTS 壳工程：用 ArkWeb 的 `Web` 组件加载应用本体
`entry/src/main/resources/rawfile/index.html`，把单文件 Web 应用包成一个 HAP。

> **本机没有 DevEco Studio，也没有鸿蒙 SDK，因此本工程未做过真实编译验证。**
> 详见文末「[验证边界](#验证边界诚实说明)」。所有字段名都是从官方文档 / 官方 Schema /
> 真实工程里核对来的，并逐条注明了出处，但没有经过编译器检验。

---

## 1. 目录结构

```
harmony/
├── AppScope/
│   ├── app.json5                          # 应用级配置（bundleName / 版本号 / 图标）
│   └── resources/base/
│       ├── element/string.json            # 应用名「词汇本」
│       └── media/app_icon.png             # 应用图标
├── entry/
│   ├── build-profile.json5                # 模块级构建配置
│   ├── hvigorfile.ts                      # hapTasks
│   ├── oh-package.json5                   # 模块级包描述
│   ├── obfuscation-rules.txt
│   └── src/main/
│       ├── module.json5                   # 模块 / Ability / 权限
│       ├── ets/
│       │   ├── entryability/EntryAbility.ets
│       │   └── pages/Index.ets            # Web 壳页面（含返回键处理）
│       └── resources/
│           ├── base/element/{string,color}.json
│           ├── base/media/                # 图标 + 分层图标描述
│           ├── base/profile/main_pages.json
│           ├── en_US|zh_CN/element/string.json
│           └── rawfile/index.html         # ★ 派生产物，勿手改
├── hvigor/hvigor-config.json5
├── hvigorfile.ts                          # appTasks
├── oh-package.json5                       # 工程级包描述
├── scripts/sync-rawfile.sh                # 从仓库根 index.html 同步应用本体
└── .gitignore
```

---

## 2. 用 DevEco Studio 打开

1. DevEco Studio **5.0 及以上**（配套 API 12+ 的 HarmonyOS NEXT SDK）。
2. `File > Open` → 选中本仓库的 **`harmony/` 目录**（不是仓库根目录）。
3. 首次打开后等待 `Sync Now` 完成（会拉取 hvigor 构建依赖）。
4. 运行前必须先配置签名（见下一节）。

> **打开前请先跑一次同步脚本**，否则 `rawfile/index.html` 不存在（它被 .gitignore 忽略，
> 不进版本库）：
> ```bash
> ./harmony/scripts/sync-rawfile.sh
> ```

---

## 3. 签名配置

仓库**不保存任何证书**，因此：

- 工程级 `build-profile.json5` 里 `signingConfigs` 为空数组，product 也**没有**配置
  `signingConfig`。按官方文档「如果没有配置，默认不签名」，产物就是**未签名 HAP**。
- 未签名 HAP **不能直接装机**，需要签名。

### 3.1 用 DevEco Studio 自动签名（推荐）

1. `File > Project Structure... > Project > Signing Configs`。
2. 勾选 `Automatically generate signature`，登录华为开发者账号。
3. DevEco 会自动申请调试证书并**自动回填** `signingConfigs` 与
   `products[0].signingConfig` 到 `build-profile.json5`。

自动签名生成的 `material` 结构（官方文档示例）：

```json5
"signingConfigs": [
  {
    "name": "default",
    "type": "HarmonyOS",
    "material": {
      "certpath": "./SigningConfig/debug_hos.cer",
      "storePassword": "******",
      "keyAlias": "debugKey",
      "keyPassword": "******",
      "profile": "./SigningConfig/debug_hos.p7b",
      "signAlg": "SHA256withECDSA",
      "storeFile": "./SigningConfig/debug_hos.p12"
    }
  }
]
```

### 3.2 手动给 CI 产物签名

CI 产出的是 `entry-default-unsigned.hap`，可用命令行工具自带的 `hap-sign-tool.jar`
重签名（官方文档《搭建流水线》给出的命令）：

```bash
java -jar hap-sign-tool.jar sign-app \
  -keyAlias "demo_key" \
  -signAlg "SHA256withECDSA" \
  -mode "localSign" \
  -appCertFile "/path/demo.cer" \
  -profileFile "/path/demo.p7b" \
  -inFile "/path/entry-default-unsigned.hap" \
  -keystoreFile "/path/demo.p12" \
  -outFile "/path/entry-default-signed.hap" \
  -keyPwd "******" -keystorePwd "******"
```

---

## 4. CI 构建

### 4.1 确切命令

CI（`.github/workflows/release.yml` 的 `harmony` job）执行的完整序列：

```bash
# 0) 环境：ErBWs/setup-ohos@v2（pin 到 commit SHA）安装 HarmonyOS 命令行工具，
#    并把 command-line-tools/bin 与 tool/node/bin 写入 PATH（hvigorw、ohpm、node 都可用）
sudo apt-get update && sudo apt-get install -y libgl1-mesa-dev   # 纹理压缩依赖

# 1) 同步应用本体到 rawfile（必做，rawfile/index.html 不进版本库）
./harmony/scripts/sync-rawfile.sh

# 2) 安装 ohpm 依赖
cd harmony
ohpm install --all

# 3) 构建 HAP
hvigorw clean --no-daemon
hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon
```

> `hvigorw` 必须**在工程根目录（`harmony/`）下**执行——官方 FAQ 明确要求先 `cd` 到工程根目录。

### 4.2 产物路径

官方文档《搭建流水线》给出的 HAP 产物路径模板：

```
${PROJECT_PATH}/{moduleName}/build/{productName}/outputs/{targetName}/xxx.hap
```

代入本工程（moduleName=entry，productName=default，targetName=default）：

```
harmony/entry/build/default/outputs/default/entry-default-unsigned.hap
```

因为工程没有配置签名，只会生成**未签名**包（官方文档：配置了签名信息才会同时生成
`xxx-signed.hap` 与 `xxx-unsigned.hap`）。

CI 的收集步骤不写死文件名，而是 `find harmony/entry/build -name '*.hap'`，
再复制成 `vocabulary-notebook-<版本>-harmony-unsigned.hap` 上传到 Release。

### 4.3 本地/CI 注意事项

- 官方文档要求 `hvigor/hvigor-config.json5` 依赖 npm 三方组件时先配置镜像：
  ```bash
  npm config set registry https://repo.huaweicloud.com/repository/npm/
  npm config set "@ohos:registry" https://repo.harmonyos.com/npm/
  ```
  本工程 `dependencies` 为空，正常不需要联网拉 hvigor 插件；
  但 `hvigorw` 首次运行仍可能自动安装 hvigor 引擎，故 CI 保留了该环境。
- Linux 对文件名大小写敏感，工程已开启 `strictMode.caseSensitiveCheck: true`，
  让 macOS/Windows 上的编译结果与 Linux 保持一致。

---

## 5. 版本号注入

`AppScope/app.json5` 的版本字段由 `scripts/set-version.mjs` 用正则覆盖：

```js
[/versionCode:\s*\d+/,       `versionCode: ${versionCode}`]
[/versionName:\s*"[^"]*"/,   `versionName: "${version}"`]
```

**因此这两行的写法是硬契约**：

```json5
    versionCode: 20260930,
    versionName: "2026.09.30",
```

两个要点，任一违反都会让 CI 的版本注入**静默失配**（脚本只 `console.warn`，不会失败，
最终产物会带着错误的版本号发出去）：

1. **key 不能加引号**。正则里的 `versionCode:` 要求冒号紧跟 key，
   写成 `"versionCode":` 就匹配不上。（JSON5 允许无引号 key，DevEco 也接受。）
2. **值必须是裸数字 / 双引号字符串**，不能是单引号。

> 该契约已由真实工具链验证：`node scripts/set-version.mjs 2026.09.30.1` 实际执行后，
> `app.json5` 被正确改写，且与 `index.html` 的 `APP_VERSION = '2026.09.30.1'` 保持一致。

---

## 6. hvigor 相关文件的来源与版本一致性（待验证清单重点项）

这一节回应 Lead 的核对要求，逐项说明**来源**与**版本一致性**。

### 6.1 `hvigor/hvigor-config.json5` —— 已确认使用新格式

内容：

```json5
{
  "modelVersion": "5.0.0",
  "dependencies": {},
  "execution": {},
  "logging": {},
  "debugging": {},
  "nodeOptions": {}
}
```

**旧格式 `hvigorVersion` 已确认不可用**，依据是我从华为 npm 源实际下载并解包的两个官方包
（`repo.harmonyos.com/npm`）：

| 依据 | 结论 |
| --- | --- |
| `@ohos/hvigor@6.24.5` 的 `res/hvigor-config-schema.json` | 顶层键白名单为 `["modelVersion","dependencies","execution","logging","debugging","nodeOptions","javaOptions","parameterFile","properties"]`，**不含 `hvigorVersion`**；`required = ["modelVersion","dependencies"]` |
| `@ohos/hvigor-ohos-plugin@6.24.5` 的 `src/const/version-const.js` | `MINIMUM_MODEL_VERSION = "5.0.0"`；`CURRENT_MODEL_VERSION` 由 `HosVersionMapper` 取当前 SDK 版本（该包解析为 **6.1.1**） |
| `@ohos/hvigor-ohos-plugin@6.24.5` 的 `src/utils/validate/validate-util.js` → `ValidateUtil.modelVersionCheck()` | 读取 `hvigor/hvigor-config.json5` 与工程级 `oh-package.json5` 的 `modelVersion`，两者**必须完全相等**，且都必须在 `[5.0.0, CURRENT_MODEL_VERSION]` 区间内，否则 `printErrorExit` 直接退出 |

因此：
- `modelVersion` 取 `"5.0.0"`（对应 HarmonyOS NEXT / API 12 的最低基线），
  低于等于命令行工具配套版本，满足 `[5.0.0, CURRENT]` 约束。
- 工程级 `oh-package.json5` 的 `modelVersion` **必须与之逐字相同**，两处都写成 `"5.0.0"`。
- 如果 CI 上命令行工具版本较新（例如 6.1.1），`"5.0.0"` 仍然合法（只要求 ≥ 最小值）；
  若想跟随工具版本，把两处**同时**改成工具配套版本即可。

**待验证**：CI 上 `setup-ohos@v2` 安装的命令行工具具体版本由 action 决定
（当前 release 为 `26.0.0.821`，SDK API 26）。本机无法安装该 SDK，因此
`"5.0.0"` 与 CI 实际 `CURRENT_MODEL_VERSION` 的匹配关系**未经真实构建验证**。

### 6.2 `hvigorw` 与 `hvigor/hvigor-wrapper.js` —— 已确认**不应**放进本工程

**这是我在自查中纠正的一处错误**：我最初从 `gitee.com/harmonyos/samples` 的一个旧样例
（`HarmonyOS_NEXT/International/International`）拷了 `hvigorw`、`hvigorw.bat` 和
`hvigor/hvigor-wrapper.js`。核对后**已全部删除**，原因有三：

1. **那套 wrapper 是旧格式**。我实际解包检查了该 `hvigor-wrapper.js`：它只读取
   `hvigorVersion` 字段，全文**没有 `modelVersion` 字样**。而该样例自己的
   `hvigor-config.json5` 正是 `{"hvigorVersion":"4.0.2", ...}` 的 DevEco 4.x 旧格式
   —— 也就是说 wrapper 与配置文件是**配套的旧版本对**，不能拆开混用新配置。
2. **现代 HarmonyOS NEXT 工程根本不提交这两个文件**。我核对了三个真实工程的文件树：
   - `TencentCloud/TIMSDK` → `HarmonyOS/Demo/`：有 `hvigor/hvigor-config.json5`
     （`modelVersion: "5.0.0"`），**无** `hvigorw`、**无** `hvigor-wrapper.js`
   - `AGenUI/AGenUI` → `platforms/harmony/`：有 `hvigor/hvigor-config.json5`
     （`modelVersion: "6.0.0"`），**无** `hvigorw`、**无** `hvigor-wrapper.js`
   - `ohosvscode/harmony-next-pipeline`（就是 Lead 参考的那套 CI）：有
     `hvigor/hvigor-config.json5`，**无** `hvigorw`、**无** `hvigor-wrapper.js`，
     而它的 CI 同样直接调 `hvigorw clean --no-daemon`
3. **官方文档就是这么要求的**。《搭建流水线》只要求
   `export PATH=${COMMANDLINE_TOOL_DIR}/command-line-tools/bin:$PATH`，
   然后 `cd` 到工程根目录执行 `hvigorw` —— `hvigorw` 由**命令行工具提供**，
   不需要工程自带。

**结论**：本工程**不包含** `hvigorw` / `hvigorw.bat` / `hvigor/hvigor-wrapper.js`，
`hvigorw` 一律使用 CI 环境（`setup-ohos`）`command-line-tools/bin` 里的那一份。
这样就不存在「wrapper 与 modelVersion 不匹配」的问题——因为工程里根本没有 wrapper。

> 官方 FAQ《如何解决构建流水线提示 Couldn't find hvigor/hvigor-wrapper.js 的问题》说的是
> **在工程外部**用脚本编译时的排查步骤（确认 wrapper 在工程的 hvigor 文件夹、并先 cd 到
> 工程根目录）。本工程走的是官方推荐的「PATH 里的 hvigorw + cd 到工程根目录」路径，
> 不触发该问题。
> <https://developer.huawei.com/consumer/cn/doc/doccenter-tools-faq/faqs-compiling-and-building-75>

**待验证**：`setup-ohos` 安装的命令行工具里，`command-line-tools/bin/hvigorw` 是否
自带可用的 wrapper（还是需要工程提供）。我无法在本机安装 2.1GB 的命令行工具包来确认；
但从上述三个真实工程的 CI 都直接调 `hvigorw` 且不带 wrapper 来看，应当自带。

### 6.3 `hvigorfile.ts` 的写法

工程级用 `appTasks`、模块级用 `hapTasks`，两种官方写法都存在（`export default { system, plugins }`
与 `export { appTasks } from '...'`）。本工程采用**兼容性更好的 `export default` 形式**
（DevEco 生成器与多数样例使用它）：

```ts
import { appTasks } from '@ohos/hvigor-ohos-plugin';
export default { system: appTasks, plugins: [] }
```

**待验证**：未在真实 hvigor 上跑过，两种写法的实际兼容性未经编译验证。

---

## 7. 应用本体（index.html）的同步

`entry/src/main/resources/rawfile/index.html` 是**派生产物**：

- 唯一事实来源是**仓库根目录的 `index.html`**。
- 同步脚本：`harmony/scripts/sync-rawfile.sh`（**请勿手改 rawfile 里的那份**，
  下次同步会覆盖）。
- 该文件已在根 `.gitignore` 与 `harmony/.gitignore` 中忽略，**不进版本库**。
- CI 在构建前会强制执行该脚本，并断言文件存在，防止漏同步。

```bash
./harmony/scripts/sync-rawfile.sh
# 已同步 .../index.html -> .../harmony/entry/src/main/resources/rawfile/index.html
# 大小：337853 字节
```

---

## 8. Web 壳的实现要点（`entry/src/main/ets/pages/Index.ets`）

```ts
Web({ src: $rawfile('index.html'), controller: this.controller })
  .domStorageAccess(true)    // localStorage —— 词汇本的数据靠它
  .databaseAccess(true)      // Web SQL / IndexedDB
  .fileAccess(true)          // 应用文件系统访问
  .onlineImageAccess(true)   // 从网络加载图片
  .mixedMode(MixedMode.All)  // 允许 HTTPS 页面加载 HTTP 资源
```

**返回键处理**（`@Entry` 组件的 `onBackPress`）：

```ts
onBackPress(): boolean {
  if (this.controller.accessBackward()) {
    this.controller.backward();
    return true;   // 页面自己处理了返回逻辑，不走系统默认路由
  }
  return false;    // 没有可回退历史 → 交回系统，由系统结束当前 UIAbility（退出应用）
}
```

官方文档对返回值的定义：**返回 `true` 表示页面自己处理返回逻辑，不进行页面路由；
返回 `false` 表示使用默认的路由返回逻辑**。

> ⚠️ 注意 `onBackPress` 的**生效范围**：官方文档写明它只在 **router 路由页面**
> （即被 `@Entry` 装饰的组件）生效。本工程只有一个 `@Entry` 页面，符合该条件。
> 若将来改用 `Navigation`/`NavDestination` 承载，需要改用 `NavDestination.onBackPressed`。

---

## 9. 权限

`module.json5` 声明了两个权限（用于应用内的「检查更新」功能）：

| 权限 | 用途 | 级别 |
| --- | --- | --- |
| `ohos.permission.INTERNET` | 访问网络检查更新 | normal（无需用户授权） |
| `ohos.permission.GET_NETWORK_INFO` | 检查更新前判断网络可用性 | normal（无需用户授权） |

两者均为 `normal` 级别，安装即授予，不会弹窗。

---

## 10. 数据存储

HarmonyOS NEXT 端的页面 origin 是 `resource://rawfile`，与 Web / Android / iOS **相互独立**，
互不同步（浏览器安全模型的必然结果）。升级安装包不会丢数据，但换包名会丢。
详见 `docs/multi-platform.md` §6。

---

## 11. 验证边界（诚实说明）

**本机没有 DevEco Studio、没有 HarmonyOS SDK，以下内容全部未做真实编译验证。**

### 11.1 本机实际做过的验证

| 验证项 | 手段 | 结果 |
| --- | --- | --- |
| 全部 `.json5` 可解析 | 去注释/去尾逗号后 `JSON.parse` | ✅ 通过 |
| 全部 `.json` 可解析 | `JSON.parse` | ✅ 通过 |
| 资源引用一致性 | 脚本扫描所有 `$media:` / `$string:` / `$color:` / `$profile:` 引用，与资源文件实际声明的 name 比对 | ✅ 通过 |
| `main_pages.json` 指向的页面文件存在 | 路径检查 | ✅ 通过 |
| 版本号可被 `set-version.mjs` 正则覆盖 | **真实执行了 `node scripts/set-version.mjs 2026.09.30.1`**，`AppScope/app.json5` 被成功改写为 `versionCode: 20260930` / `versionName: "2026.09.30.1"`，与 `index.html` 的 `APP_VERSION` 一致 | ✅ 通过（真实工具链，非模拟） |
| `sync-rawfile.sh` 实际执行 | 真实运行，产出 337853 字节 | ✅ 通过 |
| 字段名与官方文档一致 | 逐字段对照官方文档 / 官方 JSON Schema / 真实工程 | ✅ 已核对（出处见各文件注释） |

### 11.2 未验证（需在 CI 或装有 DevEco 的机器上确认）

1. **整个工程能否编译出 HAP** —— 从未跑过 `hvigorw assembleHap`。
2. **ArkTS 严格模式是否通过** —— 已刻意避免 `any`、对象字面量当类型、隐式 import，
   但未过编译器。
3. **`modelVersion: "5.0.0"` 与 CI 实际命令行工具版本的匹配**（见 §6.1）。
4. **`command-line-tools/bin/hvigorw` 是否自带 wrapper**（见 §6.2）。
5. **`deviceTypes` 取值** —— 写成 `["phone","tablet","2in1"]`。`phone` 取自华为官方样例
   （`harmonyos/samples` 的 `ETSUI/AboutSample` 等），但 OpenHarmony 文档的
   `deviceTypes` 枚举表只列出 `tablet/tv/wearable/car/2in1/default`。
   若 CI 报 `deviceTypes` 非法，把 `phone` 换成 `default` 即可。
6. **图标资源是否满足上架/打包的尺寸与格式要求** —— 直接复用了根 `icons/` 的 PWA 图标
   （512×512 PNG），未做鸿蒙分层图标的专用切图，仅提供了 `layered_image.json` 描述。
7. **未签名 HAP 的实际装机流程** —— 需真机与签名证书。

---

## 12. 参考来源

全部为华为开发者官网 / 官方发布物：

- 工程级 build-profile.json5：<https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-hvigor-build-profile-app>
- 模块级 build-profile.json5：<https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-hvigor-build-profile>
- hvigor-config.json5：<https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-hvigor-set-options>
- oh-package.json5：<https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-oh-package-json5>
- 命令行构建工具 hvigorw：<https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-hvigor-commandline>
- 搭建流水线（CI 构建与产物路径）：<https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-command-line-building-app>
- Web 组件属性（domStorageAccess 等）：<https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/arkts-basic-components-web-attributes>
- WebviewController（accessBackward / backward）：<https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/arkts-apis-webview-WebviewController>
- module.json5 配置文件：<https://raw.githubusercontent.com/openharmony/docs/master/zh-cn/application-dev/quick-start/module-configuration-file.md>
- app.json5 配置文件：<https://raw.githubusercontent.com/eclipse-oniro-mirrors/docs/OpenHarmony-5.1.0-Release/en/application-dev/quick-start/app-configuration-file.md>
- 页面生命周期 onBackPress：<https://raw.githubusercontent.com/openharmony/docs/master/zh-cn/application-dev/reference/apis-arkui/arkui-ts/ts-custom-component-lifecycle.md>
- 构建流水线报 Couldn't find hvigor-wrapper.js：<https://developer.huawei.com/consumer/cn/doc/doccenter-tools-faq/faqs-compiling-and-building-75>
- `@ohos/hvigor` / `@ohos/hvigor-ohos-plugin` 包（含官方 JSON Schema 与 VersionConst）：<https://repo.harmonyos.com/npm/>
