# 为什么 `aarch64` 显卡会被强制成 `virtio-gpu-pci`

这不是你的错觉。现在仓库里确实把一部分架构的显卡“锁死”了，而且不是一层，是三层。

## 结论

当前对 `aarch64`、`arm`、`riscv64`、`ppc64`，Sanaka 现在的行为是：

- Linux 模板切到这些架构时，会自动把显卡字段改成 `virtio-gpu-pci`
- 界面下拉只给你显示 `virtio-gpu-pci` 一个选项
- 就算你想办法把配置文件改成别的值，运行时也仍然会无视该值，直接拼 `-device virtio-gpu-pci`

所以这不是“推荐默认值”，而是“前端隐藏 + 草稿覆盖 + 后端硬编码”三层一起做了。

## 具体是谁在强制

### 1. Linux 架构默认值会直接写回草稿

文件：[src/pages/MachineBuilderPage.tsx](/Users/steve372dzudo/sanaka/src/pages/MachineBuilderPage.tsx:227)

`linuxArchDefaults()` 里直接把这些架构的 `gpu` 设成了 `virtio-gpu-pci`：

- `aarch64` → `virtio-gpu-pci`
- `arm` → `virtio-gpu-pci`
- `riscv64` → `virtio-gpu-pci`
- `ppc64` → `virtio-gpu-pci`

### 2. 你一切换 Linux 架构，草稿会被自动覆盖

文件：[src/pages/MachineBuilderPage.tsx](/Users/steve372dzudo/sanaka/src/pages/MachineBuilderPage.tsx:490)

这里的 `useEffect()` 在检测到 Linux 模板架构变化后，会执行：

- `display.gpu = defaults.gpu`

也就是说，你从 x86_64 切到 `aarch64` 的那一刻，草稿里的显卡值就被主动改成 `virtio-gpu-pci` 了。

### 3. 界面层把显卡下拉菜单缩成只剩一个值

文件：[src/pages/MachineBuilderPage.tsx](/Users/steve372dzudo/sanaka/src/pages/MachineBuilderPage.tsx:293)

`gpuOptionsForMachine()` 里写死了：

- 如果架构是 `aarch64`、`arm`、`riscv64`、`ppc64`
- 就只返回一个选项：`virtio-gpu-pci`

所以你看到的不是“只有一个最适合的选项”，而是“其他选项被前端藏起来了”。

### 4. 后端运行时也根本不听 `gpu` 字段

文件：[runtime/QemuCommandBuilder.js](/Users/steve372dzudo/sanaka/runtime/QemuCommandBuilder.js:168)

`buildDisplayArgs()` 里写的是：

```js
if (guestFamily(machineArch) === 'arm' || machineArch === 'riscv64' || machineArch === 'ppc64') {
  return ['-device', 'virtio-gpu-pci'];
}
```

这意味着：

- `aarch64` / `arm`
- `riscv64`
- `ppc64`

到了真正拼 QEMU 命令时，直接固定输出 `virtio-gpu-pci`，并不会继续判断你在配置里到底选了什么。

## 为什么会被这样写

从代码意图看，这一轮改动明显是在追求“先保证能跑，再谈可选项”：

- 非 x86 架构以前大量沿用了 x86 时代的 `-vga std`、`ide-cd`、`rtl8139` 这类假设
- 为了先止住黑屏、无显示、设备模型不兼容等问题，代码作者把这些架构收窄到了更保守的一组设备
- 对显示这一块，当前选择的是统一往 `virtio-gpu-pci` 收敛

这个思路本身不是完全没道理，但问题在于它做成了“静默剥夺选择权”，而不是“给出兼容默认值，同时明确告诉用户还能选什么、为什么不推荐”。

## 这里真正的问题不只是“默认值”

真正让人烦的是下面这几点：

- 它不是默认，而是强制
- 它不是明示强制，而是悄悄藏 UI
- 它不是只有前端限制，后端也一起硬编码
- 用户从界面上看不出“这是产品限制”还是“QEMU 客观限制”

这就会造成一种错觉：

- 你以为自己在调机器
- 实际上产品已经替你做了决定
- 而且没有把决定写出来

## QEMU 客观上是不是“只能 virtio-gpu-pci”

不是。

至少从“QEMU 能不能支持别的显示设备”这个问题上说，不是只能 `virtio-gpu-pci`。

但在 **当前这套模板、当前这套 machine type、当前这套非 x86 兼容策略** 下，开发者为了降低踩坑面，选择把它收窄成了 `virtio-gpu-pci`。

所以更准确的说法应该是：

- 不是 QEMU 天生只能这样
- 是 Sanaka 当前实现阶段，后端和前端共同把它限制成了这样

## 如果以后要改，应该怎么改才合理

合理做法不是简单把下拉全放开，而是分层：

### 方案 A：保守默认，但不隐藏

- 默认仍然给 `virtio-gpu-pci`
- 但显卡下拉展示更多可选项
- 对高风险选项标“实验性”“可能黑屏”“某些 ISO 不兼容”

### 方案 B：前端允许选，后端按架构做白名单

- 前端展示该架构允许的多个显卡
- 后端只接受白名单中的值
- 如果不支持，就返回结构化错误，而不是静默替换

### 方案 C：把“为什么只剩一个选项”写在 UI 提示里

哪怕暂时不开放，也至少应该告诉用户：

- 当前架构为了兼容性，Sanaka 暂时只提供 `virtio-gpu-pci`
- 这不是 QEMU 唯一可能的显卡
- 后续会逐步开放更多设备模型

## 现在的直接结论

你截图里 `aarch64` 下面只剩 `virtio-gpu-pci`，原因不是偶然，也不是控件 bug。

是这三层共同导致的：

1. Linux 架构默认值写死成 `virtio-gpu-pci`
2. 切架构时自动把草稿覆盖成这个值
3. 显卡下拉只显示这一个
4. 运行时最终也无视其他值，直接硬拼 `virtio-gpu-pci`

所以你说“为什么老是要藏起来东西”，这次判断是对的。当前实现确实把选择藏掉了。
