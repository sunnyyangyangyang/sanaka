# 为什么现在命令里还是 `virtio-gpu-pci`

## 先给结论

这一次，**不是后端运行时又把显卡偷偷强制回去了**。

当前源码里，后端已经不再对 `aarch64 / arm / riscv64 / ppc64` 无脑硬拼 `virtio-gpu-pci`。

你现在看到这条命令：

```bash
/opt/homebrew/bin/qemu-system-aarch64 ... -device virtio-gpu-pci ...
```

更准确的原因是：

- 当前这台机器对象里的 `display.gpu` 字段，本身还是 `virtio-gpu-pci`
- 后端现在只是“照着这个值输出”
- 所以看起来像“还是被强制”，但这次其实是“旧值残留 + 默认值延续”，不是新的运行时硬编码

## 证据 1：后端运行时已经不再按架构强制

文件：[runtime/QemuCommandBuilder.js](/Users/steve372dzudo/sanaka/runtime/QemuCommandBuilder.js:168)

当前 `buildDisplayArgs()` 是：

```js
function buildDisplayArgs(machineArch, gpu) {
  if (machineArch === 'ppc') {
    if (gpu === 'cirrus-vga') return ['-vga', 'cirrus'];
    return ['-vga', 'std'];
  }

  if (gpu === 'virtio-vga') return ['-vga', 'none', '-device', 'virtio-vga'];
  if (gpu === 'virtio-gpu-pci') return ['-device', 'virtio-gpu-pci'];
  if (gpu === 'cirrus-vga') return ['-vga', 'cirrus'];
  if (gpu === 'vmware-svga') return ['-vga', 'vmware'];
  if (gpu === 'qxl') return ['-vga', 'qxl'];
  if (gpu === 'std' || gpu === 'VGA') return ['-vga', 'std'];
  return ['-vga', 'std'];
}
```

注意这里已经没有之前那种：

```js
if (guestFamily(machineArch) === 'arm' || machineArch === 'riscv64' || machineArch === 'ppc64') {
  return ['-device', 'virtio-gpu-pci'];
}
```

也就是说：

- 后端现在会尊重 `gpu` 字段
- 只有当 `gpu` 字段本来就是 `virtio-gpu-pci` 时，才会输出 `-device virtio-gpu-pci`

## 证据 2：Linux 架构默认值里，`aarch64` 仍然把默认显卡写成 `virtio-gpu-pci`

文件：[src/pages/MachineBuilderPage.tsx](/Users/steve372dzudo/sanaka/src/pages/MachineBuilderPage.tsx:215)

`linuxArchDefaults()` 现在依然是：

- `aarch64` → `gpu: 'virtio-gpu-pci'`
- `arm` → `gpu: 'virtio-gpu-pci'`
- `riscv64` → `gpu: 'virtio-gpu-pci'`
- `ppc64` → `gpu: 'virtio-gpu-pci'`

这说明两件事：

1. “偷偷覆盖当前显卡值”的逻辑我已经拆掉了
2. 但“这些架构的推荐默认显卡仍然是什么”这件事，还保留成 `virtio-gpu-pci`

所以现在的状态是：

- 不再强制改你的现有选择
- 但默认推荐值本身仍然是 `virtio-gpu-pci`

## 证据 3：Linux 模板本身并不是 `virtio-gpu-pci`

文件：[src/domain/templates.ts](/Users/steve372dzudo/sanaka/src/domain/templates.ts:170)

`Linux Generic Template` 里写的是：

- `display.gpu = 'std'`

所以仓库当前逻辑不是“Linux 模板生下来就一定 virtio”。

真正更像是下面这种路径：

### 路径 A：旧草稿残留

- 你之前在旧版本逻辑下，把 Linux 机器切到 `aarch64`
- 当时前端会自动把 `display.gpu` 改成 `virtio-gpu-pci`
- 这台草稿或这台机器后来被保存下来了
- 现在后端已经不强制了，但它还是照着这个旧值拼命令

### 路径 B：当前默认值延续

- 你新建 Linux 模板
- 模板初始 `gpu` 是 `std`
- 但你切到 `aarch64` 后，虽然现在不再自动覆盖显卡字段了，之前已经存在的草稿状态、模板切换流程、或你当前打开的这份 draft 可能还是停在旧状态

换句话说：

- **现在“强制执行”的代码已经拆了**
- **但“被强制后留下的值”不会自动自己复原**

## 为什么你体感上还是“像被强制”

因为用户看到的是最终命令，而不是对象生命周期。

对用户来说：

- 我没选 `virtio-gpu-pci`
- 最终命令里还是它
- 那就是“又被强制了”

这个体感完全合理。

但从代码层面更准确的表述是：

- 以前是“实时强制”
- 现在更像是“历史强制留下的值 + 仍保守的默认值”

## 这和“防御性编程”有没有关系

有，而且味道很重。

这套代码的思路明显是：

- 非 x86 架构很容易踩坑
- 所以先选一个开发者认为更稳的默认设备
- 再通过前端限制和后端兜底，把用户带离危险区

这种思路在工程上不是完全不能理解，但问题是：

- 它没有清楚区分“默认值”和“强制值”
- 它没有把“这是兼容性保守策略”明确告诉用户
- 它把用户选择权和内部兼容策略混在了一起

结果就是：

- 用户会觉得东西被偷改
- 而且这种感觉通常是对的

## `accel` 为什么也像“被隐藏”

`accel` 那边和显卡不是同一种问题。

显卡这里之前是：

- 前端藏选项
- 后端真兜底强制

`accel` 这里更像是：

- 根据宿主/客体架构兼容性和 runtime 检测结果，动态收窄可选项
- 如果当前值不在允许列表里，就自动回退到第一个可用值

也就是说：

- `accel` 更多是“约束式回退”
- `gpu` 之前则是“静默覆盖 + 运行时硬编码”

所以你说它们味道相似，是对的；但严格说不是同一层级的强制。

## 当前最准确的判断

你这次看到命令里还是 `virtio-gpu-pci`，**并不说明后端硬编码没有拆掉**。

它说明的是：

1. 当前这台机器对象里的 `display.gpu` 仍然是 `virtio-gpu-pci`
2. 后端现在是在尊重这个值
3. Linux 的架构默认策略仍然把 `aarch64` 倾向于 `virtio-gpu-pci`
4. 历史草稿 / 历史保存值 / 现有 draft 生命周期，仍然会让你感觉“怎么还没摆脱它”

## 接下来要彻底不恶心，有两步

### 第一步：把默认值也改掉，或者至少显式说明

当前 `linuxArchDefaults()` 里，`aarch64` 还是：

- `gpu: 'virtio-gpu-pci'`

如果你不想默认继续落到它，就要改这里。

### 第二步：对旧草稿和旧机器做迁移或重置

否则会出现这种情况：

- 代码已经不强制了
- 但对象里存的还是旧值
- 用户看命令还是老样子

这就需要：

- 要么手动改当前机器的显卡字段
- 要么做一次迁移逻辑
- 要么在切换架构时，明确问用户要不要套用新的推荐默认值

## 最后一句

你这次的判断，不能简单说“你看错了”。  
因为从产品体验上，它**确实仍然表现得像在强制**。

只是更精确地说：

- **旧的后端强制已经拆了**
- **现在剩下的是保守默认值、旧状态残留、以及对象生命周期没有复位干净**
