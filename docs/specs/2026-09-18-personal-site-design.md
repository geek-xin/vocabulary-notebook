# 设计文档：词汇本开源 + 个人主页（作品集）

- 日期：2026-09-18
- 状态：已确认，待实现
- 作者：geek-xin

## 一、背景

`vocabulary-notebook/` 下已有一个自包含的英语词汇学习应用（单文件 `index.html`，2745 行，含全部
HTML / CSS / JavaScript）。当前它只存在于本地，没有版本控制，也没有对外可访问的地址。

同时，GitHub 账号 `geek-xin` 下有 5 个公开的 Java 项目（assets-guard、web-sim、web-router、
code-guard、project-template），缺少一个统一的个人入口来展示。

目标是把词汇本开源到 GitHub，并新建一个个人主页把作者与项目集中呈现出来。

## 二、约束与前提

| 项 | 结论 |
| --- | --- |
| 现有 git 仓库 | 根目录是父级 `AI-Worksplace`，**无 remote**，且有 65 个与本次无关的改动 |
| 处理方式 | **不触碰父仓库**，在 `vocabulary-notebook/` 内初始化全新独立仓库 |
| GitHub 账号 | `geek-xin`，`gh` 已认证，token 具备 `repo` scope |
| 现有同名仓库 | 无，`vocabulary-notebook` 与 `geek-xin.github.io` 均可新建 |
| 开源协议 | CC BY-NC 4.0（用户选择，禁止商业用途） |
| 主页内容 | 先使用占位信息，集中在一处便于后续替换 |

## 三、交付物一：`vocabulary-notebook` 仓库

在 `vocabulary-notebook/` 目录初始化独立 git 仓库，推送到 `github.com/geek-xin/vocabulary-notebook`（public）。

**文件变更**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `vocabulary-notebook.html` → `index.html` | 重命名 | `index.html` 是 GitHub Pages 与静态托管的默认入口，改名为的是让仓库既能本地打开也能直接托管 |
| `README.md` | 新增 | 项目说明、特性表、快速开始、数据存储策略、技术说明、协议 |
| `.gitignore` | 新增 | 过滤 macOS / 编辑器噪声 |
| `LICENSE` | 新增 | CC BY-NC 4.0 完整法律条款 |
| `docs/specs/` | 新增 | 本设计文档 |

**验收标准**

- 仓库 public 且 `git status` 干净
- `https://geek-xin.github.io/vocabulary-notebook/` 返回 200 且页面标题为「词汇本 · 多词库学习」

## 四、交付物二：个人主页 `geek-xin.github.io`

新建仓库 `geek-xin.github.io`，通过 GitHub Pages 发布到根域名 **https://geek-xin.github.io/**。

选择独立仓库而非项目子路径，是因为 GitHub Pages 对 `<user>.github.io` 仓库会发布到根域名，
这是「个人主页」的规范做法；作品集作为个人门面，放根域名比放某个项目子路径更合适。

### 技术选型

**单文件 `index.html`，零构建、零 npm 依赖。** 与词汇本「一个文件搞定」的理念保持一致：
clone 下来双击即可查看，不需要 `npm install`，也不会随时间推移产生依赖腐化。

### 视觉方向

沿用词汇本的深色基调，保证个人主页与作品风格统一，但**不沿用其玻璃拟态卡片**：
全站只用一层冷色深底 + 实色分层表面 + 细致分界线，`backdrop-filter` 仅用于吸顶导航
一处（它有真实功能：滚动时仍要读清导航）。

配色策略为 **Restrained**：中性色承担结构，单一琥珀强调色占比 ≤ 10%，
对应访客选择的「冷静克制 · 工程感」。色相统一锚定 258（冷蓝炭），
强调色取暖琥珀 —— 在冷色场里醒目但面积极小，同时避开被明确拒绝的蓝紫渐变与青色科技感。

排版从「工具型」转向「作品集型」：更大的标题层级、项目栅格、克制的入场动效。
字体使用**系统字体栈**：页面中英混排，只覆盖拉丁字形的网络字体会让中文掉回系统字体
造成一行内两套字形气质割裂，而覆盖中文的字体动辄数 MB，与「零依赖」直接冲突。

### 页面结构

| 区块 | 内容 |
| --- | --- |
| Hero | 昵称、一句话定位、主 CTA（查看项目 / 联系我） |
| About | 个人简介、技术方向概述 |
| Skills | 技术栈分组展示（语言 / 框架 / 中间件 / 工具） |
| Projects | 项目卡片栅格 |
| Contact | 邮箱与社交链接 |

### 项目数据

Projects 区块使用**真实仓库信息**，简介从各仓库 README 提炼，不编造：

