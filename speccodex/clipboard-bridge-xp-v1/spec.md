# Sanaka 剪贴板桥 XP+ v1 Spec

## 背景

用户希望 Sanaka 提供一个真正可用、真正顺手的宿主机 / 客户机剪贴板同步能力。

当前方向已经明确，不再走“把运行时配置写进第二张盘 / 软盘 / 二次生成工具盘”的路线。

原因很直接：

- 配置盘 / 软盘太笨重
- 软盘位不稳定
- autorun 不可靠
- 每次运行都重新生成完整工具盘不优雅

因此，Sanaka v1 剪贴板桥正式改为：

- `Sanaka Tools ISO` 只负责分发工具
- 客户机工具启动后，先通过固定 bootstrap 端口向宿主机请求本次会话配置
- 再连接真正的剪贴板同步端口

这意味着：

- 工具盘是静态资源
- 运行时配置走网络 bootstrap
- 真正的数据端口仍可动态分配

这是当前最优雅、最轻、最符合产品气质的方案。

## 目标

第一版要做到：

- 支持 `Windows XP` 到 `Windows 11+` 客户机
- 宿主机与客户机双向同步纯文本剪贴板
- 不需要 bridge 网络
- 不需要虚拟机驱动
- 工具盘只负责安装工具，不负责塞运行时配置
- 客户机工具开机自启动
- 客户机工具通过 tray 显示连接状态
- 客户机工具支持退出
- 安装器默认创建开始菜单项
- 宿主机端提供固定 bootstrap 端口 + 动态实际剪贴板桥端口

## 非目标

- 不支持 `Windows 98`
- 不支持图片剪贴板
- 不支持文件剪贴板
- 不支持富文本 / HTML / RTF
- 不支持 Linux / macOS 客户机工具
- 不做 TLS / HTTPS
- 不做互联网传输
- 不做自动更新
- 不做复杂桌面主窗口

## 总体架构

系统由四部分组成：

1. Sanaka 宿主机 bootstrap 服务
2. Sanaka 宿主机剪贴板桥服务
3. 客户机工具 `sanaka_clipboard.exe`
4. `Sanaka Tools ISO`

### 1. Bootstrap 服务

宿主机提供一个固定端口，用于客户机工具请求当前虚拟机的会话配置。

bootstrap 服务职责：

- 接收客户机的 bootstrap 请求
- 返回：
  - 当前会话的 `session_id`
  - 当前虚拟机真实剪贴板桥端口
  - 协议版本
  - 文本-only 能力说明

### 2. 剪贴板桥服务

每台运行中的虚拟机仍维持独立的实际剪贴板桥服务。

职责：

- 接收客户机文本剪贴板
- 推送宿主机文本剪贴板
- 去重
- 防循环
- 断线重连

### 3. 客户机工具

客户机工具职责：

- 后台常驻
- 启动后先请求 bootstrap
- 拿到真实配置后再连接剪贴板桥服务
- 轮询或监听本机文本剪贴板
- 双向同步
- tray 显示状态
- 支持退出

### 4. Sanaka Tools ISO

工具盘是静态资源，不再承载运行时端口配置。

职责：

- 提供 `setup.exe`
- 提供 `sanaka_clipboard.exe`
- 提供默认配置模板
- 提供安装说明

## 网络模型

### 固定 bootstrap 端口

必须有一个固定端口，方便客户机工具无配置启动。

建议：

- bootstrap 端口固定为一个单值
- 用户不需要知道该端口
- 前端不暴露该端口

第一版实现可以由后端硬编码。

### 动态实际数据端口

真正剪贴板桥端口继续动态分配。

原因：

- 多台虚拟机可同时运行
- 不会因为固定一个同步端口而冲突

### 连接顺序

1. 客户机工具连 bootstrap 固定端口
2. 宿主机返回当前会话配置
3. 客户机工具再连真实数据端口

## 为什么这条路线更优雅

这是当前最优雅的折中方案。

原因：

- 大工具盘保持静态
- 运行时配置通过网络获取
- 没有第二张配置盘
- 没有软盘依赖
- 没有 autorun 配置注入花活
- 符合 `user networking + 10.0.2.2` 的天然能力边界

结论：

- 比配置 ISO 优雅
- 比软盘优雅
- 比二次重做整张工具盘优雅

## 客户机支持范围

### 支持

- `Windows XP`
- `Windows Vista`
- `Windows 7`
- `Windows 8`
- `Windows 10`
- `Windows 11`

产品文案统一表达为：

- `Windows XP 及以上`

### 不支持

- `Windows 98`
- `Windows ME`
- 更老系统

## 客户机工具设计

### 程序名

正式程序名：

