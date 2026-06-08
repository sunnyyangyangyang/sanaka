# sanaka-tools

`sanaka-tools` 是 Sanaka 的客户机增强工具项目。

当前第一版目标：

- 语言：`C89`
- 平台：`Win32`
- 系统：`Windows XP` 到 `Windows 11+`
- 功能：纯文本剪贴板共享客户端

当前目录结构：

- `src/`
  - 原生 Win32 客户端源码
- `scripts/`
  - 构建脚本
- `installer/`
  - NSIS 安装器脚本
- `dist/`
  - 编译产物

当前实现阶段：

- 已建立 XP/Win32 客户端源码骨架
- 已接入 Sanaka 工具盘生成逻辑
- 已提供 macOS 交叉构建脚本
- 已提供 Windows MinGW32 构建脚本
- 已提供 NSIS 安装器脚本
- 当前环境还未安装 `makensis`，所以未在本机生成 `setup.exe`

## 本地构建

在 macOS / Linux 上，如果已安装 `mingw-w64`：

```sh
sh sanaka-tools/scripts/build-win32.sh
```

默认输出：

```text
sanaka-tools/dist/sanaka_clipboard.exe
```

注意：

- 当前 macOS Homebrew 的 `mingw-w64` 产物会依赖 `api-ms-win-crt-*`
- 这对 `Windows XP` 不合适
- 因此它更适合做快速验证，不适合作为 XP 正式发布构建

## Windows XP 正式构建

如果你的 Windows 机器上有较老的 `MinGW32`：

```bat
sanaka-tools\scripts\build-win32-xp.bat
```

如果同时装了 `NSIS`：

```bat
sanaka-tools\scripts\build-installer-xp.bat
```

这样更适合产出面向 `XP -> Win11+` 的正式版本。

## 安装器

NSIS 脚本：

```text
sanaka-tools/installer/sanaka-tools.nsi
```

目标输出：

```text
sanaka-tools/dist/setup.exe
```
