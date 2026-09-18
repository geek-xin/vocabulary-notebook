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

沿用词汇本的深色玻璃拟态基调，保证个人主页与作品风格统一：

- 背景：`linear-gradient(160deg, #1e2b3c, #16202e 45%, #0f1724)`
- 卡片：`rgba(255,255,255,0.045)` 半透明 + `1px` 高光描边 + 大圆角
- 字体：系统字体栈，中英文均覆盖

但排版从「工具型」转向「作品集型」：更大的标题层级、项目栅格、克制的入场动效。

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

姓名、头衔、简介、邮箱、社交链接统一收敛到文件顶部的 `PROFILE` 配置对象，
README 中说明「改这一处即可」。页面上使用占位内容的位置不特殊标记视觉样式，
但在 README 中逐项列出待替换字段。

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

## 六、验收标准

1. 两个仓库均为 public，`main` 分支指向最终提交
2. `https://geek-xin.github.io/` 与 `https://geek-xin.github.io/vocabulary-notebook/` 均返回 200
3. 线上页面标题、内容与本地一致
4. 父仓库 `AI-Worksplace` 的 65 个改动**未被改动、未被提交**
