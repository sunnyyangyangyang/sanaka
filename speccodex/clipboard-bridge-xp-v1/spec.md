# Sanaka 剪贴板桥 XP v1 Spec

## 背景

用户希望 Sanaka 提供一个真正可用的宿主机 / 客户机剪贴板同步能力。

当前约束已经明确：

- 宿主机继续使用 Sanaka 现有的 `QEMU user networking`
- 不要求用户切换到 bridge 网络
- 客户机优先支持 `Windows XP`
- `Windows 98` 不再作为支持目标
- 不引入 `SPICE agent`、`virtio` 驱动、共享文件夹驱动这类额外依赖
- 第一版只做真正能落地的最小闭环，不做“半成品验证路线”

因此，第一版方案定义为：

- Sanaka 宿主机侧提供本地 `TCP` 剪贴板桥服务
- XP 客户机侧提供一个极小的原生 `Win32` 后台程序
- 该程序通过 `10.0.2.2:<port>` 主动连接宿主机服务
- 仅同步纯文本剪贴板
- 客户机程序通过 `Sanaka Tools ISO` 分发

这不是通用远控方案，也不是文件传输方案，而是一个明确收敛的：

- `纯文本`
- `XP 优先`
- `无驱动`
- `user networking 可用`

的剪贴板同步能力。

## 目标

第一版要做到：

- 宿主机与 XP 客户机之间可双向同步纯文本剪贴板
- 不需要桥接网络
- 不需要客户机安装虚拟机驱动
- 客户机安装后可开机自启动
- Sanaka 能为某台正在运行的虚拟机启用或禁用该能力
- Sanaka 能生成并挂载 `Sanaka Tools ISO`
- 同步过程具备断线重连、去重、防循环能力
- 出错时能给出用户向提示，而不是原始内部异常

## 非目标

- 本 spec 不支持 `Windows 98`
- 本 spec 不支持图片剪贴板
- 本 spec 不支持文件剪贴板
- 本 spec 不支持富文本 / HTML / RTF
- 本 spec 不支持 Linux / macOS 客户机工具
- 本 spec 不做 TLS / HTTPS
- 本 spec 不做互联网传输
- 本 spec 不做自动更新
- 本 spec 不做复杂 GUI

## 核心判断

### 1. 正式协议选择 TCP，而不是 HTTP / curl

第一版同步是持续状态同步，不是一次性调用接口。

因此正式方案必须使用：

- 长连接
- 宿主机主动推送
- 客户机断线重连
- 双端去重

`TCP` 更适合这些要求。

`curl/libcurl` 不纳入 v1 正式实现。

### 2. XP 客户机程序必须按 XP 约束反向设计

不能先写一个现代小工具，再赌它能跑 XP。

第一版 XP 工具必须：

- 使用 `C`
- 使用原生 `Win32 API`
- 编译目标固定为 `win32`
- 不依赖 .NET / Electron / Qt / WebView
- 不依赖现代服务框架

### 3. 不做大 GUI，安装器承担主要交互

用户已经接受：

- 主程序可以没有 GUI
- 安装后重启
- 开机自启动

因此第一版应该把交互收敛到：

- ISO 内安装器
- 安装完成提示
- 可选后台托盘能力

而不是先做一个复杂桌面程序。

## 用户模型

### 用户看到的概念

用户只需要理解：

- 是否启用剪贴板同步
- 当前虚拟机是否已连接到宿主机
- 如果客户机没有安装工具，需要挂载并运行 `Sanaka Tools ISO`
- 安装后建议重启客户机

用户不需要理解：

- 原始 TCP 协议
- `10.0.2.2`
- 内部端口协商
- 剪贴板哈希去重逻辑

### 用户文案方向

前端可接受的表述：

- `共享剪贴板`
- `已连接`
- `等待客户机工具连接`
- `请在客户机中运行 Sanaka Tools 安装程序`
- `安装完成后请重启客户机`
- `当前仅支持文本剪贴板`

不应直接暴露：

- socket 错误号
- 原始 TCP 包
- `OpenClipboard failed`
- 具体内部消息格式

## 总体架构

系统由三部分组成：

1. Sanaka 宿主机服务
2. XP 客户机后台工具
3. `Sanaka Tools ISO`

