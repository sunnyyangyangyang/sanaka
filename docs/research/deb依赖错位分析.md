# `.deb` 依赖错位分析

## 这次到底错在哪

这次错位，不是代码细节错了一点，而是我对你的目标理解反了。

你的真实目标是：

- `.deb` 在安装阶段就尽可能“卡死”
- QEMU 缺东西就不要让包正常装完
- 而且不是只检查一两个常见架构
- 你要的是 Sanaka 当前支持的 7 个系统模拟器目标都具备

也就是：

- `qemu-system-x86_64`
- `qemu-system-i386`
- `qemu-system-aarch64`
- `qemu-system-arm`
- `qemu-system-riscv64`
- `qemu-system-ppc`
- `qemu-system-ppc64`
- 以及工具层面的 `qemu-img`

但我上一次理解成了另一个方向：

- “不要让 `.deb` 安装时拦住”
- “让 Sanaka 安装成功后，在运行时自己检测 QEMU”

所以我把 `.deb` 从“安装时强约束”改成了“安装时放行，运行时再说”。

这和你的目标是反着来的。

## 为什么会理解反

因为你上一轮那句：

- “很好，改成7个架构都检测，或直接检测qemu-system依赖”

这句话有两个可能读法：

### 读法 A：运行时读法

- 让 Sanaka 自己检测 7 个 `qemu-system-*`
- 或者只检测系统是否装了 QEMU

这是我当时采用的读法。

### 读法 B：打包/安装时读法

- `.deb` 的依赖要覆盖到 7 架构所需的 QEMU 组件
- 安装阶段缺一个都尽量失败

这才是你真正要的读法。

我当时错在：

- 只看到了“检测”
- 没抓住你强调的“安装阶段卡死”

## 为什么我上一版方案本质上不对

我上一版把 `qemu-system-x86`、`qemu-system-arm`、`qemu-system-misc`、`qemu-utils` 从 `Depends` 挪到了 `Recommends`。

这会导致：

- `dpkg -i` 不再因为缺少 QEMU 包而失败
- Sanaka 可以先装上
- 用户只有在运行或启动虚拟机时才知道缺了什么

这和你的产品方向冲突：

- 你要的是“安装即筛选环境”
- 不是“运行时再教育用户”

所以这一步不是“优化策略不同”，而是方向错了。

## 另一个更深层的问题：Debian/Ubuntu 里的 QEMU 包并不是按你的 7 个二进制一一对应

这里也是我上次处理得过于草率的地方。

Sanaka 运行时关心的是二进制：

- `qemu-system-x86_64`
- `qemu-system-i386`
- `qemu-system-aarch64`
- `qemu-system-arm`
- `qemu-system-riscv64`
- `qemu-system-ppc`
- `qemu-system-ppc64`

但 `.deb` 的依赖字段只能声明“包”，不能直接声明“必须存在这些具体文件”。

而 Debian / Ubuntu 的 QEMU 打包方式，经常是：

- 一个包提供多个系统模拟器
- 某些名字是虚拟包
- 某些发行版/版本把架构拆得更细
- 某些发行版/版本又把它们重新聚合

这意味着：

- “7 个二进制”
- 和
- “若干个 apt 包名”

不是天然一对一关系。

## 目前能确认到的事实

### 1. `qemu-system-aarch64` 在 Ubuntu 上是虚拟包，由 `qemu-system-arm` 提供

也就是说：

- 你要 `qemu-system-aarch64`
- 但依赖字段里未必应该写 `qemu-system-aarch64`
- 因为它本身可能不是实体包

### 2. Ubuntu 有一个聚合包 `qemu-system`

这个包本身会依赖多个子包，例如：

- `qemu-system-arm`
- `qemu-system-mips`
- `qemu-system-misc`
- `qemu-system-ppc`
- `qemu-system-s390x`
- `qemu-system-sparc`
- `qemu-system-x86`

这说明：

- “直接依赖 `qemu-system`” 会比只写两三个子包更接近“全系统模拟器环境”
- 但它仍然未必精确等于 Sanaka 当前关心的那 7 个目标

### 3. Ubuntu / Debian 新版本里，`ppc`、`riscv` 等目标并不总是都塞在 `qemu-system-misc`

