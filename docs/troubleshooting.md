# 故障排查

> 这里记录**已经真实发生过**的问题、诊断路径与结论。
> 每条都写明「现象 → 原因 → 处理」，方便下次快速定位。

## 目录

- [应用使用](#应用使用)
  - [卡片没有释义 / 一直是 `—`](#卡片没有释义--一直是-)
  - [卡片没有音标](#卡片没有音标)
  - [卡片没有例句](#卡片没有例句)
  - [导入后词条数不对 / 有漏词](#导入后词条数不对--有漏词)
  - [换了设备 / 浏览器，词汇本不见了](#换了设备--浏览器词汇本不见了)
- [安装与升级](#安装与升级)
  - [Android 提示「签名不一致」](#android-提示签名不一致)
  - [Android 安装时提示「未知来源」被拦截](#android-安装时提示未知来源被拦截)
  - [iOS 装不上](#ios-装不上)
- [构建与发版](#构建与发版)
  - [Gradle / sdkmanager 报「无法下载」](#gradle--sdkmanager-报无法下载)
  - [Gradle 报 `Given final block not properly padded`](#gradle-报-given-final-block-not-properly-padded)
  - [CI 发版失败](#ci-发版失败)
- [本地开发](#本地开发)
  - [Service Worker 没注册 / 更新不生效](#service-worker-没注册--更新不生效)

---

## 应用使用

### 卡片没有释义 / 一直是 `—`

**现象**：进入学习页后，卡片释义显示 `—`。

**原因**：应用**不内置词库**，释义全部来自在线词典。

> 导入时如果还没补全完，你看到的**不是空卡而是骨架卡**（标题旁显示「联网补全中 N / M」）。
> 骨架卡补全成功后才换成真实卡片，因此正常导入流程下不会直接看到空卡。

**处理**：

1. 若骨架卡显示「联网补全失败」，点**重试**（网络恢复后）或点**仍然查看**接受空卡；
2. 确认网络可用 —— 补全需要访问有道 `dict.youdao.com` 与 Datamuse `api.datamuse.com`；
3. 联网后重开应用，启动 3 秒会自动回填仍缺释义的词条（每次启动上限 400 词）；
4. 若日志出现 `Release 通道不可用` 之外的大量接口失败，可能是网络环境限制，换网络重试；
5. 确认没有关闭补全开关：控制台执行 `localStorage.getItem('vn_online_dict_v1')`，
   若为 `'0'` 则是被禁用，改回 `'1'` 后刷新。

> 单个词条保持空卡是**正常状态**而非解析失败：在线词典收录范围有限（尤其生僻词）。
> 判断导入是否成功看导入报告里的解析条数与未识别数，而不是卡片有没有释义。

### 卡片没有音标

**原因**：音标来自 Datamuse 的 ARPAbet 音素转换。若该词的 Datamuse 条目缺少 `pron:` 标签，
就没有音标。

**这是已知边界**，不是 bug。发音按钮不依赖音标，仍可正常播放。

### 卡片没有例句

**原因**：**没有任何可用的免费跨域例句来源**。

排查过的候选与结论：

| 来源 | 结论 |
| --- | --- |
| 有道 `jsonapi` | 数据最全（含 IPA 与双语例句），但**既无 CORS、加 `callback` 还返回 403**，浏览器无法调用 |
| 有道 `suggest` | 只有中文释义与词性，无例句 |
| Datamuse | 有释义与近反义词，无例句 |
| `api.dictionaryapi.dev` | 目标网络不可达 |
| Tatoeba | 302 重定向且返回 HTML，不是可用 API |

因此例句区块在无值时**整块隐藏**。将来接上可用来源会自动恢复。

### 导入后词条数不对 / 有漏词

**现象**：导入报告里出现「未识别 N 行」。

**处理**：导入报告会列出未识别的**原始行**（最多 40 行）。据此判断：

- 行内混了中文释义之外的干扰内容 → 应用会截断到首个中日韩字符之前；
- 编号格式不在支持范围内 → 支持的写法见 [README「支持什么格式的词表」](../README.md#支持什么格式的词表)；
- 词条不是以字母开头 → 会被计入 `rejected`（这是有意的，避免把正文当词条）。

调整源文件后重新导入即可。解析器会同时用「整篇扫描」与「逐段解析」两种方式，
取词条更多的结果。

### 换了设备 / 浏览器，词汇本不见了

**原因**：词汇本存在浏览器按 **origin** 划分的本地存储里，不上传任何服务器。

**这是设计取舍，不是缺陷。** 各来源的数据互不相通：

| 来源 | 独立数据 |
| --- | --- |
| `https://geek-xin.github.io` | 网页版 |
| `file://` | 下载的单文件副本 |
| `https://localhost`（Android） | APK 内 |
| `capacitor://localhost`（iOS） | App 内 |

**处理**：用应用内的「分享」把词汇本导出成 HTML 带走，在新设备打开后重新导入。

> 特别注意：本地单文件副本请**始终用 `file://` 双击打开**。本地文件来源统一是 `file://`，
> 换文件名、换目录都读得到同一份数据；若改用本地 http 服务打开，来源变了，书架就会是空的。

---

## 安装与升级

### Android 提示「签名不一致」

**现象**：安装新版 APK 时系统提示签名不一致 / `INSTALL_FAILED_UPDATE_INCOMPATIBLE`。

**原因**（已修复的历史问题）：**2026.10.01.7 之前**的版本用 `assembleDebug` 出包，
而 `debug.keystore` 由 AGP 在首次构建时随机生成、CI runner 每次都是全新环境，
**导致每次发版的签名都不一样**。Android 只允许同签名的 APK 互相覆盖安装。

**处理**：

1. 应用内「分享」导出词汇本；
2. 卸载旧版本（这一步会清掉本地数据）；
3. 安装 2026.10.01.7 及以后的新版；
4. 重新导入之前导出的词汇本。

> 新版已改为**固定密钥**签名，此后的版本可以正常覆盖升级。
> 密钥存在仓库 Secrets 里，**不要更换**，否则同样的问题会重演。
> 详见 [android/README.md](../android/README.md#签名固定密钥务必不要换)。

### Android 安装时提示「未知来源」被拦截

**原因**：Android 8.0+ 禁止侧载应用直接安装 APK，必须由用户显式授权。

**处理**：

- 首次安装：设置 → 安全 → 允许安装未知来源应用（部分系统在「更多安全设置」里）；
- 应用内升级：应用会检测权限并引导跳转到对应设置页，授权后重新点击更新即可；
- 华为/荣耀系统的「纯净模式」也会拦截，需临时关闭。

### iOS 装不上

**原因**：Release 里的 ipa 是**未签名**的，iOS 不接受未签名应用。

**处理**（三选一）：

1. **Xcode 直连签名** —— 打开 `ios/App/App.xcodeproj`，勾选 Automatically manage signing，选自己的 Team 后 Run；
2. **AltStore / Sideloadly 自签** —— 载入 ipa，用 Apple ID 重签名后安装；免费账号 **7 天后过期**，需重新签名；
3. **有开发者证书** —— 配置签名后用 `ios/ExportOptions.plist` 导出。

详见 [ios/README.md](../ios/README.md)。

---

## 构建与发版

### Gradle / sdkmanager 报「无法下载」

**现象**：

```
Failed to download any source lists!
IO exception while downloading manifest
```

**原因**：这通常**不是网络问题**。`sdkmanager` 默认把缓存写 `~/.android/cache`，
Gradle 默认写 `~/.gradle`；在受限沙箱 / 容器里这些目录不可写时，报出的却是上面这类
指向网络的假故障。

**处理**：显式把缓存指到可写目录：

```bash
export ANDROID_USER_HOME="$PWD/.android-user"
export GRADLE_USER_HOME="$PWD/.gradle-home"
```

并在 `android/local.properties` 写入 `sdk.dir=<SDK 绝对路径>`（该文件已 gitignore）。

### Gradle 报 `Given final block not properly padded`

**原因**：**PKCS12 密钥库不支持「库口令」与「密钥口令」不同**。
用 `keytool` 从 JKS 转 PKCS12 时会提示忽略 `-destkeypass`，
若 `ANDROID_KEYSTORE_PASSWORD` 与 `ANDROID_KEY_PASSWORD` 填了不同的值就会这样。

**处理**：把两个 Secret 设成**同一个值**。

### CI 发版失败

按以下顺序排查（都是从真实故障里总结的）：

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `APP_VERSION 与 tag 不一致` | 改了代码没同步版本号 | 跑 `node scripts/set-version.mjs <版本>` 后重新打 tag |
| `value too great for base (error token is "09")` | bash 把月份前导 0 当八进制 | 已修（workflow 用 `10#` 前缀）；若改写脚本注意同样问题 |
| `缺少 PWA 资源 manifest.webmanifest` | 文件改名后漏改校验清单 | 检查 `scripts/sync-web.mjs` 的 `ENTRIES` 与 `release.yml` 的资源校验列表 |
| Android job：`Failed to find package 'tools'` | `android-actions/setup-android` 在新镜像上失效 | 已改用自己的 `sdkmanager` 准备 SDK |
| HarmonyOS 相关 | 该端已移除 | 见 [multi-platform.md](multi-platform.md) §4.4 |

---

## 本地开发

### Service Worker 没注册 / 更新不生效

**原因**：Service Worker 只在 `https:` 或 `localhost` 下注册，`file://` 与原生 WebView 内均不注册。

**处理**：用内置的静态服务验证：

```bash
node scripts/serve.mjs        # 默认 http://127.0.0.1:4173
```

更新不生效时：`index.html` 走的是 **network-first**，一般刷新即可；
若仍不生效，在 DevTools → Application → Service Workers 里 Unregister 后重载。

`sw.js` 的缓存名由 `CACHE_VERSION` 控制，需要**强制丢弃全部旧缓存**时才 +1。
