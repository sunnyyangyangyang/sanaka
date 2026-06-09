# sanaka-tools

`sanaka-tools` 是 Sanaka 的客户机增强工具项目。

当前第一版目标：

- 语言：`C89`
- 平台：`Win32`
- 系统：`Windows XP` 到 `Windows 11+`
- 功能：纯文本剪贴板共享客户端
- 连接方式：先连接宿主机固定 bootstrap 端口，再获取真实剪贴板会话端口

当前目录结构：

- `src/`
  - 原生 Win32 客户端源码
- `scripts/`
  - 仅保留一个 Windows PowerShell 构建入口
- `installer/`
  - NSIS 安装器脚本
- `dist/`
  - 编译产物

当前实现阶段：

- 已改为 bootstrap 握手模式（默认 `10.0.2.2:7935`）
- 已接入 Sanaka 工具盘生成逻辑
- 已收口为单一 PowerShell 构建入口
- 已提供 NSIS 安装器脚本
- Windows 侧可自动搜索整机的 `MinGW32` 和 `NSIS`
- 已带托盘菜单：状态、端口、退出
- 已加入 Linux 工具镜像骨架（`sanaka-tools/linux/`）

## Linux 工具镜像骨架

当前仓库已加入 Linux 增强功能镜像源目录：

```text
sanaka-tools/linux/
```

目前已提供：

- `install.sh`
- `uninstall.sh`
- `README.txt`
- `bin/sanaka-clipboard`
- `bin/start.sh`
- `share/*.desktop`
- `config/sanaka-clipboard.ini`

说明：

- 当前 Linux 版已带一个原生 C 客户端实现
- 图形剪贴板优先尝试 `wl-paste/wl-copy`、`xclip`、`xsel`
- 纯控制台 Linux 会尝试把宿主机文本注入当前活动 tty
- 已能生成 `iso/sanaka-tools-linux.iso`
- Linux 工具镜像可以同时放 `amd64` / `aarch64` 两个二进制，安装时自动选择
- 纯控制台 Linux 当前重点保证 `宿主机 -> 客户机` 文本可用
- Linux 客户机程序现在已经实现了 bootstrap / bridge 协议，不再只是占位 stub
- Linux 安装器会带上 `doctor.sh`，`start.sh` 每次启动前都会自动跑一次修复
- Linux `doctor.sh` 在交互终端里会先询问是否安装缺失依赖，非交互场景只记录日志
- Linux shell 文案已支持 `zh-CN` / `en-US`，且在非 UTF-8 中文环境下默认回退英文
- Linux 原生构建：`sh sanaka-tools/linux/src/build.sh`
- Linux 双架构一键构建：`SANAKA_TARGET_ARCH=all sh sanaka-tools/linux/src/build.sh`
- macOS 上可直接用 `zig cc` 交叉编译这两个 Linux ELF
- macOS 如不想装 `zig`，也可尝试：`sh sanaka-tools/linux/src/build-podman.sh`

## 本地构建

在 Windows PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\sanaka-tools\scripts\build-installer-xp.ps1
```

脚本会：

- 自动搜索整台电脑上的 `MinGW32 gcc`
- 自动搜索整台电脑上的 `makensis.exe`
- 编译 `sanaka_clipboard.exe`
- 生成 `setup.exe`

## 安装器

NSIS 脚本：

```text
sanaka-tools/installer/sanaka-tools.nsi
```

目标输出：

```text
sanaka-tools/dist/setup.exe
```
