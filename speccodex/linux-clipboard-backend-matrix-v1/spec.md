# Linux 剪贴板后端矩阵 v1

## 背景

当前 Linux 客户机增强工具已经完成：

- bootstrap 握手
- bridge 长连接
- 文本协议收发
- 自启动与安装镜像

但在纯控制台 Linux 客户机里，日志会出现：

```text
clipboard write skipped: no clipboard backend available
```

这说明：

- 宿主机到客户机的桥是通的
- 客户机程序收到宿主机推送了
- 但客户机本地没有可写入目标

Linux 这里和 Windows 不同，没有统一的系统级文本剪贴板 API。

必须显式面对下面四类环境：

1. Wayland 桌面
2. X11 桌面
3. Linux VT / tty 纯控制台
4. 终端模拟器链路（OSC 52）

v1 不试图一次把所有后端都做成原生实现，但必须解决最常见的两类：

- 桌面会话
- 纯控制台

## 目标

这一轮要做到：

- 保留现有桌面剪贴板同步能力
- 在纯控制台 Linux 客户机里，不装桌面环境也能接收宿主机推送的文本
- 在日志里明确显示当前选择了哪个后端
- 在无可用后端时，给出明确原因，而不是一句模糊的 `no clipboard backend available`

## 非目标

这一轮不做：

- Wayland 原生协议实现
- X11 原生协议实现
- 从纯控制台客户机把本地选中文本稳定同步回宿主机
- 图片 / 文件 / 富文本剪贴板
- 自动探测每个终端模拟器的私有剪贴板扩展

## 后端模型

Linux 客户机程序把剪贴板能力拆成两个方向：

### 1. 读取后端

用于“客户机 -> 宿主机”。

v1 支持：

- `wl-paste`
- `xclip`
- `xsel`

说明：

- 这些只在桌面会话里成立
- 纯 tty 下通常没有可读剪贴板

### 2. 写入后端

用于“宿主机 -> 客户机”。

v1 支持：

- `wl-copy`
- `xclip`
- `xsel`
- Linux VT / tty 注入后端

其中 tty 注入后端是这轮新增重点。

## tty 注入后端

### 核心目标

当客户机运行在 Linux 虚拟控制台，而不是图形桌面时：

- 能把宿主机文本推送到当前活动控制台
- 用户能直接在 shell / 编辑器 / 文本程序里收到这些字符

### 实现思路

程序尝试：

1. 读取 `/sys/class/tty/tty0/active`
2. 找到当前活动虚拟控制台，例如 `tty1`
3. 打开 `/dev/tty1`
4. 使用 `TIOCSTI` 把文本逐字符注入该 tty 的输入队列

### 为什么这一层值得做

这不是“桌面剪贴板”，但它在 Sanaka 的控制台场景下非常实用：

- 不要求安装桌面环境
- 不要求 `xclip`
- 不要求 `wl-copy`
- 对最小 Debian、救援系统、CLI Linux 都更有意义

### 与 gpm 的关系

这层设计目标是“兼容 gpm 管理的控制台工作流”，不是“完全依赖 gpm 才能工作”。

换句话说：

- 有 gpm：可以继续用控制台鼠标与文本界面
- 没 gpm：只要当前是 Linux VT，文本注入仍然应尽量工作

## 后端优先级

### 读取优先级

1. `wl-paste`
2. `xclip`
3. `xsel`
4. 无

### 写入优先级

1. `wl-copy`
2. `xclip`
3. `xsel`
4. `tty-inject`
5. 无

原因：

- 桌面会话优先走真正的桌面剪贴板
- 纯控制台最后再退到 tty 注入

## 日志要求

程序启动时必须记录：

- 是否检测到读取后端
- 是否检测到写入后端
- 如果写入后端是 tty 注入，要记录目标 tty

例如：

```text
read backend: xclip
write backend: xclip
```

或者：

```text
read backend: none
write backend: tty-inject (/dev/tty1)
```

失败时不能只写：

```text
clipboard write skipped: no clipboard backend available
```

而应改成更具体：

```text
clipboard write skipped: no desktop backend and no active tty backend
```

## 行为边界

### 桌面 Linux

- 目标：双向文本同步
- 依赖：桌面会话 + 现有命令后端

### 纯控制台 Linux

- 目标：至少保证“宿主机 -> 客户机”文本可注入
- 不承诺“客户机 -> 宿主机”也同样稳定

这是因为：

- Linux VT 没有统一的“系统剪贴板读取 API”
- 但输入注入是可实现的

## 用户可见变化

用户不需要改 UI。

变化体现在：

- Linux 客户机控制台里可直接收到宿主机推送文本
- 日志更清楚
- README 更明确说明桌面与控制台的能力差异

## 风险

### 1. `TIOCSTI` 限制

某些 Linux 发行版或内核配置可能限制 `TIOCSTI`。

因此实现必须：

- 失败时记录日志
- 自动退回“无 tty backend”
- 不让程序崩溃

### 2. 没有活动虚拟控制台

如果当前环境不是 Linux VT，而是某些非常规容器 / 伪终端：

- 可能读不到 `/sys/class/tty/tty0/active`
- 需要退回无 tty backend

### 3. 不是严格意义上的系统剪贴板

tty 注入本质上是“往当前控制台喂输入”，不是桌面剪贴板。

但对 Sanaka 这类虚拟机控制台产品来说，它仍然是合理而且实用的 fallback。

## 验收

### 桌面场景

- 有 `xclip` / `xsel` / `wl-copy` 时，宿主机与客户机双向文本同步不退化

### 控制台场景

- 在纯 tty Debian / Ubuntu / 其他 Linux 中
- 不安装桌面环境
- 启动增强工具后
- 宿主机复制一段文本
- 客户机当前活动控制台能收到该文本

### 日志场景

- 能明确看到 read backend / write backend
- 失败时原因具体，不再模糊