- `sanaka_clipboard.exe`

### 程序形态

第一版定义为：

- 后台常驻
- 无主窗口
- 有 tray 图标
- 有 balloon / 系统通知提示

### Tray 设计

tray 菜单最少要有：

- 第一行：连接状态
  - `已连接`
  - `连接失败`
  - `连接中`
- 第二行：`端口：<port>`
- 分隔线
- `退出`

要求：

- `退出` 点击后关闭程序
- 关闭后不再继续驻留

### Balloon / 通知

不使用阻塞式 `msgbox` 作为主流程提示。

要求：

- 首次连接成功时弹系统气泡：
  - `Sanaka 增强工具连接成功`
- 连接失败时弹系统气泡：
  - `Sanaka 增强工具连接失败`

tray 是长期状态承载，气泡只是辅助反馈。

## 安装器设计

### 安装器产物

正式入口：

- `setup.exe`

### 默认行为

安装器应：

- 复制 `sanaka_clipboard.exe`
- 复制默认配置文件
- 写入开机自启动
- 默认创建开始菜单项
- 可选立即启动
- 提示建议重启

### 开始菜单

要求：

- 默认安装到开始菜单
- 至少提供：
  - `Sanaka Clipboard`
  - `卸载`

### 开机自启动

第一版可继续走注册表：

- 优先 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`

## 工具盘设计

建议结构：

```text
Sanaka Tools ISO/
  autorun.inf
  setup.exe
  readme.txt
  bin/
    sanaka_clipboard.exe
  config/
    sanaka-clipboard.ini
```

注意：

- `sanaka-clipboard.ini` 只作为默认模板
- 不再承载每次运行的真实端口和 session

## 宿主机后端设计

### Bootstrap runtime state

运行态应至少维护：

- bootstrap 服务是否可用
- 当前虚拟机实际剪贴板桥端口
- 当前会话 session id
- 是否已有客户机连接

### 前端可见状态

前端只需要知道用户向状态，不需要知道内部协议细节。

建议状态：

- `idle`
- `waiting`
- `connected`
- `error`

### 不对前端暴露

- bootstrap 端口
- 原始 session id
- 原始 TCP 消息
- `10.0.2.2`

## 协议设计

### Bootstrap 协议

bootstrap 服务返回的最小信息：

```json
{
  "protocolVersion": 1,
  "sessionId": "xxx",
  "clipboardPort": 7936,
  "textOnly": true
}
```

### 剪贴板同步协议

保持当前 TCP 长连接思路：

- `hello`
- `hello_ack`
- `clipboard_push`
- `clipboard_ack`
- `heartbeat`
- `error`

## 防循环

保持双端哈希防循环：

- `lastLocalHash`
- `lastRemoteAppliedHash`

原则不变。

## 编译链

### 正式发布建议

XP 目标应优先在 Windows 上使用较老、合适的 `MinGW32` 构建。

原因：

- macOS 上较新的 `mingw-w64` 常常带出 `api-ms-win-crt-*`
- 这对 XP 不友好

### 语言约束

- `C89`
- 原生 `Win32 API`
- 不依赖 .NET / Electron / Qt

## 实现顺序

### Phase 1

- 固定 bootstrap 端口
- 客户机工具先请求 bootstrap
- tray 菜单最小版
- `退出`

### Phase 2

- balloon 成功/失败提示
- 开始菜单项完善
- 安装器体验完善

### Phase 3

- 连接状态更稳定
- 文案与图标继续细化

## 验收标准

满足以下条件视为 v1 成立：

1. 用户挂载 `Sanaka Tools ISO`
2. 运行 `setup.exe`
3. 工具被安装到默认目录
4. 开始菜单出现程序项
5. 开机后工具自动启动
6. tray 可见
7. tray 可显示：
   - 状态
   - `端口：<port>`
   - `退出`
8. 工具启动后先请求 bootstrap
9. 工具拿到真实端口后可建立真实剪贴板桥连接
10. 成功时弹连接成功通知
11. 失败时弹连接失败通知
12. 宿主机 -> 客户机 文本同步正常
13. 客户机 -> 宿主机 文本同步正常
14. 不会无限循环同步

## 明确结论

第一版正式路线定为：

- 支持 `Windows XP 及以上`
- 不支持 `Windows 98`
- `sanaka_clipboard.exe` 启动后先走固定 bootstrap 端口
- 再连接动态分配的真实剪贴板桥端口
- tray 显示状态与端口
- 提供 `退出`
- 安装器默认写开始菜单
- 静态工具盘 + 运行时网络 bootstrap

这条路线比“配置 ISO / 软盘注入”更优雅，也更适合作为 Sanaka 的长期产品路径。
