# GitHub 上传与 Release 发布规范

更新时间：2026-04-30

这份文档用于记录当前项目在 GitHub 仓库整理、代码推送、Release 发布、构建产物命名上的统一规范，以及本轮实际踩过的坑。

适用仓库：

- `https://github.com/2186056836/ppx`

## 1. 当前约定

### 1.1 仓库根目录

以后统一以：

- `C:\Users\Administrator\Downloads\皮皮虾助手fix\ppx-master`

作为 Git 仓库根目录。

不要把外层分析目录、反编译目录、临时日志目录一起上传。

### 1.2 构建产物分发方式

构建产物统一通过 GitHub Releases 分发。

不要再把 APK 放进仓库内的 `res/`、`docs/` 或其他源码目录。

### 1.3 README 下载说明

README 中下载说明统一写成：

```md
已构建版本通过 [GitHub Releases 下载页](https://github.com/2186056836/ppx/releases) 分发。
```

不要只写 `Releases`，否则显示语义太弱。

## 2. 构建产物命名规范

当前源码已固化 APK 命名规则，位置：

- `app/build.gradle.kts`

当前规则：

```kotlin
android.applicationVariants.all {
    outputs.all {
        (this as BaseVariantOutputImpl).outputFileName =
            "皮皮虾助手-v${versionName}-release.apk"
    }
}
```

标准命名格式：

```text
皮皮虾助手-v<versionName>-release.apk
```

例如：

```text
皮皮虾助手-v26.04.29-release.apk
```

不要再上传成：

- `26.04.29.apk`
- `版本号.apk`
- 无项目前缀的 APK 名称

## 3. 当前版本信息

当前版本：

- `versionName = 26.04.29`
- `versionCode = 20260429`

当前 Release tag：

- `v26.04.29`

当前规范：

- Git tag 用 `v<versionName>`
- APK 文件名用 `皮皮虾助手-v<versionName>-release.apk`

## 4. 推荐发布流程

### 4.1 修改源码

先在源码根目录修改：

- `README.md`
- `app/build.gradle.kts`
- 其他业务代码

### 4.2 同步到构建镜像

当前环境里，实际稳定构建目录是：

- `D:\ppx-master-build`

原因：

- 原源码路径带中文
- 部分 Gradle / 工具链在该环境下对中文路径不稳定

因此改完 `ppx-master` 后，必要时要同步关键文件到 `D:\ppx-master-build` 再构建。

### 4.3 编译 Release

命令：

```bash
cd "D:/ppx-master-build"
./gradlew.bat :app:assembleRelease --no-daemon
```

标准输出产物位置：

```text
D:/ppx-master-build/app/build/outputs/apk/release/皮皮虾助手-v26.04.29-release.apk
```

### 4.4 推代码到 GitHub

在仓库根目录执行：

```bash
git add .
git commit -m "your message"
git -c http.version=HTTP/1.1 -c http.lowSpeedLimit=1 -c http.lowSpeedTime=600 push
```

这里显式加：

- `http.version=HTTP/1.1`
- `http.lowSpeedLimit=1`
- `http.lowSpeedTime=600`

是因为本轮实际遇到过一次 `github.com:443` 超时，普通 `git push` 不稳定。

### 4.5 创建或更新 Release

创建 Release：

```bash
gh release create v26.04.29 "D:/ppx-master-build/app/build/outputs/apk/release/皮皮虾助手-v26.04.29-release.apk#皮皮虾助手-v26.04.29-release.apk" --repo 2186056836/ppx --title "v26.04.29" --notes-file <notes-file>
```

如果是替换已有 asset：

```bash
gh release delete-asset v26.04.29 "旧文件名.apk" --repo 2186056836/ppx -y
gh release upload v26.04.29 "D:/ppx-master-build/app/build/outputs/apk/release/皮皮虾助手-v26.04.29-release.apk#皮皮虾助手-v26.04.29-release.apk" --repo 2186056836/ppx
```

## 5. Release 正文规范

推荐正文模板：

```text
基于 Secack/ppx 的重构维护版本
- 适配目标：皮皮虾 6.2.0
- 兼容 LSPosed 1.9.x legacy API 93 与 LSPosed 2.0 modern API 101
- 感谢原作者 Secack / Akari
```

## 6. Release 正文写入避坑

### 6.1 不要直接依赖复杂 shell 转义

本轮踩坑结果：

- 曾经用 shell 直接传 `--notes $'...'`
- 最终 GitHub Release body 被写成了单个 `$`

这不是显示异常，而是正文真的被写坏了。

### 6.2 正确做法：用 `--notes-file`

推荐先写临时文件，再传给 `gh release edit` 或 `gh release create`。

PowerShell 示例：

```powershell
$tmp = Join-Path $env:TEMP 'ppx-release-notes.md'
@'
基于 Secack/ppx 的重构维护版本
- 适配目标：皮皮虾 6.2.0
- 兼容 LSPosed 1.9.x legacy API 93 与 LSPosed 2.0 modern API 101
- 感谢原作者 Secack / Akari
'@ | Set-Content -LiteralPath $tmp -Encoding UTF8

gh release edit v26.04.29 --repo 2186056836/ppx --notes-file $tmp

Remove-Item -LiteralPath $tmp -Force
```

以后优先用这种方式，不要再赌 bash / powershell / JSON / heredoc 的多层转义。

## 7. GitHub Token / 权限避坑

### 7.1 当前 token 有 `repo`，但没有 `workflow`

本轮实际现象：

- 仓库创建成功
- `git push` 被 GitHub 拒绝更新 `.github/workflows/app.yml`

报错核心含义：

- OAuth token 没有 `workflow` scope

### 7.2 当前处理办法

如果当前 token 没有 `workflow` scope：

- 不要在本次会话里硬推 `.github/workflows/*`
- 先把 workflow 文件转移到：
  - `docs/ci/app.yml.example`

等以后 token 补了 `workflow` scope，再恢复回：

- `.github/workflows/app.yml`

## 8. 本轮确认过的事实

### 8.1 仓库

- 仓库地址：`https://github.com/2186056836/ppx`

### 8.2 Release

- Release 页面：`https://github.com/2186056836/ppx/releases/tag/v26.04.29`

### 8.3 当前标准 asset 名

- `皮皮虾助手-v26.04.29-release.apk`

## 9. 下次会话建议直接照做

下次如果要继续发布，建议按下面顺序：

1. 在 `ppx-master` 改源码
2. 必要时同步到 `D:\ppx-master-build`
3. `assembleRelease`
4. 检查 APK 名称是否符合 `皮皮虾助手-v<version>-release.apk`
5. `git commit`
6. 用带 `HTTP/1.1` 参数的 `git push`
7. 用 `gh release upload` 替换或发布 asset
8. Release 正文一律走 `notes-file`

这套流程已经在当前环境里走通过一次，可以直接复用。
