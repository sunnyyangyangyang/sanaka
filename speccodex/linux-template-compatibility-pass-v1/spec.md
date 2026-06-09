# Linux Template Compatibility Pass v1

## 背景

当前仓库的产品方向已经明确成：

- 默认优先兼容性
- 不优先追求速度
- 新建机器第一目标是“先装起来、先有画面、先能启动”

但 `Linux Generic` 这条线仍然残留着旧思路：

- 默认值偏 VirtIO
- Builder 没按架构收紧
- Runtime 对不同架构的图形/总线分流还不完整

这会带来两类直接问题：

1. `x86 Linux` 默认配置过于激进，出现黑屏或识别设备不顺。
2. 非 x86 Linux 被伪装成“和 x86 一样”，让用户选到其实不稳的组合。

## 当前实际问题

当前 `Linux Generic` 的默认值在：

- `src/domain/templates.ts`

现在还是：

- `arch = "x86_64"`
- `machine_type = "pc-q35-9.2"`
- `network.card = "virtio-net-pci"`
- `display.gpu = "virtio-vga"`
- Builder 默认磁盘总线会落到 `virtio`

也就是说，这个模板本质上仍然是：

- 现代 Linux / VirtIO 优先模板

而不是：

- 兼容优先模板

## 这次的用户结论

不能把 Linux 再拆成：

- `Linux x86_64`
- `Linux ARM64`
- `Linux RISC-V`
- `Linux PPC64`

否则四个系统乘七个架构会演化成 28 个模板，产品会失控。

所以最终方案不是：

- 按架构复制模板

而是：

- 模板负责“系统语义”
- 架构负责“默认硬件与约束规则”

也就是：

- `Windows`
- `Linux`
- `Custom`

这些模板仍然保留；

但在模板内部，`arch` 成为真正的一等配置项。

## 目标

本轮目标是建立：

- `系统模板 + 架构规则`

而不是继续：

- `系统模板 + 一套通吃全部架构的默认硬件`

最终产品语义：

1. 模板只表达“我要装什么系统”
2. 架构决定：
   - machine type
   - 可选 GPU
   - 可选网卡
   - 可选磁盘总线
   - 默认值
3. Runtime 继续作为最后兜底层

## 设计结论

## A. Linux 不再拆成多模板

`Linux Generic` 继续保留一个模板。

但这个模板不再自带“一套固定硬件”心智，而是：

- 用户选中 `Linux`
- 再由 `arch` 决定默认硬件 profile

也就是：

- `Linux + x86_64`
- `Linux + i386`
- `Linux + aarch64`
- `Linux + arm`
- `Linux + riscv64`
- `Linux + ppc`
- `Linux + ppc64`

这些不是新模板，而是：

- 同一个 Linux 模板下的不同架构配置

## B. 架构 profile 才是核心

需要新增明确的架构 profile 规则层。

这个 profile 决定：

- 默认 machine type
- 默认磁盘总线
- 默认显卡
- 默认网卡
- 哪些选项允许暴露
- 哪些选项需要隐藏或自动降级

## C. `Custom` 不是 Linux 的一个分支

`Custom` 需要单独定义成：

- 真正空白的机器草稿
- 默认所有关键硬件都是 `none`

不是：

- 预填一套 x86_64 + q35 + tcg + virtio-vga 的伪自定义模板

当前已经落地的规则：

- `arch = none`
- `machine_type = none`
- `accelerator = none`
- `sound_card = none`
- `display.gpu = none`
- `network.enabled = false`
- `network.card = none`
- `boot_order = none`

运行时必须在这些值未配置时直接报错，而不是偷偷补默认硬件。

## Linux 架构规则

## 1. Linux + x86_64

目标：

- 通用桌面/服务器安装
- 兼容优先

建议默认值：

- `machine_type = pc-q35-9.2`
- `accelerator = tcg`
- `disk interface = sata`
- `gpu = std`
- `network = e1000` 或 `rtl8139`
- `uefi = false`

允许暴露：

- Machine type:
  - `pc-q35-9.2`
  - `q35`
  - `pc-i440fx-9.2`
  - `pc`
- GPU:
  - `std`
  - `qxl`
  - `virtio-vga`
  - `vmware-svga`
  - `cirrus-vga`
- Disk:
  - `ide`
  - `sata`
  - `scsi`
  - `virtio`
- NIC:
  - `e1000`
  - `rtl8139`
  - `virtio-net-pci`
  - 其他 x86 合理备选

用户默认值必须偏保守，而不是偏 VirtIO。

## 2. Linux + i386

目标：

- 老 32 位 Linux
- 兼容优先

建议默认值：

- `machine_type = pc-i440fx-9.2`
- `disk interface = ide`
- `gpu = std`
- `network = rtl8139` 或 `e1000`

暴露规则与 x86_64 类似，但默认更老、更保守。

## 3. Linux + aarch64

目标：

- 现代 ARM64 Linux

建议默认值：

- `machine_type = virt`
- `disk interface = scsi` 或 `virtio`
- `network = virtio-net-pci`
- `display = virtio-gpu-pci` 语义

