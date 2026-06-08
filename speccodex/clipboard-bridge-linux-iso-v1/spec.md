# Linux 增强工具镜像 v1

## 目标

为 Sanaka 增加 Linux 客户机增强工具镜像：

- 镜像文件名固定为 `iso/sanaka-tools-linux.iso`
- 控制台“更多 -> 安装 Sanaka 增强功能 -> Linux”挂载这个镜像
- 镜像主入口固定为 `install.sh`
- 不依赖 autorun
- 用户挂载后手动执行 `install.sh`

当前版本先只做：

- 共享剪贴板增强工具安装
- 开机自启动 / 登录后自启动
- 基础卸载能力
- 基础状态可见性

不做：

- GUI 安装器
- 自动运行
- 文件拖拽
- 双向文件同步

---

## 用户模型

Linux 客户机用户的预期是：

- 挂载 ISO 后可以看到一个清晰入口
- 最好一条命令完成安装
- 安装后重启或重新登录即可生效
- 失败时能看懂原因

因此 v1 设计为：

- 根目录直接放 `install.sh`
- 同时提供 `README.txt`
- 脚本全程输出清楚的提示
- 尽量不要求用户手工改很多路径

---

## 镜像目录结构

`sanaka-tools-linux.iso` 根目录建议如下：

```text
install.sh
uninstall.sh
README.txt
bin/
  sanaka_clipboard_linux
share/
  sanaka-clipboard.desktop
  sanaka-clipboard-autostart.desktop
config/
  sanaka-clipboard.ini
```

说明：

- `install.sh`
  - 主入口
- `uninstall.sh`
  - 卸载入口
- `README.txt`
  - 给用户看的最短说明
- `bin/sanaka_clipboard_linux`
  - Linux 客户机剪贴板常驻程序
- `share/sanaka-clipboard.desktop`
  - 可选的应用启动器
- `share/sanaka-clipboard-autostart.desktop`
  - 安装到用户自启动目录的模板
- `config/sanaka-clipboard.ini`
  - 默认配置模板

---

## 安装目标位置

默认按“当前用户安装”设计，不要求 root。

建议安装到：

```text
~/.local/share/sanaka-tools/
~/.config/autostart/
```

具体：

- 程序主体：
  - `~/.local/share/sanaka-tools/bin/sanaka_clipboard_linux`
- 配置文件：
  - `~/.local/share/sanaka-tools/config/sanaka-clipboard.ini`
- 日志目录：
  - `~/.local/share/sanaka-tools/logs/`
- 自启动文件：
  - `~/.config/autostart/sanaka-clipboard.desktop`
- CLI 启动辅助脚本：
  - `~/.local/share/sanaka-tools/bin/sanaka_clipboard_start.sh`

原因：

- 不需要 root
- 兼容大多数桌面 Linux
- 也方便兼容无桌面环境
- 卸载简单

---

## install.sh 行为

`install.sh` 是唯一主入口。

执行流程：

1. 打印欢迎信息
2. 检查当前系统
3. 检查必要目录是否可写
4. 创建安装目录
5. 复制二进制、配置、desktop 文件 / CLI 启动脚本
6. 给二进制加执行权限
7. 检测是否存在桌面环境
8. 如果有桌面环境，修正自启动 `.desktop` 中的绝对路径
9. 如果没有桌面环境，提示用户如何把启动脚本加入 shell profile / rc 文件
10. 如已有旧版本，先覆盖
11. 输出安装完成提示
12. 提示用户“重新登录、重新进入 shell，或手动启动一次”

脚本应支持：

- 直接双击后由终端执行
- 终端里 `bash install.sh`
- `sh install.sh`

脚本不要依赖：

- Python
- systemd
- root 权限

---

## install.sh 输出风格

输出必须口语化、短、直接。

例如：

```text
Sanaka Linux 增强功能安装程序

[1/6] 检查目录...
[2/6] 复制程序...
[3/6] 写入配置...
[4/6] 检查当前环境...
[5/6] 配置自启动...
[5/6] 完成权限设置...
[6/6] 安装完成

你现在可以：
1. 重新登录系统
2. 或手动运行 ~/.local/share/sanaka-tools/bin/sanaka_clipboard_linux
```

失败时必须明确：

- 哪一步失败
- 哪个文件失败
- 建议用户怎么处理

---

## uninstall.sh 行为

`uninstall.sh` 用来删除当前用户安装内容。

执行后删除：

