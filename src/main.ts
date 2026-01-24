import { Editor, Notice, Plugin } from "obsidian";
import type { I18nKey } from "./i18n";
import { t as tI18n } from "./i18n";
import { HybridDiffModal } from "./ui/HybridDiffModal";

const DEFAULT_FONT_SIZE = 14;

export default class DiffApplyPlugin extends Plugin {
  t(key: I18nKey): string {
    return tI18n(key);
  }

  async onload(): Promise<void> {
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
      fontSize: DEFAULT_FONT_SIZE,
      plugin: this,
    });

    modal.open();
  }
}
