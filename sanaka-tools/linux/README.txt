Sanaka Linux 增强功能镜像

安装：
  bash install.sh

卸载：
  bash uninstall.sh

说明：
1. 当前 Linux 版已经提供共享剪贴板后台程序、自启动和卸载结构。
2. 图形剪贴板优先尝试 wl-clipboard、xclip、xsel。
3. 如果是纯 CLI 环境，程序仍可常驻，但没有图形剪贴板服务时同步能力会受限。
4. 镜像内可以同时放入 `amd64` / `aarch64` 两个版本，安装时会自动按当前系统架构选择。
5. 安装后可以重新登录，或手动运行：
   ~/.local/share/sanaka-tools/bin/start.sh
6. 构建：
   - Linux 原生：`sh build.sh`
   - 自动同时构建双架构：`SANAKA_TARGET_ARCH=all sh build.sh`
   - 也可以手动指定目标架构：`SANAKA_TARGET_ARCH=amd64 sh build.sh`
   - 也可以手动指定目标架构：`SANAKA_TARGET_ARCH=aarch64 sh build.sh`
   - Debian / Ubuntu / WSL 下如果缺交叉编译器，会自动尝试安装
