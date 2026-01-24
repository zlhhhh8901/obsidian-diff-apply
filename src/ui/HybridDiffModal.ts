import { App, Modal, Notice } from "obsidian";
import { diffChars } from "diff";
import type DiffApplyPlugin from "../main";
import {
  getDesiredLeadingNewlineCountFromSource,
  getSmartLeadingNewlinesForTarget,
} from "../utils/smartInsert";
import {
  computeLineDiff as computeLineDiffUtil,
  computeModifiedLineDiff as computeModifiedLineDiffUtil,
} from "../utils/lineDiff";

export interface HybridDiffOptions {
  originalText: string;
  modifiedText: string;
  onApply: (finalText: string) => void;
  fontSize: number;
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

  // While interacting in Original/Modified, keep Editor selection/caret visually visible
  // by rendering a mirror overlay (textarea loses selection/caret visuals when blurred).
  private finalEditorMirrorEl: HTMLDivElement | null = null;
  private finalEditorMirrorScrollEl: HTMLDivElement | null = null;
  private finalEditorMirrorContentEl: HTMLDivElement | null = null;
  private boundSyncFinalEditorMirror: (() => void) | null = null;
  private boundSyncFinalEditorMirrorFocusIn: ((event: FocusEvent) => void) | null = null;
  private boundSyncFinalEditorMirrorFocusOut: ((event: FocusEvent) => void) | null = null;

  // Inline diff state
  private leftHoverState: 'default' | 'hovered' = 'default';
  private rightHoverState: 'default' | 'hovered' = 'default';
  private leftDiffOverlay: HTMLDivElement | null = null;
  private rightDiffOverlay: HTMLDivElement | null = null;
  private leftDiffContent: HTMLDivElement | null = null;
  private rightDiffContent: HTMLDivElement | null = null;

  private copyFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private leftPanel: HTMLDivElement | null = null;
  private middlePanel: HTMLDivElement | null = null;
  private rightPanel: HTMLDivElement | null = null;
  private isPointerInSidePanels = false;

  // Edit mode state
  private isEditModeEnabled = false;
  private toggleEditModeBtn: HTMLButtonElement | null = null;
  private boundHandleKeyDown: ((event: KeyboardEvent) => void) | null = null;
  private fontDisplayEl: HTMLSpanElement | null = null;

  // Scroll sync state
  private isSyncingScroll = false;
  private leftTextareaScrollListener: (() => void) | null = null;
  private rightTextareaScrollListener: (() => void) | null = null;
  private leftOverlayScrollListener: (() => void) | null = null;
  private rightOverlayScrollListener: (() => void) | null = null;

  // Undo history for the editor
  private history: string[] = [];
  private historyIndex = 0;
  private isComposing = false;
  private preCompositionText = "";

  // Insert flash state (so we can keep the brief highlight but avoid accidental replacement)
  private finalEditorFlashRange: { start: number; end: number } | null = null;
  private boundFinalEditorBeforeInput: ((event: InputEvent) => void) | null = null;

  constructor(app: App, opts: HybridDiffOptions) {
    super(app);
    this.originalText = opts.originalText;
    this.modifiedText = opts.modifiedText;
    this.onApply = opts.onApply;
    this.fontSize = opts.fontSize || 14;
    this.plugin = opts.plugin;
  }

  onOpen(): void {
    this.titleEl.setText("Diff Apply");
    this.modalEl.addClass("hybrid-diff-modal");
    this.modalEl.style.setProperty("--hybrid-font-size", `${this.fontSize}px`);
    this.applyDiffThemeSettings();

    const container = this.contentEl.createDiv({ cls: "hybrid-diff-container" });

    const editorsContainer = container.createDiv({ cls: "hybrid-editors-container" });

    this.createPanels(editorsContainer);
    this.addHybridActions(container);
    this.addKeyboardShortcuts();
  }

  private applyDiffThemeSettings(): void {
    const { defaultDiffStyle, completeDiffStyle } = this.plugin.settings;

    this.modalEl.dataset.defaultStyle = defaultDiffStyle;
    this.modalEl.dataset.completeStyle = completeDiffStyle;
  }

  private computeLineDiff(originalLines: string[], modifiedLines: string[]) {
    return computeLineDiffUtil(originalLines, modifiedLines);
  }

  private computeModifiedLineDiff(originalLines: string[], modifiedLines: string[]) {
    return computeModifiedLineDiffUtil(originalLines, modifiedLines);
  }