### 1. 宿主机服务

放在 Sanaka 后端：

- Electron main process / runtime 层负责生命周期管理
- 每台启用了共享剪贴板的运行中虚拟机拥有一个独立 session
- 为该 session 分配本地监听端口
- 监听来自客户机工具的 TCP 连接
- 和宿主机系统剪贴板交互

### 2. XP 客户机后台工具

客户机程序职责：

- 开机自启动
- 尝试连接 `10.0.2.2:<port>`
- 读取本机文本剪贴板
- 把本机更新推送到宿主机
- 接收宿主机推送并写入本机剪贴板
- 防止来回循环同步
- 断线后自动重连

### 3. Sanaka Tools ISO

ISO 负责交付客户机工具，而不是网络桥本身。

建议结构：

```text
Sanaka Tools ISO/
  autorun.inf
  setup.exe
  readme.txt
  bin/
    sanaka-clip.exe
    uninstall.exe
  config/
    default.ini
```

注意：

- `autorun.inf` 只是辅助，不应成为唯一入口
- 即使自动运行失效，用户也能手动双击 `setup.exe`

## 客户机支持范围

### 支持

- `Windows XP`

第一版目标是：

- `32-bit Win32 exe`
- `XP` 可运行

### 不支持

- `Windows 98`
- `Windows ME`
- `DOS`

产品层面应明确：

- `Sanaka Tools v1` 不承诺支持 `98`
- 如果用户跑更老系统，不给兼容保证

## XP 客户机程序设计

### 程序形态

第一版定义为：

- 默认无主窗口
- 后台常驻进程
- 可选托盘图标不是首版必须项

首版可以接受：

- 启动即最小化为后台
- 无交互界面

### 语言与工具链

正式方案固定：

- 语言：`C`
- 编译器：`mingw-w64`
- 宿主开发平台允许为 macOS

不纳入正式方案：

- `tcc`
- `C++`
- `.NET`

### 编译目标

建议约束：

- `i686`
- `_WIN32_WINNT=0x0501`
- 尽量减少外部运行时依赖

### 模块拆分

建议客户机工程拆分为：

- `main.c`
- `clipboard_win32.c`
- `tcp_client.c`
- `protocol.c`
- `hash.c`
- `utf.c`
- `autostart.c`

职责：

- `main.c`
  - 主循环、初始化、重连调度
- `clipboard_win32.c`
  - Win32 剪贴板读写
- `tcp_client.c`
  - 连接、收包、发包、心跳
- `protocol.c`
  - 消息编解码
- `hash.c`
  - 文本内容哈希
- `utf.c`
  - UTF-16 / UTF-8 转换
- `autostart.c`
  - 开机自启注册辅助

## 安装器设计

### 安装形式

通过 ISO 分发一个独立安装器：

- `setup.exe`

该安装器负责：

- 复制客户机程序
- 写入开机自启
- 写入配置
- 可选首次启动程序
- 提示用户重启

### 安装路径

建议优先使用：

- `C:\Program Files\Sanaka Tools\`

如果遇到 XP 权限或兼容性问题，也可以退到：

- `C:\SanakaTools\`

最终路径应在实现阶段固定，不在 UI 暴露太多自由度。

### 开机自启

第一版建议走注册表：

- 优先 `HKLM\Software\Microsoft\Windows\CurrentVersion\Run`
- 无权限时降级到 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`

写入项例如：

- `SanakaClipboardBridge`

### 安装完成行为

安装器完成后应：

- 明确提示已安装成功
- 明确提示建议重启
- 可选立即启动一次后台程序

### 卸载

第一版建议同时提供：

- `uninstall.exe`

负责：

- 删除开机自启
- 删除已安装程序
- 删除配置文件

## Sanaka 后端设计

### 生命周期

共享剪贴板是“每台虚拟机运行期能力”，不是全局单例。

因此每个运行中的虚拟机需要独立维护：

- 是否启用共享剪贴板
- session id
- 监听端口
- 当前连接状态
- 最近一次宿主机剪贴板哈希
- 最近一次客户机剪贴板哈希

### Runtime State

建议在运行态暴露：

