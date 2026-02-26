import { Editor, Plugin } from "obsidian";
import type { I18nKey } from "./i18n";
import { t as tI18n } from "./i18n";
import { ReviewDiffModal } from "./ui/ReviewDiffModal";

export type DiffGranularityMode = "word" | "char";

interface PersistedPluginData {
  ui: DiffApplyPluginUiState;
}

type LegacyPluginData = {
  ui?: Partial<DiffApplyPluginUiState>;
  fontSize?: unknown;
};

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
  private pluginData: PersistedPluginData = { ui: { ...DEFAULT_UI_STATE } };

  t(key: I18nKey): string {
    return tI18n(key);
  }

  async onload(): Promise<void> {
    await this.loadUiState();

    this.addCommand({
      id: "hybrid-diff",
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
    const raw = (await this.loadData()) as LegacyPluginData | null;
    const data = raw ?? {};

    const ui = data.ui ?? {};
    const uiFontSize =
      typeof ui.fontSize === "number" && Number.isFinite(ui.fontSize) ? ui.fontSize : undefined;
    const legacyFontSize =
      typeof data.fontSize === "number" && Number.isFinite(data.fontSize) ? data.fontSize : undefined;
    const fontSize = uiFontSize ?? legacyFontSize ?? DEFAULT_UI_STATE.fontSize;
    const diffGranularity = ui.diffGranularity === "char" ? "char" : DEFAULT_UI_STATE.diffGranularity;

    this.ui = {
      fontSize,
      diffGranularity,
    };
    this.pluginData = { ui: { ...this.ui } };
  }

  async saveUiState(): Promise<void> {
    this.pluginData = {
      ui: {
        fontSize: this.ui.fontSize,
        diffGranularity: this.ui.diffGranularity,
      },
    };
    await this.saveData(this.pluginData);
  }

  private async openHybridDiffForSelection(editor: Editor): Promise<void> {
    const selection = editor.getSelection();
    if (!selection || selection.length === 0) {
      return;
    }

    let clipboardContent = "";
    try {
      clipboardContent = await navigator.clipboard.readText();
    } catch (error) {
      console.warn(this.t("notice.clipboardReadFailed"), error);
    }

    let initialFinalText = clipboardContent;
    if (initialFinalText.length === 0) {
      initialFinalText = selection;
    }

    const from = editor.getCursor("from");
    const to = editor.getCursor("to");

    const modal = new ReviewDiffModal(this.app, {
      originalText: selection,
      initialFinalText,
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