  private createPanels(editorsContainer: HTMLElement): void {
    this.leftPanel = editorsContainer.createDiv({ cls: "hybrid-panel original" });

    const leftHeader = this.leftPanel.createDiv({ cls: "panel-header" });
    leftHeader.setText(this.plugin.t("modal.header.original"));

    const leftContent = this.leftPanel.createDiv({ cls: "panel-content" });
    const originalEditor = this.createReadOnlyEditor(leftContent, this.originalText, true);
    originalEditor.addClass("diff-active");
    this.originalEditor = originalEditor;

    // Create left diff overlay
    const leftOverlayResult = this.createInlineDiffOverlay(leftContent);
    this.leftDiffOverlay = leftOverlayResult.overlay;
    this.leftDiffContent = leftOverlayResult.content;

    // Sync scroll for left overlay
    originalEditor.addEventListener('scroll', () => {
      if (this.leftDiffContent) {
        this.leftDiffContent.style.transform = `translate(-${originalEditor.scrollLeft}px, -${originalEditor.scrollTop}px)`;
      }
    });

    this.middlePanel = editorsContainer.createDiv({ cls: "hybrid-panel editable" });

    const middleHeader = this.middlePanel.createDiv({ cls: "panel-header" });
    middleHeader.setText(this.plugin.t("modal.header.editor"));

    const middleContent = this.middlePanel.createDiv({ cls: "panel-content" });

    const finalEditor = this.createEditableEditor(middleContent, "");
    this.finalEditor = finalEditor;
    this.setupFinalEditorMirror(middleContent);

    this.rightPanel = editorsContainer.createDiv({ cls: "hybrid-panel modified" });

    const rightHeader = this.rightPanel.createDiv({ cls: "panel-header" });
    rightHeader.setText(this.plugin.t("modal.header.modified"));

    const rightContent = this.rightPanel.createDiv({ cls: "panel-content" });
    const modifiedEditor = this.createReadOnlyEditor(rightContent, this.modifiedText, false);
    modifiedEditor.addClass("diff-active");
    this.modifiedEditor = modifiedEditor;

    // Create right diff overlay
    const rightOverlayResult = this.createInlineDiffOverlay(rightContent);
    this.rightDiffOverlay = rightOverlayResult.overlay;
    this.rightDiffContent = rightOverlayResult.content;

    // Sync scroll for right overlay
    modifiedEditor.addEventListener('scroll', () => {
      if (this.rightDiffContent) {
        this.rightDiffContent.style.transform = `translate(-${modifiedEditor.scrollLeft}px, -${modifiedEditor.scrollTop}px)`;
      }
    });

    // Treat mouse interaction in side panels as "active" even if focus lands on <body>
    // (e.g. clicking panel chrome), so the Editor's selection/caret hint stays visible.
    const setSidePointerActive = (active: boolean) => {
      this.isPointerInSidePanels = active;
      this.syncFinalEditorMirror();
    };
    this.leftPanel.addEventListener("pointerenter", () => setSidePointerActive(true));
    this.leftPanel.addEventListener("pointerleave", () => setSidePointerActive(false));
    this.rightPanel.addEventListener("pointerenter", () => setSidePointerActive(true));
    this.rightPanel.addEventListener("pointerleave", () => setSidePointerActive(false));

    // Setup diff hover listeners
    this.setupDiffHoverListeners();

    // Render initial diff views
    if (this.leftDiffContent) {
      this.renderDefaultDiffMarks(this.leftDiffContent, this.originalText, true);
    }
    if (this.rightDiffContent) {
      this.renderDefaultDiffMarks(this.rightDiffContent, this.modifiedText, false);
    }
  }

  private setupFinalEditorMirror(middleContent: HTMLElement): void {
    if (!this.finalEditor) {
      return;
    }

    const mirrorEl = middleContent.createDiv({ cls: "diff-apply-editor-mirror" });
    const mirrorScrollEl = mirrorEl.createDiv({ cls: "diff-apply-editor-mirror-scroll" });
    const mirrorContentEl = mirrorScrollEl.createDiv({ cls: "diff-apply-editor-mirror-content" });

    this.finalEditorMirrorEl = mirrorEl;
    this.finalEditorMirrorScrollEl = mirrorScrollEl;
    this.finalEditorMirrorContentEl = mirrorContentEl;

    this.syncFinalEditorMirrorStyles();

    const sync = () => this.syncFinalEditorMirror();
    this.boundSyncFinalEditorMirror = sync;

    this.finalEditor.addEventListener("input", sync);
    this.finalEditor.addEventListener("select", sync);
    this.finalEditor.addEventListener("keyup", sync);
    this.finalEditor.addEventListener("mouseup", sync);
    this.finalEditor.addEventListener("scroll", sync);

    this.boundFinalEditorBeforeInput = () => this.cancelFinalEditorFlashSelection();
    this.finalEditor.addEventListener("beforeinput", this.boundFinalEditorBeforeInput, true);

    // Focus moves between the three panes; keep mirror visibility in sync.
    this.boundSyncFinalEditorMirrorFocusIn = () => sync();
    this.boundSyncFinalEditorMirrorFocusOut = () => window.setTimeout(sync, 0);
    this.modalEl.addEventListener("focusin", this.boundSyncFinalEditorMirrorFocusIn, {
      capture: true,
    });
    this.modalEl.addEventListener("focusout", this.boundSyncFinalEditorMirrorFocusOut, {
      capture: true,
    });

    this.syncFinalEditorMirror();
  }

