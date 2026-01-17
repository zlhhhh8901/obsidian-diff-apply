import { App, Modal, Notice } from "obsidian";
import { diffChars } from "diff";
import type DiffApplyPlugin from "../main";
import type { DiffViewPosition } from "../types";
import {
  computeLineDiff as computeLineDiffUtil,
  computeModifiedLineDiff as computeModifiedLineDiffUtil,
} from "../utils/lineDiff";

export interface HybridDiffOptions {
  originalText: string;
  modifiedText: string;
  onApply: (finalText: string) => void;
  fontSize: number;
  defaultDiffPosition: DiffViewPosition;
  plugin: DiffApplyPlugin;
}

export class HybridDiffModal extends Modal {
  private originalText: string;
  private modifiedText: string;
  private onApply: (finalText: string) => void;
  private fontSize: number;
  private plugin: DiffApplyPlugin;

  private originalEditor: HTMLTextAreaElement | null = null;
  private modifiedEditor: HTMLTextAreaElement | null = null;
  private finalEditor: HTMLTextAreaElement | null = null;

  // Diff view state
  private diffViewPosition: DiffViewPosition;
  private isDiffVisible = true;
  private diffOverlay: HTMLDivElement | null = null;
  private diffScrollContainer: HTMLDivElement | null = null;
  private diffOverlayScrollTop = 0;
  private diffScrollContainerScrollTop = 0;
  private diffContainer: HTMLDivElement | null = null;
  private isDiffDirty = false;

  private copyFlashTimer: ReturnType<typeof window.setTimeout> | null = null;
  private leftPanel: HTMLDivElement | null = null;
  private middlePanel: HTMLDivElement | null = null;
  private rightPanel: HTMLDivElement | null = null;

  // Edit mode state
  private isEditModeEnabled = false;
  private toggleEditModeBtn: HTMLButtonElement | null = null;
  private boundHandleKeyDown: ((event: KeyboardEvent) => void) | null = null;
  private fontDisplayEl: HTMLSpanElement | null = null;

  // Undo history for the editor
  private history: string[] = [];
  private historyIndex = 0;
  private isComposing = false;
  private preCompositionText = "";

  constructor(app: App, opts: HybridDiffOptions) {
    super(app);
    this.originalText = opts.originalText;
    this.modifiedText = opts.modifiedText;
    this.onApply = opts.onApply;
    this.fontSize = opts.fontSize || 14;
    this.plugin = opts.plugin;
    this.diffViewPosition = opts.defaultDiffPosition || "center";
  }

  onOpen(): void {
    console.log("HybridDiffModal opening...");
    console.log("Original text:", this.originalText);
    console.log("Modified text:", this.modifiedText);

    this.titleEl.setText("Diff Apply");
    this.modalEl.addClass("hybrid-diff-modal");
    this.modalEl.style.width = "95vw";
    this.modalEl.style.maxWidth = "1400px";
    this.modalEl.style.height = "85vh";
    this.modalEl.style.overflow = "hidden";

    const container = this.contentEl.createDiv({ cls: "hybrid-diff-container" });
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.gap = "10px";

    const hint = container.createDiv({ cls: "hybrid-hint" });
    hint.setText(
      "Left: original, right: modified. Press Enter to copy selection to middle editor. Use Cmd+, / Cmd+. to move diff view, Cmd+/ to toggle visibility. Cmd+Z to undo."
    );
    hint.style.padding = "8px";
    hint.style.background = "#f0f0f0";
    hint.style.borderRadius = "4px";
    hint.style.fontSize = `${this.fontSize - 1}px`;
    hint.style.color = "#666";

    const editorsContainer = container.createDiv({ cls: "hybrid-editors-container" });
    editorsContainer.style.display = "flex";
    editorsContainer.style.flex = "1";
    editorsContainer.style.gap = "10px";
    editorsContainer.style.minHeight = "0";

    console.log("Editors container created:", editorsContainer);

    this.createPanels(editorsContainer);
    this.addHybridActions(container);
    this.addKeyboardShortcuts();
  }

  private computeLineDiff(originalLines: string[], modifiedLines: string[]) {
    return computeLineDiffUtil(originalLines, modifiedLines);
  }

  private computeModifiedLineDiff(originalLines: string[], modifiedLines: string[]) {
    return computeModifiedLineDiffUtil(originalLines, modifiedLines);
  }