这里不能再延续 x86 的 GPU 心智。

Builder 不应继续暴露一整套：

- `std`
- `cirrus-vga`
- `qxl`
- `virtio-vga`

正确做法应该是：

- 只暴露 ARM64 可行路线
- 或显示“自动”

## 4. Linux + arm

目标：

- 现代 ARM Linux

和 `aarch64` 类似，但需要更保守。

建议：

- `machine_type = virt`
- `network = virtio-net-pci`
- `disk = scsi / virtio`
- 图形不走 x86 风格 VGA 语义

同时需要在 UI 中暗示：

- 这是现代 ARM 路线
- 不保证非常老的内核和发行版

## 5. Linux + riscv64

目标：

- 现代 RISC-V Linux

建议：

- `machine_type = virt`
- `network = virtio-net-pci`
- `disk = scsi / virtio`

这类机器当前应视为：

- 高级/实验性

至少不能让它误落进：

- 通用 VGA
- 通用 x86 设备集合

## 6. Linux + ppc

目标：

- PowerMac 风格 Linux

建议：

- `machine_type = mac99`
- 图形/磁盘/网卡都按 PowerMac 语义收紧

不能假装它和 `ppc64 pseries` 是同一路线。

## 7. Linux + ppc64

目标：

- Power Linux / pseries 路线

建议默认值：

- `machine_type = pseries`
- `disk = scsi`
- `network = virtio-net-pci`

这是现代 Linux on Power 的路线，不该套 x86 规则。

## Builder 规则

## 1. 架构是一等配置

创建页中：

- `arch` 不再只是一个字符串字段
- 它必须驱动整个硬件选项集合

也就是：

- 机器类型选项随 `arch` 变化
- GPU 选项随 `arch` 变化
- 网卡选项随 `arch` 变化
- 磁盘总线选项随 `arch` 变化

## 2. Linux 模板切换架构时，自动套用 profile 默认值

当用户在 `Linux` 模板下切换 `arch`：

- 自动更新 machine type
- 自动更新默认网卡
- 自动更新默认 GPU
- 自动更新磁盘默认接口

但只应覆盖“仍是默认/空白”的值。

如果用户已经主动改过某项：

- 不应粗暴重置全部设置

## 3. `Custom` 不套 Linux profile

`Custom` 单独处理：

- 不自动给任何架构 profile
- 所有关键项默认为 `none`
- 用户自己配

## Runtime 规则

## 1. Runtime 继续做最后兜底

即使前端已经按架构过滤，Runtime 仍必须：

- 对不合法组合做拒绝
- 对可静默修正的组合做降级

比如：

- `q35 + ide` -> 挂到 AHCI
- `ppc64 pseries + ide-cd` -> 改成更合适的 SCSI 路线

## 2. `none` 不允许被偷偷补默认值

如果机器是：

- `arch = none`
- `accelerator = none`
- `machine_type = none`
- `gpu = none`

那 Runtime 必须直接报错：

- 机器架构未配置
- 加速方式未配置
- 机器类型未配置
- 显示设备未配置

而不是：

- 偷偷补成 `x86_64 + q35 + tcg + std`

## 需要修改的地方

### 必改

1. `src/domain/templates.ts`
   - Linux 模板默认值改成兼容优先
   - `Custom` 继续保持真正空白

2. `src/pages/MachineBuilderPage.tsx`
   - 引入按架构变化的 profile
   - Linux 下切换架构时自动套默认值
   - GPU/NIC/Disk options 按架构过滤

3. `runtime/QemuCommandBuilder.js`
   - `riscv64` 显示策略补齐
   - `ppc/ppc64` 显示策略补齐
   - 保证不同架构不会误走 x86 图形/总线

4. 测试
   - Linux 模板切架构时默认值变化
   - `Custom` 保持 `none`
   - Runtime 拒绝 `none`
   - 非 x86 显示映射覆盖

### 建议改

1. 引入 `arch profile` 辅助模块
   - 避免规则散落在 Builder 页面和 Runtime 中

2. 文档更新
   - 覆盖旧的 Linux VirtIO 优先 spec

## 验收标准

1. Linux 仍然只有一个模板，不新增一堆 `Linux ARM64` / `Linux RISC-V` 模板。
2. Linux 模板下切不同架构，会看到不同的默认硬件与可选项。
3. `x86_64 Linux` 默认不再是 `virtio-vga + virtio-net-pci + virtio 磁盘`。
4. `aarch64/arm/riscv64/ppc64` 不再暴露明显错误的 x86 风格 GPU/设备组合。
5. `Custom` 默认所有关键项都是 `none`。
6. 运行时对 `none` 明确报错，不偷偷补默认硬件。

## 结论

这次 Linux 方向的正确收口不是：

- 继续保留一个通吃 Linux 模板
- 也不是炸成 28 个模板

而是：

- 模板保留系统语义
- 架构负责硬件规则
- `Custom` 作为真正空白草稿

这是产品复杂度和兼容性之间最稳的平衡点。
