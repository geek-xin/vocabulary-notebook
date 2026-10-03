# 版本历史

版本号对应 `index.html` 里的 `APP_VERSION`，格式 `YYYY.MM.DD.N`，按发版时间倒序（最新在上）。
每条写清：改了什么、为什么、如何验证。

> 本文件在 2026.10.02 重写：此前记录里混入了大量**内置词典时代**（731 词、联网兜底、精确匹配策略）
> 与**已移除的鸿蒙端**的细节，与当前实现矛盾；同时把「切换卡片过渡动画」从「未发布」归位到
> 它实际所属的版本。历史结论只保留仍然成立的取舍与仍然会复现的坑。

---

## 2026.10.02.7 —— 更新检查：多镜像兜底、重试退避、失败可查

> 状态：**待发版**。

### 问题

本项目所有产物都托管在 GitHub（Releases + Pages），而 **GitHub 在部分网络下时通时不通**。
原来的更新检查对此毫无办法：

1. **四条路全依赖 GitHub** —— Release API → Release 附件 → 线上 `index.html` 都指向
   `api.github.com` / `github.com` / `*.github.io`，一个域名不通就全军覆没；
2. **一次就放弃** —— 弱网下瞬时抖动很常见，但失败后直接换下一条，没有重试；
3. **超时偏紧** —— 8 秒上限要覆盖连接与读取两段，慢网络下常常还没读出内容就被掐掉；
4. **失败了也不知道为什么** —— 自动检查全程静默；手动检查只有一句「检查失败，
   请检查网络后重试」，用户无从判断是限流、断网还是域名不通。

### 改动

**一、多镜像链式兜底**

| 顺序 | 源 | 拿到的信息 |
| --- | --- | --- |
| 1 | GitHub Releases API | 版本 + Release 附件 + APK 直链 |
| 2 | GitHub Pages 线上 `index.html` | 只有版本号 |
| 3 | jsDelivr × 3 入口（`cdn` / `gcore` / `testingcf`） | 只有版本号 |

版本检查只需要读 `index.html` 里一个常量，不必非走 GitHub。jsDelivr 托管 GitHub
仓库文件且有多个入口，国内网络通常比 GitHub 原生域名稳 —— 这一条正是针对
「GitHub 连不上」。

**踩到的坑：镜像 URL 不能用 `@main`。** 第一版写成 `@main`，实测发版后
jsDelivr 仍在返回**上一个版本**的 `index.html`（`cache-control: max-age=604800`，
浮动引用的缓存键不变）。后果比连不上更糟：读到旧版本号 → 判定「已是最新」→
**用户永远收不到更新提示**。已改为按 `@v{APP_VERSION}` 现拼 —— tag 是不可变引用，
每个版本一个独立 URL。代价是「改了版本号但还没打 tag」时这些源 404，
自动落到下一个源，属于安全的失败方向。

**二、重试与超时**

- 超时 8s → **12s**；
- 每个源失败后**退避 600ms 重试一次**；
- **HTTP 错误不重试**（403 限流重试没有意义，直接换源，避免白等）。
- 顺带给 `fetchText` 加了 `cache: 'no-store'`，避免中间缓存返回陈旧版本号。

**三、失败可查但不打扰**

- 手动失败时给**具体原因**：403 说「接口限流了，过一会儿再试」，
  全不通说「连不上 GitHub 及其镜像，也可以直接到 Release 页手动下载」；
- 自动检查仍**不弹提示**，但把结果记进内存 `lastUpdateProbe`
  （`{ at, ok, source, error }`）并打控制台；用户随后手动点一次即可看到上次卡在哪；
- `lastUpdateProbe` **不落盘** —— 诊断信息，不是用户数据。

### 验证

真实浏览器（Playwright 驱动 `scripts/serve.mjs`），逐场景注入 fetch 故障。

| 场景 | 请求序列 | 结果 |
| --- | --- | --- |
| API 正常 | api | ✅ `source=release-api` |
| API 403 + Pages 通 | api → pages | ✅ `source=github-pages` |
| API 403 + Pages 不通 + jsDelivr 通 | api → pages ×2 → cdn | ✅ `source=jsdelivr` |
| 只有 gcore 通 | api → pages ×2 → cdn ×2 → gcore | ✅ `source=jsdelivr-gcore` |
| 全不通 | 4 个源各试到 | ✅ 不抛异常，`ok=false` 且 `error` 为最后原因 |
| 全不通（手动） | — | ✅ toast 给出「连不上 GitHub 及其镜像…」 |
| 全不通（自动） | — | ✅ 0 条 toast（不打扰），但 probe 已记录 |
| HTTP 403 / 404 | 每源只请求 1 次 | ✅ 不重试，总耗时约 1.8s |
| 真实网络 | api | ✅ 459ms，正确报「已是最新版本」 |

控制台 0 error；`npm test` 24 + 27 项断言全过。

---

## 2026.10.02.6 —— 清理脚手架残留与死代码，修正文档失真数字

> 状态：**已发布** —— tag `v2026.10.02.6`（2026-10-03），CI 四端产物全部构建成功，
> Release 已发布 `vocabulary-notebook.html` / `.apk` / `.ipa` 三个资产。

### 清理（删除的文件）

| 删除 | 为什么是冗余 |
| --- | --- |
| `android/app/src/test/…/ExampleUnitTest.java` | Capacitor 脚手架生成的模板测试，断言是 `assertEquals(4, 2 + 2)`，与本项目无关 |
| `android/app/src/androidTest/…/ExampleInstrumentedTest.java` | 同上，且断言 `getPackageName() == "com.getcapacitor.app"` —— 本项目包名是 `com.geekxin.vocabularynotebook`，**这个测试真跑起来必然失败** |
| `android/app/src/main/res/drawable/ic_launcher_background.xml` | 脚手架默认图标底图（青绿色网格），未被任何资源引用；应用图标用的是 `values/ic_launcher_background.xml` 里的深色 `#0F1724` |
| `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` | 同上，未被引用；adaptive icon 的前景走 `@mipmap/ic_launcher_foreground` |
| `.DS_Store`、`docs/.DS_Store` | macOS 目录元数据，已在 `.gitignore` 里 |

另清理了可再生的构建产物（`android/app/build`、`android/build`、`www`、iOS 同步产物），
它们本就被 `.gitignore` 排除，只是占着磁盘。

### 清理（删除的代码）

- `index.html` 里两个**从未被引用**的 id：`homeSearch`（搜索框容器）、`themeFab`（首页主题按钮）。
  两者都靠 class 定位（`.home-search` / `.theme-toggle`），id 是多余的。
  注：同批检出的 `confirmTitle` / `reportTitle` **保留** —— 它们被 `aria-labelledby` 引用。

### 修正的文档失真

- `docs/design.md` §12 的测试脚本表**漏了 `test-share.mjs`**，只列了两个脚本；
- `docs/multi-platform.md` §8.1 声称 SW 23 项 / 分享 26 项断言，实测为 **24 / 27**；
- README 与 design.md 的 `index.html` 体积（186 KB / gzip 55 KB）已随本轮改动过期，实测 **190 KB / 56 KB**。

### 保留的（看着像冗余但不是）

| 文件 | 为什么保留 |
| --- | --- |
| `ios/App/CapApp-SPM/` | Capacitor 8 的 SPM 依赖宿主，`project.pbxproj` 里引用 9 处，删了 iOS 构建会挂 |
| `ios/debug.xcconfig` | 被 `project.pbxproj` 当作 `baseConfigurationReference` 引用 |
| `ios/ExportOptions.plist` | 供自签名导出使用，`ios/README.md` 与 troubleshooting 都有引用 |
| `android/tools/gen-android-icons.py` | 与 `scripts/gen-icons.py` 职责不同：后者生成根 `icons/`，前者从它派生 Android mipmap 全套；`android/README.md` 有引用 |
| `.nojekyll` | GitHub Pages 用它跳过 Jekyll 处理，Pages 构建实际需要 |
| `android/app/src/main/res/values/ic_launcher_background.xml` | 与同名 drawable 不同，这个**被** adaptive icon 引用 |

### 验证

