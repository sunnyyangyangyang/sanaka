# Checklist

- [ ] Linux 仍然只有一个模板，没有拆成按架构复制的 7 个模板。
- [ ] Linux 模板下切换 `arch` 时，默认 machine type / GPU / NIC / disk interface 会跟着变。
- [ ] Linux 模板的 `x86_64` 默认值已从 VirtIO 优先改成兼容优先。
- [ ] Linux 模板的 `i386` 默认值已偏向旧系统兼容路线。
- [ ] Linux 模板的 `aarch64` 不再暴露整套 x86 风格 GPU 选项。
- [ ] Linux 模板的 `arm` 不再暴露整套 x86 风格 GPU 选项。
- [ ] Linux 模板的 `riscv64` 不再误落入通用 VGA 语义。
- [ ] Linux 模板的 `ppc64` 不再假装和 x86 使用同一路图形/总线规则。
- [ ] `Custom` 默认 `arch / accelerator / machine_type / gpu / network.card / sound_card / boot_order` 都可以是 `none`。
- [ ] `Custom` 不会再偷偷预填成一台 x86_64 机器。
- [ ] Runtime 遇到 `none` 会明确报错，不会偷偷补默认硬件。
- [ ] Builder 的硬件选项已经开始由 `arch` 驱动，而不是整页固定一套选项。
