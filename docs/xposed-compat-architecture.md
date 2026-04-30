# Xposed 兼容架构说明

更新时间：2026-04-29

这份文档用于把 `ppx-master` 当前的 Xposed 兼容架构提炼成可迁移方案，方便复用到其他项目。

目标版本矩阵：

- `LSPosed 1.9.x -> legacy Xposed API 93`
- `LSPosed 2.0 -> modern libxposed API 101`

不再把 `modern API 100` 作为新项目目标兼容面。

## 1. 推荐总结构

推荐采用四层结构：

1. `LegacyEntry`
   - 只处理 `de.robv.android.xposed.*` 入口
   - 接收 `handleLoadPackage`
   - 过滤目标包
   - 把必要上下文转交给统一启动层

2. `Modern101Entry`
   - 只处理 `io.github.libxposed.api.*` 入口
   - `onModuleLoaded` 只绑定 modern 101 runtime
   - `onPackageReady` 才启动宿主初始化
   - 不把业务逻辑塞进入口类

3. `EntryDispatcher / HostBootstrap`
   - 负责统一 legacy / modern 的收口
   - 负责目标包过滤、classLoader 去重、自包激活补丁
   - 负责决定何时开始宿主初始化

4. `Runtime / HookRegistry`
   - 负责抽象 hook 能力
   - 负责 `invokeOriginal`、`hookBefore/After/Replace`
   - 负责业务 hook 扫描、注册与执行

一句话：

- 入口层只负责“接入框架”
- bootstrap 只负责“启动宿主”
- runtime 只负责“屏蔽 hook 差异”
- 业务层只负责“声明功能 hook”

## 2. `ppx-master` 当前实现对照

当前工程已经有“多入口 + 共享桥接层”的雏形。

### 2.1 legacy 入口

- `app/src/main/assets/xposed_init`
- `app/src/main/java/com/akari/ppx/xp/Entry.kt`

当前职责：

- 接收 `IXposedHookLoadPackage.handleLoadPackage`
- 把 `packageName + classLoader` 转给 `ModuleEntryBridge`

这是正确方向。legacy 入口本身足够薄。

### 2.2 modern 入口

- `xposed-modern-api101-entry/src/main/java/com/akari/ppx/xp/modern/Api101Entry.java`
- `app/src/main/resources/META-INF/xposed/java_init.list`
- `app/src/main/resources/META-INF/xposed/module.prop`
- `app/src/main/resources/META-INF/xposed/scope.list`

当前 intended 方向：

- `onModuleLoaded` 绑定 modern runtime
- `onPackageReady` 进入统一桥接层

这也符合 `API 101` 的生命周期设计。

### 2.3 共享桥接层

- `app/src/main/java/com/akari/ppx/xp/ModuleEntryBridge.kt`

当前它同时承担了这些职责：

- runtime 选择：`HookRuntime.useLegacy/useModern`
- 包过滤
- classLoader 去重
- 自模块激活补丁
- `Init(context)` 宿主初始化
- Dex 扫描 `BaseHook`
- `MainActivity.onCreate` 时逐个执行 hook

这就是当前最厚的一层。后续如果要继续演进，优先拆这里。

### 2.4 hook 运行时抽象

- `app/src/main/java/com/akari/ppx/utils/HookRuntime.kt`
- `app/src/main/java/com/akari/ppx/utils/XposedEx.kt`

当前方向是对的：

- 业务层不直接依赖 `XC_MethodHook.MethodHookParam`
- 统一改成内部 `HookParam`
- 由 `HookRuntime` 决定走 legacy 还是 modern

这层是整个兼容设计里最值得保留的部分。

## 3. 建议给其他项目的最小实现

如果要给新项目复用，最小实现建议如下。

### 3.1 legacy 线

保留：

- `assets/xposed_init`
- manifest metadata：
  - `xposedmodule=true`
  - `xposeddescription=...`
  - `xposedminversion=93`
  - `xposedscope=...`
  - 需要旧偏好支持时可保留 `xposedsharedprefs=true`

legacy 入口类只做：

- 接收 `handleLoadPackage`
- 过滤目标包
- 调 `EntryDispatcher.onLegacyLoadPackage(...)`

不要在 legacy 入口里直接做 hook 扫描和功能初始化。

### 3.2 modern 101 线

保留：

- `META-INF/xposed/java_init.list`
- `META-INF/xposed/module.prop`
- `META-INF/xposed/scope.list`

`module.prop` 建议：

```properties
minApiVersion=101
targetApiVersion=101
staticScope=true
```

modern 入口类只做：

- `onModuleLoaded` -> 绑定 modern 101 runtime
- `onPackageReady` -> 调 `EntryDispatcher.onModernPackageReady(...)`

不建议在 constructor 里做初始化。

### 3.3 共享桥接层

建议拆成两个对象：

- `EntryDispatcher`
  - 接收 legacy / modern 的入口调用
  - 只负责把上下文转发到 bootstrap

- `HostBootstrap`
  - 负责目标包过滤
  - 负责 classLoader 去重
  - 负责宿主初始化
  - 负责决定何时安装业务 hook

### 3.4 hook 抽象层

建议保留两个接口：

- `LoaderRuntime`
  - 提供框架名、API 级别、日志、模块路径、进程信息

- `HookBridge`
  - 提供 `hook`
  - 提供 `invokeOriginal`
  - 如需要可提供 `deoptimize`

业务层只依赖这两个抽象，不直接依赖 `de.robv.android.xposed` 或 `io.github.libxposed.api`。

## 4. 当前仓库的关键文件