| 项目 | 结果 |
| --- | --- |
| 清理后干净重建 | ✅ `gradlew clean assembleDebug` BUILD SUCCESSFUL |
| release 构建路径 | ✅ `gradlew assembleRelease` BUILD SUCCESSFUL |
| APK 资源清单比对 | ✅ 与清理前逐条 diff，**唯一差异就是被删的 3 个文件**；图标与启动图 30 项完全一致 |
| 功能回归 | ✅ 主题切换、搜索过滤、翻面动画、切换动画、骨架卡（无分享 / 保留删除）、分享页导出自包含，均正常 |
| 控制台 | ✅ 除已知的 GitHub API 403 回退外无报错 |
| `npm test` | ✅ 24 + 27 项断言全过 |

---

## 2026.10.02.5 —— 翻面改用「转到侧面时换面」的翻转动画

> 状态：**已发布** —— tag `v2026.10.02.5`（2026-10-02），CI 四端产物全部构建成功，
> Release 已发布 `vocabulary-notebook.html` / `.apk` / `.ipa` 三个资产。

### 问题

上一版为了修镜像 / 空白，把翻面退化成了**纯透明度交叉淡入**（卡片完全不旋转）。
代价是丢掉了「翻过去」这个动作本身的语义 —— 用户点一下，内容直接变了，
没有任何方向感。

### 改动

补回翻转动画，但换面藏在**看不见的那一瞬间**：

```
rotateY(0deg) → rotateY(90deg)   170ms   ← 转到侧面
        （此刻宽度为 0，换面）
rotateY(-90deg) → rotateY(0deg)  210ms   ← 从另一侧转回
```

- 旋转只走 **0°→90°→0°** 两个四分之一拍，不转 180°；
- 换面发生在 90°：卡片算出来的宽度正好是 0，看不到任何跳变；
- 任何时刻要么看不见，要么看到的是**正对镜头、没有镜像**的一面 ——
  这正是上一版 180° 翻转的两个病根（文字镜像、背面空白）；
- `.scene` 补回 `perspective: 1800px`，否则 `rotateY` 看着是「压扁」而不是「转过去」；
- 新增 `.card.flipping .card-face { transition: none }`，翻转期间关掉交叉淡入，
  避免两个过渡抢 `opacity`；
- `flipping` / `switching` 互为守卫：翻转中忽略新的翻转；
  `switchTo` 开始时先 `cancelFlip()`，`renderWord` 换词时也收尾，
  避免卡片停在转到一半的角度；
- 减弱动效下直接换面，不播动画；
- 分享页（`buildShareScript`）同步同一套翻转逻辑。

### 验证

真实浏览器（Playwright 驱动 `scripts/serve.mjs`，1100×860）。

| 项目 | 结果 |
| --- | --- |
| 动画关键帧 | ✅ `rotateY(0deg)→rotateY(90deg)`（170ms）+ `rotateY(-90deg)→rotateY(0deg)`（210ms） |
| 中途采样 | ✅ 约 80/120ms 时卡片已在转（`matrix3d` 非单位阵），换面后 `show-back` 变真 |
| 90° 那一刻 | ✅ 卡片 `getBoundingClientRect().width === 0`，完全不可见 |
| 45° 截图 | ✅ 文字被透视压缩但**不镜像**（旋转只到 90°，不会翻到背面朝前） |
| 连点两次 | ✅ `flipping` 守卫忽略第二次，收尾后 `transform: none`，不卡半路 |
| 背面时切换下一张 | ✅ 回到正面显示新词，无残留角度 |
| 翻转途中切换 | ✅ 先收尾再切换，结束后 `flipping` / `switching` 均为 false |
| 减弱动效 | ✅ 0 次 `animate` 调用，直接换面 |
| 音频按钮 | ✅ 不触发翻转 |
| 分享页 | ✅ 导出含同一套翻转逻辑；iframe 内真实渲染点击，`matrix3d` 正常变化、内容正确切换 |
| 控制台 | ✅ 0 error / 0 warning |
| `npm test` | ✅ 内联脚本语法 + SW + 分享通道全部通过 |

截图 `docs/images/card-front.png`、`card-back.png` 已重新渲染截取。

---

## 2026.10.02.4 —— 卡片四角统一圆弧

> 状态：**已发布** —— tag `v2026.10.02.4`（2026-10-02），CI 四端产物全部构建成功，
> Release 已发布 `vocabulary-notebook.html` / `.apk` / `.ipa` 三个资产。

### 问题

卡片四角不是一套：左缘 3px（近乎直角）、右缘 `clamp(16px, 3vw, 24px)`。
这个不对称圆角是为**装订边**做的呼应 —— 左缘是装订侧，所以收窄。

但上一版扁平化已经把装订边的暗部去掉了，这个左直角就失去了依托：

1. 它和其余三个圆角不是一套语言，看着像**只渲染了一半**；
2. 卡片小尺寸（窄屏 324px 宽）时，3px 与 20px 的差异尤其扎眼；
3. 窄屏还有一条单独的覆盖规则 `border-radius: 3px 20px 20px 3px`，
   等于同一个设计写了两遍，改一处就得记得改另一处。

### 改动

`.card-face` 的 `border-radius` 改成一个值：

```css
/* 之前 */
border-radius: 3px clamp(16px, 3vw, 24px) clamp(16px, 3vw, 24px) 3px;
/* 现在 */
border-radius: clamp(16px, 3vw, 24px);
```

窄屏覆盖规则同步改成 `border-radius: 20px`。

### 验证

真实浏览器（Playwright 驱动 `scripts/serve.mjs`）。

| 项目 | 结果 |
| --- | --- |
| 桌面 1100px | ✅ 正面 / 背面四角均为 `24px`，`Set` 去重后只剩 1 个值 |
| 中间宽度 641 / 768px | ✅ 均为 `19.23px` / `23.04px`，四角一致 |
| 窄屏 640 / 480 / 390px | ✅ 均为 `20px`，四角一致（覆盖规则已同步） |
| 深 / 浅主题 | ✅ 四角一致，描边与纹理不受影响 |
| 正 / 背面 | ✅ 两面都统一 |
| `npm test` | ✅ 内联脚本语法 + SW + 分享通道全部通过 |

截图 `docs/images/card-front.png`、`card-back.png` 已重新渲染截取。

---

## 2026.10.02.3 —— 卡片改为原地换内容，不再 3D 翻转

> 状态：**已发布** —— tag `v2026.10.02.3`（2026-10-02），CI 四端产物全部构建成功，
> Release 已发布 `vocabulary-notebook.html` / `.apk` / `.ipa` 三个资产。

### 问题

点卡片原本走的是 3D 翻转：`.card.flipped { transform: rotateY(180deg) }`，
配合 `preserve-3d` 与 `backface-visibility: hidden`，让整张卡绕 Y 轴转 180°。

用户反馈「卡片翻转显示词汇近义词等，不是把卡片转过来」—— 问题就出在**「转」这个动作本身**：

1. 旋转过程中卡片侧过去，**文字会镜像**；
2. WebView 的 3D 渲染差异还可能让背面整片空白；
3. 结果用户看到的不是近反义词，而是一张翻过去的卡。

这里要表达的只是「点一下看近反义词」，不需要动 `transform`。

### 改动

**正 / 背面原地交叉淡入淡出，卡片不旋转。**

- 两个 `.card-face` 绝对定位叠在同一位置；`.card-back` 默认
  `opacity: 0; visibility: hidden`，`.card.show-back` 把两者的透明度对调，过渡 0.18s；
- 用 `visibility` 而不只是 `opacity`，是为了让隐藏面的内容不参与点击与 tab 焦点；
- 删掉 `.scene` 的 `perspective`、`.card` 的 `transform-style: preserve-3d` 与
  `transition: transform`、`.card-face` 的 `backface-visibility`、
  `.card-back` 的 `transform: rotateY(180deg)`；
- `switchTo` 的退出 / 进入两拍只做 `translateX` 位移，不再带 `rotateY`；
- `renderWord` 内部把 `show-back` 归零，换词一定从正面出现；
- 翻转逻辑抽成 `toggleFlip()`，点击与键盘（空格 / 回车）共用；
- 提示文案：「点击卡片翻转」→「点击看近反义词」，背面补上「点击回到释义」，
  `aria-label` 同步改为「单词卡片，点击查看近义词与反义词」；
