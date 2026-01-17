# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Diff Apply is an Obsidian plugin that provides advanced text comparison and merging functionality using a three-panel visual interface (Original/Editor/Modified) powered by CodeMirror Merge.

## Architecture

This is a **compiled/distributed plugin** - the repository contains only the built JavaScript bundle (`main.js`), styles (`main.css`), and configuration files. There are **no source TypeScript files** present.

### Key Files
- `manifest.json` - Plugin metadata (ID: "obsidian-diff-apply", version: 0.1.0)
- `main.js` - Compiled JavaScript bundle (~15K lines, ~530KB)
- `main.css` - Plugin styles (~828 lines, ~82KB)
- `data.json` - User settings (fontSize: 10-24px, defaultDiffPosition: left/center/right)

### Plugin Structure
- **Three-panel layout**: Original (left), Editor (center), Modified (right)
- **CodeMirror-based**: Uses CodeMirror Merge for diff visualization
- **Obsidian API integration**: Requires Obsidian 1.5.0+
- **Settings management**: Font size and diff position configuration

## Development Notes

### Missing Development Infrastructure
- No TypeScript source files
- No package.json or build configuration
- No development dependencies
- No test files or testing framework

### Plugin Features (from compiled code analysis)
- Smart text comparison with line-level and character-level diff detection
- Hybrid editing mode with read-only/editable toggle
- Keyboard shortcuts for navigation and editing
- Clipboard integration for automatic comparison
- Double-click to copy functionality
- Font size adjustment (10-24px range)
- Configurable diff view position

### Commands Available
- "混合编辑所选文本" (Hybrid Edit Selected Text) - Main command
- Context menu integration via right-click

### Keyboard Shortcuts
- `Cmd/Ctrl + ,` - Move diff view left (when visible)
- `Cmd/Ctrl + .` - Move diff view right (when visible)
- `Cmd/Ctrl + /` - Toggle diff view visibility
- `Enter` - Copy selected text to editor (read-only mode)
- `Cmd/Ctrl + Z` - Undo in editor
- Double-click - Copy line to editor (read-only mode)

## Working with This Codebase

Since this contains only compiled JavaScript:

1. **For debugging**: Use the compiled `main.js` - look for function names and comments that indicate feature areas
2. **For styling**: Modify `main.css` directly - contains all UI styling for the three-panel interface
3. **For configuration**: Update `data.json` for user settings or `manifest.json` for plugin metadata
4. **For development**: You would need to locate or recreate the original TypeScript source and build system

## Recent Development Activity
Based on git history, recent work has focused on:
- Font size control improvements (immediate effect)
- UI simplification (removed redundant buttons)
- Shortcut logic optimization
- Double-click copy functionality
- Read-only to edit mode conversion