  private cancelFinalEditorFlashSelection(): void {
    if (!this.finalEditorFlashRange || !this.finalEditor) {
      return;
    }

    const { start, end } = this.finalEditorFlashRange;
    if (this.finalEditor.selectionStart === start && this.finalEditor.selectionEnd === end) {
      this.finalEditor.setSelectionRange(end, end);
    }

    this.finalEditorFlashRange = null;

    if (this.copyFlashTimer) {
      clearTimeout(this.copyFlashTimer);
      this.copyFlashTimer = null;
    }
  }

  private syncFinalEditorMirrorStyles(): void {
    if (!this.finalEditor || !this.finalEditorMirrorEl || !this.finalEditorMirrorScrollEl) {
      return;
    }

    const computed = window.getComputedStyle(this.finalEditor);

    this.finalEditorMirrorEl.style.position = "absolute";
    this.finalEditorMirrorEl.style.top = "0";
    this.finalEditorMirrorEl.style.left = "0";
    this.finalEditorMirrorEl.style.right = "0";
    this.finalEditorMirrorEl.style.bottom = "0";
    this.finalEditorMirrorEl.style.pointerEvents = "none";
    this.finalEditorMirrorEl.style.zIndex = "2";
    this.finalEditorMirrorEl.style.display = "none";

    this.finalEditorMirrorScrollEl.style.width = "100%";
    this.finalEditorMirrorScrollEl.style.height = "100%";
    this.finalEditorMirrorScrollEl.style.overflow = "auto";
    this.finalEditorMirrorScrollEl.style.boxSizing = computed.boxSizing;
    this.finalEditorMirrorScrollEl.style.padding = computed.padding;
    this.finalEditorMirrorScrollEl.style.fontFamily = computed.fontFamily;
    this.finalEditorMirrorScrollEl.style.fontSize = computed.fontSize;
    this.finalEditorMirrorScrollEl.style.lineHeight = computed.lineHeight;
    this.finalEditorMirrorScrollEl.style.letterSpacing = computed.letterSpacing;
    this.finalEditorMirrorScrollEl.style.backgroundColor = computed.backgroundColor;
    this.finalEditorMirrorScrollEl.style.color = computed.color;
    this.finalEditorMirrorScrollEl.style.whiteSpace = "pre-wrap";
    this.finalEditorMirrorScrollEl.style.wordBreak = "break-word";
  }

  private syncFinalEditorMirror(): void {
    if (
      !this.finalEditor ||
      !this.finalEditorMirrorEl ||
      !this.finalEditorMirrorScrollEl ||
      !this.finalEditorMirrorContentEl
    ) {
      return;
    }

    const activeElement = document.activeElement;
    const isInteractingWithSidePanels =
      activeElement === this.originalEditor ||
      activeElement === this.modifiedEditor ||
      this.isPointerInSidePanels;

    if (!isInteractingWithSidePanels) {
      this.finalEditorMirrorEl.style.display = "none";
      return;
    }

    // Keep scroll in sync so caret/selection lines up with the visible area.
    this.finalEditorMirrorScrollEl.scrollTop = this.finalEditor.scrollTop;
    this.finalEditorMirrorScrollEl.scrollLeft = this.finalEditor.scrollLeft;

    const value = this.finalEditor.value ?? "";
    const selectionStart = this.finalEditor.selectionStart ?? 0;
    const selectionEnd = this.finalEditor.selectionEnd ?? 0;

    // Only show mirror when textarea is blurred (otherwise the native selection/caret is visible).
    if (document.activeElement === this.finalEditor) {
      this.finalEditorMirrorEl.style.display = "none";
      return;
    }

    this.finalEditorMirrorEl.style.display = "block";
    this.renderFinalEditorMirrorContent(value, selectionStart, selectionEnd);
  }

