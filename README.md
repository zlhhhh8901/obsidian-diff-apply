# Diff Apply (Obsidian Plugin)

[中文](#中文) | [English](#english)

## 中文

Diff Apply 用于在 Obsidian 中把“选中的原文”与“目标文本”进行对照审阅，并快速回填原文片段后应用结果。

### 当前工作流（与实现一致）

1. 在编辑器中选中一段原文。
2. 运行命令 `Review & Apply Selection`，或在编辑器右键菜单点击 `Review & Apply`。
3. 右侧 `Final` 初始内容优先取系统剪贴板；若剪贴板不可读或为空，则回退为选中文本。
4. 左侧 `Review` 展示差异标记：
   - 删除内容（原文有、Final 无）为删除标记
   - 新增/替换内容可悬停查看原文 tooltip
   - 点击差异项可把对应原文注入右侧 `Final`
5. 在底部可切换差异粒度（`Word` / `Char`）与字号（10–24px）。
6. 点击 `Apply` 将右侧结果替换回原始选区；点击 `Cancel` 取消。

### 功能范围

- 双栏审阅：`Review` + `Final`
- 差异粒度切换：Word / Char
- 字号调节并持久化
- Final 区支持撤销/重做（`Mod+Z`, `Mod+Shift+Z`, `Mod+Y`）
- 悬停定位、注入闪烁、边缘方向提示（长文本）

### 截图占位（后续补图）

本次不内置截图，后续请补充到 `assets/screenshots/`，建议使用以下文件名：

- `review-default.png`
- `review-hover-tooltip.png`
- `review-click-inject.png`
- `review-edge-hints.png`

README 可在截图补齐后按上述命名直接引用。

### 安装

1. 创建插件目录：`.obsidian/plugins/diff-apply/`
2. 复制以下文件到该目录：
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. 在 Obsidian 设置中启用 `Diff Apply`。

---

## English

Diff Apply helps you review differences between selected source text and target text in Obsidian, then quickly inject original fragments back and apply the final result.

### Current workflow (matches implementation)

1. Select source text in the editor.
2. Run `Review & Apply Selection`, or right-click and choose `Review & Apply`.
3. The `Final` pane initializes from clipboard text first; if clipboard read fails or is empty, it falls back to the selected text.
4. The `Review` pane renders inline diff markers:
   - deleted original parts are shown as delete markers
   - inserted/replaced parts support hover tooltip with original text
   - clicking a diff segment injects original text into `Final`
5. Use footer controls for diff granularity (`Word` / `Char`) and font size (10–24px).
6. Click `Apply` to replace the original selection; click `Cancel` to discard.

### Feature scope

- Two-pane review: `Review` + `Final`
- Diff granularity toggle: Word / Char
- Font size controls with persistence
- Undo/redo in Final pane (`Mod+Z`, `Mod+Shift+Z`, `Mod+Y`)
- Hover navigation, injection flash, edge direction hints for long text

### Screenshot placeholders (to be added)

Screenshots are intentionally omitted in this cleanup pass. Add future screenshots under `assets/screenshots/` with these names:

- `review-default.png`
- `review-hover-tooltip.png`
- `review-click-inject.png`
- `review-edge-hints.png`

### Installation

1. Create plugin folder: `.obsidian/plugins/diff-apply/`
2. Copy the following files into it:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. Enable `Diff Apply` in Obsidian settings.