  private createPanels(editorsContainer: HTMLElement): void {
    this.leftPanel = editorsContainer.createDiv({ cls: "hybrid-panel original" });
    this.leftPanel.style.flex = "1";
    this.leftPanel.style.display = "flex";
    this.leftPanel.style.flexDirection = "column";
    this.leftPanel.style.border = "1px solid #ccc";
    this.leftPanel.style.borderRadius = "4px";
    this.leftPanel.style.minHeight = "0";

    const leftHeader = this.leftPanel.createDiv({ cls: "panel-header" });
    leftHeader.setText("Original");
    leftHeader.style.padding = "8px";
    leftHeader.style.background = "#f5f5f5";
    leftHeader.style.borderBottom = "1px solid #ccc";
    leftHeader.style.fontWeight = "bold";
    leftHeader.style.flexShrink = "0";

    const leftContent = this.leftPanel.createDiv({ cls: "panel-content" });
    leftContent.style.flex = "1";
    leftContent.style.padding = "0";
    leftContent.style.overflow = "hidden";
    leftContent.style.minHeight = "0";
    leftContent.style.position = "relative";
    const originalEditor = this.createReadOnlyEditor(leftContent, this.originalText, true);
    originalEditor.style.height = "100%";
    this.originalEditor = originalEditor;

    this.middlePanel = editorsContainer.createDiv({ cls: "hybrid-panel editable" });
    this.middlePanel.style.flex = "1";
    this.middlePanel.style.display = "flex";
    this.middlePanel.style.flexDirection = "column";
    this.middlePanel.style.border = "2px solid #4CAF50";
    this.middlePanel.style.borderRadius = "4px";
    this.middlePanel.style.minHeight = "0";

    const middleHeader = this.middlePanel.createDiv({ cls: "panel-header" });
    middleHeader.setText("Editor");
    middleHeader.style.padding = "8px";
    middleHeader.style.background = "#4CAF50";
    middleHeader.style.color = "white";
    middleHeader.style.fontWeight = "bold";
    middleHeader.style.flexShrink = "0";

    const middleContent = this.middlePanel.createDiv({ cls: "panel-content" });
    middleContent.style.flex = "1";
    middleContent.style.padding = "0";
    middleContent.style.overflow = "hidden";
    middleContent.style.minHeight = "0";
    middleContent.style.position = "relative";

    const finalEditor = this.createEditableEditor(middleContent, "");
    finalEditor.style.height = "100%";
    this.finalEditor = finalEditor;

    this.rightPanel = editorsContainer.createDiv({ cls: "hybrid-panel modified" });
    this.rightPanel.style.flex = "1";
    this.rightPanel.style.display = "flex";
    this.rightPanel.style.flexDirection = "column";
    this.rightPanel.style.border = "1px solid #ccc";
    this.rightPanel.style.borderRadius = "4px";
    this.rightPanel.style.minHeight = "0";

    const rightHeader = this.rightPanel.createDiv({ cls: "panel-header" });
    rightHeader.setText("Modified");
    rightHeader.style.padding = "8px";
    rightHeader.style.background = "#f5f5f5";
    rightHeader.style.borderBottom = "1px solid #ccc";
    rightHeader.style.fontWeight = "bold";
    rightHeader.style.flexShrink = "0";

    const rightContent = this.rightPanel.createDiv({ cls: "panel-content" });
    rightContent.style.flex = "1";
    rightContent.style.padding = "0";
    rightContent.style.overflow = "hidden";
    rightContent.style.minHeight = "0";
    rightContent.style.position = "relative";
    const modifiedEditor = this.createReadOnlyEditor(rightContent, this.modifiedText, false);
    modifiedEditor.style.height = "100%";
    this.modifiedEditor = modifiedEditor;

    this.updatePanelContents();
  }

  private updatePanelContents(): void {
    this.clearAllDiffOverlays();

    if (this.isDiffVisible) {
      let targetPanel: HTMLDivElement | null = null;
      switch (this.diffViewPosition) {
        case "left":
          targetPanel = this.leftPanel;
          break;
        case "center":
          targetPanel = this.middlePanel;
          break;
        case "right":
          targetPanel = this.rightPanel;
          break;
      }

      if (targetPanel) {
        const content = targetPanel.querySelector<HTMLElement>(".panel-content");
        if (content) {
          this.createDiffOverlay(content);
          this.isDiffDirty = false;
          this.restoreDiffScroll();
        }
      }
    }
  }