  private renderFinalEditorMirrorContent(value: string, start: number, end: number): void {
    if (!this.finalEditorMirrorContentEl) {
      return;
    }

    const contentEl = this.finalEditorMirrorContentEl;
    contentEl.textContent = "";

    const safeStart = Math.max(0, Math.min(start, value.length));
    const safeEnd = Math.max(0, Math.min(end, value.length));
    const rangeStart = Math.min(safeStart, safeEnd);
    const rangeEnd = Math.max(safeStart, safeEnd);

    const frag = document.createDocumentFragment();

    const before = value.slice(0, rangeStart);
    const after = value.slice(rangeEnd);

    if (before) {
      frag.appendChild(document.createTextNode(before));
    }

    if (rangeStart !== rangeEnd) {
      const selectionSpan = document.createElement("span");
      selectionSpan.className = "diff-apply-editor-mirror-selection";
      selectionSpan.textContent = value.slice(rangeStart, rangeEnd);
      frag.appendChild(selectionSpan);
    } else {
      const caretSpan = document.createElement("span");
      caretSpan.className = "diff-apply-editor-mirror-caret";
      caretSpan.textContent = "\u200b";
      frag.appendChild(caretSpan);
    }

    if (after) {
      frag.appendChild(document.createTextNode(after));
    }

    contentEl.appendChild(frag);
  }

