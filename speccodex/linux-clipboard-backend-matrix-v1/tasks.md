# Linux 剪贴板后端矩阵 v1 Tasks

## 客户机程序

- 为 Linux 客户机程序增加后端探测层
- 区分 read backend / write backend
- 保留 `wl-paste` / `wl-copy` / `xclip` / `xsel`
- 增加 Linux VT `tty-inject` 写入后端
- 增加活动 tty 探测
- 增加更明确的日志输出

## 镜像与文档

- 更新 `sanaka-tools/linux/README.txt`
- 更新 `sanaka-tools/README.md`
- 重建 `sanaka-tools-linux.iso`

## 验证

- 桌面路径不回退
- 纯 tty 路径不再出现模糊的 no backend 日志
- 纯 tty 路径具备 host -> guest 文本注入能力
