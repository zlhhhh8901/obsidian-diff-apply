# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin called "Diff Apply" that provides advanced text comparison and merging functionality. The plugin allows users to compare selected text with new text in a floating window using CodeMirror Merge view.

## Architecture

- **Main Plugin**: `main.js` (compiled TypeScript) contains the main `DiffApplyPlugin` class extending `import_obsidian.Plugin`
- **Plugin Entry**: The plugin is bundled into a single JavaScript file that follows Obsidian's plugin architecture
- **Dependencies**: Uses Obsidian API and CodeMirror for text editing and comparison features
- **Settings**: Stores configuration in `data.json` with font size preference

## Development Commands

This is a compiled Obsidian plugin. No build commands are available in the current codebase as it appears to be in deployed state.

## Code Structure

The main plugin class (`DiffApplyPlugin`) is compiled TypeScript that includes:
- Settings management with default fontSize: 14
- Plugin lifecycle methods (onload, etc.)
- Integration with Obsidian's plugin system
- CodeMirror Merge view integration for text comparison

## Plugin Configuration

- `manifest.json` contains plugin metadata including ID, version, and entry point
- `data.json` stores user settings (currently just fontSize)
- Plugin follows Obsidian's plugin structure requirements

## Notes

- The codebase is in compiled/deployed state (no TypeScript source files present)
- Uses Obsidian's plugin API and CodeMirror for text manipulation
- Single JavaScript file deployment model typical of Obsidian plugins