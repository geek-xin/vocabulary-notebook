# 文档索引

<div align="center">

**[词汇本](../README.md)** · 单文件、零构建的英语词汇学习应用

[![Release](https://img.shields.io/github/v/release/geek-xin/vocabulary-notebook?label=release&color=ffd966)](https://github.com/geek-xin/vocabulary-notebook/releases/latest)
[![License](https://img.shields.io/github/license/geek-xin/vocabulary-notebook?color=blue)](../LICENSE)

</div>

本目录是**维护者文档**。面向使用者的说明在仓库根的 [README.md](../README.md)。

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
| [design.md](design.md) | **当前**架构与设计取舍：总览、数据模型与三级存储、导入与解码、`parseWordList` 双路解析、全在线词典（来源、ARPAbet→IPA 音标转换、缓存策略、能力边界）、主题、学习页与发音、分享、下载与更新检查，以及「边界与不做的事」 |
| [multi-platform.md](multi-platform.md) | 多端交付：PWA / Android / iOS 三端形态、Release 自动更新通道、各端数据隔离、发版流程，以及**各端验证边界** |
| [history.md](history.md) | 版本历史，最新在上；每个版本写清改了什么、为什么、如何验证 |
| [troubleshooting.md](troubleshooting.md) | 常见故障的诊断路径与成因 |
| `README.md` | 本索引与维护约定 |

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
不改变产品本体的单文件形态。

## 维护约定

1. **代码是唯一事实来源。** 文档与代码冲突时以代码为准，并尽快修正文档；设计文档描述的是「现在为什么是这样」，不是需求或计划。
2. **设计变化更新 `design.md`。** 涉及结构、数据、流程或关键取舍的改动，同步更新对应小节；只改文案或纯样式可不动。
3. **每次发版在 `history.md` 顶部插入一条。** 版本号与 `index.html` 里的 `APP_VERSION`（格式 `YYYY.MM.DD.N`）保持一致，写清：改了什么、为什么、如何验证。
4. **明确的取舍、明确「不做」的事写进 `design.md` 的「边界与不做的事」。** 这样同一个问题不会被反复评估，已否决的方案也不会被重新提出。
5. **可自动化的验证放进 `scripts/`** 并由 `npm test` / CI 执行；文档只记录验证方法与结论，不粘贴一次性脚本。
6. **踩过的坑写进 `history.md` 对应版本里**，不要只留在聊天记录中 —— 这些是后续维护最有价值的部分。