  private createReadOnlyEditor(
    container: HTMLElement,
    text: string,
    isOriginal = false
  ): HTMLTextAreaElement {
    const editor = container.createEl("textarea");
    editor.addClass("hybrid-editor");
    editor.addClass("hybrid-editor--readonly");
    editor.addClass(isOriginal ? "hybrid-editor--original" : "hybrid-editor--modified");
    editor.value = text;
    editor.readOnly = true;

    // Debounced input handler for real-time diff updates in edit mode
    let inputDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    editor.addEventListener("input", () => {
      if (!this.isEditModeEnabled) {
        return;
      }
      if (inputDebounceTimer) {
        clearTimeout(inputDebounceTimer);
      }
      inputDebounceTimer = setTimeout(() => {
        this.updateAllDiffViews();
      }, 300);
    });

    editor.addEventListener("dblclick", (event) => {
      if (this.isEditModeEnabled) {
        return;
      }

      event.preventDefault();

      const cursorPos = editor.selectionStart;
      const currentLineStart = editor.value.lastIndexOf("\n", cursorPos - 1) + 1;
      let currentLineEnd = editor.value.indexOf("\n", cursorPos);
      if (currentLineEnd === -1) currentLineEnd = editor.value.length;

      const lineContent = editor.value.substring(currentLineStart, currentLineEnd);

      if (lineContent.trim() !== "") {
        if (!this.finalEditor) {
          return;
        }
        const desiredLeadingNewlines =
          this.plugin.settings.smartDblClickInsertNewlines
            ? getDesiredLeadingNewlineCountFromSource(editor.value, currentLineStart)
            : 0;
        const prefix = getSmartLeadingNewlinesForTarget(
          this.finalEditor.value,
          this.finalEditor.selectionStart,
          desiredLeadingNewlines
        );
        const textToCopy = prefix + lineContent;
        this.insertAtCursor(this.finalEditor, textToCopy);
      }

      window.setTimeout(() => {
        editor.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    });

    if (isOriginal) {
      this.originalEditor = editor;
    } else {
      this.modifiedEditor = editor;
    }

    return editor;
  }

  private createEditableEditor(container: HTMLElement, text: string): HTMLTextAreaElement {
    const editor = container.createEl("textarea");
    editor.addClass("hybrid-editor");
    editor.addClass("hybrid-editor--final");
    editor.value = text;

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

  private createInlineDiffOverlay(container: HTMLElement): { overlay: HTMLDivElement; content: HTMLDivElement } {
    const overlay = container.createDiv({ cls: "diff-inline-overlay" });

    const content = overlay.createDiv({ cls: "diff-inline-content" });

    return { overlay, content };
  }

  private renderDefaultDiffMarks(contentEl: HTMLElement, text: string, isLeft: boolean): void {
    if (!contentEl) {
      return;
    }

    contentEl.textContent = "";

    if (isLeft) {
      // Left column: show only deletions with semi-transparent red background
      const currentModified = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;
      const diffResult = diffChars(text, currentModified);

      diffResult.forEach((part) => {
        if (!part.added) {
          // Show removed and unchanged text
          const span = contentEl.createSpan();
          span.textContent = part.value;

          if (part.removed) {
            span.addClass("diff-deleted-default");
          }
        }
      });
    } else {
      // Right column: show only additions with semi-transparent green background
      const currentOriginal = this.originalEditor ? this.originalEditor.value : this.originalText;
      const diffResult = diffChars(currentOriginal, text);

      diffResult.forEach((part) => {
        if (!part.removed) {
          // Show added and unchanged text
          const span = contentEl.createSpan();
          span.textContent = part.value;

          if (part.added) {
            span.addClass("diff-added-default");
          }
        }
      });
    }
  }

  private renderHoverDiffMarks(contentEl: HTMLElement, text: string, isLeft: boolean): void {
    if (!contentEl) {
      return;
    }

    contentEl.textContent = "";

    if (isLeft) {
      // Left column: show deletions with thin red underline
      const currentModified = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;
      const diffResult = diffChars(text, currentModified);

      diffResult.forEach((part) => {
        if (!part.added) {
          // Show removed and unchanged text
          const span = contentEl.createSpan();
          span.textContent = part.value;

          if (part.removed) {
            span.addClass("diff-deleted-hover");
          }
        }
      });
    } else {
      // Right column: show additions with thin green underline
      const currentOriginal = this.originalEditor ? this.originalEditor.value : this.originalText;
      const diffResult = diffChars(currentOriginal, text);

      diffResult.forEach((part) => {
        if (!part.removed) {
          // Show added and unchanged text
          const span = contentEl.createSpan();
          span.textContent = part.value;

          if (part.added) {
            span.addClass("diff-added-hover");
          }
        }
      });
    }
  }

  private renderCompleteDiff(contentEl: HTMLElement, originalText: string, modifiedText: string): void {
    if (!contentEl) {
      return;
    }

    contentEl.textContent = "";

    const diffResult = diffChars(originalText, modifiedText);

    diffResult.forEach((part) => {
      const span = contentEl.createSpan();
      span.textContent = part.value;

      if (part.removed) {
        span.addClass("diff-deleted-complete");
      } else if (part.added) {
        span.addClass("diff-added-complete");
      }
    });
  }

  private setupDiffHoverListeners(): void {
    if (!this.leftPanel || !this.rightPanel) {
      return;
    }

    this.leftPanel.addEventListener("mouseenter", () => this.handleLeftPanelEnter());
    this.leftPanel.addEventListener("mouseleave", () => this.handleLeftPanelLeave());
    this.rightPanel.addEventListener("mouseenter", () => this.handleRightPanelEnter());
    this.rightPanel.addEventListener("mouseleave", () => this.handleRightPanelLeave());
  }

  private handleLeftPanelEnter(): void {
    this.leftHoverState = 'hovered';
    const currentOriginal = this.originalEditor ? this.originalEditor.value : this.originalText;
    const currentModified = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;

    if (this.leftDiffContent) {
      this.renderHoverDiffMarks(this.leftDiffContent, currentOriginal, true);
    }
    if (this.rightDiffContent && this.rightDiffOverlay) {
      this.renderCompleteDiff(this.rightDiffContent, currentOriginal, currentModified);
      // Enable scrolling for complete diff view
      this.rightDiffOverlay.addClass("scrollable");
      this.rightDiffContent.style.transform = "none";

      // Ensure textarea has enough scrollable space to match overlay
      if (this.originalEditor) {
        this.ensureScrollableSpace(this.originalEditor, this.rightDiffOverlay);
      }
    }

    // Setup scroll sync: left textarea <-> right overlay
    if (this.originalEditor && this.rightDiffOverlay) {
      this.leftTextareaScrollListener = () => {
        if (this.rightDiffOverlay) {
          this.syncScrollByPercentage(this.originalEditor!, this.rightDiffOverlay);
        }
      };
      this.rightOverlayScrollListener = () => {
        if (this.originalEditor) {
          this.syncScrollByPercentage(this.rightDiffOverlay!, this.originalEditor);
        }
      };

      this.originalEditor.addEventListener('scroll', this.leftTextareaScrollListener);
      this.rightDiffOverlay.addEventListener('scroll', this.rightOverlayScrollListener);
    }
  }

  private handleLeftPanelLeave(): void {
    this.leftHoverState = 'default';
    const currentOriginal = this.originalEditor ? this.originalEditor.value : this.originalText;
    const currentModified = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;

    if (this.leftDiffContent) {
      this.renderDefaultDiffMarks(this.leftDiffContent, currentOriginal, true);
    }
    if (this.rightDiffContent && this.rightDiffOverlay) {
      this.renderDefaultDiffMarks(this.rightDiffContent, currentModified, false);
      // Restore scroll sync
      this.rightDiffOverlay.removeClass("scrollable");
      if (this.modifiedEditor) {
        this.rightDiffContent.style.transform = `translate(-${this.modifiedEditor.scrollLeft}px, -${this.modifiedEditor.scrollTop}px)`;
      }
    }

    // Restore original scrollable space
    if (this.originalEditor) {
      this.restoreScrollableSpace(this.originalEditor);
    }

    // Remove scroll sync listeners
    if (this.leftTextareaScrollListener && this.originalEditor) {
      this.originalEditor.removeEventListener('scroll', this.leftTextareaScrollListener);
      this.leftTextareaScrollListener = null;
    }
    if (this.rightOverlayScrollListener && this.rightDiffOverlay) {
      this.rightDiffOverlay.removeEventListener('scroll', this.rightOverlayScrollListener);
      this.rightOverlayScrollListener = null;
    }
  }

  private handleRightPanelEnter(): void {
    this.rightHoverState = 'hovered';
    const currentOriginal = this.originalEditor ? this.originalEditor.value : this.originalText;
    const currentModified = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;

    if (this.rightDiffContent) {
      this.renderHoverDiffMarks(this.rightDiffContent, currentModified, false);
    }
    if (this.leftDiffContent && this.leftDiffOverlay) {
      this.renderCompleteDiff(this.leftDiffContent, currentOriginal, currentModified);
      // Enable scrolling for complete diff view
      this.leftDiffOverlay.addClass("scrollable");
      this.leftDiffContent.style.transform = "none";

      // Ensure textarea has enough scrollable space to match overlay
      if (this.modifiedEditor) {
        this.ensureScrollableSpace(this.modifiedEditor, this.leftDiffOverlay);
      }
    }

    // Setup scroll sync: right textarea <-> left overlay
    if (this.modifiedEditor && this.leftDiffOverlay) {
      this.rightTextareaScrollListener = () => {
        if (this.leftDiffOverlay) {
          this.syncScrollByPercentage(this.modifiedEditor!, this.leftDiffOverlay);
        }
      };
      this.leftOverlayScrollListener = () => {
        if (this.modifiedEditor) {
          this.syncScrollByPercentage(this.leftDiffOverlay!, this.modifiedEditor);
        }
      };

      this.modifiedEditor.addEventListener('scroll', this.rightTextareaScrollListener);
      this.leftDiffOverlay.addEventListener('scroll', this.leftOverlayScrollListener);
    }
  }

  private handleRightPanelLeave(): void {
    this.rightHoverState = 'default';
    const currentOriginal = this.originalEditor ? this.originalEditor.value : this.originalText;
    const currentModified = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;

    if (this.rightDiffContent) {
      this.renderDefaultDiffMarks(this.rightDiffContent, currentModified, false);
    }
    if (this.leftDiffContent && this.leftDiffOverlay) {
      this.renderDefaultDiffMarks(this.leftDiffContent, currentOriginal, true);
      // Restore scroll sync
      this.leftDiffOverlay.removeClass("scrollable");
      if (this.originalEditor) {
        this.leftDiffContent.style.transform = `translate(-${this.originalEditor.scrollLeft}px, -${this.originalEditor.scrollTop}px)`;
      }
    }

    // Restore original scrollable space
    if (this.modifiedEditor) {
      this.restoreScrollableSpace(this.modifiedEditor);
    }

    // Remove scroll sync listeners
    if (this.rightTextareaScrollListener && this.modifiedEditor) {
      this.modifiedEditor.removeEventListener('scroll', this.rightTextareaScrollListener);
      this.rightTextareaScrollListener = null;
    }
    if (this.leftOverlayScrollListener && this.leftDiffOverlay) {
      this.leftDiffOverlay.removeEventListener('scroll', this.leftOverlayScrollListener);
      this.leftOverlayScrollListener = null;
    }
  }

  private syncDiffOverlayScroll(textarea: HTMLTextAreaElement, content: HTMLDivElement): void {
    if (!textarea || !content) {
      return;
    }
    content.scrollTop = textarea.scrollTop;
    content.scrollLeft = textarea.scrollLeft;
  }

  private syncScrollByPercentage(sourceEl: HTMLElement, targetEl: HTMLElement): void {
    if (!sourceEl || !targetEl || this.isSyncingScroll) {
      return;
    }

    this.isSyncingScroll = true;

    try {
      // Calculate scroll percentage of source element
      const sourceScrollHeight = sourceEl.scrollHeight - sourceEl.clientHeight;
      const sourceScrollPercentage = sourceScrollHeight > 0
        ? sourceEl.scrollTop / sourceScrollHeight
        : 0;

      // Apply percentage to target element
      const targetScrollHeight = targetEl.scrollHeight - targetEl.clientHeight;
      targetEl.scrollTop = targetScrollHeight * sourceScrollPercentage;

      // Sync horizontal scroll by pixels (usually not much difference)
      targetEl.scrollLeft = sourceEl.scrollLeft;
    } finally {
      // Use setTimeout to reset flag after current event loop
      setTimeout(() => {
        this.isSyncingScroll = false;
      }, 0);
    }
  }

  private ensureScrollableSpace(textarea: HTMLTextAreaElement, overlay: HTMLElement): void {
    if (!textarea || !overlay) {
      return;
    }

    // Calculate how much scrollable space each element has
    const textareaScrollableHeight = textarea.scrollHeight - textarea.clientHeight;
    const overlayScrollableHeight = overlay.scrollHeight - overlay.clientHeight;

    // If overlay needs more scroll space than textarea has, add padding to textarea
    if (overlayScrollableHeight > textareaScrollableHeight) {
      const additionalPadding = overlayScrollableHeight - textareaScrollableHeight;
      const currentPadding = parseInt(window.getComputedStyle(textarea).paddingBottom) || 0;
      textarea.style.paddingBottom = `${currentPadding + additionalPadding}px`;
      // Store original padding for restoration
      textarea.dataset.originalPaddingBottom = currentPadding.toString();
    }
  }

  private restoreScrollableSpace(textarea: HTMLTextAreaElement): void {
    if (!textarea) {
      return;
    }

    // Restore original padding if it was modified
    if (textarea.dataset.originalPaddingBottom !== undefined) {
      textarea.style.paddingBottom = `${textarea.dataset.originalPaddingBottom}px`;
      delete textarea.dataset.originalPaddingBottom;
    }
  }

  private updateAllDiffViews(): void {
    const currentOriginal = this.originalEditor ? this.originalEditor.value : this.originalText;
    const currentModified = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;

    if (this.leftHoverState === 'default' && this.rightHoverState === 'default') {
      if (this.leftDiffContent) {
        this.renderDefaultDiffMarks(this.leftDiffContent, currentOriginal, true);
      }
      if (this.rightDiffContent) {
        this.renderDefaultDiffMarks(this.rightDiffContent, currentModified, false);
      }
    } else if (this.leftHoverState === 'hovered') {
      if (this.leftDiffContent) {
        this.renderHoverDiffMarks(this.leftDiffContent, currentOriginal, true);
      }
      if (this.rightDiffContent) {
        this.renderCompleteDiff(this.rightDiffContent, currentOriginal, currentModified);
      }
    } else if (this.rightHoverState === 'hovered') {
      if (this.rightDiffContent) {
        this.renderHoverDiffMarks(this.rightDiffContent, currentModified, false);
      }
      if (this.leftDiffContent) {
        this.renderCompleteDiff(this.leftDiffContent, currentOriginal, currentModified);
      }
    }
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

    this.toggleEditModeBtn = actionsContainer.createEl("button", {
      text: this.plugin.t("modal.toggle.editMode"),
      cls: "hybrid-toggle-btn",
    });
    this.toggleEditModeBtn.setAttribute("aria-pressed", "false");

    const clearBtn = actionsContainer.createEl("button", {
      text: this.plugin.t("modal.action.clear"),
      cls: "hybrid-clear-btn",
    });

    const applyBtn = actionsContainer.createEl("button", {
      text: this.plugin.t("modal.action.apply"),
      cls: "mod-cta hybrid-apply-btn",
    });

    const cancelBtn = actionsContainer.createEl("button", {
      text: this.plugin.t("modal.action.cancel"),
      cls: "hybrid-cancel-btn",
    });

    const fontControlsContainer = actionsContainer.createDiv({ cls: "hybrid-font-controls" });

    const fontLabel = fontControlsContainer.createEl("span", {
      text: this.plugin.t("modal.fontSize.label"),
      cls: "hybrid-font-label",
    });

    const decreaseBtn = fontControlsContainer.createEl("button", { text: "-", cls: "hybrid-font-btn" });
    decreaseBtn.setAttribute("aria-label", this.plugin.t("modal.fontSize.decreaseAriaLabel"));
    decreaseBtn.setAttribute("title", this.plugin.t("modal.fontSize.decreaseAriaLabel"));

    this.fontDisplayEl = fontControlsContainer.createEl("span", {
      text: `${this.fontSize}px`,
      cls: "hybrid-font-display",
    });

    const increaseBtn = fontControlsContainer.createEl("button", { text: "+", cls: "hybrid-font-btn" });
    increaseBtn.setAttribute("aria-label", this.plugin.t("modal.fontSize.increaseAriaLabel"));
    increaseBtn.setAttribute("title", this.plugin.t("modal.fontSize.increaseAriaLabel"));

    this.toggleEditModeBtn.addEventListener("click", () => {
      this.toggleEditMode();
    });

    clearBtn.addEventListener("click", () => {
      if (this.finalEditor) {
        this.finalEditor.value = "";
        this.finalEditor.dispatchEvent(new Event("input", { bubbles: true }));
        this.syncFinalEditorMirror();
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
      new Notice(this.plugin.t("modal.notice.selectTextInOriginal"));
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
      new Notice(this.plugin.t("modal.notice.selectTextInModified"));
    }
  }

  private copyAllModified(): void {
    if (!this.modifiedEditor || !this.finalEditor) {
      return;
    }
    const allModifiedText = this.modifiedEditor.value;
    if (allModifiedText) {
      this.finalEditor.value = allModifiedText;
      new Notice(this.plugin.t("modal.notice.copied"));
    } else {
      new Notice(this.plugin.t("modal.notice.modifiedEmpty"));
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
      return;
    }

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
    this.flashCopiedRange(textarea, insertStart, insertEnd);

    textarea.scrollTop = savedScrollTop;

    const inputEvent = new Event("input", { bubbles: true });
    textarea.dispatchEvent(inputEvent);

    this.syncFinalEditorMirror();
  }

  private flashCopiedRange(
    textarea: HTMLTextAreaElement,
    start: number,
    end: number
  ): void {
    if (start === end) {
      return;
    }

    if (textarea === this.finalEditor) {
      this.finalEditorFlashRange = { start, end };
    }

    textarea.setSelectionRange(start, end);
    if (this.copyFlashTimer) {
      clearTimeout(this.copyFlashTimer);
    }
    this.copyFlashTimer = setTimeout(() => {
      if (textarea.selectionStart === start && textarea.selectionEnd === end) {
        textarea.setSelectionRange(end, end);
      }
      if (textarea === this.finalEditor) {
        this.finalEditorFlashRange = null;
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
          new Notice(this.plugin.t("modal.notice.selectTextInOriginal"));
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
          new Notice(this.plugin.t("modal.notice.selectTextInModified"));
        }
        return;
      }
    }
  }

  onClose(): void {
    if (this.boundSyncFinalEditorMirror && this.finalEditor) {
      const sync = this.boundSyncFinalEditorMirror;
      this.finalEditor.removeEventListener("input", sync);
      this.finalEditor.removeEventListener("select", sync);
      this.finalEditor.removeEventListener("keyup", sync);
      this.finalEditor.removeEventListener("mouseup", sync);
      this.finalEditor.removeEventListener("scroll", sync);
      this.boundSyncFinalEditorMirror = null;
    }
    if (this.boundFinalEditorBeforeInput && this.finalEditor) {
      this.finalEditor.removeEventListener("beforeinput", this.boundFinalEditorBeforeInput, true);
      this.boundFinalEditorBeforeInput = null;
    }
    if (this.boundSyncFinalEditorMirrorFocusIn) {
      this.modalEl.removeEventListener("focusin", this.boundSyncFinalEditorMirrorFocusIn, true);
      this.boundSyncFinalEditorMirrorFocusIn = null;
    }
    if (this.boundSyncFinalEditorMirrorFocusOut) {
      this.modalEl.removeEventListener("focusout", this.boundSyncFinalEditorMirrorFocusOut, true);
      this.boundSyncFinalEditorMirrorFocusOut = null;
    }

    if (this.boundHandleKeyDown) {
      document.removeEventListener("keydown", this.boundHandleKeyDown, { capture: true });
      this.boundHandleKeyDown = null;
    }
    if (this.copyFlashTimer) {
      clearTimeout(this.copyFlashTimer);
      this.copyFlashTimer = null;
    }

    // Clean up diff overlay references
    this.leftDiffOverlay = null;
    this.rightDiffOverlay = null;
    this.leftDiffContent = null;
    this.rightDiffContent = null;

    this.contentEl.empty();
  }

  private updateFontSize(newSize: number): void {
    this.fontSize = newSize;
    this.modalEl.style.setProperty("--hybrid-font-size", `${newSize}px`);
    this.syncFinalEditorMirrorStyles();
    this.syncFinalEditorMirror();

    if (this.fontDisplayEl) {
      this.fontDisplayEl.textContent = `${newSize}px`;
    }

    // Re-render diff views with new font size
    this.updateAllDiffViews();
  }

  private toggleEditMode(): void {
    this.isEditModeEnabled = !this.isEditModeEnabled;

    if (this.toggleEditModeBtn) {
      if (this.isEditModeEnabled) {
        this.toggleEditModeBtn.textContent = this.plugin.t("modal.toggle.readOnly");
      } else {
        this.toggleEditModeBtn.textContent = this.plugin.t("modal.toggle.editMode");
      }
      this.toggleEditModeBtn.setAttribute("aria-pressed", this.isEditModeEnabled ? "true" : "false");
      this.toggleEditModeBtn.classList.toggle("is-active", this.isEditModeEnabled);
    }
    this.modalEl.classList.toggle("is-edit-mode", this.isEditModeEnabled);

    if (this.originalEditor) {
      this.originalEditor.readOnly = !this.isEditModeEnabled;
    }
    if (this.modifiedEditor) {
      this.modifiedEditor.readOnly = !this.isEditModeEnabled;
    }

    new Notice(
      this.isEditModeEnabled
        ? this.plugin.t("modal.notice.editMode")
        : this.plugin.t("modal.notice.readOnly")
    );

    this.updateAllDiffViews();
  }
}