  private saveDiffScroll(): void {
    if (this.diffOverlay) {
      this.diffOverlayScrollTop = this.diffOverlay.scrollTop;
    }
    if (this.diffScrollContainer) {
      this.diffScrollContainerScrollTop = this.diffScrollContainer.scrollTop;
    }
  }

  private restoreDiffScroll(): void {
    if (this.diffOverlay) {
      this.diffOverlay.scrollTop = this.diffOverlayScrollTop;
    }
    if (this.diffScrollContainer) {
      this.diffScrollContainer.scrollTop = this.diffScrollContainerScrollTop;
    }
  }

  private clearAllDiffOverlays(): void {
    this.saveDiffScroll();
    [this.leftPanel, this.middlePanel, this.rightPanel].forEach((panel) => {
      if (panel) {
        const existingOverlay = panel.querySelector(".diff-overlay");
        if (existingOverlay) {
          existingOverlay.remove();
        }
      }
    });
    this.diffOverlay = null;
    this.diffScrollContainer = null;
    this.diffContainer = null;
  }

  private switchDiffPosition(position: DiffViewPosition): void {
    this.diffViewPosition = position;
    this.updatePanelContents();
  }

  private moveDiffLeft(): void {
    if (this.diffViewPosition === "center") {
      this.diffViewPosition = "left";
      this.updatePanelContents();
    } else if (this.diffViewPosition === "right") {
      this.diffViewPosition = "center";
      this.updatePanelContents();
    }
  }

  private moveDiffRight(): void {
    if (this.diffViewPosition === "left") {
      this.diffViewPosition = "center";
      this.updatePanelContents();
    } else if (this.diffViewPosition === "center") {
      this.diffViewPosition = "right";
      this.updatePanelContents();
    }
  }

  private toggleDiffVisibility(): void {
    this.isDiffVisible = !this.isDiffVisible;
    if (this.isDiffVisible) {
      this.showDiffOverlay();
    } else {
      this.hideDiffOverlay();
    }
  }

  private showDiffOverlay(): void {
    if (!this.diffOverlay || this.isDiffDirty) {
      this.updatePanelContents();
      return;
    }
    this.diffOverlay.style.display = "block";
    this.restoreDiffScroll();
  }

  private hideDiffOverlay(): void {
    if (!this.diffOverlay) {
      return;
    }
    this.saveDiffScroll();
    this.diffOverlay.style.display = "none";
  }

  private createReadOnlyEditor(
    container: HTMLElement,
    text: string,
    isOriginal = false
  ): HTMLTextAreaElement {
    console.log("Creating readonly editor, isOriginal:", isOriginal, "text length:", text.length);

    const editor = container.createEl("textarea");
    editor.value = text;
    editor.style.width = "100%";
    editor.style.height = "100%";
    editor.style.border = "none";
    editor.style.outline = "none";
    editor.style.resize = "none";
    editor.style.fontFamily = "monospace";
    editor.style.fontSize = `${this.fontSize}px`;
    editor.style.lineHeight = "1.5";
    editor.style.backgroundColor = "#fafafa";
    editor.style.overflow = "auto";
    editor.style.whiteSpace = "pre-wrap";
    editor.style.wordWrap = "break-word";
    editor.style.userSelect = "text";
    editor.style.cursor = "text";
    editor.readOnly = true;

    editor.addEventListener("input", () => {
      if (!this.isEditModeEnabled) {
        return;
      }
      if (this.isDiffVisible) {
        window.setTimeout(() => {
          this.updateDiffView();
        }, 100);
      } else {
        this.isDiffDirty = true;
      }
    });

    editor.addEventListener("dblclick", () => {
      if (this.isEditModeEnabled) return;

      const cursorPos = editor.selectionStart;
      const currentLineStart = editor.value.lastIndexOf("\n", cursorPos - 1) + 1;
      let currentLineEnd = editor.value.indexOf("\n", cursorPos);
      if (currentLineEnd === -1) currentLineEnd = editor.value.length;

      const lineContent = editor.value.substring(currentLineStart, currentLineEnd);

      if (lineContent.trim() !== "") {
        if (!this.finalEditor) {
          return;
        }
        const textToCopy = lineContent;
        this.insertAtCursor(this.finalEditor, textToCopy);
      }
    });

    if (isOriginal) {
      this.originalEditor = editor;
      console.log("Original editor saved:", this.originalEditor);
    } else {
      this.modifiedEditor = editor;
      console.log("Modified editor saved:", this.modifiedEditor);
    }

    return editor;
  }

