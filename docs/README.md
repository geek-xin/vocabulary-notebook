# 文档索引

<div align="center">

**[词汇本](../README.md)** · 单文件、零构建的英语词汇学习应用

[![Release](https://img.shields.io/github/v/release/geek-xin/vocabulary-notebook?label=release&color=ffd966)](https://github.com/geek-xin/vocabulary-notebook/releases/latest)
[![License](https://img.shields.io/github/license/geek-xin/vocabulary-notebook?color=blue)](../LICENSE)

</div>

本目录是**维护者文档**：写给改这个项目的人看，不是用户手册。
面向使用者的说明在仓库根的 [README.md](../README.md)。

## 从这里开始

| 我想…… | 看这里 |
| --- | --- |
| 了解应用现在**怎么设计的、为什么这么做** | [design.md](design.md) |
| 知道**每个版本改了什么、怎么验证的** | [history.md](history.md) |
| 做多端构建 / 发版 / 理解各端验证边界 | [multi-platform.md](multi-platform.md) |
| 排查问题 | [troubleshooting.md](troubleshooting.md) |
| 构建 Android（签名、应用内升级） | [../android/README.md](../android/README.md) |
| 构建 iOS（未签名 ipa、三种安装方式） | [../ios/README.md](../ios/README.md) |

## 文档一览

| 文档 | 覆盖内容 |
| --- | --- |
| [design.md](design.md) | **当前**架构与设计取舍：单文件定位、数据模型与三级存储、导入与解码、`parseWordList` 双路解析、全在线词典（来源、ARPAbet→IPA、缓存、能力边界）、主题、学习页「书页」与切换动画、发音、分享（三端各自的通道）、下载与更新检查，以及「边界与不做的事」 |
| [multi-platform.md](multi-platform.md) | 多端交付：PWA / Android / iOS 三端形态、Release 自动更新通道、各端数据隔离、发版流程，以及**各端验证边界** |
| [history.md](history.md) | 版本历史，最新在上；每个版本写清改了什么、为什么、如何验证 |
| [troubleshooting.md](troubleshooting.md) | 常见故障的「现象 → 原因 → 处理」 |

## 项目结构一览

```
vocabulary-notebook/
├── index.html              ★ 应用本体（唯一事实来源）
├── manifest.json / sw.js   PWA 清单与 Service Worker
├── icons/                  图标
├── docs/                   维护者文档（本目录）
│   ├── design.md           架构与设计取舍
│   ├── multi-platform.md   多端交付与验证边界
│   ├── history.md          版本历史
│   ├── troubleshooting.md  故障排查
│   └── images/             README 用的截图
├── scripts/                图标生成 / 资源同步 / 版本写入 / 测试
├── android/                Capacitor Android 壳
├── ios/                    Capacitor iOS 壳
└── .github/workflows/      release.yml：打 tag 自动构建并发布
```

产品本体只有 `index.html` 一个文件；`android/`、`ios/`、`scripts/`、`.github/workflows/` 属于**分发层**，
不改变产品本体的单文件形态。`www/` 是 `scripts/sync-web.mjs` 从根 `index.html` 生成的派生产物，不进版本库。

## 维护约定

1. **代码是唯一事实来源。** 文档与代码冲突时以代码为准，并尽快修正文档；
   设计文档描述的是「现在为什么是这样」，不是需求或计划。
2. **设计变化更新 `design.md`。** 涉及结构、数据、流程或关键取舍的改动，同步更新对应小节；
   只改文案或纯样式可不动。
3. **每次发版在 `history.md` 顶部插入一条。** 版本号与 `index.html` 里的 `APP_VERSION`
   （格式 `YYYY.MM.DD.N`）保持一致，写清：改了什么、为什么、如何验证。
4. **明确的取舍、明确「不做」的事写进 `design.md` 的「边界与不做的事」。**
   这样同一个问题不会被反复评估，已否决的方案也不会被重新提出。
5. **可自动化的验证放进 `scripts/`** 并由 `npm test` / CI 执行；
   文档只记录验证方法与结论，不粘贴一次性脚本。
6. **踩过的坑写进 `history.md` 对应版本里**，不要只留在聊天记录中 —— 这些是后续维护最有价值的部分。
7. **不保留过程稿。** 需求草稿、实施计划、逐任务清单在落地后即失效，不要留在 `docs/` 下：
   结论进 `design.md`，变更与验证进 `history.md`。`docs/` 里只放长期有效的文档。
8. **文档里的数字要能被复算。** 体积、条目数、断言数这类数字写进文档时，
   必须能从当前代码或 `npm test` 直接得出，且改代码时一并更新。

## 文档自身的验证

本目录的文档不做「读起来对不对」的主观判断，只做可机械核对的两件事：

| 检查 | 做法 |
| --- | --- |
| 文内链接有效 | 逐个解析相对路径，确认目标文件存在 |
| 事实与代码一致 | 常量、键名、接口地址、断言数等从 `index.html` / `sw.js` / `scripts/` 反查确认 |

> 截图 `images/*.png` 由真实浏览器渲染后截取（Playwright 驱动 `scripts/serve.mjs`），
> 不是设计稿；界面改动后应重新截取，避免文档展示的是旧界面。
