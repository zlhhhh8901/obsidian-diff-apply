# Diff Apply (Obsidian Plugin)

[English](#english) | [中文](#中文)

## 中文

**痛点**：合并两版文本时，常需反复滚动对比、肉眼找差异、逐句复制粘贴——过程繁琐且易出错。

**传统方案**：传统 diff 多为代码审查设计；面对写作改稿（长句改写、语义调整、段落重排）时，差异虽能高亮，但“挑选并合并成最终稿”仍不顺手。

**本项目方案**：三栏浮窗（Original | Editor | Modified）+ 差异高亮 + 便捷选取片段，最终在中间栏完成合并并应用回原文。

### 差异显示

**默认状态**：左栏红色标注删除内容，右栏绿色标注新增内容

![默认状态](./assets/默认状态.png)

**悬停状态**：鼠标悬停时，当前栏高亮弱化为虚线下划，另一栏显示完整增删对比

![悬停状态](./assets/悬停状态1.png)

**段落定位（锚点）**：

- 当两侧段落数/文本长度差异较大时，会在差异视图中插入“段落锚点”，用于跨栏对齐定位。
- 默认仅显示淡淡的小点刻度，不干扰阅读。当鼠标移至锚点附近，两侧同步高亮同一锚点：小点变亮 + 显示一条强调色竖线。
- 若对应锚点不在当前可视范围，上/下边缘会出现箭头提示其在上方/下方。

![跨栏定位](./assets/跨栏定位.png)

### 文本选取

- 选中左/右栏文本后按 `Enter`：插入到编辑区光标处
- 双击某行：整行插入编辑区（自动换行）

### 其它功能

| 功能 | 说明 |
|:--|:--|
| Edit Mode | 左右栏变为可编辑状态，差异实时更新 |
| Diff 粒度 | Word / Char 切换，适配不同语言 |
| 字号调节 | 10–24px |

### 安装

1. 创建插件目录：`.obsidian/plugins/diff-apply/`
2. 将以下文件放入该目录：
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. 在设置中启用 `Diff Apply`

---

## English

**Problem**: When merging two versions of text, you often have to scroll back and forth, spot differences manually, then copy/paste line by line—tedious and error-prone.

**Traditional approach**: Most traditional diffs are designed for code review. For writing revisions (rewriting long sentences, semantic tweaks, paragraph reordering), diffs can highlight changes, but “picking and merging into a final draft” is still not very convenient.

**Solution**: A 3-column floating window layout (Original | Editor | Modified) + diff highlights + convenient snippet picking. Merge the final result in the middle column and apply it back to the original text.

### Diff Display

**Default**: deletions are marked in red on the left; additions are marked in green on the right.

![Default](./assets/默认状态.png)

**Hover**: when hovering, highlights in the current column are softened into dotted underlines, while the other column shows the full add/remove comparison.

![Hover](./assets/悬停状态1.png)

**Paragraph anchors**: 

- When the paragraph count / text length differs significantly between the two sides, the diff view inserts “paragraph anchors” to help align and locate corresponding content across panes.
- By default, only faint dot ticks are shown to avoid distracting from reading. When you move the cursor near an anchor, the same anchor is highlighted on both sides: the dot brightens and an accent-colored vertical indicator line appears.
- If the corresponding anchor is outside the current viewport, an arrow will appear at the top/bottom edge to indicate whether it’s above or below.

![Paragraph markers](./assets/跨栏定位.png)

### Text Picking

- Select text in the left/right column and press `Enter`: insert at the editor cursor
- Double-click a line: insert the whole line (newline auto-added)

### Other Features

| Feature | Notes |
|--------|------|
| Edit Mode | Left/right columns become editable; the diff view updates in real time |
| Diff granularity | Switch Word / Char, useful for different languages |
| Font size | 10–24px |

### Installation

1. Create the plugin folder: `.obsidian/plugins/diff-apply/`
2. Put these files into the folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. Enable `Diff Apply` in Obsidian settings