- `~/.local/share/sanaka-tools/`
- `~/.config/autostart/sanaka-clipboard.desktop`
- 如存在则删除安装器追加的 shell 启动片段

并提示：

- 已删除
- 若当前程序正在运行，请注销或手动结束进程

---

## 配置文件

默认配置文件沿用现有桥接思路。

建议初始内容：

```ini
host=10.0.2.2
port=0
session_id=
protocol_version=1
```

说明：

- `host=10.0.2.2`
  - 继续使用 QEMU user 网络宿主机地址
- `port=0`
  - 由 bootstrap 动态下发真实桥接端口

---

## 自启动策略

v1 采用双模式：

### 1. 有桌面环境

优先使用 XDG autostart。

安装时写入：

`~/.config/autostart/sanaka-clipboard.desktop`

内容指向：

- `Exec=/home/用户名/.local/share/sanaka-tools/bin/sanaka_clipboard_linux`

要求：

- 不写死用户名
- 安装时替换成实际绝对路径

### 2. 无桌面环境

不依赖 `.desktop`。

安装器提供两个方案：

- 方案 A：用户手动运行
  - `~/.local/share/sanaka-tools/bin/sanaka_clipboard_linux`
- 方案 B：用户确认后，安装器向用户自己的 shell 启动文件追加一段启动片段
  - 如 `~/.profile`
  - 如 `~/.bash_profile`
  - 如 `~/.bashrc`
  - 如 `~/.zprofile`

追加逻辑要求：

- 只追加到用户自己的文件
- 不能覆盖原文件
- 必须带清晰的开始/结束标记
- 重复安装时不能重复追加多份

推荐标记：

```sh
# >>> sanaka clipboard start >>>
~/.local/share/sanaka-tools/bin/sanaka_clipboard_start.sh >/dev/null 2>&1 &
# <<< sanaka clipboard end <<<
```

如果安装器判断当前是纯 CLI 环境，应明确提示：

- 当前未检测到桌面环境
- 已切换为 CLI 常驻模式
- 需要重新登录 shell 或手动启动一次

---

## README.txt 内容要求

README 要尽量短，只说明：

1. 这是 Sanaka Linux 增强功能镜像
2. 安装命令是 `bash install.sh`
3. 安装后重新登录、重新进入 shell，或手动运行程序
4. 卸载命令是 `bash uninstall.sh`

---

## 控制台对接规则

控制台菜单：

- 更多
  - 检测虚拟机网络 (Windows)
  - 安装 Sanaka 增强功能
    - Windows
    - Linux

Linux 项点击后：

- 如果 `iso/sanaka-tools-linux.iso` 存在
  - 直接挂载到光驱
- 如果不存在
  - 明确提示“找不到工具镜像”

不允许：

- 点击后无反应
- 静默失败

---

## 运行模型

Linux 客户机工具程序 `sanaka_clipboard_linux` 设计目标：

- 启动后常驻后台
- 尝试连接宿主机 bootstrap
- 获取动态端口
- 建立剪贴板桥连接
- 支持文本剪贴板同步

v1 对 GUI 不做要求，可以是纯后台程序。

如果没有桌面环境：

- 程序仍应能启动
- 仍应能建立网络连接
- 只是在没有图形剪贴板服务时，同步能力可能受限
- 但程序本身不能因为无桌面环境直接拒绝运行

如果需要状态可见性，可选：

- stdout 日志
- 本地日志文件

但不强制做 tray。

---

## 兼容范围

v1 目标环境：

- Ubuntu / Xubuntu
- KDE Plasma / GNOME / XFCE 常见桌面环境
- 无桌面环境的纯 CLI Linux

要支持两种场景：

- 图形桌面登录后自动启动
- 纯 CLI 环境下登录 shell 后启动或常驻

暂不保证：

- Wayland / X11 的所有剪贴板细节完全一致
- 所有发行版都零适配

---

## 错误处理

以下情况必须明确报错：

- ISO 不存在
- `install.sh` 没有执行权限
- 安装目录不可写
- 二进制文件缺失
- 自启动文件写入失败
- shell 启动文件追加失败
- 当前环境无桌面但用户没有选择任何 CLI 启动方式

报错风格：

- 简短
- 直接指出失败点
- 给出下一步建议

---

## 版本边界

v1 只要求做到：

- ISO 结构稳定
- `install.sh` 可安装
- Linux 控制台菜单可挂载
- 找不到镜像时提示清楚

真正的 Linux 剪贴板客户端实现、打包和兼容性补齐，可以作为后续子任务继续推进。
