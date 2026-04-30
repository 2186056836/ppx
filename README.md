# 皮皮虾助手

一个基于 LSPosed / Xposed 的皮皮虾增强模块。

## 项目说明

本仓库是基于原项目 [Secack/ppx](https://github.com/Secack/ppx) 的重构与后续维护版本。

本次整理保留了原项目的整体思路，并在此基础上补充了：

- 现代 `libxposed` 入口与运行时桥接
- `LSPosed 1.9.x` legacy 与 `LSPosed 2.0` modern 双线兼容
- 新版本皮皮虾适配与一轮功能修复
- 更清晰的文档与构建产物归档

感谢原作者 `Secack / Akari` 提供原始项目与设计基础。

## 兼容范围

- 宿主适配目标：`皮皮虾 6.2.0`
- 框架兼容：
  - `LSPosed 1.9.x` -> legacy Xposed API 93
  - `LSPosed 2.0` -> modern libxposed API 101

## 项目结构

- `app/`：主模块源码
- `xposed-modern-api101-entry/`：modern API 101 入口
- `buildSrc/`：Gradle 版本与构建辅助
- `docs/`：架构与适配分析文档
- `tools/`：本地验证脚本

## 构建

```bash
./gradlew.bat :app:assembleRelease --no-daemon
```

Release APK 输出：

- `app/build/outputs/apk/release/`

## 下载

已构建版本通过 [Releases](https://github.com/2186056836/ppx/releases) 分发。

## 许可

本项目沿用原项目许可证：

- [GNU General Public License v3.0](LICENSE)