- 分享页（`buildShareScript`）同步了同一套逻辑。

### 验证

真实浏览器（Playwright 驱动 `scripts/serve.mjs`，1100×860）。

| 项目 | 结果 |
| --- | --- |
| 卡片是否旋转 | ✅ 正 / 背面切换过程中 `transform` 恒为 `none` |
| 内容切换 | ✅ 正面 `opacity 1 / 0`，背面 `0 / 1`，`visibility` 同步对调 |
| 来回切换 | ✅ 两次点击后完全回到初始态 |
| 背面时切换下一张 | ✅ 回到正面显示新词（`show-back` 归零） |
| 切换动画 | ✅ 仍触发 2 次 `animate`，只做 `translateX` |
| 键盘空格 / 回车 | ✅ 同样切换，再按一次切回 |
| 音频按钮 | ✅ 不触发切换（`closest('.audio-btn')` 守卫生效） |
| 分享页 | ✅ 导出 HTML 无 `rotateY` / `preserve-3d` / `.flipped`；在 iframe 内真实渲染并点击，内容正常切换 |
| `npm test` | ✅ 内联脚本语法 + SW + 分享通道全部通过 |

截图 `docs/images/card-front.png`、`card-back.png` 已按新交互重新渲染截取。

---

## 2026.10.02.2 —— 学习页卡片扁平化：去掉全部阴影

> 状态：**已发布** —— tag `v2026.10.02.2`（2026-10-02），CI 四端产物全部构建成功，
> Release 已发布 `vocabulary-notebook.html` / `.apk` / `.ipa` 三个资产。

### 问题

上一版把学习页卡片做成了「一页书」，但深度是靠阴影堆出来的，一共三层：

1. 外投影 `0 18px 34px rgba(0, 0, 0, 0.36)` —— 卡片「浮」在背景上；
2. 内高光 `inset 0 2px 10px rgba(255, 255, 255, 0.85)` —— 纸面反光；
3. 装订边 `-16px 0 24px -18px ... inset` —— 左缘压出一道暗部，暗示订口。

三层叠起来，卡片更像一块**有厚度的面板**，而不是一页纸。扁平化就是把这层厚度去掉。

### 改动

`.card-face` 的 `box-shadow` 一律为 `none`，三层全部去掉：

- **边界改用发丝描边**：卡片与背景同为浅色，去掉投影后需要一条线划出边界 ——
  浅色 `rgba(20, 50, 80, 0.1)`，深色换成烫金 `rgba(201, 164, 76, 0.16)`（与外壳强调色对齐）；
- **纸的层次交给纹理与「印刷件」**：纤维噪声（`--book-grain`）、页眉、页码、衬线字头全部保留，
  只是不再靠阴影造深度；
- **深色主题的覆盖规则只改 `background-image` 与 `border-color`**，不再重写 `box-shadow`；
- **删掉浅色主题整块 `html[data-theme="light"] .card-face { box-shadow: ... }` 覆盖规则**。

装订边（左缘 `inset` 暗部）本质上也是一层内阴影，留着就还是「有深度」，一并去掉。
书的结构现在只靠**页眉 + 页码 + 衬线字头 + 左窄右宽的圆角**表达。

### 为什么删规则而不是把阴影值改成 `none`

深色主题那套 `box-shadow` 是写在 `html[data-theme="dark"]` 里的**整体覆盖**，
浅色那套同理。只要还留着这些规则，将来改一处就会漏一处 ——
上一版就踩过「浅色主题漏写装订边阴影导致它凭空消失」。
现在基础样式里直接不写 `box-shadow`，主题规则里也没有它，**没有阴影可丢**。

### 验证

真实浏览器（Playwright 驱动 `scripts/serve.mjs`，1100×860 与 390×780 两种视口）。

| 项目 | 结果 |
| --- | --- |
| `.card-face` 计算样式 | ✅ 深浅两个主题下 `box-shadow` 均为 `none` |
| 正 / 背面 | ✅ 两面都无阴影，纤维纹理与页眉页码保留 |
| 发丝描边 | ✅ 浅色 `1px rgba(20, 50, 80, 0.1)`；深色 `1px rgba(201, 164, 76, 0.16)` |
| 切换动画 | ✅ 仍触发 2 次 `animate`（退出 + 进入），词条正常刷新 |
| 分享页 | ✅ 导出 HTML 中 `.card-face` 无 `box-shadow`，`switchTo` 与 `.page-folio` 仍在 |
| `npm test` | ✅ 内联脚本语法 + SW + 分享通道全部通过 |

截图 `docs/images/card-front.png`、`card-back.png` 已按扁平后的界面重新渲染截取。

---

## 2026.10.02.1 —— 补全成功才出卡片、学习页改排成「书页」、切换卡片加过渡动画、修 Android 分享

> 状态：**已发布** —— tag `v2026.10.02.1`（2026-10-02），CI 四端产物全部构建成功，
> Release 已发布 `vocabulary-notebook.html` / `.apk` / `.ipa` 三个资产。

### 问题

三件事在同一个版本里落地：

1. 导入后立刻渲染真实卡片，而释义要等后台联网补全才填上 —— 用户看到的是**一屏释义为 `—` 的空卡**，
   分不清「正在补全」「词典没收录」还是「解析坏了」，导入几百词时尤其难受；
2. 学习页那张卡片是「深色玻璃面板里嵌一块白板」的观感，和首页书架不是一套语言；
3. 切换卡片时 `renderWord` 把新旧内容原地替换，卡片没有任何过渡，视觉上是「文字瞬间跳变」，
   且缺少方向感 —— 用户分不清翻到了下一张还是上一张；
4. **Android 端点分享提示「当前浏览器不支持系统分享」**，词汇本根本发不出去。

### 改动一：联网补全成功后才呈现卡片

导入路径从「解析 → 落盘 → 立即出卡片 → 后台静默补全」改为
**「解析 → 落盘 → 骨架卡 → 联网补全 → 成功才换成真实卡片」**：

- 新增内存侧表 `pendingBooks`（`id -> { status, done, total }`），**绝不持久化**。
  若持久化，离线用户重开应用会永远看不到自己已导入并落盘的数据 —— 那是数据可用性事故。
  页面重开后该词汇本按已知词汇本处理，走启动回填路径正常显示。
- 骨架卡显示标题、词数、「联网补全中 done / total」与细进度条；
  **不可进入学习页、不提供分享**（补全前进去只有空卡，导出的也是空释义），
  **保留删除**，让用户能撤销本次导入。
- `enrichWords` 新增返回字段 `answered`：至少一个来源在 **HTTP 层正常应答**（哪怕没查到该词），
  与 `filled`（真的填进了内容）区分开。**有任一来源应答即算成功**，
  个别生僻词查不到不阻塞呈现；离线 / 联网开关关闭 / 零应答才算失败。
- 失败态骨架卡显示「联网补全失败」，提供**重试**与**仍然查看**，
  并 toast 明确提示「联网补全失败，词汇本已保存」，不静默。
- 取消原先「延迟 800ms 启动补全」的 setTimeout —— 骨架卡本身就是进度反馈，不再需要错峰。

**改动一顺带修掉的问题**：

- 离线分支原先只标记失败却不重绘，骨架卡会永远停在「联网补全中 0 / N」，看起来像卡死；
- 落盘失败（如配额不足）原先仍算成功，用户会看到「已就绪」但重开应用内容不见 ——
  现在落盘失败同样判失败并进入失败态；
- 补全期间用户删掉词汇本，收尾时会给已删除的书重建 pending 条目，留下悬挂状态。

### 改动二：卡片按书页来排

做书的方式是加「书的结构」，不是换一套配色：

