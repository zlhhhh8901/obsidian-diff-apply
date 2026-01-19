### Overview
An Obsidian plugin that provides text comparison and editing features to help you conveniently modify note content.

### How to Use

<video src="https://github.com/user-attachments/assets/229fb103-c10c-4619-a7c4-928d2cf03bcf" controls="controls" width="100%"></video>

1. **Select Text**: Select the text you want to modify in your Obsidian note
2. **Open Interface**: Open Diff Apply interface. The left side shows the original text, the right side shows the modified version (read from clipboard), and the editing result in the center
3. **View Differences**:
   - `Cmd/Ctrl + /` to toggle diff view
   - `Cmd/Ctrl + ,/.` to move view position left/right
4. **Edit Text**:
   - Select text and press `Enter` to copy to editor cursor position or replace selected text
   - Double-click a line to copy the entire line to editor
5. **Switch Mode**:
   - Click the button below to switch from Read Only mode to Edit Mode
   - You can directly modify content in both original and modified areas, diff view updates in real-time
6. **Apply Changes**:
   - Click Apply button to apply changes to your note
   - Click Cancel button to exit without saving

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
