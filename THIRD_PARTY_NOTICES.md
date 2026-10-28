# 第三方组件

本仓库保留以下上游代码及原许可证。项目总许可证不替换这些组件各自的授权声明。

| 组件 | 位置 | 原许可证 | 来源 |
| --- | --- | --- | --- |
| Three.js r180（含控件、加载器和导出器） | public/vendor/three/ | MIT，见同目录 LICENSE | https://github.com/mrdoob/three.js/tree/r180 |
| fflate 0.8.2 | public/vendor/fflate.js | MIT，见 public/vendor/fflate-LICENSE | https://github.com/101arrowz/fflate |
| meshoptimizer decoder（Three.js 随附版本） | public/vendor/three/addons/libs/meshopt_decoder.module.js | MIT，见 meshopt-LICENSE | https://github.com/zeux/meshoptimizer |
| Draco decoder（Three.js 随附版本） | public/vendor/three/addons/libs/draco/ | Apache-2.0，见该目录 LICENSE | https://github.com/google/draco |

植被引擎的 THREE-LICENSE.txt 也保留在源码中。fflate 文件开头的 UZIP.js 来源说明按上游原样保留。

Blender、Node.js 和 Codex CLI 是外部运行依赖，不含在本仓库的二进制分发中。与 Blender Python API 交互的项目脚本随本项目按 GPL-3.0-or-later 提供。Tripo 为外部 API 服务，使用者需要自行遵守服务条款并承担其使用费用。
