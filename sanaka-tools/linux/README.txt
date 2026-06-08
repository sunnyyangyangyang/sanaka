Sanaka Linux 增强功能镜像

安装：
  bash install.sh

卸载：
  bash uninstall.sh

说明：
1. 当前 Linux 版已经提供共享剪贴板后台程序、自启动和卸载结构。
2. 图形剪贴板优先尝试 wl-clipboard、xclip、xsel。
3. 如果是纯 CLI 环境，程序仍可常驻，但没有图形剪贴板服务时同步能力会受限。
4. 安装后可以重新登录，或手动运行：
   ~/.local/share/sanaka-tools/bin/start.sh
5. 构建：
   - Linux 原生：`sh build.sh`
   - macOS 上交叉构建：`sh build-podman.sh`