较新的包拆分里，常见情况是：

- `qemu-system-ppc` 单独成包
- `qemu-system-riscv` 单独成包
- `qemu-system-misc` 仍然存在，但不应该想当然把它当成“所有剩余架构的总包”

这正是我上次只写：

- `qemu-system-x86`
- `qemu-system-arm`
- `qemu-system-misc`

会不够“卡死”的原因。

## 所以，为什么会出现“错位”

根本原因有两层。

### 第一层：产品目标理解错位

你要的是：

- 安装期强约束

我给的是：

- 运行期柔性检测

这是方向性误读。

### 第二层：技术映射错位

你关心的是：

- 7 个可执行文件是否都在

而我当时处理的是：

- 几个我以为“差不多覆盖”的包名

这又把“二进制能力集合”误简化成了“几个常见 apt 包”。

## 正确的技术结论

如果目标真的是：

- `.deb` 安装阶段就尽量卡死
- 并且 7 个架构缺一不可

那么只改 `package.json -> build.deb.depends` 还不够。

### 原因

`Depends` 只能保证：

- 某些 Debian 包被安装

但不能 100% 精确保证：

- 这 7 个二进制文件全都实际存在
- 它们的包拆分方式在不同 Debian / Ubuntu 版本上完全一致

## 真正更靠谱的做法

应该分两层：

### 第 1 层：`Depends` 尽量收紧

至少要比我上次那版严格得多。

方向上应当接近：

- `qemu-system`
- `qemu-system-x86`
- `qemu-system-arm`
- `qemu-system-ppc`
- `qemu-system-riscv`
- `qemu-utils`

是否要同时保留 `qemu-system-misc`，要看我们最终支持的发行版矩阵再定。

### 第 2 层：安装脚本里做“文件级强校验”

也就是在 Debian 安装脚本中，直接检查：

- `command -v qemu-system-x86_64`
- `command -v qemu-system-i386`
- `command -v qemu-system-aarch64`
- `command -v qemu-system-arm`
- `command -v qemu-system-riscv64`
- `command -v qemu-system-ppc`
- `command -v qemu-system-ppc64`
- `command -v qemu-img`

如果缺任意一个：

- 安装失败
- 给出明确报错

这样才是真正意义上的：

- “卡得更死”

## 为什么不能只靠 `qemu-system`

因为 `qemu-system` 是聚合包，不是“Sanaka 支持矩阵证明书”。

它能说明：

- 系统安装了一组 QEMU 全系统模拟器组件

但不能自动等价于：

- Sanaka 当前要求的 7 个具体二进制全部存在

所以：

- 只依赖 `qemu-system`，不够精确
- 只依赖几个子包，也未必全
- 最稳的是“包依赖 + 安装脚本文件校验”双保险

## 现在这件事该怎么定性

这不是用户表达问题。

是我在产品意图上做了错误归纳：

- 你说的是“更严格”
- 我做成了“更宽松”

而且我还把：

- “7 架构能力校验”

偷换成了：

- “几个常见 QEMU 包差不多就行”

这两个偷换叠在一起，才导致了这次错位。

## 下一步应该怎么做

下一步如果要正式修，不应该再走“放松依赖”路线，而应该：

1. 重新收紧 `deb.depends`
2. 明确 Ubuntu / Debian 目标版本
3. 加 Debian 安装脚本
4. 在安装脚本中做 7 个 `qemu-system-*` + `qemu-img` 的硬检查
5. 缺任意一个时，直接让安装失败，并输出用户可读的缺失项

这才符合你的原始目标。

## 参考资料

- Ubuntu `qemu-system-x86` 包页面：<https://packages.ubuntu.com/qemu-system-x86>
- Ubuntu `qemu-system` 包页面：<https://packages.ubuntu.com/noble/qemu-system>
- Ubuntu `qemu-system-aarch64` 虚拟包页面：<https://packages.ubuntu.com/jammy/qemu-system-aarch64>
- Debian `qemu-system-misc` 包页面：<https://packages.debian.org/sid/qemu-system-misc>
- Debian `qemu-system-ppc` 包页面：<https://packages.debian.org/sid/qemu-system-ppc>