```ts
interface RuntimeClipboardBridgeState {
  enabled: boolean;
  active: boolean;
  connected: boolean;
  guestToolInstalledKnown: boolean;
  listenPort?: number;
  pendingGuestConnection?: boolean;
  lastError?: string;
  textOnly: true;
}
```

其中：

- `enabled`
  - 配置上是否启用
- `active`
  - 当前虚拟机这轮启动是否已经创建桥服务
- `connected`
  - 是否已有客户机工具连接
- `guestToolInstalledKnown`
  - 是否已知客户机工具已经出现过连接
- `pendingGuestConnection`
  - 当前等待客户机连接

### 宿主机服务职责

后端服务至少要做：

- 打开监听 socket
- 接受客户机连接
- 校验 session
- 定时读取宿主机系统剪贴板
- 将新文本推送给客户机
- 接收客户机文本并写入宿主机剪贴板
- 记录最新哈希，防循环
- 在虚拟机关机时关闭服务

### 每台虚拟机独立端口

不应所有虚拟机复用一个全局端口并靠机器名硬分流。

推荐：

- 每次虚拟机启动时为该运行 session 分配一个本地 TCP 端口
- 通过客户机配置或工具盘配置文件告知客户机该端口

## 配置模型

建议为机器配置新增：

```ts
interface ClipboardBridgeConfig {
  enabled: boolean;
  mode: 'text';
  autoConnect: boolean;
}
```

挂载建议：

```ts
machine.integration = {
  clipboard: {
    enabled: false,
    mode: 'text',
    autoConnect: true
  }
}
```

第一版固定：

- `mode = 'text'`

## 工具盘 / 配置传递

客户机需要知道至少两个值：

- 宿主机地址
- 监听端口

宿主机地址第一版固定：

- `10.0.2.2`

端口由 Sanaka 启动该虚拟机时动态分配。

传递方式建议：

- Sanaka 在生成 `Sanaka Tools ISO` 时写入一个简单配置文件
- 配置文件放在 `config/default.ini`

示例：

```ini
host=10.0.2.2
port=47123
session_id=...
protocol_version=1
```

注意：

- session 信息不能长期复用到所有虚拟机
- 至少要做到“每台运行中的虚拟机独立”

## 网络模型

### 连接方向

必须由客户机主动连宿主机：

- 客户机 -> `10.0.2.2:<port>`

原因：

- `QEMU user networking` 下，客户机可访问宿主机特殊地址
- 无需 bridge
- 无需宿主机扫描客户机地址

### 协议选择

正式协议使用：

- `TCP`

不使用：

- HTTP 轮询
- WebSocket
- TLS

## 协议设计

### 总原则

协议应：

- 简单
- 可增量扩展
- 可容错
- 可调试

第一版不需要复杂二进制协议。

可接受的方案：

- 长度前缀 + UTF-8 JSON

### 消息模型

建议每条消息至少包含：

```json
{
  "type": "clipboard_push",
  "sessionId": "abc",
  "source": "guest",
  "text": "hello",
  "hash": "....",
  "timestamp": 1234567890
}
```

### 消息类型

第一版最少支持：

- `hello`
- `hello_ack`
- `clipboard_push`
- `clipboard_ack`
- `heartbeat`
- `error`

### hello

客户机连接后先发：

- `protocolVersion`
- `sessionId`
- `clientName`
- `clientOs`

宿主机校验通过后返回 `hello_ack`。

### clipboard_push

任一端检测到本地剪贴板变化后，发送：

- 文本内容
- 哈希
- 来源
- 时间戳

### heartbeat

用于判断连接存活。

建议：

- 空闲时每 `5s` 发一次
- 连续若干次失败则断开并重连

## 防循环设计

这是 v1 的关键要求。

双向同步如果不做去重，会造成：

- 宿主机写入客户机
- 客户机检测到变化再传回宿主机
- 宿主机又写回客户机
- 无限循环

### 最小策略

双方都维护：

- `lastLocalHash`
- `lastRemoteAppliedHash`

逻辑：

1. 本地检测到剪贴板变化
2. 计算当前文本哈希
3. 若该哈希等于 `lastRemoteAppliedHash`
   - 认为这是刚刚由远端写入的内容
   - 不回传