  private createEditableEditor(container: HTMLElement, text: string): HTMLTextAreaElement {
    const editor = container.createEl("textarea");
    editor.value = text;
    editor.style.width = "100%";
    editor.style.height = "100%";
    editor.style.border = "none";
    editor.style.outline = "none";
    editor.style.resize = "none";
    editor.style.fontFamily = "monospace";
    editor.style.fontSize = `${this.fontSize}px`;
    editor.style.lineHeight = "1.5";
    editor.style.backgroundColor = "white";
    editor.style.overflow = "auto";

    this.history = [text];
    this.historyIndex = 0;
    this.isComposing = false;
    this.preCompositionText = text;

    editor.addEventListener("compositionstart", () => {
      this.isComposing = true;
      this.preCompositionText = editor.value;
    });

    editor.addEventListener("compositionend", () => {
      this.isComposing = false;
      this.addToHistory(editor.value);
    });

    editor.addEventListener("input", () => {
      if (!this.isComposing) {
        this.addToHistory(editor.value);
      }
    });

    editor.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        if (this.isComposing) {
          editor.value = this.preCompositionText;
          this.isComposing = false;
          this.historyIndex = this.history.indexOf(this.preCompositionText);
          if (this.historyIndex === -1) {
            this.addToHistory(this.preCompositionText);
          }
        } else if (this.historyIndex > 0) {
          this.historyIndex--;
          editor.value = this.history[this.historyIndex];
        }
        editor.focus();
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === "y" || (event.key === "z" && event.shiftKey))
      ) {
        event.preventDefault();
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          editor.value = this.history[this.historyIndex];
          editor.focus();
        }
      }
    });

    return editor;
  }

  private addToHistory(value: string): void {
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(value);
    this.historyIndex++;

    if (this.history.length > 100) {
      this.history.shift();
      this.historyIndex--;
    }
  }

  private addHybridActions(container: HTMLElement): void {
    const actionsContainer = container.createDiv({ cls: "hybrid-actions" });
    actionsContainer.style.display = "flex";
    actionsContainer.style.gap = "10px";
    actionsContainer.style.padding = "10px 0";
    actionsContainer.style.justifyContent = "center";
    actionsContainer.style.flexWrap = "wrap";

    this.toggleEditModeBtn = actionsContainer.createEl("button", {
      text: "Edit Mode",
    });
    this.toggleEditModeBtn.style.padding = "8px 16px";
    this.toggleEditModeBtn.style.backgroundColor = "#2196F3";
    this.toggleEditModeBtn.style.color = "white";
    this.toggleEditModeBtn.style.border = "none";
    this.toggleEditModeBtn.style.borderRadius = "4px";
    this.toggleEditModeBtn.style.cursor = "pointer";

    const clearBtn = actionsContainer.createEl("button", {
      text: "Clear",
    });
    clearBtn.style.padding = "8px 16px";
    clearBtn.style.backgroundColor = "#f44336";
    clearBtn.style.color = "white";
    clearBtn.style.border = "none";
    clearBtn.style.borderRadius = "4px";
    clearBtn.style.cursor = "pointer";

    const applyBtn = actionsContainer.createEl("button", {
      text: "Apply",
      cls: "mod-cta",
    });
    applyBtn.style.padding = "8px 16px";
    applyBtn.style.backgroundColor = "#4CAF50";
    applyBtn.style.color = "white";
    applyBtn.style.border = "none";
    applyBtn.style.borderRadius = "4px";
    applyBtn.style.cursor = "pointer";

    const cancelBtn = actionsContainer.createEl("button", {
      text: "Cancel",
    });
    cancelBtn.style.padding = "8px 16px";
    cancelBtn.style.backgroundColor = "#666";
    cancelBtn.style.color = "white";
    cancelBtn.style.border = "none";
    cancelBtn.style.borderRadius = "4px";
    cancelBtn.style.cursor = "pointer";

    const fontControlsContainer = actionsContainer.createDiv();
    fontControlsContainer.style.display = "flex";
    fontControlsContainer.style.alignItems = "center";
    fontControlsContainer.style.gap = "8px";
    fontControlsContainer.style.marginLeft = "20px";

    const fontLabel = fontControlsContainer.createEl("span", { text: "size:" });
    fontLabel.style.fontSize = "14px";
    fontLabel.style.color = "#ccc";

    const decreaseBtn = fontControlsContainer.createEl("button", { text: "-" });
    decreaseBtn.style.padding = "4px 8px";
    decreaseBtn.style.borderRadius = "4px";
    decreaseBtn.style.border = "1px solid #666";
    decreaseBtn.style.backgroundColor = "#333";
    decreaseBtn.style.color = "white";
    decreaseBtn.style.cursor = "pointer";

    this.fontDisplayEl = fontControlsContainer.createEl("span", {
      text: `${this.fontSize}px`,
    });
    this.fontDisplayEl.style.fontSize = "14px";
    this.fontDisplayEl.style.color = "#ccc";
    this.fontDisplayEl.style.minWidth = "40px";
    this.fontDisplayEl.style.textAlign = "center";

    const increaseBtn = fontControlsContainer.createEl("button", { text: "+" });
    increaseBtn.style.padding = "4px 8px";
    increaseBtn.style.borderRadius = "4px";
    increaseBtn.style.border = "1px solid #666";
    increaseBtn.style.backgroundColor = "#333";
    increaseBtn.style.color = "white";
    increaseBtn.style.cursor = "pointer";

    this.toggleEditModeBtn.addEventListener("click", () => {
      this.toggleEditMode();
    });

    clearBtn.addEventListener("click", () => {
      if (this.finalEditor) {
        this.finalEditor.value = "";
      }
    });

    applyBtn.addEventListener("click", () => {
      if (!this.finalEditor) {
        return;
      }
      this.onApply(this.finalEditor.value);
      this.close();
    });

    cancelBtn.addEventListener("click", () => {
      this.close();
    });

    decreaseBtn.addEventListener("click", () => {
      const newSize = Math.max(10, this.fontSize - 1);
      if (this.fontDisplayEl) {
        this.fontDisplayEl.textContent = `${newSize}px`;
      }
      this.updateFontSize(newSize);
      if (this.plugin) {
        this.plugin.settings.fontSize = newSize;
        void this.plugin.saveSettings();
      }
    });

    increaseBtn.addEventListener("click", () => {
      const newSize = Math.min(24, this.fontSize + 1);
      if (this.fontDisplayEl) {
        this.fontDisplayEl.textContent = `${newSize}px`;
      }
      this.updateFontSize(newSize);
      if (this.plugin) {
        this.plugin.settings.fontSize = newSize;
        void this.plugin.saveSettings();
      }
    });
  }

  private copyFromOriginal(): void {
    if (!this.originalEditor || !this.finalEditor) {
      return;
    }
    const selectedText = this.getSelectedText(this.originalEditor);
    if (selectedText) {
      this.insertAtCursor(this.finalEditor, selectedText);
    } else {
      new Notice("Please check what you want to copy in the original text");
    }
  }

  private copyFromModified(): void {
    if (!this.modifiedEditor || !this.finalEditor) {
      return;
    }
    const selectedText = this.getSelectedText(this.modifiedEditor);
    if (selectedText) {
      this.insertAtCursor(this.finalEditor, selectedText);
    } else {
      new Notice("Please check what you want to copy in the modified text");
    }
  }

  private copyAllModified(): void {
    if (!this.modifiedEditor || !this.finalEditor) {
      return;
    }
    const allModifiedText = this.modifiedEditor.value;
    if (allModifiedText) {
      this.finalEditor.value = allModifiedText;
      new Notice("Have copied.");
    } else {
      new Notice("Modified version is empty.");
    }
  }

  private getSelectedText(textarea: HTMLTextAreaElement): string {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end) {
      return "";
    }

    return textarea.value.substring(start, end);
  }

  private insertAtCursor(textarea: HTMLTextAreaElement, text: string): void {
    if (textarea.tagName !== "TEXTAREA") {
      console.error("insertAtCursor 只能用于textarea元素");
      return;
    }

    const previousActive = document.activeElement;
    const savedScrollTop = textarea.scrollTop;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    const insertStart = start;
    const insertEnd = start + text.length;

    const newValue = before + text + after;
    textarea.value = newValue;
    textarea.focus();
    this.flashCopiedRange(textarea, insertStart, insertEnd, previousActive);

    textarea.scrollTop = savedScrollTop;

    const inputEvent = new Event("input", { bubbles: true });
    textarea.dispatchEvent(inputEvent);
  }

  private flashCopiedRange(
    textarea: HTMLTextAreaElement,
    start: number,
    end: number,
    previousActive: Element | null
  ): void {
    if (start === end) {
      return;
    }
    const restoreTarget = previousActive instanceof HTMLElement ? previousActive : null;
    textarea.setSelectionRange(start, end);
    if (this.copyFlashTimer) {
      clearTimeout(this.copyFlashTimer);
    }
    this.copyFlashTimer = window.setTimeout(() => {
      textarea.setSelectionRange(end, end);
      if (restoreTarget && restoreTarget !== textarea && this.modalEl.contains(restoreTarget)) {
        restoreTarget.focus();
      }
    }, 600);
  }

  private addKeyboardShortcuts(): void {
    if (!this.boundHandleKeyDown) {
      this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    }
    document.addEventListener("keydown", this.boundHandleKeyDown, { capture: true });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const activeElement = document.activeElement;
    const isInModal = activeElement ? this.modalEl.contains(activeElement) : false;
    const rootElement = document.documentElement;

    if (
      !isInModal &&
      activeElement !== document.body &&
      activeElement !== rootElement &&
      activeElement !== null
    ) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "/") {
      event.preventDefault();
      this.toggleDiffVisibility();
      return;
    }

    if (event.key === "Enter" || event.key === "Return" || event.keyCode === 13) {
      if (activeElement === this.finalEditor) {
        return;
      }

      if (this.isEditModeEnabled) {
        return;
      }

      event.preventDefault();

      if (activeElement === this.originalEditor) {
        const selectedText = this.originalEditor
          ? this.getSelectedText(this.originalEditor)
          : "";
        if (selectedText) {
          this.copyFromOriginal();
          if (this.originalEditor) {
            this.originalEditor.setSelectionRange(
              this.originalEditor.selectionEnd,
              this.originalEditor.selectionEnd
            );
          }
        } else {
          new Notice("请先在原文中选择要复制的文本");
        }
        return;
      }

      if (activeElement === this.modifiedEditor) {
        const selectedText = this.modifiedEditor
          ? this.getSelectedText(this.modifiedEditor)
          : "";
        if (selectedText) {
          this.copyFromModified();
          if (this.modifiedEditor) {
            this.modifiedEditor.setSelectionRange(
              this.modifiedEditor.selectionEnd,
              this.modifiedEditor.selectionEnd
            );
          }
        } else {
          new Notice("请先在修改版中选择要复制的文本");
        }
        return;
      }
    }

    if (!this.isDiffVisible) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === ",") {
      event.preventDefault();
      this.moveDiffLeft();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === ".") {
      event.preventDefault();
      this.moveDiffRight();
      return;
    }
  }

  onClose(): void {
    if (this.boundHandleKeyDown) {
      document.removeEventListener("keydown", this.boundHandleKeyDown, { capture: true });
      this.boundHandleKeyDown = null;
    }
    if (this.copyFlashTimer) {
      clearTimeout(this.copyFlashTimer);
      this.copyFlashTimer = null;
    }
    this.contentEl.empty();
  }

  private createDiffOverlay(container: HTMLElement): void {
    this.diffOverlay = container.createDiv({ cls: "diff-overlay" });
    this.diffOverlay.style.position = "absolute";
    this.diffOverlay.style.top = "0";
    this.diffOverlay.style.left = "0";
    this.diffOverlay.style.width = "100%";
    this.diffOverlay.style.height = "100%";
    this.diffOverlay.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
    this.diffOverlay.style.zIndex = "10";
    this.diffOverlay.style.display = "block";
    this.diffOverlay.style.borderRadius = "4px";
    this.diffOverlay.style.padding = "8px";
    this.diffOverlay.style.boxSizing = "border-box";
    this.diffOverlay.style.overflow = "auto";
    this.diffOverlay.style.cursor = "pointer";

    this.diffOverlay.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleDiffVisibility();
    });

    const diffContent = this.diffOverlay.createDiv({ cls: "diff-content" });
    diffContent.style.display = "flex";
    diffContent.style.flexDirection = "column";
    diffContent.style.height = "100%";
    diffContent.style.gap = "4px";

    const diffHeader = diffContent.createDiv({ cls: "diff-header" });
    diffHeader.style.display = "flex";
    diffHeader.style.justifyContent = "space-between";
    diffHeader.style.alignItems = "center";
    diffHeader.style.marginBottom = "4px";

    const unifiedDiffPanel = diffContent.createDiv({ cls: "unified-diff-panel" });
    unifiedDiffPanel.style.flex = "1";
    unifiedDiffPanel.style.border = "1px solid #ddd";
    unifiedDiffPanel.style.borderRadius = "4px";
    unifiedDiffPanel.style.overflow = "auto";
    this.diffScrollContainer = unifiedDiffPanel;

    const unifiedDiffContent = unifiedDiffPanel.createDiv({ cls: "unified-diff-content" });
    unifiedDiffContent.style.padding = "12px";
    this.createUnifiedDiffContent(unifiedDiffContent);

    const hint = diffContent.createDiv({ cls: "diff-hint" });
    hint.style.fontSize = `${this.fontSize - 1}px`;
    hint.style.color = "#666";
    hint.style.textAlign = "center";
    hint.style.marginTop = "8px";
  }

  private createUnifiedDiffContent(container: HTMLElement): void {
    const currentOriginalText = this.originalEditor ? this.originalEditor.value : this.originalText;
    const currentModifiedText = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;

    const diffResult = diffChars(currentOriginalText, currentModifiedText);

    const diffContainer = container.createDiv();
    this.diffContainer = diffContainer;
    diffContainer.style.fontFamily = "monospace";
    diffContainer.style.fontSize = `${this.fontSize}px`;
    diffContainer.style.lineHeight = "1.5";
    diffContainer.style.whiteSpace = "pre-wrap";
    diffContainer.style.wordWrap = "break-word";

    diffResult.forEach((part) => {
      const span = diffContainer.createSpan();
      span.textContent = part.value;

      if (part.removed) {
        span.style.backgroundColor = "#ffebee";
        span.style.color = "#d32f2f";
        span.style.textDecoration = "line-through";
        span.style.textDecorationColor = "#d32f2f";
        span.style.textDecorationThickness = "2px";
      } else if (part.added) {
        span.style.backgroundColor = "#e8f5e8";
        span.style.color = "#2e7d32";
      } else {
        span.style.color = "#333";
      }
    });
  }

  private updateFontSize(newSize: number): void {
    this.fontSize = newSize;

    if (this.originalEditor) {
      this.originalEditor.style.fontSize = `${newSize}px`;
    }
    if (this.modifiedEditor) {
      this.modifiedEditor.style.fontSize = `${newSize}px`;
    }
    if (this.finalEditor) {
      this.finalEditor.style.fontSize = `${newSize}px`;
    }

    if (this.diffContainer) {
      this.diffContainer.style.fontSize = `${newSize}px`;
    }

    if (this.fontDisplayEl) {
      this.fontDisplayEl.textContent = `${newSize}px`;
    }

    if (this.isDiffVisible) {
      this.updateDiffView();
    }
  }

  private toggleEditMode(): void {
    this.isEditModeEnabled = !this.isEditModeEnabled;

    if (this.toggleEditModeBtn) {
      if (this.isEditModeEnabled) {
        this.toggleEditModeBtn.textContent = "Read Only";
        this.toggleEditModeBtn.style.backgroundColor = "#FF9800";
      } else {
        this.toggleEditModeBtn.textContent = "Edit Mode";
        this.toggleEditModeBtn.style.backgroundColor = "#2196F3";
      }
    }

    if (this.originalEditor) {
      this.originalEditor.readOnly = !this.isEditModeEnabled;
    }
    if (this.modifiedEditor) {
      this.modifiedEditor.readOnly = !this.isEditModeEnabled;
    }

    new Notice(this.isEditModeEnabled ? "Edit Mode" : "Read Only");

    this.updateDiffView();
  }

  private updateDiffView(): void {
    if (!this.isDiffVisible) {
      return;
    }

    const originalText = this.originalEditor ? this.originalEditor.value : this.originalText;
    const modifiedText = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;

    this.originalText = originalText;
    this.modifiedText = modifiedText;

    this.updatePanelContents();
  }
}
