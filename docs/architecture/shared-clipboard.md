# Sanaka 共享剪贴板原理

## 当前目标

Sanaka 当前的共享剪贴板只处理：

- 宿主机 <-> 客户机
- 纯文本
- Windows XP 及以上客户机

不处理：

- 图片
- 文件
- 富文本 / HTML / RTF
- 多客户机共享同一个 session

## 总体结构

当前实现分成四段：

1. 宿主机运行时剪贴板桥服务
2. 宿主机 bootstrap 服务
3. QEMU user networking
4. 客户机增强功能程序 `sanaka_clipboard.exe`

## 1. 宿主机剪贴板桥

每台运行中的虚拟机各自拥有一个独立的剪贴板桥服务。

它负责：

- 轮询宿主机文本剪贴板
- 把宿主机文本推送给客户机
- 接收客户机推来的文本
- 写回宿主机剪贴板
- 做 hash 去重，避免来回反复同步

当前协议是基于 TCP 的简单 JSON 行协议。

典型消息：

- `hello`
- `hello_ack`
- `clipboard_push`
- `clipboard_ack`
- `heartbeat`

## 2. 宿主机 bootstrap

bootstrap 是固定入口。

当前固定端口：

- `7935`

客户机启动后，不直接知道真实剪贴板桥端口，因为真实端口是运行时动态分配的。

所以流程是：

1. 客户机先连接 `10.0.2.2:7935`
2. 上报自己当前看到的虚拟网卡 MAC
3. 宿主机根据 MAC 匹配当前运行中的虚拟机
4. 返回该虚拟机当前的：
   - `sessionId`
   - 实际剪贴板桥端口
   - 协议版本

如果宿主机找不到这台运行中的虚拟机，bootstrap 会返回：

- `machine_not_running`

## 3. 为什么是 10.0.2.2

Sanaka 当前使用的是 QEMU `user networking`。

在这个模式下：

- 客户机常见地址是 `10.0.2.15`
- 宿主机在客户机视角下是 `10.0.2.2`

因此客户机增强功能程序访问宿主机服务时，直接连接：

- `10.0.2.2:<port>`

不需要 bridge 网络。

## 4. 为什么用 MAC 识别虚拟机

一开始考虑过用机器 UUID、配置文件路径、第二张配置盘等方法。

最后改成 MAC，原因是：

- XP 对一些现代系统识别 API 支持不好
- 配置盘和软盘方案太笨重
- MAC 天然存在于虚拟网卡
- QEMU 可以给网卡注入稳定 MAC
- 客户机可以自己读取当前网卡 MAC

所以现在的识别链是：

1. Sanaka 启动虚拟机时，为网卡注入稳定 MAC
2. XP 客户机里读取当前网卡 MAC
3. 客户机把这个 MAC 发给 bootstrap
4. 宿主机用这个 MAC 找到对应运行中的虚拟机

## 5. 客户机增强功能程序做什么

`sanaka_clipboard.exe` 负责：

- 开机自启动
- 托盘显示状态
- 读取当前虚拟机网卡 MAC
- 连接 bootstrap
- 获取真实端口和 session
- 连接实际剪贴板桥
- 双向同步文本剪贴板

当前托盘可显示：

- 连接状态
- bootstrap / bridge 相关状态
- 退出

## 6. 编码处理

XP 时代很多程序对剪贴板编码处理并不统一。

所以当前实现是双保险：

读取客户机剪贴板时：

- 优先 `CF_UNICODETEXT`，走 `UTF-16 -> UTF-8`
- 失败再读 `CF_TEXT`，走 `ANSI -> UTF-8`

写回客户机剪贴板时：

- 主写 `CF_UNICODETEXT`，走 `UTF-8 -> UTF-16`
- 同时补一份 `CF_TEXT`，走 `UTF-8 -> ANSI`

这能尽量兼容 XP 上的老程序。

## 7. 当前日志

当前有两类关键日志：

### 客户机内日志

文件：

- `sanaka_clipboard.log`

记录：

- 网卡 MAC
- bootstrap 连接情况
- bootstrap 返回内容
- bridge 连接情况
- 剪贴板同步关键事件

### 宿主机运行时日志

文件：

- `qemu.log`

Sanaka 会额外写入：

- 启动时期望的 `machineMac`
- 最终 QEMU 启动命令
- bootstrap 收到的客户机 MAC
- 当前 registry 中可匹配的运行中虚拟机
- 剪贴板桥收发日志

## 8. 当前已知边界

- 现在主要验证的是 XP
- 目前是文本同步，不是完整远程桌面剪贴板协议
- 如果客户机工具没有安装或未启动，宿主机桥会处于等待状态
- 如果虚拟机配置里未启用 clipboard integration，宿主机不会创建实际剪贴板桥

## 9. 为什么看起来“桥好了但粘贴没反应”

这类问题通常只会落在下面几层：

1. 宿主机没启用该虚拟机的 clipboard integration
2. bootstrap 认出 MAC 了，但这台机没有 active 的 clipboard bridge
3. guest -> host 的 `clipboard_push` 到了，但宿主机写剪贴板失败
4. guest 读取的是老程序的 ANSI 剪贴板，而不是 Unicode

现在日志已经足够把这几种情况分开定位。
