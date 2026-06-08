# Sanaka 剪贴板桥 XP v1 Tasks

## 后端

- 为机器配置增加 `integration.clipboard`
- 为 runtime state 增加 `clipboardBridge`
- 实现每台虚拟机独立的 TCP 剪贴板桥服务
- 实现宿主机剪贴板轮询与同步
- 实现 session / 协议版本 / 文本长度校验
- 实现 `Sanaka Tools ISO` 生成与挂载能力
- 实现结构化错误与连接状态输出

## XP 客户机工具

- 建立 `mingw-w64` 的 `win32` 构建链
- 实现 `CF_UNICODETEXT` 读写
- 实现 TCP 长连接、心跳、重连
- 实现 UTF-16 / UTF-8 转换
- 实现文本哈希与防循环
- 实现后台常驻模式
- 实现安装器与卸载器
- 实现开机自启注册

## 前端

- 增加共享剪贴板开关
- 增加状态显示
- 增加“挂载 Sanaka Tools ISO”入口
- 增加“查看连接说明”入口
- 增加文本-only 限制说明

## 验证

- 验证 XP 客户机开机自启
- 验证宿主机 -> XP 文本同步
- 验证 XP -> 宿主机 文本同步
- 验证断线重连
- 验证防循环
- 验证非文本忽略
- 验证超长文本拒绝
