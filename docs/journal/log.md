# log

## 本次更新

这轮主要在补 `sanaka-tools/linux`，目标是不再停留在“能装但不好用”的状态，而是把 Linux 增强工具真正做成可安装、可诊断、可启动、可打包、可追日志的一套运行时。

## 1. Linux 共享剪贴板后端补强

- 新增了 Linux 剪贴板后端矩阵设计与实现。
- 图形桌面优先支持：
  - `wl-copy` / `wl-paste`
  - `xclip`
  - `xsel`
- 纯控制台 / tty 环境新增：
  - 活动控制台探测
  - `tty-inject` 文本注入
- 启动日志现在会明确记录：
  - `read backend`
  - `write backend`
- 失败日志从模糊提示改成更具体的原因说明，便于排查。

相关实现：

- `sanaka-tools/linux/src/sanaka_clipboard_linux.c`
- `speccodex/linux-clipboard-backend-matrix-v1/`

## 2. Linux 双架构构建打通

- 现在 Linux 客户端同时维护：
  - `amd64`
  - `aarch64`
- 在 macOS 上引入 `zig cc` 交叉编译路线，不再依赖 WSL 主机才能产出 Linux ELF。
- 已把新的双架构二进制重新编进 Linux 工具镜像。

相关文件：

- `sanaka-tools/linux/src/build.sh`
- `sanaka-tools/linux/bin/sanaka-clipboard-amd64`
- `sanaka-tools/linux/bin/sanaka-clipboard-aarch64`

## 3. Linux ISO 打包收紧

- `sanaka-tools-linux.iso` 不再向最终用户暴露源码和构建脚本。
- ISO 现在只保留运行时必需内容：
  - `install.sh`
  - `uninstall.sh`
  - `bin/`
  - `config/`
  - `share/`
  - `lib/`
  - `locales/`
- 同时要求镜像内必须带双架构 ELF，而不是混一个旧的单架构残留。

相关文件：

- `scripts/rebuild-sanaka-tools-linux-iso.sh`
- `iso/sanaka-tools-linux.iso`

## 4. Linux Doctor 接入

- 新增 `sanaka-tools/linux/bin/doctor.sh`
- `install.sh` 安装结束时会自动跑一次 doctor
- `start.sh` 每次启动前也会自动跑一次 doctor
- doctor 会自动补齐：
  - shell 启动钩子
  - 桌面自启动文件
  - 配置文件
  - 常见桌面剪贴板依赖检测

这样即使用户是先在 CLI 里安装，之后再装 `lxde`、`xfce` 之类桌面，也不容易出现“之前安装了但桌面里不生效”的问题。

## 5. 依赖安装逻辑调整

- 现在缺依赖时不会无脑偷偷安装。
- 交互终端里会先问用户要不要安装：
  - `wl-clipboard`
  - `xclip`
  - `xsel`
- 非交互场景下不会自动装，只会跳过并记日志。
- 如果没有提权能力，doctor 也会明确提示，而不是静默失败。

## 6. Linux Shell i18n

- 为 Linux 工具镜像加入独立的运行时 i18n：
  - `lib/i18n.sh`
  - `locales/en-US.sh`
  - `locales/zh-CN.sh`
- 覆盖脚本：
  - `install.sh`
  - `uninstall.sh`
  - `bin/doctor.sh`
  - `bin/start.sh`
- 现在会根据环境自动选择语言。
- 如果当前是非 UTF-8 中文环境，例如 `zh_CN.GBK`，会自动回退英文，避免终端乱码。

## 7. 启动输出补充

`start.sh` 现在启动时会直接输出：

- `Sanaka 共享剪贴板客户端开始运行！`
- `端口：<port>`
- `日志文件：<logfile>`

这样用户至少知道：

- 程序有没有真正启动
- 当前看的应该是哪个端口
- 日志去哪找

## 8. 文案与残留修正

- 删除了 Linux 安装完成后“预览骨架”的误导性残留文案。
- 补充并修正了 Linux 相关 README 说明。

## 9. 验证情况

本轮已完成的验证包括：

- 相关 shell 脚本 `sh -n` 语法检查通过
- `npm run typecheck` 通过
- 新 Linux ELF 已确认包含新的后端日志字符串
- 新 Linux ISO 已确认包含：
  - `bin/doctor.sh`
  - `lib/i18n.sh`
  - `locales/en-US.sh`
  - `locales/zh-CN.sh`
- 已验证：
  - `LANG=zh_CN.UTF-8` 输出中文
  - `LANG=zh_CN.GBK` 自动回退英文

## 当前状态

当前 Linux 增强工具已经不再只是占位骨架，至少具备了下面这些实际能力：

- 可安装
- 可卸载
- 可自启动
- 可自动修复基础环境
- 可输出明确日志
- 可做双架构打包
- 可根据桌面 / tty 选择不同剪贴板路径

但也仍然有边界：

- 纯 tty 下目前重点是“宿主机 -> 客户机”文本注入
- 纯 tty 的“客户机 -> 宿主机”读取，仍没有桌面会话那样统一稳定
- Linux 桌面环境差异很大，后续仍值得继续补更细的诊断提示