| 书的部件 | 实现 |
| --- | --- |
| 纸张 | 内联 SVG 噪声（`--book-grain`）叠在原纸白渐变上，`soft-light` 混合 |
| 订口 | 左缘向内压出的暗部（`inset` 阴影），左缘圆角收窄（3px）、右缘放宽 |
| 页眉 | 左栏书名、右栏当前词条，下压一条细线（`.page-runhead`） |
| 页码 | 页面下缘居中的 folio（`.page-folio`），两侧各一段短线 |
| 字头 | 衬线字（`--book-serif`），词性改成贴字底的斜体金线而非胶囊 |
| 释义 | 宽屏（≥700px）下英中**对开双栏**，中间一条细线；窄屏堆叠 |
| 近反义词 | 排成一行连续文字，用 `·` 分隔，而不是一堆胶囊 |

配色沿用整体那套（深色外壳、纸白、蓝 `#1e6f9f`、金 `#ffd966`），
书页里只新增一个金色 `#c9a44c` 作分隔点。衬线字体只用系统字体栈，不引外部字体。

### 改动三：切换卡片的两拍过渡动画

新增 `switchTo(index, direction)`，用 Web Animations API 播两拍：
**退出 130ms → 换内容 → 进入 220ms**，合计约 350ms。换内容发生在卡片不可见的那一瞬间，
所以看不到文字跳变。位移量固定为卡片宽度的 8%。

- **不动 `renderWord`**。它现有 5 处调用，其中 3 处（进入学习页、联网补全后刷新、启动回填后刷新）
  **必须保持瞬间替换** —— 那些不是用户主动切换。这是本次改动的接缝。
- **关掉原有翻面过渡**。CSS 里 animation 会整体接管该属性的过渡，若不处理，
  `.card` 原有的 0.6s `transition: transform` 会与动画抢 `transform` 而出现拖尾。
  切换期间临时加 `.card.switching { transition: none }`，收尾时摘掉。
- **在背面时切换**：退出拍把 `rotateY` 从 180° 收敛到 0°，与滑出合并为一次动画，新卡正面滑入。
- **方向语义**：顺序切换恒为向前（含最后一张绕回第 1 张 —— 若按目标页与当前页的大小比较会被误判成
  「向后」），方向键按自身方向，随机与页码跳转按大小比较。
- **连按**：动画未播完又来新切换 → `cancel()` 当前动画、瞬间换内容、不播动画。
- **减弱动效**：`prefers-reduced-motion: reduce` 时退化为瞬间替换。
  注意 CSS 媒体查询管不到 Web Animations API，这一条必须在 JS 里用 `matchMedia` 判定。
- **分享页同步**：`buildShareScript` 生成的是自包含脚本，补了同一套切换逻辑。

**改动二 / 三顺带修掉的问题**：

- 浅色主题下 `html[data-theme="light"] .card-face` 的 `box-shadow` 是**整体覆盖**而非叠加，
  只写外描边与投影会让订口凭空消失，书页看着又变回一块面板 —— 已把订口阴影一起写全。
- 窄屏（≤640px）放不下「居中页码 + 右对齐提示」，页码改为 `position: static` 落到左端，
  与右端的翻转提示分列两侧。

### 改动四：修 Android 端点分享提示「浏览器不支持」

**现象**：Android APK 内点词汇本卡片上的分享按钮，只弹「当前浏览器不支持系统分享」。

**原因**：`shareBook` 只判断 `navigator.share`，而 **Android WebView 不实现 Web Share API**
（它不是完整 Chromium，Web Share 由系统级集成提供，WebView 拿不到），
所以壳内 `navigator.share` 恒为 undefined，函数在第一道判断就返回了。

**这一条比看起来严重**：词汇本按 origin 隔离存储、不云同步，分享是**唯一**的跨设备搬运通道。
Android 端这条路一断，用户既不能把词表发到别的设备，也不能在换机时保住数据 ——
而 Android 恰恰是移动端的主要分发形态。

**处理**：把分享拆成三条通道，按环境同步选择（`nativeShare()` → `navigator.share` → 复制文本）：

- **新增原生插件 `SharePlugin`**（`android/.../SharePlugin.java`，在 `MainActivity` 注册）。
  JS 传入分享页 HTML → 原生落盘 `cache/share/` → `FileProvider` → `ACTION_SEND` +
  `createChooser` 拉起系统分享面板，效果与 Web 端的 `navigator.share({ files })` 对齐。
- **桌面浏览器 / `file://` 单文件**原先直接放弃；现改为把词表文本复制到剪贴板，
  至少能粘到聊天窗口发出去。优先同步的 `execCommand`（剪贴板同样要用户激活），
  失败再退到异步 `navigator.clipboard.writeText`。
- 通道判定保持**同步**：系统分享与剪贴板都要求 transient activation，一旦 `await` 过就丢。

**踩到的两个坑**（都写进了 `SharePlugin` 的注释）：

- **只加 `FLAG_GRANT_READ_URI_PERMISSION` 不够**，必须同时 `setClipData`，
  否则部分接收方（尤其国产 IM）拿不到读权限，分享会以「无法读取文件」失败。
- **必须用 `startActivityForResult` + `@ActivityCallback`**，用户取消分享时返回
  `RESULT_CANCELED`；不上报的话 JS 侧会把「取消」当成失败弹提示。

### 验证

真实浏览器（Playwright 驱动 `scripts/serve.mjs`，1280×860 与 390×780 两种视口）+ `npm test`。

| 项目 | 结果 |
| --- | --- |
| 顺序切换 / → 方向键 | ✅ 退出 `translateX(-8%)`、进入 `+8%`（向前） |
| ← 方向键 | ✅ 退出 `+8%`、进入 `-8%`（向后） |
| 最后一张绕回第 1 张 | ✅ 仍为向前（退出 `-8%`、进入 `+8%`） |
| 随机切换 / 页码跳转 | ✅ 按目标页与当前页大小比较定方向 |
| 单张卡 / 跳到当前页 | ✅ 不播动画（0 次 `animate` 调用） |
| 减弱动效 | ✅ 0 次 `animate` 调用，词条正常更新 |
| 书页部件 | ✅ 页眉（书名 + 词条）、页码、衬线字头、订口阴影均生效 |
| 释义分栏 | ✅ 宽屏 `grid-template-columns: 318px 318px`；390px 视口下为单列 |
| 窄屏页码 | ✅ `position: static`、`transform: none` |
| 书页主题 | ✅ 订口阴影在深色与浅色下都生效（浅色下曾被 `box-shadow` 覆盖丢失） |
| 分享页导出 | ✅ 约 55 KB、0 个外部 `script`/`link`，含 `switchTo` / `.page-runhead` / `.page-folio` / 减弱动效分支 |
| 联网导入 3 词 | ✅ 先骨架卡（`联网补全中 0 / 3`），约 1.3s 后换成真实卡片，释义齐全 |
| 断网导入 | ✅ 骨架卡显示「联网补全失败」，出现「重试」「仍然查看」；数据已落盘（1 本 2 词） |
| 点「仍然查看」 | ✅ 换成真实卡片，可正常进入学习页 |
| 部分词查不到（`zzqqxxtt`） | ✅ 判成功、呈现卡片；`apple=苹果`，生僻词保持 `—` |
| 骨架卡 | ✅ 补全期间点击不进入学习页、不提供分享、保留删除 |
| 断网后恢复网络点「重试」 | ✅ 回到进行中态，随后补全成功 |
| 补全期间删除词汇本 | ✅ 无悬挂 pending 条目 |
| 浅色 / 深色主题 | ✅ 骨架卡与失败态均正常（见 `docs/images/pending-loading-light.png`、`pending-failed-dark.png`） |
| 分享通道（Android 壳） | ✅ 调 `SharePlugin`、不入 `navigator.share`、不再提示「不支持」 |
| 分享通道（Web / PWA） | ✅ 走 `navigator.share`，`canShare` 为真时带 `text/html` File |
| 分享通道（桌面 / `file://`） | ✅ 复制词表文本；`execCommand` 失败时退到剪贴板 API |
| 原生分享取消 | ✅ `dismissed` 不弹失败提示 |
| 原生分享抛错 | ✅ 明确提示原因并留控制台日志，不静默 |
| 分享文件名清洗 | ✅ 路径分隔符 / 通配符 / 引号全部替换，仍以 `.html` 结尾 |
| Android 构建 | ✅ `./gradlew clean assembleDebug` 通过，APK 内 `classes.dex` 含 `SharePlugin` |
| 端到端资源链路 | ✅ `sync-web.mjs` → `cap sync android` → APK 内 `assets/public/index.html` 含新分享逻辑 |
| `npm test` | ✅ 内联脚本语法 + SW 23 项 + 分享通道 26 项断言 |