本项目当前实现对应文件：

- legacy 入口
  - `app/src/main/assets/xposed_init`
  - `app/src/main/java/com/akari/ppx/xp/Entry.kt`

- modern 入口
  - `xposed-modern-api101-entry/src/main/java/com/akari/ppx/xp/modern/Api101Entry.java`
  - `app/src/main/resources/META-INF/xposed/java_init.list`
  - `app/src/main/resources/META-INF/xposed/module.prop`
  - `app/src/main/resources/META-INF/xposed/scope.list`

- 共享桥接
  - `app/src/main/java/com/akari/ppx/xp/ModuleEntryBridge.kt`

- hook 抽象
  - `app/src/main/java/com/akari/ppx/utils/HookRuntime.kt`
  - `app/src/main/java/com/akari/ppx/utils/XposedEx.kt`

- legacy manifest metadata
  - `app/src/main/AndroidManifest.xml`

- modern 打包配置
  - `app/build.gradle.kts`

## 5. 参考仓库

### 5.1 优先参考：QAuxiliary

仓库：

- https://github.com/cinit/QAuxiliary

看什么：

- legacy 入口：
  - `Xp51HookEntry`
- modern 100/101 入口分层：
  - `Lsp10xUnifiedHookEntry`
  - `Lsp100HookEntry`
  - `Lsp101HookEntry`
- 统一启动链：
  - `ModuleLoader`
  - `UnifiedEntryPoint`
  - `StartupAgent`

为什么最值得参考：

- 它不是只会“识别两种入口”
- 它把入口适配、runtime 抽象、统一启动流拆得更清楚
- 适合当“项目级兼容架构模板”

直接链接：

- https://raw.githubusercontent.com/cinit/QAuxiliary/main/loader/sbl/src/main/java/io/github/qauxv/loader/sbl/xp51/Xp51HookEntry.java
- https://raw.githubusercontent.com/cinit/QAuxiliary/main/loader/sbl/src/main/java/io/github/qauxv/loader/sbl/lsp10x/Lsp10xUnifiedHookEntry.java
- https://raw.githubusercontent.com/cinit/QAuxiliary/main/loader/sbl/src/main/java/io/github/qauxv/loader/sbl/lsp101/Lsp101HookEntry.java
- https://raw.githubusercontent.com/cinit/QAuxiliary/main/loader/sbl/src/main/java/io/github/qauxv/loader/sbl/common/ModuleLoader.java
- https://raw.githubusercontent.com/cinit/QAuxiliary/main/loader/startup/src/main/java/io/github/qauxv/startup/UnifiedEntryPoint.java

### 5.2 官方 modern API 示例：libxposed/example

仓库：

- https://github.com/libxposed/example

看什么：

- `module.prop`
- `java_init.list`
- `ModuleMain.java`

为什么要看：

- 用来校准 `API 101` 的官方语义
- 尤其是 `onModuleLoaded / onPackageLoaded / onPackageReady / hook()/getInvoker()`

注意：

- 这是 modern-only 示例
- 不能直接当作“双兼容模板”

### 5.3 modern-only 工程组织参考：Janus

仓库：

- https://github.com/penguinyzsh/janus

看什么：

- `hook/build.gradle.kts`
- `META-INF/xposed/module.prop` 的生成方式
- manifest 中 legacy manager metadata 的保留方式

为什么要看：

- modern API 101 打包方式比较整洁
- 适合参考 Gradle 与资源组织

### 5.4 modern-only 轻量参考：Gboard Material Expressive Black

仓库：

- https://github.com/hxreborn/gboard-material-expressive-black

看什么：

- `app/build.gradle.kts`
- `META-INF/xposed/module.prop`

为什么要看：

- 适合参考 `META-INF/xposed/*` 打包
- 适合参考 modern-only 模块的最小构成

### 5.5 APK 样本补充：HookVip_4.1.5

本地样本：

- `C:\Users\Administrator\Downloads\皮皮虾助手fix\HookVip_4.1.5.apk`

价值：

- 适合观察“legacy + modern 双入口识别、单桥接运行时”的 APK 成品形态
- 不适合直接当源码架构模板

原因：

- 它经过混淆
- 可读性远不如 QAuxiliary
- 更适合作为行为样本，不适合作为维护模板

## 6. 给其他项目的落地建议

如果是新项目，优先采用下面这套裁剪版：

1. legacy：
   - `assets/xposed_init`
   - `EntryLegacy`

2. modern：
   - `META-INF/xposed/java_init.list`
   - `EntryModern101`

3. 共享层：
   - `EntryDispatcher`
   - `HostBootstrap`
   - `HookRuntime`
   - `HookRegistry`

4. 配置：
   - manifest 保留 legacy metadata
   - `module.prop` 只写 `101`
   - `scope.list` 和 manifest `xposedscope` 保持一致

不建议新项目继续沿用：

- `modern api100` 过渡层
- `java_init.list` 同时挂多个 modern 入口
- 在入口类里直接做业务 hook 初始化

## 7. 当前仓库的历史过渡残留

`ppx-master` 在一次过渡期里曾存在 `api100` 过渡模块与分支。对于新项目，这部分不应继续复制。

历史过渡项包括：

- `xposed-modern-api100-entry`
- `xposed-modern-api100-stubs`
- `HookRuntime.kt` 里的 `api100` 分支
- `java_init.list` 曾同时暴露 `Api100Entry` 和 `Api101Entry`

推荐收敛方向：

- legacy 只保留 `Entry`
- modern 只保留 `Api101Entry`
- 共享 runtime 只保留 legacy + modern101 两条分支