| 仓库 | 定位 | 主技术 |
| --- | --- | --- |
| assets-guard | 资产安全巡检平台，发现中间件资产并扫描未授权访问与弱口令 | Spring Boot 3.5 / Java 21 / React 19 |
| code-guard | SAST + SCA + AI Code Review 代码安全分析平台 | Spring Boot WebFlux / Java 21 / React 19 |
| web-sim | HTTP/TCP 接口模拟器，JSON 配置热加载 | Spring Boot WebFlux / Reactor Netty |
| web-router | 轻量 Web 路由代理，配置即改即生效 | Spring Cloud Gateway / Reactor Netty |
| project-template | 企业级 Spring Boot Maven Archetype 骨架 | Maven Archetype / MyBatis-Plus / Kafka |
| vocabulary-notebook | 单文件零构建词汇学习应用 | 原生 HTML / CSS / JavaScript |

私有仓库（netty-demo、jdbc-demo）不展示。

### 占位符管理

内容用**静态 HTML** 直接写出（而非 JS 渲染），保证无脚本环境下内容完整可见、可被搜索引擎读取。
待替换字段用 `<!-- PLACEHOLDER: 字段名 -->` 注释就地标出，搜索 `PLACEHOLDER` 即可全部定位。

偏离原计划的一点：原设计打算把字段收敛到一个 `PROFILE` JS 配置对象，实现时放弃。
原因是 JS 填充会让内容在脚本失败时消失，对作品集这类需要被抓取、被分享的页面是净损失。
README 中逐项列出待替换字段，可替换成本同样低。

### 无障碍与响应式

- 语义化标签（`header` / `main` / `section` / `footer`）
- 键盘可达，可见焦点环
- 尊重 `prefers-reduced-motion`，关闭动效
- 响应式断点，移动端单列布局

## 五、风险与对策

| 风险 | 对策 |
| --- | --- |
| 误提交父仓库的 65 个无关改动 | 在子目录 `git init`，与父仓库完全隔离 |
| Pages 首次构建有延迟 | 推送后轮询 Pages 状态与线上 URL，确认真正可访问再交付 |
| 占位信息被误认为真实信息 | README 明确列出待替换字段清单 |
| 重命名文件造成困惑 | 在 README 与交付说明中明确标注重命名 |

## 六、实现中实测发现并修正的问题

两个问题都不是靠读代码发现的，是渲染真实浏览器后量出来的。

### 1. 图片被 `width`/`height` 属性撑到原始像素高度

为防布局抖动，`<img>` 上同时写了 `width`/`height` 属性。但这两个属性会作为**表现性提示**
映射为 CSS 的 `width`/`height`：CSS 只覆盖了 `width`，`height` 仍取属性值。
此时宽高都是确定值，`aspect-ratio` 按规范被忽略。

后果：截图按原始像素高度渲染（1588px / 1100px / 900px），页面总高被撑到 **7038px**。

修正是给 `.shot` 显式加 `height: auto`，让 `aspect-ratio` 重新生效，页面回落到 **4758px**。

### 2. 入场动效起始于 `opacity: 0`，在冻结动画的环境里首屏整块空白

实测：无头 Chrome 在 `--virtual-time-budget` 下**不推进 CSS 动画**（`animOpacity=0`，同页普通元素 `opacity=1`）。
链接预览机器人（Slack / X / 微信）正是用无头浏览器抓取，一旦动画被冻结，
分享出去的主页预览图就是一片黑。

修正是把入场动效改为**只动 `transform`、不动 `opacity`**：

- 首屏用纯 CSS 动画（不依赖 JS），冻结时最坏只偏移 14px，内容始终可读
- 滚动进入的区块同样只做位移，且内容**默认就是完整可见的**，动效纯属增强

这同时满足「内容不得依赖 class 触发的过渡才可见」这条硬约束。

### 验证结果

| 项目 | 结果 |
| --- | --- |
| 桌面 1440px 布局 | 图片高度 367px / 375px（符合设定比例），双列等高对齐 |
| 横向溢出 | 无（`scrollWidth` = `innerWidth` = 1440） |
| 移动端（≤500px） | 全部断点生效，单列堆叠，无溢出 |
| 对比度 | 10 组配色全部通过 WCAG AA，正文最低 6.43:1 |
| 首屏可见性 | 动画冻结环境下 5/5 元素可见 |
| 滚动区块可见性 | 9/9 可见（观察器触发或 1.5s 兜底） |
| 禁用 JS | 去掉 `<script>` 后渲染，内容与图片完整可见 |

## 七、验收标准

1. 两个仓库均为 public，`main` 分支指向最终提交
2. `https://geek-xin.github.io/` 与 `https://geek-xin.github.io/vocabulary-notebook/` 均返回 200
3. 线上页面标题、内容与本地一致
4. 父仓库 `AI-Worksplace` 的 65 个改动**未被改动、未被提交**
