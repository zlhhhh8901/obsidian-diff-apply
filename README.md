# Obsidian Diff Apply

## 中文

### 项目概述
一个 Obsidian 插件，用于便捷对比、修改笔记内容。

**使用演示**：

<video src="https://github.com/user-attachments/assets/229fb103-c10c-4619-a7c4-928d2cf03bcf" controls="controls" width="100%"></video>

### 使用方法

1. **选择文本**：在 Obsidian 笔记中选中需要修改的文本段落
2. **打开界面**：打开 Diff Apply 界面，左侧显示原文，右侧显示修改版（从剪贴板读取），中间编辑区
3. **查看差异**：
   - `Cmd/Ctrl + /` 打开/隐藏差异对比视图
   - `Cmd/Ctrl + ,/.` 左右移动差异对比视图位置
4. **编辑文本**：
   - 选中文本后按 `Enter` 可复制到编辑器光标位置，或替换选中文本
   - 双击某行可复制整个行到编辑区
5. **切换模式**：
   - 点击下方按钮从只读模式（Read Only）切换到编辑模式（Edit Mode）
   - 可直接修改原文区和修改区的内容，差异视图会实时更新
6. **应用更改**：
   - 点击 **Apply** 按钮应用修改到笔记
   - 点击 **Cancel** 按钮取消并退出

### 安装方法

1. 下载插件文件到 Obsidian 插件目录：
   ```
   .obsidian/plugins/obsidian-diff-apply/
   ```
2. 将以下文件放入该目录：
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. 在 Obsidian 设置中启用 "Diff Apply" 插件

---

## English

### Overview
An Obsidian plugin that provides text comparison and editing features to help you conveniently modify note content.

### How to Use

1. **Select Text**: Select the text you want to modify in your Obsidian note
2. **Open Interface**: Open Diff Apply interface. The left side shows the original text, the right side shows the modified version (read from clipboard)
3. **View Differences**:
   - `Cmd/Ctrl + /` to toggle diff view
   - `Cmd/Ctrl + ,/.` to move view position left/right
4. **Edit Text**:
   - Select text and press `Enter` to copy to editor cursor position or replace selected text
   - Double-click a line to copy the entire paragraph to editor
5. **Switch Mode**:
   - Click the button below to switch from Read Only mode to Edit Mode
   - You can directly modify content in both original and modified areas, diff view updates in real-time
6. **Apply Changes**:
   - Click **Apply** button to apply changes to your note
   - Click **Cancel** button to exit without saving

### Installation

1. Download plugin files to Obsidian plugin directory:
   ```
   .obsidian/plugins/obsidian-diff-apply/
   ```
2. Place the following files in that directory:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. Enable "Diff Apply" plugin in Obsidian settings
