# Kimi -> GPT

## 本轮完成：新版本提醒 v1

### 修改的文件

1. **新增组件**
   - `src/components/UpdateReminder.tsx` — 新版本提醒弹层

2. **修改页面**
   - `src/pages/SettingsPage.tsx` — 添加"更新"设置区块

3. **修改入口**
   - `src/App.tsx` — 挂载 UpdateReminder 组件

4. **样式**
   - `src/styles/app.css` — 添加 update-reminder 弹层样式（约 150 行）

5. **翻译**
   - `src/i18n/resources.ts` — 添加更新相关的中英文文案

### 长更新内容滚动方案

弹层采用 **flex 布局 + 固定头尾** 方案：

```
弹层容器 (max-height: min(90vh, 600px), display: flex, flex-direction: column)
├── 头部 (flex-shrink: 0) — 标题、发布时间、关闭按钮
├── 内容区 (flex: 1, min-height: 0, overflow-y: auto) — 更新内容 notes
└── 底部 (flex-shrink: 0) — 三个按钮
```

- 内容区单独滚动，头部和底部固定
- 不撑爆弹层，不整块一起滚
- 自定义滚动条样式，与项目现有滚动条一致

### 避免"淡入无动画"bug 的方案

复用项目现有的 `usePresence` hook，该 hook 内部已实现双帧 RAF 保障：

```typescript
// usePresence.ts
if (open) {
  setVisible(false);      // 第 1 帧：重置为不可见
  setMounted(true);       // 第 1 帧：挂载到 DOM
  frame = requestAnimationFrame(() => {
    nextFrame = requestAnimationFrame(() => {
      setVisible(true);   // 第 3 帧：浏览器已渲染初始态，再设为可见
    });
  });
}
```

- 打开时：先挂载 → 浏览器渲染初始态（opacity: 0）→ 再触发 visible（opacity: 1）
- 关闭时：先 visible = false 触发退出动画 → 动画结束后 unmount
- 不依赖鼠标移动，不会闪，不会直接跳到最终态

UpdateReminder 直接使用 `const { mounted, visible } = usePresence(Boolean(reminder))`，与 AboutDialog、DeleteModal 等组件使用同一套方案。

### 复用 vs 新增

**复用现有组件/Hook：**
- `usePresence` — 弹层挂载/可见状态管理
- `SectionCard` — 设置页更新区块的卡片容器
- `MaterialSelectField` — 设置页表单控件（如有需要）
- `.button`、`.button--primary`、`.button--secondary`、`.button--ghost` — 按钮样式

**新增组件：**
- `UpdateReminder` — 新版本提醒弹层（独立组件，不与其他弹层复用，因为结构和交互差异较大）

### 设置页"更新"区块内容

- 当前版本号（从 `updateCurrentInfo.currentVersion` 读取）
- 当前通道（Release / Beta）
- 已跳过版本（如有）
- "检查更新"按钮：
  - 点击后显示"检查中..."状态
  - 已是最新版本时显示轻提示"已是最新版本"
  - 检查失败时显示轻提示"检查失败，请稍后重试"
  - 3 秒后自动清除提示

### 弹层按钮行为

- **前往下载** → 调用 `openUpdatePage(url)` → GPT 后端用默认浏览器打开下载页
- **稍后** → 调用 `dismissUpdateReminder()` → 关闭弹层
- **跳过此版本** → 调用 `skipUpdateVersion(version)` → 关闭弹层

### 关于打开浏览器

所有外部链接均使用 `window.electronAPI.app.openExternal(url)` 或 `openUpdatePage(url)`（AppStore 封装的同一个 API），**不会**用 `window.open` 或 Electron 新窗口。确保走系统默认浏览器。
