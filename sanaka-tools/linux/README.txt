Sanaka Linux 增强功能镜像

安装：
  bash install.sh

卸载：
  bash uninstall.sh

说明：
1. 当前 Linux 版已经提供共享剪贴板后台程序、自启动和卸载结构。
2. 图形剪贴板优先尝试 wl-clipboard、xclip、xsel。
3. 如果没有桌面环境，程序会尝试把宿主机文本直接注入当前活动 tty 控制台。
4. 纯控制台 Linux 目前重点保证“宿主机 -> 客户机”文本可用；“客户机 -> 宿主机”仍更适合在桌面会话中使用。
5. 镜像内可以同时放入 `amd64` / `aarch64` 两个版本，安装时会自动按当前系统架构选择。
6. 安装后可以重新登录，或手动运行：
   ~/.local/share/sanaka-tools/bin/start.sh
   程序启动前会先自动运行：
   ~/.local/share/sanaka-tools/bin/doctor.sh --auto
   如果缺少桌面剪贴板依赖，交互式安装时会先询问是否安装。
   如果终端不适合显示中文，默认会自动回退为英文输出。
7. 构建：
   - Linux 原生：`sh src/build.sh`
   - 自动同时构建双架构：`SANAKA_TARGET_ARCH=all sh src/build.sh`
   - 也可以手动指定目标架构：`SANAKA_TARGET_ARCH=amd64 sh src/build.sh`
   - 也可以手动指定目标架构：`SANAKA_TARGET_ARCH=aarch64 sh src/build.sh`
   - macOS 上安装 `zig` 后，也可以直接交叉编译这两个 Linux 版本
   - Debian / Ubuntu / WSL 下如果缺交叉编译器，会自动尝试安装
8. 启动日志默认写到：
   ~/.local/share/sanaka-tools/logs/sanaka-clipboard.log
9. `doctor.sh` 会自动补齐：
   - shell 启动钩子
   - 桌面自启动文件
   - 基础配置文件
   - 常见桌面剪贴板依赖（能提权时自动安装）
