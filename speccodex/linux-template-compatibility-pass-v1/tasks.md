# Tasks

- [ ] 调整 `Linux Generic` 模板默认值：从 `virtio-vga + virtio-net-pci + virtio disk` 收紧为兼容优先。
- [ ] 定义 `Linux` 模板的 `arch profile` 规则表。
- [ ] 在创建页中让 `arch` 成为一等配置，驱动 machine type / GPU / NIC / disk interface。
- [ ] 为 `Linux + x86_64` 配置兼容优先默认值。
- [ ] 为 `Linux + i386` 配置旧系统兼容默认值。
- [ ] 为 `Linux + aarch64` 配置现代 ARM64 默认值与选项约束。
- [ ] 为 `Linux + arm` 配置现代 ARM 默认值与选项约束。
- [ ] 为 `Linux + riscv64` 配置 RISC-V 默认值与选项约束。
- [ ] 为 `Linux + ppc` 配置 PowerMac 路线默认值与选项约束。
- [ ] 为 `Linux + ppc64` 配置 pseries 路线默认值与选项约束。
- [ ] 在 Runtime 中补齐 `riscv64` 显示映射策略。
- [ ] 在 Runtime 中补齐 `ppc` / `ppc64` 显示映射策略。
- [ ] 保持 `Custom` 为真正空白草稿，不套 Linux profile。
- [ ] 为 `Custom` 的 `none` 配置补齐预览/启动前错误提示。
- [ ] 更新文档，覆盖旧的 Linux VirtIO 优先心智。
