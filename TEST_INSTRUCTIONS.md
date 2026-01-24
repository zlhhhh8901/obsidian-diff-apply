# 测试说明 - 内联差异视图

## 测试步骤

1. **重启 Obsidian**
   - 完全关闭 Obsidian
   - 重新打开 Obsidian

2. **准备测试文本**
   - 在笔记中选择一段文本（例如："Hello World"）
   - 复制一段修改后的文本到剪贴板（例如："Hello Beautiful World"）

3. **打开 Diff Apply 模态框**
   - 选中原文本
   - 使用命令面板或右键菜单打开 "Hybrid Edit (Hybrid Diff)"

## 预期行为

### 默认状态（鼠标未悬停）
- **左栏（Original）**：应该显示删除的部分带有半透明红色背景
  - 例如："Hello [World]" 中的 "World" 应该有淡红色背景
- **右栏（Modified）**：应该显示添加的部分带有半透明绿色背景
  - 例如："Hello [Beautiful World]" 中的 "Beautiful " 应该有淡绿色背景
- **中间栏（Editor）**：纯编辑区域，无差异标记

### 鼠标悬停在左栏
- **左栏**：红色背景变为红色下划线（便于文本选择）
- **右栏**：显示完整差异（红色删除 + 绿色添加）
  - 删除的文本：红色背景 + 删除线
  - 添加的文本：绿色背景

### 鼠标悬停在右栏
- **右栏**：绿色背景变为绿色下划线
- **左栏**：显示完整差异（红色删除 + 绿色添加）

## 如果没有看到差异标记

### 检查项目
1. **确认构建成功**：运行 `npm run build` 应该没有错误
2. **检查 CSS 文件**：确认 `styles.css` 包含了新的 diff 样式
3. **清除缓存**：
   - 关闭 Obsidian
   - 删除 `.obsidian/plugins/obsidian-diff-apply/main.js`
   - 重新运行 `npm run build`
   - 重启 Obsidian

### 调试步骤
1. 打开浏览器开发者工具（Ctrl+Shift+I 或 Cmd+Option+I）
2. 检查控制台是否有错误
3. 检查元素：
   - 左右栏的 textarea 应该有 `diff-active` class
   - 应该能看到 `.diff-inline-overlay` 和 `.diff-inline-content` 元素
   - `.diff-inline-content` 中应该有带 `diff-deleted-default` 或 `diff-added-default` class 的 span 元素

## 其他功能测试

1. **文本选择**：在左右栏中选择文本应该正常工作
2. **双击插入**：双击左右栏的任意行应该将该行复制到中间编辑器
3. **Enter 键插入**：选中文本后按 Enter 应该将文本复制到中间编辑器
4. **编辑模式**：点击"编辑"按钮后，左右栏应该可编辑，差异视图应该实时更新（300ms 防抖）
5. **字体大小调整**：点击 +/- 按钮应该调整所有栏的字体大小，差异视图应该重新渲染
6. **滚动同步**：滚动左右栏时，差异 overlay 应该同步滚动

## 已知限制

- 中间编辑器永远不显示差异标记（这是设计行为）
- 旧的键盘快捷键（Cmd+,、Cmd+.、Cmd+/）已被移除
- 设置中的"默认差异视图位置"选项已被移除
