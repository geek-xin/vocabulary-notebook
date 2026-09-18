# 词汇本 · 多词库学习

> 一个**单文件、零构建、纯本地**的英语词汇学习应用。导入 `.docx` / `.pdf` 词表，自动匹配释义，卡片式记忆。

在线使用：**https://geek-xin.github.io/vocabulary-notebook/**

---

## 特性

| 特性 | 说明 |
| --- | --- |
| 多词库书架 | 每个导入的文件生成一个独立词汇本，卡片网格展示，支持重命名、删除、分享 |
| 卡片式学习 | 点击翻面查看释义与例句，支持左右方向键、触屏滑动切换 |
| 智能补全 | 内置 **298 词**匹配词典，从文档中提取英文词条后自动补全音标、词性、中英释义与例句 |
| 文档导入 | 支持 `.docx`（mammoth）与 `.pdf`（pdf.js），可一次多选批量导入 |
| 英式发音 | 接入有道发音接口，点击喇叭播放英式读音 |
| 学习进度 | 每个词汇本独立记忆上次阅读到的页码，重新打开自动回到原位 |
| 页码跳转 | 点击计数器直接输入页码跳转 |
| 纯本地存储 | 数据只保存在你的浏览器里，不上传任何服务器 |

## 快速开始

**方式一：在线使用**

打开 https://geek-xin.github.io/vocabulary-notebook/ 即可，手机浏览器同样适用，可「添加到主屏幕」当 App 用。

**方式二：本地打开**

```bash
git clone https://github.com/geek-xin/vocabulary-notebook.git
cd vocabulary-notebook
open index.html        # macOS；Windows 直接双击 index.html
```

无需 `npm install`，无需构建步骤。

## 导入词表

点击首页「导入词汇本」按钮，选择一个或多个 `.docx` / `.pdf` 文件，每个文件会生成一个独立词汇本。

导入时应用会从文档中提取英文词条，并与内置词典匹配补全信息；未收录的词条保留原词，释义留空供自行补充。

## 数据存储

采用三级降级策略，尽可能保证数据不丢：

1. **IndexedDB** —— 首选，配额远大于 localStorage，移动端 WebView 更稳
2. **localStorage** —— IndexedDB 不可用时自动降级
3. **内存模式** —— 前两者都不可用时启用，此模式下刷新页面数据会丢失，应用会弹出提示

旧版本存在 `localStorage` 中的词汇本会在首次打开时**自动迁移**到 IndexedDB。

> 数据完全保存在本机浏览器，换设备或清理浏览器数据不会同步，请注意自行备份。

## 技术说明

整个应用是**一个 `index.html` 文件**，内含全部 HTML / CSS / JavaScript，无框架、无打包器、无依赖安装。

外部依赖仅在需要时从 CDN 按序回退加载（jsDelivr → BootCDN → staticfile → cdnjs）：

- `mammoth` —— 解析 `.docx`
- `pdf.js` —— 解析 `.pdf`
- 有道词典发音接口 —— 提供英式读音

音频播放前会做一次「音频解锁」，以兼容夸克、微信等对自动播放限制较严的环境。

## 目录结构

```
vocabulary-notebook/
├── index.html      # 应用本体（单文件，含全部逻辑与样式）
├── README.md
├── LICENSE         # CC BY-NC 4.0
└── docs/
    └── specs/      # 设计文档
```

## 浏览器兼容

面向现代浏览器（Chrome / Safari / Edge / Firefox 及主流移动端 WebView）。使用到 IndexedDB、Web Audio、`speechSynthesis` 等特性，IE 不支持。

## 许可证

[CC BY-NC 4.0](LICENSE) © 2026 geek-xin

允许署名前提下的非商业性分享与演绎，**禁止商业用途**。完整法律条款见 [LICENSE](LICENSE)。
