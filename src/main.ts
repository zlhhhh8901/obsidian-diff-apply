import { Editor, Notice, Plugin } from "obsidian";
import { DiffApplySettingTab } from "./settings/DiffApplySettingTab";
import { HybridDiffModal } from "./ui/HybridDiffModal";
import { DEFAULT_SETTINGS, DiffApplySettings } from "./types";

export default class DiffApplyPlugin extends Plugin {
  settings: DiffApplySettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new DiffApplySettingTab(this.app, this));

    this.addCommand({
      id: "diff-apply-hybrid",
      name: "混合编辑所选文本",
      editorCallback: (editor) => this.openHybridDiffForSelection(editor),
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selection = editor.getSelection();
        if (selection && selection.length > 0) {
          menu.addItem((item) =>
            item
              .setTitle("混合编辑（Hybrid Diff）")
              .setIcon("edit")
              .onClick(() => this.openHybridDiffForSelection(editor))
          );
        }
      })
    );
  }

  onunload(): void {}

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async openHybridDiffForSelection(editor: Editor): Promise<void> {
    const selection = editor.getSelection();
    if (!selection || selection.length === 0) {
      new Notice("请先在笔记中选中要对比的原文片段。");
      return;
    }

    let clipboardContent = "";
    try {
      clipboardContent = await navigator.clipboard.readText();
    } catch (error) {
      console.warn("无法读取剪贴板内容，可能是权限问题", error);
    }

    const from = editor.getCursor("from");
    const to = editor.getCursor("to");

    const modal = new HybridDiffModal(this.app, {
      originalText: selection,
      modifiedText: clipboardContent,
      onApply: (finalText) => {
        editor.replaceRange(finalText, from, to);
      },
      fontSize: this.settings.fontSize,
      defaultDiffPosition: this.settings.defaultDiffPosition,
      plugin: this,
    });

    modal.open();
  }
}