4. 否则发送 `clipboard_push`

当一端接收到远端文本并成功写入本地剪贴板后：

- 更新 `lastRemoteAppliedHash`

### 哈希算法

第一版用稳定且轻量的文本哈希即可。

不要求密码学安全。

## 宿主机剪贴板读取策略

宿主机第一版也不需要复杂事件监听。

可接受方案：

- 定时轮询系统剪贴板

建议间隔：

- `300ms` 到 `800ms`

理由：

- 简单
- 跨平台稳定
- 足够满足文本剪贴板体验

后续可在不同平台逐步替换为事件驱动，但不属于 v1 必须项。

## XP 客户机剪贴板读取策略

第一版同样采用：

- 定时轮询

原因：

- 比复杂监听更稳
- 更适合 XP
- 更容易控制循环逻辑

建议间隔：

- `300ms` 到 `800ms`

## 字符编码

客户机 Win32 剪贴板读取建议使用：

- `CF_UNICODETEXT`

网络传输统一：

- `UTF-8`

因此客户机工具必须实现：

- UTF-16 -> UTF-8
- UTF-8 -> UTF-16

若转换失败：

- 本次同步丢弃
- 记录可诊断错误
- 不使主循环崩溃

## 安全边界

第一版安全目标不是“对公网安全”，而是“局部隔离内不误同步”。

第一版至少要做：

- session id 校验
- 协议版本校验
- 长度限制
- 非文本消息拒收

第一版不做：

- TLS
- 证书
- 复杂身份系统

### 文本长度限制

必须设置上限，避免异常大文本拖垮 XP 或主进程。

建议首版限制：

- 单条文本 `1 MiB` 以内

超限行为：

- 拒绝同步该条内容
- 返回结构化错误

## 错误处理

后端与前端之间应传用户向状态，而不是底层异常原文。

可见状态包括：

- `等待客户机工具连接`
- `客户机工具已连接`
- `共享剪贴板已断开，正在重连`
- `当前仅支持文本剪贴板`
- `客户机工具版本不兼容`

调试日志中可保留：

- socket 关闭原因
- 协议解包失败
- UTF 转码失败

## 前端对接范围

这轮 spec 不定义最终视觉，但定义前端需要对接的行为。

前端需要能显示：

- 共享剪贴板开关
- 当前状态
- “挂载 Sanaka Tools ISO”动作
- “查看连接说明”动作
- 文本-only 限制说明

前端不应暴露：

- 内部端口
- session id
- 原始 JSON 协议

## macOS 开发机交叉编译

宿主开发机允许为 macOS。

正式工具链路线：

- `mingw-w64`

目标是从 mac 产出：

- `win32` 的 XP 客户机 `exe`
- `setup.exe`

这意味着：

- 不依赖我 SSH 到 Windows 才能开始实现
- XP 客户机工具的主开发可在 mac 侧完成

## 实现顺序建议

### Phase 1

- Sanaka 后端 TCP 服务
- 运行态状态模型
- 机器配置模型
- 生成 `Sanaka Tools ISO` 的后端能力

### Phase 2

- XP 客户机后台程序
- 安装器
- 开机自启

### Phase 3

- 前端开关与状态
- 挂载工具盘入口
- 用户向错误态

## 验收标准

满足以下条件即视为 v1 成立：

1. 在启用共享剪贴板的 XP 虚拟机中安装 `Sanaka Tools`
2. 重启后客户机工具自动运行
3. 客户机可连接到宿主机服务
4. 宿主机复制一段纯文本，XP 客户机可收到
5. XP 客户机复制一段纯文本，宿主机可收到
6. 相同文本不会无限来回同步
7. 客户机关闭或网络断开后，宿主机显示断开状态
8. 客户机恢复后能够自动重连
9. 非文本内容不会导致崩溃
10. 超长文本被安全拒绝

## 明确结论

第一版正式路线定为：

- 支持 `XP`
- 不支持 `98`
- 协议用 `TCP`
- 不接 `curl/libcurl`
- 客户机程序用 `C + Win32 + mingw-w64`
- 不做复杂 GUI
- 通过 `Sanaka Tools ISO + setup.exe + 开机自启` 交付
- 只同步纯文本剪贴板
