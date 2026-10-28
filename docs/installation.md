# Orbigen 安装与配置

## 环境

Node.js 24+，当前主要开发环境为 Windows。浏览器依赖已包含在源码中，不需要 npm install。Blender 和 Codex CLI 均为可选的外部程序。

## Windows PowerShell 启动

```powershell
git clone https://github.com/RyanLoveAI/Orbigen.git
cd Orbigen
$env:ASSET_WORKBENCH_DATA = Join-Path $PWD 'data'
npm start
```

浏览器打开 http://127.0.0.1:8766，按 Ctrl+C 停止服务。不要上传 data 目录。

## 环境变量

| 变量 | 用途 | 默认行为 |
| --- | --- | --- |
| ASSET_WORKBENCH_PORT | 本机服务端口 | 8766 |
| ASSET_WORKBENCH_DATA | 数据库、工程与导入文件 | 仓库内 data 目录 |
| ORBIGEN_ASSET_FOLDER | 本地素材目录 | 使用应用的本地目录配置 |
| ORBIGEN_BLENDER_BIN | Blender 可执行文件 | 尝试查找本机安装 |
| ORBIGEN_CODEX_BIN | Codex CLI 可执行文件 | 尝试查找本机安装 |
| ORBIGEN_FOUR_VIEW_INBOX | 四视图批量输入目录 | 用户目录下 Orbigen/FourViewInbox |

例如，指定 Blender 路径时，把实际安装路径赋给 ORBIGEN_BLENDER_BIN，再启动 npm start。不要把个人安装路径写进源码提交。

## 常见问题

### 端口被占用

先确认是否已有工作台运行。也可以设置另一个 ASSET_WORKBENCH_PORT 后启动，访问相应端口。不要终止不认识的进程。

### 找不到 Blender 或 Codex

检查程序是否已安装，再通过上表的环境变量指定可执行文件。Codex 需要自行完成官方登录。

### 植物预设提示素材缺失

源码版未发布四套来源未核实的植物模型与贴图。这是发布范围限制，见 [素材说明](../ASSETS.md)。

### Tripo 连接失败

确认使用国际官方 API Key，不是网页账号密码、Client ID 或旧站凭据；检查网络和 API 余额。不要把 Key 发到公开问题区。

## 更新与备份

更新源码前，先停止服务并备份自己的数据目录。data 已被 Git 忽略；这不等于它已被自动备份。避免在服务写入时直接复制数据库。
