# 构件（Orbigen）｜本地 3D 素材管理与程序化树木工作台

[![Tests](https://github.com/RyanLoveAI/Orbigen/actions/workflows/test.yml/badge.svg)](https://github.com/RyanLoveAI/Orbigen/actions/workflows/test.yml)
[![License: GPL v3+](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-green.svg)](https://nodejs.org/)

**构件 Orbigen** 是一个在本机运行的 **3D 素材管理、程序化树木生成和模型装配工作台**。它把参考图分拆、Tripo AI 3D 生成、本地素材库、树木制作与建筑构件装配放在同一个流程里。

**English:** Orbigen is a local 3D asset manager, procedural tree and vegetation editor, and model assembly workbench. It integrates the official Tripo API, Three.js previews, and optional Blender processing. Built with Node.js, JavaScript, SQLite, and Python.

> 当前发布的是源码版，主要在 Windows 上开发。私人素材库、个人工程、API Key、Blender 安装包和未核实来源的植物资源均不在仓库中。

## 目录

- [主要功能](#主要功能)
- [快速开始](#快速开始)
- [Tripo 国际官方 API](#tripo-国际官方-api)
- [Blender 与 Codex 可选集成](#blender-与-codex-可选集成)
- [源码与素材边界](#源码与素材边界)
- [项目结构](#项目结构)
- [开发与测试](#开发与测试)
- [文档](#文档)
- [开源许可证](#开源许可证)

## 主要功能

| 模块 | 用途 |
| --- | --- |
| 本地 3D 素材库 | 导入、预览、分类、查找和复用模型，管理本机资源 |
| 参考图分拆 | 记录模型组件、制作备注和组件四视图 |
| Tripo AI 素材生成 | 文字生成 3D、图片生成 3D、多视图生成，完成后下载入库 |
| 程序化树木制作 | 调整树干、枝条、树叶和树冠，检查模型并导出 |
| 植被制作与搭配 | 编辑植物单元与分布规则；部分预设需要自备资源 |
| 建筑构件装配 | 组合素材、调整位置与尺寸，保存工程和可复用半成品 |
| 本机模型处理 | 可选通过 Blender 处理模型与转换格式 |

适合需要整理本地模型、制作游戏场景素材、生成程序化树木，或把建筑构件组合成场景的工作流。模型是否满足游戏引擎的性能、碰撞、LOD 和美术要求，仍需要实际验收。

## 快速开始

### 1. 准备环境

- 安装 **Node.js 24 或更新版本**。
- 安装 Git，用于获取源码。
- 准备浏览器；当前主要使用 Windows 与 Chrome 验证。

### 2. 获取并启动

```sh
git clone https://github.com/RyanLoveAI/Orbigen.git
cd Orbigen
npm start
```

浏览器打开 [本地工作台](http://127.0.0.1:8766)。浏览器所需的 Three.js 等库已包含在源码中，不需要额外安装 npm 依赖。按 Ctrl+C 停止服务。

### 3. 保存自己的数据

默认数据库与工程保存在仓库的 `data/` 目录，该目录已被 Git 忽略。可以通过 `ASSET_WORKBENCH_DATA` 指定独立的数据目录。

其他环境变量、Windows PowerShell 启动示例和排查方法，见 [安装与配置](docs/installation.md)。

## Tripo 国际官方 API

1. 在 [Tripo 官方控制台](https://developers.tripo3d.ai/en/keys) 创建自己的 API Key。
2. 启动 Orbigen，进入「Tripo 素材生成」。
3. 填写 API Key，连接后选择文字、参考图或四视图生成。
4. 检查积分估算与生成设置，再提交任务；完成后自动下载并入库。

当前使用 [Tripo 官方 v3 API](https://openapi.tripo3d.ai/v3)，适配 **H3.1 / v3.1-20260211**。API 与网页版积分分别计费；生成会消耗你的 API 积分，实际费用以官方记录为准。

Windows 可选择通过 DPAPI 加密保存 Key。没有配置安全存储 helper 的其他系统只使用当前会话。不要在公开 Issue、截图或代码中提供密钥。更多说明见 [功能指南](docs/user-guide.md)。

## Blender 与 Codex 可选集成

- **Blender**：用于本机模型处理和格式转换。单独安装后，可设置 `ORBIGEN_BLENDER_BIN` 指向可执行文件。
- **Codex CLI**：可选的制作助手集成，需要单独安装、登录，并可通过 `ORBIGEN_CODEX_BIN` 指定路径。

这些软件的可执行文件不在本仓库中。第三方服务的账号、费用和使用条款由使用者自行管理。

## 源码与素材边界

仓库包含应用代码、测试和已保留许可证的第三方前端库；不包含个人数据、生成历史、商业素材库和便携运行环境。

四套植物模型／贴图资源尚未完成来源核实，未公开发布。因此，依赖这些资源的部分树种预设暂不可用。可以使用程序化树形，或导入自己有权使用的模型与贴图。详见 [ASSETS.md](ASSETS.md)。

服务默认只监听 `127.0.0.1`，用于本机工作。当前没有面向公网部署的用户认证与权限体系，不要直接暴露到公网。

## 项目结构

```text
Orbigen/
├── server.mjs             # 本机 HTTP 服务与 API 路由
├── store.mjs              # 数据库与模型存储
├── tripo.mjs              # Tripo 国际官方 API 适配
├── tripo-batch.mjs        # 图片目录批量任务
├── public/
│   ├── app.js            # 浏览器应用入口
│   ├── modules/          # 树木、植被、素材库与装配等模块
│   └── vendor/           # Three.js、fflate 及随附解码器
├── scripts/              # Blender 脚本与模型检查工具
├── skills/               # 制作助手使用的操作说明
├── tests/                # 自动化测试
└── docs/                 # 安装与功能文档
```

## 开发与测试

```sh
npm test
npm run test:tree-review:http
```

源码发布前已通过 22 项自动化测试及隔离的模型导出入库 HTTP 检查。Tripo 测试使用模拟 API，不会进行付费生成；真实 Key 的生成流程需要自行验证。Linux 与 macOS 尚未完成完整运行验证。

## 文档

- [安装、配置与故障排查](docs/installation.md)
- [素材管理、AI 生成与树木制作指南](docs/user-guide.md)
- [贡献代码](CONTRIBUTING.md)
- [安全说明](SECURITY.md)
- [素材授权边界](ASSETS.md)
- [第三方组件与许可证](THIRD_PARTY_NOTICES.md)

反馈问题请使用 [GitHub Issues](https://github.com/RyanLoveAI/Orbigen/issues)，说明运行环境、复现步骤和错误现象，并先移除个人数据。

## 开源许可证

除单独标注的第三方代码外，**构件 Orbigen** 由 **RyanLoveAI** 以 **GPL-3.0-or-later** 发布，见 [LICENSE](LICENSE)。第三方库保留原有版权和许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。项目许可证不替用户导入的模型、贴图或其他素材授予权利。