**未验证边界**：真机 WebView（Android / iOS）中的表现未验证，本机无设备。
分享面板能否真的拉起、微信能否收到文件，需真机确认；本机只验证到「选对了通道、
入参正确、构建产物包含该逻辑」。

---

## 2026.10.01.8 —— README 与文档优化，补充截图与故障排查

### 改动

README 从 197 行扩到 296 行，参考主流开源项目的组织方式重写：

- **居中头部**：图标 + 一句话简介 + 徽章（release / CI 状态 / 许可证 / 平台）+ 快捷导航；
- **界面截图**：新增 4 张实拍截图（书架深/浅色、卡片正/反面），截图由 Playwright 真实渲染后截取；
- **快速开始**：三种使用方式（在线 / 下载单文件 / 克隆仓库）；
- **下载与安装**：表格给出各端直链，文件名固定不带版本号；
- **常见问题**：6 个折叠问答，全部来自真实踩过的问题（例句来源、音标口音、离线边界、数据隔离、签名不一致、导入漏词）；
- **技术说明 / 开发构建 / 已知限制 / 贡献指南**：补全为一个完整 README 应有的结构。

文档侧：

- 新增 [troubleshooting.md](troubleshooting.md)：按「现象 → 原因 → 处理」组织，
  覆盖应用使用、安装升级、构建发版、本地开发四类问题，每条都来自真实故障；
- [README.md](README.md) 重写为 wiki 式索引：按「我想做什么」导航，附项目结构图与维护约定。

仓库设置：

- 补上 `homepage`（此前为空）；
- 新增 8 个 topics：`vocabulary` / `english-learning` / `flashcards` / `pwa` / `single-file` /
  `offline-first` / `capacitor` / `indexeddb`。

### 顺带修掉的问题

- 卡片背面的「近义词 (PET)」「反义词 (PET)」标签：PET 词典早已移除，标签没跟着改；
- 3 处文档内的相对链接写成了 `../../README.md`（多了一层，实际指向仓库外），已修正为 `../README.md`。

### 验证

| 项目 | 结果 |
| --- | --- |
| README markdown 结构 | ✅ div / details / 代码围栏均配对 |
| 文档内 md 链接 | ✅ 32 个链接全部有效（用脚本逐个解析校验） |
| 截图资源 | ✅ 4 张图片本地存在且路径正确 |
| 徽章可达性 | ✅ release / license / platform 徽章均返回 200 |
| 下载直链 | ✅ apk / ipa / html 三个 latest 直链均可用 |
| `npm test` | ✅ 通过 |

> 说明：GitHub Wiki 无法通过 API 或推送初始化（GitHub 只允许在网页端创建首篇页面），
> 因此「wiki」这部分落在 `docs/` 上。若需要真正的 GitHub Wiki，
> 需先在仓库 Wiki 页手动创建任意一页完成初始化，之后即可用 git 推送维护。

---

## 2026.10.01.7 —— 固定签名密钥 + Android 应用内升级

### 问题：用户根本无法升级

用户反馈「自动更新提示签名不一致」。排查确认属实，而且比预想严重：

| APK 来源 | 证书 SHA-256 |
| --- | --- |
| 本机构建 | `718e70fc…` |
| CI 发布 | `0291ccd9…` |

**两者不同。** 根因是 CI 一直用 `assembleDebug` 出包：debug.keystore 由 AGP 在首次
构建时随机生成，而 GitHub runner 每次都是全新环境 —— 于是**每次发版的签名都不一样**。
Android 只允许同签名的 APK 互相覆盖安装，签名不一致会直接拒绝
（`INSTALL_FAILED_UPDATE_INCOMPATIBLE`），用户只能卸载重装，而卸载会连词汇本数据一起清掉。

### 修复：固定 release 密钥

1. 生成 4096 位 RSA 密钥（有效期 30 年），转成 PKCS12；
2. 存入 GitHub Secrets：`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` /
   `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`；
3. `android/app/build.gradle` 读取这些环境变量还原密钥并配置 `signingConfigs.release`，
   开启 v1 + v2 签名；
4. CI 改跑 `assembleRelease`，并在收集产物前用 `apksigner verify` 校验签名。

本机没有这些环境变量时自动跳过签名配置，`assembleDebug` 调试不受影响。

**踩到的坑**：PKCS12 不支持「存储口令」与「密钥口令」不同，
`keytool` 转换时会警告并忽略 `-destkeypass`，若两个 Secret 填了不同的值，
Gradle 会报 `Given final block not properly padded`。已把两者设为同一口令。

验证：连续两次 `clean assembleRelease`，证书指纹完全一致（`bc3d2322…`）。

### 新增：Android 应用内升级（无感）

以前原生壳里点更新只会跳浏览器打开 Release 页，用户还得自己找包、下载、再点安装。
现在改为应用内完成：

- 新增原生插件 `AppUpdaterPlugin`（约 180 行 Java，无第三方依赖）：
  下载 APK 到 cache → 经 FileProvider 交给系统安装器 → 拉起安装界面；
- 带「已下载则复用」判断与下载进度事件，避免重复下载 4 MB；
- 新增 `REQUEST_INSTALL_PACKAGES` 权限；
- 请求下载前先查「安装未知应用」权限，未授权则引导去设置页，而不是失败后才发现；
- Web / iOS 上插件不存在，自动降级为原有行为（Web 下载 HTML、iOS 跳 Release 页）。

> 说明：Android 8.0+ 强制要求用户手动授予「安装未知应用」权限，且安装确认框必须用户点击，
> 所以这是「无感」而非「静默」—— 但已经省掉了跳浏览器、找包、选文件等全部中间步骤。

### 迁移说明（重要）

**已安装旧版本的用户无法直接升级到本版**：旧包用的是每次随机构建的 debug 密钥，
与新固定密钥不同。需要先导出词汇本（应用内「分享」），卸载后装新版，再重新导入。
这是修复历史问题的必要代价 —— 在此之前，旧版本之间同样无法互相覆盖安装。

### 验证

| 项目 | 结果 |
| --- | --- |
| 签名稳定性 | ✅ `clean assembleRelease` 两次，指纹均为 `bc3d2322…` |
| APK 权限 | ✅ `aapt2` 确认含 `REQUEST_INSTALL_PACKAGES` |
| 插件已打进包 | ✅ `classes.dex` 中可检出 `AppUpdaterPlugin` |
| 应用内更新 JS 链路 | ✅ 壳内调用 `getStatus` → `downloadAndInstall(正确 URL)` |
| 权限未授予分支 | ✅ 走 `openInstallPermissionSettings`，且不触发下载 |
| 纯 Web 降级 | ✅ `nativeUpdater()` 返回 null，行为不变 |
| 密钥未进仓库 | ✅ `.gitignore` 覆盖 `*.jks` / `*.p12` / `*.keystore` |
| 真机安装与升级 | ❌ 无设备，未验证 |

---

## 2026.10.01.6 —— 发布名改用程序名，产物名去掉版本号

### 改动

- **Release 名称**：`词汇本 v<版本>` → `词汇本`。版本号改由 tag 与 Release 正文承载。
- **产物文件名去掉版本号**：

  | 之前 | 现在 |
  | --- | --- |
  | `vocabulary-notebook-<版本>-android.apk` | `vocabulary-notebook.apk` |
  | `vocabulary-notebook-<版本>-unsigned.ipa` | `vocabulary-notebook.ipa` |
  | `vocabulary-notebook.html` | 不变 |

  好处是下载地址固定，可以直接引用最新 Release 的直链，不必每次改文件名。
- **删除全部历史 Release**（v2026.10.01.1 ~ v2026.10.01.5）。
  已发布的 tag 保留 —— 版本记录与 `APP_VERSION` 的对应关系仍可追溯。

