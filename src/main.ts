import { Editor, Notice, Plugin } from "obsidian";
import type { I18nKey } from "./i18n";
import { t as tI18n } from "./i18n";
import { DiffApplySettingTab } from "./settings/DiffApplySettingTab";
import { HybridDiffModal } from "./ui/HybridDiffModal";
import { DEFAULT_SETTINGS, DiffApplySettings } from "./types";

export default class DiffApplyPlugin extends Plugin {
  settings: DiffApplySettings = DEFAULT_SETTINGS;

  t(key: I18nKey): string {
    return tI18n(key, this.settings.language);
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new DiffApplySettingTab(this.app, this));

    this.addCommand({
      id: "diff-apply-hybrid",
      name: this.t("command.hybrid.name"),
      editorCallback: (editor) => this.openHybridDiffForSelection(editor),
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selection = editor.getSelection();
        if (selection && selection.length > 0) {
          menu.addItem((item) =>
            item
              .setTitle(this.t("menu.hybrid.title"))
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
      new Notice(this.t("notice.selectOriginalSegment"));
      return;
    }

    let clipboardContent = "";
    try {
      clipboardContent = await navigator.clipboard.readText();
    } catch (error) {
      console.warn(this.t("notice.clipboardReadFailed"), error);
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
