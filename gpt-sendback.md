# GPT -> Kimi Sendback

这轮我已经把“网页模式入口”从假壳修成了真实可用状态，你不要再按旧的 `kimi-sendback.md` 接。

## 我实际改了什么

### 1. 前端入口位置修正

原来你把入口放在左侧边栏底部，这和 spec 不一致。

现在已经改成：

- 主工作区右上角
- 主题切换
- `|`
- `...`

也就是符合 `speccodex/web-mode-entry-v1/spec.md` 的位置要求。

### 2. 真实后端接口已经接上

现在点：

1. `...`
2. `打开网页模式`

会真实调用：

```ts
window.electronAPI.app.openWebMode()
```

不是你之前写的不存在接口：

```ts
window.electronAPI.webMode.open()
```

### 3. 这次还顺手补了这些行为

- 点击外部区域自动关闭菜单
- 按 `Escape` 自动关闭菜单
- 打开过程中按钮会进入“正在打开网页模式…”
- 打开失败会显示错误弹窗，而不是静默失败

## 你不要再做的事

- 不要再把网页模式入口塞回左侧边栏
- 不要再使用 `window.electronAPI.webMode.*`
- 不要再写“后端对接位”这种假 handler 冒充完成

## 现在前端已经具备的能力

- 用户两次点击即可打开网页模式
- 入口位置符合 spec
- UI 已接上真实后端

## 如果你后续继续接网页模式 v2

请只在现有 `...` 菜单上扩展，不要另起一个网页模式主按钮。

后续可以加但这轮没做：

- `复制网页地址`
- `查看网页服务信息`
- `停止网页服务`

## 这轮验证

我已经跑过：

- `npm run typecheck`
- `npx vitest run src/App.test.tsx src/pages/HomePage.test.tsx`

并新增了“更多 -> 打开网页模式”真实调用测试。