### 影响评估

应用内更新检查读的是 Release 的 **`tag_name`**（`v2026.10.01.6` → `2026.10.01.6`），
与 Release 名称、产物文件名都无关，因此改名不影响自动更新。
`pickReleaseAsset()` 匹配 `vocabulary-notebook.html` 或任意 `.html` 附件，同样不受影响。

### 验证

| 项目 | 结果 |
| --- | --- |
| `release.yml` 可解析 | ✅ |
| 产物命名 | ✅ Android/iOS/Web 三者均不带版本号 |
| Release 名称 | ✅ 固定为「词汇本」 |
| 历史 Release | ✅ 已全部删除，tag 保留 |
| `npm test` | ✅ 通过 |
| 三端发布 | ⏳ 由本次 tag 的 CI 验证 |

---

## 2026.10.01.5 —— 移除鸿蒙端，只保留 Web / Android / iOS

### 背景

鸿蒙端是 2026.09.30.1 加入的，代价一直不低：

- HarmonyOS NEXT 不兼容 Android APK，必须维护一套**独立的 ArkTS 工程**（`harmony/`，29 个文件）
  和**另一套工具链**（DevEco / hvigor / ohpm）；
- CI 侧依赖第三方 2.1 GB SDK，链路长且脆弱 —— 2026.10.01.3 就因上游 500 导致发版缺产物；
- 维护成本与收益不成比例。

### 改动

- 删除 `harmony/` 整个工程目录；
- 删除 `scripts/check-harmony-json5.py`，并从 `npm test` 中移除；
- `scripts/set-version.mjs` 去掉鸿蒙的写入规则（现在只写 index.html / package.json / Android / iOS）；
- `release.yml` 删除 `harmony` job 与 `OHOS_CLI_VERSION`，`needs` 改为 `[meta, web, android, ios]`，
  产物收集与 Release 说明表格同步去掉 HAP；
- `.gitignore` 清掉 harmony 与 `*.hap` 规则；
- 文档同步：README、design.md、multi-platform.md、docs/README.md、android/README.md；
  multi-platform.md 新增「为什么没有鸿蒙端」，避免以后被重新提出。

### 仍然成立的部分

旧版鸿蒙（HarmonyOS 4 及以前）**兼容 Android APK**，所以那份 APK 在旧鸿蒙上照样能装，
只是不再作为独立目标承诺。这一点在 android/README.md 里保留了说明。

### 验证

| 项目 | 结果 |
| --- | --- |
| `harmony/` 与 `check-harmony-json5.py` 已删除 | ✅ |
| `set-version.mjs` 实跑 | ✅ 只更新 index.html / Android / iOS，无失配告警 |
| `release.yml` 可解析 | ✅ `jobs: meta, web, android, ios, release`，`env` 只剩 `NODE_VERSION` |
| workflow 内无鸿蒙残留 | ✅ 含产物收集与 Release 说明 |
| `npm test` | ✅ 内联 JS 语法 + SW 22 项断言 |
| Android 构建 | ✅ `assembleDebug` BUILD SUCCESSFUL |
| 三端发布 | ⏳ 由本次 tag 的 CI 验证 |

---

## 2026.10.01.4 —— 修复鸿蒙构建的第三方依赖脆弱性

> 本节对应的鸿蒙端已在 2026.10.01.5 移除。保留原因：**「第三方 action 不固定版本 = 缓存永不命中
> = 每次全量下载」这个坑与具体平台无关**，换成任何大体积依赖都会重演。

### 问题

v2026.10.01.3 发版时 **HarmonyOS HAP 构建失败**，Release 里因此缺了这一端产物：

```
HTTP 500 (https://api.github.com/repos/ErBWs/ohos-sdk/releases/assets/540521089)
##[error]Process completed with exit code 1.
```

失败发生在 `ErBWs/setup-ohos` 这个第三方 action 下载 SDK 的步骤，不是我们的代码。
但排查后发现两个**我们这边的真实问题**，让这次失败从「偶发」变成了「大概率」：

1. **没有固定版本**。action 的缓存键是 `ohos-sdk-${os}-${arch}-${version}`，
   不传 `version` 时键就是 `ohos-sdk-Linux-X64-`（版本为空）。
   日志里明确写着 `Cache not found for input keys: ohos-sdk-Linux-X64-` ——
   **缓存从未命中过**。而这份 SDK 有 **2.1 GB**（1500 MB + 667 MB 两个分片），
   等于每次发版都要全量重下一次，失败概率自然高。
2. **单次下载没有重试**。一次瞬时 500 就让整个鸿蒙 job 挂掉。

### 改动

不再用 `ErBWs/setup-ohos`，改为自己下载，一次解决三个问题：

| 改动 | 解决什么 |
| --- | --- |
| 在 workflow `env` 里固定 `OHOS_CLI_VERSION: 26.0.0.821` | 缓存键变稳定，`actions/cache` 真正生效；同时避免上游发新版导致构建行为漂移 |
| 用 `curl --retry 5 --retry-delay 15 --retry-all-errors` 下载 | 瞬时 5xx / 连接中断可自动恢复 |
| `sha256sum -c` 校验后再解压 | 下载损坏时立刻失败，而不是在编译阶段报莫名其妙的错 |
| 命中缓存则跳过下载 | 后续发版不再重复下 2.1 GB |
| 新增「校验 hvigorw 可用」步骤 | 工具链没装好时立即失败，而不是拖到编译阶段 |

顺带把第三方 action 从供应链里去掉了。

### 验证

| 项目 | 结果 |
| --- | --- |
| workflow YAML 可解析 | ✅ `jobs` 与 `env` 均正常 |
| 鸿蒙 job 步骤结构 | ✅ 11 步，缓存 → 下载 → 校验 hvigorw → 构建 |
| 下载地址可达 | ✅ `.aa` / `.ab` / `.sha256` 三个 URL 均返回 200 |
| 校验文件格式 | ✅ `sha256sum -c` 能识别（拼接后可正常校验） |
| 真实构建 | ⏳ 由本次 tag 的 CI 验证 |

---

## 2026.10.01.3 —— 修分享页遗漏与 CI 版本号兜底

本轮没有新功能，只修了两处**真实缺陷**，都是前几轮改动留下的尾巴。

### 1. 分享出去的卡片挂着永远显示「—」的例句区块

2026.10.01.1 把例句区块改成「无值时整块隐藏」，但当时**只改了主应用的 `renderWord`**，
没改 `buildShareScript` 里那份独立的渲染脚本。

后果：分享出去的文件（`buildShareHtml` 克隆 `studyView`，带着 `frontExampleBox`）每张卡都显示
一个空的「例句 —」区块，与主应用表现不一致。

修复：给分享页的 `render` 补上同样的隐藏逻辑。已用 iframe 真实渲染分享页验证。

> 教训：**分享页是一份复制出去的渲染逻辑**，主应用改渲染时必须同步改它。
> 同类问题在 2026.10.02.1 的切换动画里也出现过一次 —— 已一并同步。

### 2. CI 版本号兜底会构建出对不上的版本

手动触发 `workflow_dispatch` 且不填版本号时，兜底逻辑读的是 `package.json` 的 `version`。
但 npm 的 semver 规定只能有三段，`set-version.mjs` 写入 `2026.10.01.2` 时实际落盘为 `2026.10.1` ——
于是会构建出与 `APP_VERSION` 对不上的包，而 `APP_VERSION` 恰恰是应用判断新旧的唯一依据。

修复：兜底改为直接读 `index.html` 的 `APP_VERSION`（版本号的唯一事实来源）；
并在 `set-version.mjs` 里注明 `package.json` 的 version 只是构建工具链元数据。

### 验证

| 项目 | 结果 |
| --- | --- |
| 分享页自包含性 | 45 KB、0 个外部 `script`/`link` 引用、内嵌词条与音标 |
| 分享页真实渲染（iframe） | 单词、音标、释义、计数正确，点击可翻转 |
| 分享页例句隐藏 | `frontExampleBox.hidden === true`、`backExample.hidden === true` |
| CI 兜底逻辑 | 实测读出正确版本，`versionCode` 计算正确 |
| 死代码排查 | 80 个顶格函数全部有引用 |

