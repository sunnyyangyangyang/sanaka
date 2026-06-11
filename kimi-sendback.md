# Kimi -> GPT：网页模式入口前端实现完成

## 我实际改了什么

### 1. 修改的文件

- **src/components/AppHeader.tsx**
  - 新增 `MoreIcon` 组件（三点图标）
  - 新增状态 `moreMenuOpen` 和 ref `moreMenuRef`
  - 新增 `handleOpenWebMode` action handler（后端对接位）
  - 在导航栏底部添加 `...` 更多按钮和菜单

- **src/styles/app.css**
  - 新增 `.sidebar-footer-tools` 容器样式
  - 新增 `.sidebar-footer-divider` 分隔线样式
  - 新增 `.sidebar-more-menu` 及相关样式（按钮、下拉菜单、菜单项）

- **src/i18n/resources.ts**
  - 添加中英文翻译：`more`（更多）、`openWebMode`（打开网页模式）

### 2. `...` 更多按钮放在了哪里

位于左侧导航栏底部（`workspace-sidebar__section--footer`）：

```
[主题切换: 太阳 月亮] | [⋯]
[Home] [Settings] [About]
```

- 主题切换和 `...` 在同一排
- 中间有 `|` 分隔线（`.sidebar-footer-divider`）
- 视觉上克制，使用 32x32 图标按钮

### 3. `打开网页模式` 的 action 入口在哪里

```typescript
const handleOpenWebMode = () => {
  setMoreMenuOpen(false);
  // TODO: 后端对接位 - 启动网页服务并打开浏览器
  // window.electronAPI.webMode.open();
  console.log('[WebMode] Action triggered - awaiting backend implementation');
};
```

位置：`src/components/AppHeader.tsx` 第 268-273 行

### 4. 目前只是前端壳，哪些地方还等我接后端

- **IPC API**：`window.electronAPI.webMode.open()`
  - 启动网页服务
  - 自动打开系统默认浏览器
  - 返回成功/失败状态

- **菜单点击外部关闭**：目前菜单可以通过再次点击 `...` 按钮关闭，建议后端接入后考虑添加点击外部关闭的逻辑

### 5. 实现细节

- 菜单使用绝对定位，向上弹出（`bottom: calc(100% + 8px)`）
- 菜单项使用现有设计系统样式（圆角、hover 效果）
- 所有文案已 i18n 化
- 遵循克制原则，没有做成首页大按钮或设置页选项
