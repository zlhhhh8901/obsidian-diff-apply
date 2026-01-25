import { Editor, Notice, Plugin } from "obsidian";
import type { I18nKey } from "./i18n";
import { t as tI18n } from "./i18n";
import { HybridDiffModal } from "./ui/HybridDiffModal";

export type DiffGranularityMode = "word" | "char";

type PluginData = Record<string, unknown>;

export interface DiffApplyPluginUiState {
  fontSize: number;
  diffGranularity: DiffGranularityMode;
}

const DEFAULT_UI_STATE: DiffApplyPluginUiState = {
  fontSize: 14,
  diffGranularity: "word",
};

export default class DiffApplyPlugin extends Plugin {
  // UI-only preferences: configured inside the modal, not in Obsidian Settings.
  ui: DiffApplyPluginUiState = { ...DEFAULT_UI_STATE };
  private pluginData: PluginData = {};

  t(key: I18nKey): string {
    return tI18n(key);
  }

  async onload(): Promise<void> {
    await this.loadUiState();

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

  private async loadUiState(): Promise<void> {
    const data = (await this.loadData()) as PluginData | null;
    this.pluginData = data ?? {};

    const ui = (this.pluginData.ui ?? {}) as Partial<DiffApplyPluginUiState>;
    const normalizedGranularity = ui.diffGranularity === "char" ? "char" : "word";
    this.ui = { ...DEFAULT_UI_STATE, ...ui, diffGranularity: normalizedGranularity };
  }

  async saveUiState(): Promise<void> {
    this.pluginData = { ...this.pluginData, ui: this.ui };
    await this.saveData(this.pluginData);
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
      fontSize: this.ui.fontSize,
      diffGranularity: this.ui.diffGranularity,
      plugin: this,
    });

    modal.open();
  }
}