### 一次差点造成损失的操作（记录备查）

改分享页时用「整体读出 → 改字符串 → 整体写回」的方式编辑 `index.html`，
但 `read` 默认只返回前 2000 行，而文件已有 4200 行 —— 写回时把后 2200 行**截断了**。
`git checkout -- index.html` 完整恢复（与 HEAD 无差异），随后改用定点替换完成修改。

教训：**大文件不要用「读全文再写回」的方式改**，一律用定点替换；
真要整体处理，也必须先确认读到的行数与文件实际行数一致。

---

## 2026.10.01.1 —— 移除内置词典，释义全部改为在线

### 背景

内置词典 731 条、183.7 KB，占 `index.html` 的 55%。两个长期问题：

1. **覆盖率永远不够**：任何真实词表都会大量未命中（「真题 1 校园版」91 词只命中 8 个），
   于是又叠了一层联网兜底 —— 两套来源、两套优先级，复杂度翻倍。
2. **维护成本高**：为补词要手工校对音标、释义、例句，词典越补越大，命中率提升却有限。

### 改动

- 删除 `defaultWordsData`（731 条）与 `getDefaultWordMap()`；`index.html` **330 KB → 152 KB**。
- 导入路径只剩一条：提取词条 → 一律建空卡 → 后台在线补全。不再有「命中/未命中」分支。
- 音标改由 Datamuse 提供，新增 `arpabetToIpa()` 做 ARPAbet → IPA 转换。
- 例句区块在无值时整块隐藏（`frontExampleBox` / `backExample`）。
- 清空静态 HTML 里写死的 `price` / `/praɪs/` 占位内容。

### 音标转换：重音符号的位置

映射是一对一的，真正的坑在**重音符号放哪**。它属于整个音节，要放在**音节首**：
直接放在元音前会得到 `/prˈaɪs/`，正确的是 `/ˈpraɪs/`。

按「最大音节首」原则（`onsetOf()` + 合法辅音簇表）把元音之间的辅音簇切给下一音节，
再把符号放到该音节开头。词首辅音簇整体归本音节，因为英语没有以 `/str/` 这类三辅音结尾的音节。

实现中实际踩到并修掉的两个问题：

1. `onsetOf([])` 返回 1 而非 0，元音相邻时符号错位（`career` 得到 `/kˈəɪr/`）。
2. `ER` 最初按英式处理，与 Datamuse 的**美式**发音不符；改为卷舌音后
   `career` → `/kərˈɪr/`、`furniture` → `/ˈfɜːrnɪtʃər/` 才正确。

### 顺带修掉一个真实 bug

`enrichWords()` 原先把「缓存里有新鲜结果」当成「无需处理」直接 `continue`，
**从不把缓存写进词条**。后果：同一个词第二次导入（或换个词汇本导入）时，
缓存明明有数据，卡片却永远空着。

内置词典时代这个问题被掩盖（多数词命中词典、不走联网路径），去掉词典后会让大量卡片无故空白。
现在命中缓存会直接 `applyOnlineEntry()` 填卡 —— 缓存只省网络请求，不省「写入」这一步。

### 能力边界

- **没有例句来源**：可跨域的免费接口都不提供；有道 `jsonapi` 有例句但无 CORS 且加 `callback` 返回 403。
- **音标是美式近似值**，机械转换、未经人工校对。
- **关闭联网开关后没有本地兜底**，所有卡片都会是空的。

### 验证

| 场景 | 结果 |
| --- | --- |
| `lookupYoudao("price")` | 词性 `n./v.`、中文释义正常 |
| `lookupDatamuse("price")` | 英文释义 + 4 个近义词 + 音标 `/ˈpraɪs/` |
| `lookupOnline("serendipity")` | 中英释义齐全、音标 `/sɛrənˈdɪpɪtiː/` |
| 导入 3 词并补全 | 空卡 → 全部填上 |
| 缓存命中 | 第二次导入同一词由缓存填充（修复前为空） |
| 关闭联网后导入 | 导入成功、卡片保持空、不抛错 |
| 线上站点实测 | 导入 `price` / `serendipity` 全部补全，0 console 报错 |

音标转换另用 12 个真实 ARPAbet 串做离线断言（price / serendipity / successful / theatre /
reduce / career / furniture / competition / countryside / instruction / describe / special），
以及空输入与未知音素两个边界，全部符合预期。

---

## 2026.09.30.1 —— 多端交付：PWA + iOS / Android / HarmonyOS + Release 自动更新

> 本节涉及的鸿蒙端已在 2026.10.01.5 移除；其余三端形态与更新通道沿用至今。

### 背景

应用此前只有一种分发形态：浏览器访问线上页面，或把 `index.html` 下载成单文件离线用。
新增需求是支持 iOS / Android / 鸿蒙原生安装包，并把编译产物发布到 GitHub Release，
同时让程序能自动检查更新。

关键约束：**产品本体的单文件、零构建形态不能破坏**。因此所有原生端都做成「壳」——
原生工程只承载同一个 `index.html`，不复制业务逻辑。

### 方案：一份本体，多种壳

| 形态 | 承载方式 | 产物 |
| --- | --- | --- |
| Web / PWA | 浏览器 + manifest + Service Worker | GitHub Pages（沿用 legacy 构建） |
| Android | Capacitor 8 壳（`androidScheme: https`） | `*-android.apk` |
| iOS | Capacitor 8 壳（SPM） | `*-ios-unsigned.ipa` |
| HarmonyOS NEXT | ArkTS `Web` 组件加载 `$rawfile(index.html)` | `*-harmony-unsigned.hap` |

旧版鸿蒙（HarmonyOS 4 及以前）兼容 Android APK，直接复用 Android 产物，不额外维护工程。

**派生而非复制**：`www/`（Capacitor webDir）与 `harmony/**/rawfile/index.html` 都由脚本从根
`index.html` 生成并 gitignore。仓库里永远只有一份应用本体，不存在「两份 HTML 漂移」。

### 更新通道：两条，Release 优先

1. **首选** GitHub Releases API，读 `tag_name` 与 `assets`；
2. **回退** 抓线上 `index.html` 读 `APP_VERSION`。

必须回退的场景：未认证限流（403）、仓库尚无 Release（404）、离线、8 秒超时。
回退再失败时，只有**手动**检查才提示失败，自动检查全程静默。

自动检查的覆盖面是关键决策点：`isLocalCopy()` 在原生壳内返回 `false`（壳确实不是「本地副本」），
若直接沿用它做门槛，**壳内会永远收不到更新提示** —— 而壳正是移动端的主要分发形态。
因此单独引入 `shouldAutoCheck() { return isNativeShell() || isLocalCopy(); }`，
线上 Web 端仍然跳过（那里由 Service Worker 负责更新）。

壳内的忽略策略也不同：**不落盘** `APP_IGNORED_KEY`，忽略只对当次会话生效。
理由是壳内用户既不能刷新页面也不能替换文件，提示条是唯一的更新入口；
持久化忽略会让用户随手一关就永久失联。

### 发版：打 tag 即发布

`node scripts/set-version.mjs <版本>` 一处写入多处（`index.html` / `package.json` /
Android `build.gradle` / iOS `pbxproj` / 当时的鸿蒙 `app.json5`），随后打 tag 触发
`.github/workflows/release.yml`：并行构建各端 + 汇总 Web 产物 → 发布同一个 Release。
CI 会校验 `APP_VERSION` 与 tag 一致，不一致直接失败。

### 踩过的坑

- **`.gitignore` 行尾注释不生效**：`www/   # 说明` 会被当成含空格和 `#` 的模式，导致 `www/` 根本没被忽略。改为注释单独成行。
- **`sdkmanager` 的缓存路径**：它把缓存写 `~/.android/cache`，在受限沙箱下写不进去，报出的却是
  「Failed to download any source lists / IO exception while downloading manifest」这种指向网络的假故障。
  必须显式设 `ANDROID_USER_HOME`；Gradle 同理需要 `GRADLE_USER_HOME`。
- **JSON5 引号键**：鸿蒙 `app.json5` 里是 `"versionCode": 1`（键带引号），最初的正则匹配不到，
  发版时会**静默失配**。已改为容忍两种写法。
- **`@capacitor/assets` 拖入 sharp**：安装时要下载 libvips 二进制，超时即整包失败。
  图标改用 Python + Pillow 生成（`scripts/gen-icons.py`），去掉该依赖。
- **manifest 文件名**：`manifest.webmanifest` 在 legacy Pages 上的 MIME 没有保证，统一用 `manifest.json`。
  但 `scripts/sync-web.mjs` 的 `ENTRIES` 与 `release.yml` 的资源校验一度没跟着改，导致 manifest 没进 Android 包 ——
  这类「两处清单」是跨模块集成的典型漏点。
- **bash 八进制陷阱**：`$(( 2026 * 10000 + 09 * 100 + 30 ))` 里的 `09` 让 bash 直接报
  `value too great for base`，首次发版 meta job 秒挂。加 `10#` 前缀强制十进制。
- **`android-actions/setup-android@v3` 失效**：在当前 ubuntu 镜像上判定预装 sdkmanager「版本不对」，
  转去装已下架的 `tools` 包并失败。runner 本就预装 Android SDK，改用其自带 sdkmanager 补齐组件。
- **鸿蒙 `hvigor-config.json5` 格式**：`hvigorVersion` 是 DevEco 4.x 的写法，API 12 要求 `modelVersion`，
  且 `hvigor/hvigor-config.json5` 与工程级 `oh-package.json5` 两处必须**完全相等**。

### 验证

| 项目 | 方式 | 结果 |
| --- | --- | --- |
| 内联 JS 语法 | `node scripts/check-inline-js.mjs` | 2 个内联脚本通过 |
| Service Worker 行为 | `node scripts/test-sw.mjs` | 22 项断言全过（当时） |
| PWA 装配 | 本地 http + 真实浏览器 | manifest 被解析、SW `activated`、8 个外壳资源入缓存、离线可开 |
| Android APK | 本机 `./gradlew assembleDebug` / `assembleRelease` | BUILD SUCCESSFUL；`aapt2` 实测包名/版本/权限/label 正确 |
| iOS 未签名 ipa | CI macos runner 真实编译 | 463 KB |
| HarmonyOS HAP | CI + 华为命令行工具真实编译 | 215 KB |
| Release 流程 | 打 tag 真实触发 | 各端产物全部发布 |
| 应用内自动检查更新 | 真实旧副本 + 线上 Release | 弹提示条并下载到新版本 |

### 已知边界

- **各端数据互相独立**：按 origin 划分的本地存储，网页版 / 单文件 / Android / iOS / 鸿蒙各一份，互不同步。
- iOS 与鸿蒙产物**均未签名**，仓库不保存任何证书；需用户自行签名后才能装机。
- 真机安装与运行时行为（WebView 加载、发音、联网补全）**未验证**，本机无设备也无 Xcode / DevEco。
  iOS 与鸿蒙的「可编译」结论来自 CI 真实构建，不是本地静态检查。

---

## 2026.09.19.3 —— 联网词典兜底（已随 2026.10.01.1 移除）

> ⚠️ 本条描述的内置词典与联网兜底双层结构**已在 2026.10.01.1 整体移除**，
> 仅作为历史记录保留，不代表当前实现。当前实现见 [design.md](design.md) §5。

内置词典只有 731 条，任意词表都会遇到「没收录」的词，而这些卡片此前只能永远空着。
用户选择「直接联网、无需触发」，于是做成导入后自动补全：

| 需要的信息 | 来源 | 通道 |
| --- | --- | --- |
| 中文释义 + 词性 | 有道 `suggest` | JSONP |
| 英文释义 + 近反义词 | Datamuse | `fetch`（CORS） |

- 只处理 `meaningCn` 为空 / `'—'` 的词；只填空白字段，绝不覆盖内置词典已有内容。
- 导入完成后延迟 800ms 后台执行，不阻塞导入；启动 3s 后对已有词汇本再做一次后台回填。
- 结果按词缓存（`vn_dict_cache_v1`，上限 4000、TTL 180 天）。
- **只有至少一个来源正常应答才写缓存**；纯网络失败不缓存，下次仍会重试。
- 联网来源**不提供音标与例句**，这两项当时只有内置词典词条才有。

### 验证

| 场景 | 结果 |
| --- | --- |
| 导入 6 个内置词典没有的词 | 6/6 补出中文释义，6/6 有英文释义，4/6 有近义词，0 console 报错 |
| 导入 91 词「真题 1 校园版」 | 91/91 命中内置词典，0 次联网缓存写入（纯 no-op） |
| 断网导入 | 保持空卡，不弹错误，导入正常完成 |

---

## 2026.09.19.2 —— 补齐 PET 词典与深浅色主题

> ⚠️ 本条涉及的**内置词典已在 2026.10.01.1 移除**；深浅色主题仍然有效。

- **深浅色主题**：一键切换，没手动选过时跟随系统；首帧由 `<head>` 内联脚本写入 `data-theme` 避免闪烁。
  切换时同步更新 `<meta name="theme-color">`。
- **PET 词典补全**：内置词典 `298 → 648`（新增 350 条），词头逐字符保留源文件拼写
  （含弯引号 U+2019、大小写、省略号等）。

### 验证

| 场景 | 结果 |
| --- | --- |
| 深浅色切换与持久化 | 手动选择后刷新保持；未选择时跟随系统 |
| 词典条目数 | 298 → 648，无重复词头 |

---

## 2026.09.19.1 —— 纯文本词表导入 + 真题词典补全

### 背景

「真题 1 校园版.txt」共 91 行，旧版解析器只提取出少数几条，大量词条丢失。

### 诊断

先排查解析器，用一个纯函数化的校验脚本逐行核对，确认**解析器把 91 行完整、干净地全部提取出来了**。
真正的原因是词典覆盖：648 条的内置词典里这 91 个词头只命中 8 个
（`complaint`、`software`、`immediately`、`prevent`、`be likely to`、`depend on`、`reply`、`despite`），
其余 **83 个词头没有词条**，于是渲染成「只有单词、没有释义和近反义词」的空卡。

> 这个结论直接引出了后来的两条演进：先补词典（2026.09.19.2），再彻底改为在线查询（2026.10.01.1）。
> 也是「**先确认是解析问题还是数据问题，再动手**」这条排查纪律的来源。

### 改动

- 新增 `.txt` 纯文本词表导入，`decodeTextBuffer` 自动识别 UTF-8 / BOM / UTF-16 / **GBK**。
- `parseWordList` 增加 `plain` 模式：一行即一个词条，不走编号切分。
- 补齐 83 条真题词头。

### 验证

| 场景 | 结果 |
| --- | --- |
| 「真题 1 校园版.txt」导入 | 91/91 词条全部提取 |
| GBK 编码的 .txt | 正确解码，无乱码 |
| UTF-8 BOM / UTF-16 | 正确识别 |

---

## 2026.09.18.1 —— 本地副本、版本号与更新检查

### 背景

应用以单文件分发后，用户手上的副本无法感知线上新版本，也没有便捷的更新途径。

### 改动

- 首页右下角常驻版本号，新增「检查更新」与「下载」两个按钮。
- **下载**取应用本体（不含词汇本数据）存成 `vocabulary-notebook.html`。
- **检查更新**抓线上 `index.html` 正则读 `APP_VERSION` 比对。
- 本地副本打开时自动静默检查一次，失败不打扰；发现新版本在按钮上方提示并支持一键更新。

### 关键修复：副本不再携带词汇本内容

最初用「克隆 DOM 再清理」生成副本，会把已渲染的词汇本卡片带进去。
改为取**脚本执行时的 DOM 原文**（`pristineHtml`）—— 那一刻还没有任何用户数据进入页面，
副本天然干净，无需逐项清理。

### 验证

| 场景 | 结果 |
| --- | --- |
| 下载副本后打开 | 书架为空，不含原站词汇本 |
| 线上有新版本时打开本地副本 | 提示条出现，点「更新」下载到新版本 |
| 离线打开本地副本 | 静默失败，不打扰 |
