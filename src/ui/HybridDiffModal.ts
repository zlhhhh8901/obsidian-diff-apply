import { App, Modal, Notice, setIcon } from "obsidian";
import { diffArrays } from "diff";
import type DiffApplyPlugin from "../main";
import type { DiffGranularityMode } from "../main";
import {
  getDesiredLeadingNewlineCountFromSource,
  getSmartLeadingNewlinesForTarget,
} from "../utils/smartInsert";
import {
  computeLineDiff as computeLineDiffUtil,
  computeModifiedLineDiff as computeModifiedLineDiffUtil,
} from "../utils/lineDiff";

const DEFAULT_DIFF_STYLE = "background";
const COMPLETE_DIFF_STYLE = "background";
const SMART_DBLCLICK_INSERT_NEWLINES = true;

type DiffLayer = "default" | "hover" | "complete";

export interface HybridDiffOptions {
  originalText: string;
  modifiedText: string;
  onApply: (finalText: string) => void;
  fontSize: number;
  diffGranularity: DiffGranularityMode;
  plugin: DiffApplyPlugin;
}

export class HybridDiffModal extends Modal {
  private originalText: string;
  private modifiedText: string;
  private onApply: (finalText: string) => void;
  private fontSize: number;
  private diffGranularity: DiffGranularityMode;
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
  private leftDiffLayers: Partial<Record<DiffLayer, HTMLDivElement>> | null = null;
  private rightDiffLayers: Partial<Record<DiffLayer, HTMLDivElement>> | null = null;

  private copyFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private leftPanel: HTMLDivElement | null = null;
  private middlePanel: HTMLDivElement | null = null;
  private rightPanel: HTMLDivElement | null = null;
  private isPointerInSidePanels = false;

  // Edit mode state
  private isEditModeEnabled = false;
  private toggleEditModeWrapper: HTMLDivElement | null = null;
  private toggleEditModeLabelEl: HTMLSpanElement | null = null;
  private boundHandleKeyDown: ((event: KeyboardEvent) => void) | null = null;
  private fontDisplayEl: HTMLSpanElement | null = null;
  private diffGranularityBtnEls: Partial<Record<DiffGranularityMode, HTMLButtonElement>> = {};

  // Scroll sync state
  private isSyncingScroll = false;
  private leftTextareaScrollListener: ((event: Event) => void) | null = null;
  private rightTextareaScrollListener: ((event: Event) => void) | null = null;
  private leftOverlayScrollListener: ((event: Event) => void) | null = null;
  private rightOverlayScrollListener: ((event: Event) => void) | null = null;
  private ignoreNextScrollEventTargets = new WeakSet<HTMLElement>();

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
    this.diffGranularity = opts.diffGranularity ?? "word";
    this.plugin = opts.plugin;
  }

  onOpen(): void {
    this.titleEl.empty();
    const header = this.titleEl.createDiv({ cls: "merge-header" });
    const brand = header.createDiv({ cls: "brand" });
    const brandIcon = brand.createSpan({ cls: "brand-icon", attr: { "aria-hidden": "true" } });
    setIcon(brandIcon, "git-merge");
    brand.createEl("span", { text: "Merge Conflict Resolver" });

    this.modalEl.addClass("hybrid-diff-modal");
    this.modalEl.addClass("merge-conflict-view");
    this.modalEl.style.setProperty("--hybrid-font-size", `${this.fontSize}px`);
    this.applyDiffThemeSettings();

    const container = this.contentEl.createDiv({ cls: "hybrid-diff-container" });

    const editorsContainer = container.createDiv({ cls: "hybrid-editors-container" });

    this.createPanels(editorsContainer);
    this.addHybridActions(container);
    this.addKeyboardShortcuts();
  }

  private applyDiffThemeSettings(): void {
    this.modalEl.dataset.defaultStyle = DEFAULT_DIFF_STYLE;
    this.modalEl.dataset.completeStyle = COMPLETE_DIFF_STYLE;
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
    this.leftDiffLayers = {
      default: leftOverlayResult.defaultContent,
      hover: leftOverlayResult.hoverContent,
      complete: leftOverlayResult.completeContent,
    };

    // Sync scroll for left overlay
    originalEditor.addEventListener('scroll', () => {
      this.syncOverlayContentTransformToTextarea("left");
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
    this.rightDiffLayers = {
      default: rightOverlayResult.defaultContent,
      hover: rightOverlayResult.hoverContent,
      complete: rightOverlayResult.completeContent,
    };

    // Sync scroll for right overlay
    modifiedEditor.addEventListener('scroll', () => {
      this.syncOverlayContentTransformToTextarea("right");
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

    // Read-only mode: pre-render all diff layers once and cache them.
    this.rebuildReadOnlyDiffCaches();
    this.applyReadOnlyInteractionState();
    this.syncOverlayContentTransformToTextarea("left");
    this.syncOverlayContentTransformToTextarea("right");
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
          SMART_DBLCLICK_INSERT_NEWLINES
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

  private tokenizeInlineDiff(text: string): string[] {
    if (text.length === 0) {
      return [];
    }

    const SegmenterCtor = (Intl as unknown as { Segmenter?: unknown }).Segmenter as
      | (new (locales?: string | string[], options?: { granularity?: "grapheme" | "word" }) => {
          segment: (input: string) => Iterable<{ segment: string; isWordLike?: boolean }>;
        })
      | undefined;

    if (SegmenterCtor) {
      if (this.diffGranularity === "char") {
        const seg = new SegmenterCtor(undefined, { granularity: "grapheme" });
        return Array.from(seg.segment(text), (s) => s.segment);
      }

      const wordSeg = new SegmenterCtor(undefined, { granularity: "word" });
      return Array.from(wordSeg.segment(text), (s) => s.segment);
    }

    if (this.diffGranularity === "char") {
      return Array.from(text);
    }

    // Fallback tokenizer: CJK/punctuation as single chars + everything else as "word+trailing-space".
    const tokens: string[] = [];
    const cjkCharPattern =
      "[\\u3400-\\u9FFF\\uF900-\\uFAFF\\u3040-\\u30FF\\uAC00-\\uD7AF\\u1100-\\u11FF\\u3130-\\u318F\\u3000-\\u303F]";
    const cjkSplitRegex = new RegExp(`(${cjkCharPattern})`, "g");
    const cjkTestRegex = new RegExp(`^${cjkCharPattern}$`);

    const parts = text.split(cjkSplitRegex).filter((part) => part.length > 0);
    for (const part of parts) {
      if (cjkTestRegex.test(part)) {
        tokens.push(part);
        continue;
      }

      const matches = part.match(/\s+|\S+\s*/g);
      if (matches) {
        tokens.push(...matches);
      }
    }

    return tokens;
  }

  private diffInlineText(originalText: string, modifiedText: string): Array<{
    value: string;
    added?: boolean;
    removed?: boolean;
  }> {
    const originalTokens = this.tokenizeInlineDiff(originalText);
    const modifiedTokens = this.tokenizeInlineDiff(modifiedText);
    const diffResult = diffArrays(originalTokens, modifiedTokens);

    return diffResult.map((part) => ({
      value: part.value.join(""),
      added: part.added,
      removed: part.removed,
    }));
  }

  private renderDefaultDiffMarks(contentEl: HTMLElement, text: string, isLeft: boolean): void {
    if (!contentEl) {
      return;
    }

    contentEl.textContent = "";

    if (isLeft) {
      // Left column: show only deletions with semi-transparent red background
      const currentModified = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;
      const diffResult = this.diffInlineText(text, currentModified);

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
      const diffResult = this.diffInlineText(currentOriginal, text);

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
      const diffResult = this.diffInlineText(text, currentModified);

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
      const diffResult = this.diffInlineText(currentOriginal, text);

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

    const diffResult = this.diffInlineText(originalText, modifiedText);

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
    if (this.isEditModeEnabled) {
      return;
    }
    this.leftHoverState = 'hovered';
    this.setOverlayLayer("left", "hover");
    this.setOverlayLayer("right", "complete");
    this.setOverlayScrollable("left", false);
    this.setOverlayScrollable("right", true);

    // Setup scroll sync: left textarea <-> right overlay
    if (this.originalEditor && this.rightDiffOverlay) {
      this.leftTextareaScrollListener = (event) => {
        const currentTarget = event.currentTarget as HTMLElement | null;
        if (currentTarget && this.ignoreNextScrollEventTargets.has(currentTarget)) {
          this.ignoreNextScrollEventTargets.delete(currentTarget);
          return;
        }
        if (this.rightDiffOverlay) {
          this.syncScrollByPercentage(this.originalEditor!, this.rightDiffOverlay);
        }
      };
      this.rightOverlayScrollListener = (event) => {
        const currentTarget = event.currentTarget as HTMLElement | null;
        if (currentTarget && this.ignoreNextScrollEventTargets.has(currentTarget)) {
          this.ignoreNextScrollEventTargets.delete(currentTarget);
          return;
        }
        if (this.originalEditor) {
          this.syncScrollByPercentage(this.rightDiffOverlay!, this.originalEditor);
        }
      };

      this.originalEditor.addEventListener('scroll', this.leftTextareaScrollListener);
      this.rightDiffOverlay.addEventListener('scroll', this.rightOverlayScrollListener);

      // Wait for DOM to update, then ensure scrollable space and sync initial position
      requestAnimationFrame(() => {
        if (this.originalEditor && this.rightDiffOverlay) {
          this.ensureScrollableSpace(this.originalEditor, this.rightDiffOverlay);
          if (this.modifiedEditor) {
            this.ensureScrollableSpace(this.modifiedEditor, this.rightDiffOverlay);
          }
          // Sync initial scroll position
          this.syncScrollByPercentage(this.originalEditor, this.rightDiffOverlay);
        }
      });
    }
  }

  private handleLeftPanelLeave(): void {
    if (this.isEditModeEnabled) {
      return;
    }
    this.leftHoverState = 'default';
    this.setOverlayLayer("left", "default");
    this.setOverlayLayer("right", "default");
    this.setOverlayScrollable("right", false);
    this.syncOverlayContentTransformToTextarea("right");

    // Restore original scrollable space
    if (this.originalEditor) {
      this.restoreScrollableSpace(this.originalEditor);
    }
    if (this.modifiedEditor) {
      this.restoreScrollableSpace(this.modifiedEditor);
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
    if (this.isEditModeEnabled) {
      return;
    }
    this.rightHoverState = 'hovered';
    this.setOverlayLayer("right", "hover");
    this.setOverlayLayer("left", "complete");
    this.setOverlayScrollable("right", false);
    this.setOverlayScrollable("left", true);

    // Setup scroll sync: right textarea <-> left overlay
    if (this.modifiedEditor && this.leftDiffOverlay) {
      this.rightTextareaScrollListener = (event) => {
        const currentTarget = event.currentTarget as HTMLElement | null;
        if (currentTarget && this.ignoreNextScrollEventTargets.has(currentTarget)) {
          this.ignoreNextScrollEventTargets.delete(currentTarget);
          return;
        }
        if (this.leftDiffOverlay) {
          this.syncScrollByPercentage(this.modifiedEditor!, this.leftDiffOverlay);
        }
      };
      this.leftOverlayScrollListener = (event) => {
        const currentTarget = event.currentTarget as HTMLElement | null;
        if (currentTarget && this.ignoreNextScrollEventTargets.has(currentTarget)) {
          this.ignoreNextScrollEventTargets.delete(currentTarget);
          return;
        }
        if (this.modifiedEditor) {
          this.syncScrollByPercentage(this.leftDiffOverlay!, this.modifiedEditor);
        }
      };

      this.modifiedEditor.addEventListener('scroll', this.rightTextareaScrollListener);
      this.leftDiffOverlay.addEventListener('scroll', this.leftOverlayScrollListener);

      // Wait for DOM to update, then ensure scrollable space and sync initial position
      requestAnimationFrame(() => {
        if (this.modifiedEditor && this.leftDiffOverlay) {
          this.ensureScrollableSpace(this.modifiedEditor, this.leftDiffOverlay);
          if (this.originalEditor) {
            this.ensureScrollableSpace(this.originalEditor, this.leftDiffOverlay);
          }
          // Sync initial scroll position
          this.syncScrollByPercentage(this.modifiedEditor, this.leftDiffOverlay);
        }
      });
    }
  }

  private handleRightPanelLeave(): void {
    if (this.isEditModeEnabled) {
      return;
    }
    this.rightHoverState = 'default';
    this.setOverlayLayer("right", "default");
    this.setOverlayLayer("left", "default");
    this.setOverlayScrollable("left", false);
    this.syncOverlayContentTransformToTextarea("left");

    // Restore original scrollable space
    if (this.modifiedEditor) {
      this.restoreScrollableSpace(this.modifiedEditor);
    }
    if (this.originalEditor) {
      this.restoreScrollableSpace(this.originalEditor);
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

  private ignoreNextScrollEvent(targetEl: HTMLElement): void {
    this.ignoreNextScrollEventTargets.add(targetEl);
    requestAnimationFrame(() => {
      this.ignoreNextScrollEventTargets.delete(targetEl);
    });
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

      // Temporarily disable smooth scrolling to prevent async scroll events
      const originalScrollBehavior = targetEl.style.scrollBehavior;
      targetEl.style.scrollBehavior = 'auto';

      this.ignoreNextScrollEvent(targetEl);
      targetEl.scrollTop = targetScrollHeight * sourceScrollPercentage;
      targetEl.scrollLeft = sourceEl.scrollLeft;

      // Restore scroll behavior
      targetEl.style.scrollBehavior = originalScrollBehavior;
    } finally {
      this.isSyncingScroll = false;
    }
  }

  private ensureScrollableSpace(textarea: HTMLTextAreaElement, overlay: HTMLElement): void {
    if (!textarea || !overlay) {
      return;
    }

    const computed = window.getComputedStyle(textarea);
    const originalPaddingBottom =
      textarea.dataset.originalPaddingBottom !== undefined
        ? parseFloat(textarea.dataset.originalPaddingBottom)
        : parseFloat(computed.paddingBottom) || 0;

    const currentPaddingBottom = parseFloat(computed.paddingBottom) || 0;
    const currentExtraPadding = Math.max(0, currentPaddingBottom - originalPaddingBottom);

    // Calculate how much scrollable space each element has
    const textareaScrollableHeight =
      textarea.scrollHeight - textarea.clientHeight - currentExtraPadding;
    const overlayScrollableHeight = overlay.scrollHeight - overlay.clientHeight;

    // If overlay needs more scroll space than textarea has, add padding to textarea
    const neededExtraPadding = Math.max(0, overlayScrollableHeight - textareaScrollableHeight);
    if (neededExtraPadding === 0) {
      if (textarea.dataset.originalPaddingBottom !== undefined) {
        this.restoreScrollableSpace(textarea);
      }
      return;
    }

    if (
      textarea.dataset.originalPaddingBottom !== undefined &&
      neededExtraPadding === currentExtraPadding
    ) {
      return;
    }

    // Store original padding for restoration (only once).
    if (textarea.dataset.originalPaddingBottom === undefined) {
      textarea.dataset.originalPaddingBottom = String(originalPaddingBottom);
    }

    const prevScrollTop = textarea.scrollTop;
    textarea.style.paddingBottom = `${originalPaddingBottom + neededExtraPadding}px`;

    // Keep the visible text position stable: do not remap scrollTop on hover transitions.
    // Only clamp if the new scroll range becomes smaller (e.g. diff view updated).
    const maxAfter = textarea.scrollHeight - textarea.clientHeight;
    if (prevScrollTop > maxAfter) {
      const originalScrollBehavior = textarea.style.scrollBehavior;
      textarea.style.scrollBehavior = "auto";
      this.ignoreNextScrollEvent(textarea);
      textarea.scrollTop = maxAfter;
      textarea.style.scrollBehavior = originalScrollBehavior;
    }
  }

  private restoreScrollableSpace(textarea: HTMLTextAreaElement): void {
    if (!textarea) {
      return;
    }

    // Restore original padding if it was modified
    if (textarea.dataset.originalPaddingBottom === undefined) {
      return;
    }

    const originalPaddingBottom = parseFloat(textarea.dataset.originalPaddingBottom) || 0;
    const prevScrollTop = textarea.scrollTop;

    textarea.style.paddingBottom = `${originalPaddingBottom}px`;
    delete textarea.dataset.originalPaddingBottom;

    // Keep text position stable; if the user previously scrolled into the added padding region,
    // clamp back to the true content bottom.
    const maxAfter = textarea.scrollHeight - textarea.clientHeight;
    if (prevScrollTop > maxAfter) {
      const originalScrollBehavior = textarea.style.scrollBehavior;
      textarea.style.scrollBehavior = "auto";
      this.ignoreNextScrollEvent(textarea);
      textarea.scrollTop = maxAfter;
      textarea.style.scrollBehavior = originalScrollBehavior;
    }
  }

  private updateAllDiffViews(): void {
    if (this.isEditModeEnabled) {
      return;
    }
    // Rebuild cached layers (granularity changed or exiting edit mode).
    this.rebuildReadOnlyDiffCaches();
    this.applyReadOnlyInteractionState();

    // If a complete diff overlay is currently active, re-check scroll space and re-sync position.
    requestAnimationFrame(() => {
      if (this.leftHoverState === "hovered" && this.originalEditor && this.rightDiffOverlay) {
        this.ensureScrollableSpace(this.originalEditor, this.rightDiffOverlay);
        if (this.modifiedEditor) {
          this.ensureScrollableSpace(this.modifiedEditor, this.rightDiffOverlay);
        }
        this.syncScrollByPercentage(this.originalEditor, this.rightDiffOverlay);
      }
      if (this.rightHoverState === "hovered" && this.modifiedEditor && this.leftDiffOverlay) {
        this.ensureScrollableSpace(this.modifiedEditor, this.leftDiffOverlay);
        if (this.originalEditor) {
          this.ensureScrollableSpace(this.originalEditor, this.leftDiffOverlay);
        }
        this.syncScrollByPercentage(this.modifiedEditor, this.leftDiffOverlay);
      }
    });
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
    const footer = container.createEl("footer");

    const leftSection = footer.createDiv({ cls: "footer-section" });
    const rightSection = footer.createDiv({ cls: "footer-section" });

    const toggleWrapper = leftSection.createDiv({
      cls: "toggle-wrapper",
      title: this.plugin.t("modal.toggle.editMode"),
    });
    this.toggleEditModeWrapper = toggleWrapper;
    toggleWrapper.setAttribute("role", "switch");
    toggleWrapper.setAttribute("tabindex", "0");
    toggleWrapper.createDiv({ cls: "toggle-switch" });
    this.toggleEditModeLabelEl = toggleWrapper.createEl("span", { text: "" });
    this.syncEditModeToggleUI();

    leftSection.createDiv({ cls: "divider" });

    const segment = leftSection.createDiv({ cls: "segmented-control" });
    const createGranularityBtn = (mode: DiffGranularityMode, labelKey: Parameters<DiffApplyPlugin["t"]>[0]) => {
      const btn = segment.createEl("button", {
        text: this.plugin.t(labelKey),
        cls: "segment-btn",
      });
      btn.setAttribute("type", "button");
      btn.setAttribute("aria-pressed", "false");
      btn.dataset.mode = mode;
      btn.addEventListener("click", () => this.setDiffGranularity(mode));
      this.diffGranularityBtnEls[mode] = btn;
    };

    createGranularityBtn("word", "modal.diffGranularity.word");
    createGranularityBtn("char", "modal.diffGranularity.char");
    this.updateDiffGranularityUI();

    leftSection.createDiv({ cls: "divider" });

    const fontControlsContainer = leftSection.createDiv({ cls: "hybrid-font-controls" });
    const decreaseBtn = fontControlsContainer.createEl("button", { cls: "btn btn-ghost hybrid-font-btn" });
    setIcon(decreaseBtn, "minus");
    decreaseBtn.setAttribute("aria-label", this.plugin.t("modal.fontSize.decreaseAriaLabel"));
    decreaseBtn.setAttribute("title", this.plugin.t("modal.fontSize.decreaseAriaLabel"));

    this.fontDisplayEl = fontControlsContainer.createEl("span", {
      text: "A",
      cls: "hybrid-font-display",
    });
    this.fontDisplayEl.style.fontSize = `${this.fontSize}px`;
    this.fontDisplayEl.setAttribute("title", `${this.fontSize}px`);

    const increaseBtn = fontControlsContainer.createEl("button", { cls: "btn btn-ghost hybrid-font-btn" });
    setIcon(increaseBtn, "plus");
    increaseBtn.setAttribute("aria-label", this.plugin.t("modal.fontSize.increaseAriaLabel"));
    increaseBtn.setAttribute("title", this.plugin.t("modal.fontSize.increaseAriaLabel"));

    const clearBtn = rightSection.createEl("button", {
      cls: "btn btn-ghost hybrid-clear-btn",
    });
    clearBtn.setAttribute("type", "button");
    clearBtn.textContent = this.plugin.t("modal.action.clear");

    rightSection.createDiv({ cls: "divider" });

    const cancelBtn = rightSection.createEl("button", {
      text: this.plugin.t("modal.action.cancel"),
      cls: "btn btn-secondary hybrid-cancel-btn",
    });
    cancelBtn.setAttribute("type", "button");

    const applyBtn = rightSection.createEl("button", {
      cls: "btn btn-primary hybrid-apply-btn",
    });
    applyBtn.setAttribute("type", "button");
    const applyIcon = applyBtn.createSpan({ cls: "btn-icon", attr: { "aria-hidden": "true" } });
    setIcon(applyIcon, "check");
    applyBtn.appendText(this.plugin.t("modal.action.apply"));

    const handleToggleClick = () => this.setEditModeEnabled(!this.isEditModeEnabled);
    toggleWrapper.addEventListener("click", handleToggleClick);
    toggleWrapper.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        handleToggleClick();
      }
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
      this.updateFontSize(newSize);
    });

    increaseBtn.addEventListener("click", () => {
      const newSize = Math.min(24, this.fontSize + 1);
      this.updateFontSize(newSize);
    });
  }

  private updateDiffGranularityUI(): void {
    const modes: DiffGranularityMode[] = ["word", "char"];
    for (const mode of modes) {
      const btn = this.diffGranularityBtnEls[mode];
      if (!btn) {
        continue;
      }
      const isActive = mode === this.diffGranularity;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  }

  private setDiffGranularity(mode: DiffGranularityMode): void {
    if (mode === this.diffGranularity) {
      return;
    }

    this.diffGranularity = mode;
    this.updateDiffGranularityUI();
    this.updateAllDiffViews();

    this.plugin.ui.diffGranularity = mode;
    void this.plugin.saveUiState();
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
    this.leftDiffLayers = null;
    this.rightDiffLayers = null;

    this.contentEl.empty();
  }

  private updateFontSize(newSize: number): void {
    this.fontSize = newSize;
    this.modalEl.style.setProperty("--hybrid-font-size", `${newSize}px`);
    this.syncFinalEditorMirrorStyles();
    this.syncFinalEditorMirror();

    if (this.fontDisplayEl) {
      this.fontDisplayEl.style.fontSize = `${newSize}px`;
      this.fontDisplayEl.setAttribute("title", `${newSize}px`);
    }

    this.plugin.ui.fontSize = newSize;
    void this.plugin.saveUiState();
    // Font size changes affect layout but not diff computation; keep cached DOM.
    this.syncOverlayContentTransformToTextarea("left");
    this.syncOverlayContentTransformToTextarea("right");

    // If a complete diff overlay is currently scrollable, re-check scroll space.
    requestAnimationFrame(() => {
      if (this.leftHoverState === "hovered" && this.originalEditor && this.rightDiffOverlay) {
        this.ensureScrollableSpace(this.originalEditor, this.rightDiffOverlay);
        this.syncScrollByPercentage(this.originalEditor, this.rightDiffOverlay);
      }
      if (this.rightHoverState === "hovered" && this.modifiedEditor && this.leftDiffOverlay) {
        this.ensureScrollableSpace(this.modifiedEditor, this.leftDiffOverlay);
        this.syncScrollByPercentage(this.modifiedEditor, this.leftDiffOverlay);
      }
    });
  }

  private syncEditModeToggleUI(): void {
    if (this.toggleEditModeWrapper) {
      this.toggleEditModeWrapper.classList.toggle("is-enabled", this.isEditModeEnabled);
      this.toggleEditModeWrapper.setAttribute("aria-checked", this.isEditModeEnabled ? "true" : "false");
    }
    if (this.toggleEditModeLabelEl) {
      this.toggleEditModeLabelEl.textContent = this.plugin.t("modal.toggle.editMode");
    }
  }

  private setEditModeEnabled(enabled: boolean): void {
    if (enabled === this.isEditModeEnabled) {
      this.syncEditModeToggleUI();
      return;
    }

    this.isEditModeEnabled = enabled;
    this.syncEditModeToggleUI();
    this.modalEl.classList.toggle("is-edit-mode", this.isEditModeEnabled);

    if (this.originalEditor) {
      this.originalEditor.readOnly = !this.isEditModeEnabled;
    }
    if (this.modifiedEditor) {
      this.modifiedEditor.readOnly = !this.isEditModeEnabled;
    }

    if (this.isEditModeEnabled) {
      this.leftHoverState = 'default';
      this.rightHoverState = 'default';

      this.setOverlayScrollable("left", false);
      this.setOverlayScrollable("right", false);
      this.syncOverlayContentTransformToTextarea("left");
      this.syncOverlayContentTransformToTextarea("right");

      if (this.originalEditor) {
        this.restoreScrollableSpace(this.originalEditor);
      }
      if (this.modifiedEditor) {
        this.restoreScrollableSpace(this.modifiedEditor);
      }

      if (this.leftTextareaScrollListener && this.originalEditor) {
        this.originalEditor.removeEventListener('scroll', this.leftTextareaScrollListener);
        this.leftTextareaScrollListener = null;
      }
      if (this.rightOverlayScrollListener && this.rightDiffOverlay) {
        this.rightDiffOverlay.removeEventListener('scroll', this.rightOverlayScrollListener);
        this.rightOverlayScrollListener = null;
      }
      if (this.rightTextareaScrollListener && this.modifiedEditor) {
        this.modifiedEditor.removeEventListener('scroll', this.rightTextareaScrollListener);
        this.rightTextareaScrollListener = null;
      }
      if (this.leftOverlayScrollListener && this.leftDiffOverlay) {
        this.leftDiffOverlay.removeEventListener('scroll', this.leftOverlayScrollListener);
        this.leftOverlayScrollListener = null;
      }
    }

    this.updateAllDiffViews();
  }

  private toggleEditMode(): void {
    this.setEditModeEnabled(!this.isEditModeEnabled);
  }

  private createInlineDiffOverlay(container: HTMLElement): {
    overlay: HTMLDivElement;
    defaultContent: HTMLDivElement;
    hoverContent: HTMLDivElement;
    completeContent: HTMLDivElement;
  } {
    const overlay = container.createDiv({ cls: "diff-inline-overlay" });
    overlay.dataset.layered = "true";
    overlay.dataset.activeLayer = "default";

    const defaultContent = overlay.createDiv({
      cls: "diff-inline-content",
      attr: { "data-layer": "default" },
    });
    const hoverContent = overlay.createDiv({
      cls: "diff-inline-content",
      attr: { "data-layer": "hover" },
    });
    const completeContent = overlay.createDiv({
      cls: "diff-inline-content",
      attr: { "data-layer": "complete" },
    });

    // Make the data-layer attribute robust even if Obsidian's helper doesn't set it in some contexts.
    defaultContent.dataset.layer = "default";
    hoverContent.dataset.layer = "hover";
    completeContent.dataset.layer = "complete";

    return { overlay, defaultContent, hoverContent, completeContent };
  }

  private getOverlay(side: "left" | "right"): HTMLDivElement | null {
    return side === "left" ? this.leftDiffOverlay : this.rightDiffOverlay;
  }

  private getOverlayLayers(side: "left" | "right"): Partial<Record<DiffLayer, HTMLDivElement>> | null {
    return side === "left" ? this.leftDiffLayers : this.rightDiffLayers;
  }

  private setOverlayLayer(side: "left" | "right", layer: DiffLayer): void {
    const overlay = this.getOverlay(side);
    if (!overlay) {
      return;
    }
    overlay.dataset.activeLayer = layer;
  }

  private setOverlayScrollable(side: "left" | "right", scrollable: boolean): void {
    const overlay = this.getOverlay(side);
    if (!overlay) {
      return;
    }

    if (scrollable) {
      overlay.addClass("scrollable");
      this.setOverlayContentTransform(side, "none");
      return;
    }

    // When an overlay was scrollable, it may have a different scroll position than its underlying textarea.
    // If we simply disable overlay scrolling, the user's visible position can "desync" from what the textarea
    // will scroll next. Commit the overlay's current scroll position back to the textarea and reset the
    // overlay scroll offsets so transform-based syncing stays correct.
    if (overlay.classList.contains("scrollable")) {
      const textarea = side === "left" ? this.originalEditor : this.modifiedEditor;

      // Prevent any scroll listeners from reacting to the programmatic adjustments below.
      this.isSyncingScroll = true;
      try {
        if (textarea) {
          const overlayScrollableHeight = overlay.scrollHeight - overlay.clientHeight;
          const overlayPercent =
            overlayScrollableHeight > 0 ? overlay.scrollTop / overlayScrollableHeight : 0;
          const clampedPercent = Math.max(0, Math.min(1, overlayPercent));

          const textareaScrollableHeight = textarea.scrollHeight - textarea.clientHeight;
          const originalTextareaScrollBehavior = textarea.style.scrollBehavior;
          textarea.style.scrollBehavior = "auto";
          this.ignoreNextScrollEvent(textarea);
          textarea.scrollTop = textareaScrollableHeight * clampedPercent;
          textarea.scrollLeft = overlay.scrollLeft;
          textarea.style.scrollBehavior = originalTextareaScrollBehavior;
        }

        const originalOverlayScrollBehavior = overlay.style.scrollBehavior;
        overlay.style.scrollBehavior = "auto";
        this.ignoreNextScrollEvent(overlay);
        overlay.scrollTop = 0;
        overlay.scrollLeft = 0;
        overlay.style.scrollBehavior = originalOverlayScrollBehavior;
      } finally {
        this.isSyncingScroll = false;
      }
    }

    overlay.removeClass("scrollable");
    this.syncOverlayContentTransformToTextarea(side);
  }

  private setOverlayContentTransform(side: "left" | "right", transform: string): void {
    const layers = this.getOverlayLayers(side);
    if (!layers) {
      return;
    }
    const all: Array<HTMLDivElement | undefined> = [layers.default, layers.hover, layers.complete];
    for (const el of all) {
      if (el) {
        el.style.transform = transform;
      }
    }
  }

  private syncOverlayContentTransformToTextarea(side: "left" | "right"): void {
    const overlay = this.getOverlay(side);
    if (!overlay || overlay.classList.contains("scrollable")) {
      return;
    }
    const textarea = side === "left" ? this.originalEditor : this.modifiedEditor;
    if (!textarea) {
      return;
    }

    const transform = `translate(-${textarea.scrollLeft}px, -${textarea.scrollTop}px)`;
    this.setOverlayContentTransform(side, transform);
  }

  private applyReadOnlyInteractionState(): void {
    if (this.isEditModeEnabled) {
      return;
    }

    if (this.leftHoverState === "hovered") {
      this.setOverlayLayer("left", "hover");
      this.setOverlayLayer("right", "complete");
      this.setOverlayScrollable("left", false);
      this.setOverlayScrollable("right", true);
      return;
    }

    if (this.rightHoverState === "hovered") {
      this.setOverlayLayer("right", "hover");
      this.setOverlayLayer("left", "complete");
      this.setOverlayScrollable("right", false);
      this.setOverlayScrollable("left", true);
      return;
    }

    this.setOverlayLayer("left", "default");
    this.setOverlayLayer("right", "default");
    this.setOverlayScrollable("left", false);
    this.setOverlayScrollable("right", false);
  }

  /**
   * Count paragraphs in text (separated by blank lines: \n\n or more)
   */
  private countParagraphs(text: string): number {
    if (!text.trim()) return 0;
    // Split by one or more blank lines
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    return paragraphs.length;
  }

  /**
   * Find all paragraph break positions (character indices at the start of blank lines)
   * This places markers at the end of paragraphs, right before the blank line
   */
  private findParagraphBreakPositions(text: string): number[] {
    const positions: number[] = [];
    const regex = /\n\s*\n/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      // Position at the start of the blank line (end of previous paragraph)
      positions.push(match.index);
    }
    return positions;
  }

  /**
   * Get superscript number character for index (1-based)
   */
  private getSuperscriptNumber(n: number): string {
    const superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
    if (n <= 0) return '';
    if (n < 10) return superscripts[n];
    // For numbers >= 10, combine digits
    return String(n).split('').map(d => superscripts[parseInt(d)]).join('');
  }

  /**
   * Create a paragraph marker element (dot + superscript number)
   */
  private createParagraphMarker(container: HTMLElement, number: number): void {
    const marker = container.createSpan({ cls: 'diff-paragraph-marker' });
    const dot = marker.createSpan({ cls: 'diff-paragraph-marker-dot' });
    dot.textContent = '●';
    const num = marker.createSpan({ cls: 'diff-paragraph-marker-num' });
    num.textContent = this.getSuperscriptNumber(number);
  }

  /**
   * Calculate paragraph marker positions for both sides based on diff result.
   * Returns marker info: which side has more paragraphs, and where to insert markers.
   */
  private calculateParagraphMarkers(
    originalText: string,
    modifiedText: string,
    diffResult: Array<{ value: string; added?: boolean; removed?: boolean }>
  ): {
    moreParagraphsSide: 'left' | 'right' | 'equal';
    // For each marker number, store the character position in left and right text
    markers: Array<{ number: number; leftPos: number; rightPos: number }>;
  } {
    const leftParagraphs = this.countParagraphs(originalText);
    const rightParagraphs = this.countParagraphs(modifiedText);

    // Determine which side has more paragraphs
    let moreParagraphsSide: 'left' | 'right' | 'equal';
    let sourceText: string;
    let sourceBreakPositions: number[];

    if (rightParagraphs > leftParagraphs) {
      moreParagraphsSide = 'right';
      sourceText = modifiedText;
      sourceBreakPositions = this.findParagraphBreakPositions(modifiedText);
    } else if (leftParagraphs > rightParagraphs) {
      moreParagraphsSide = 'left';
      sourceText = originalText;
      sourceBreakPositions = this.findParagraphBreakPositions(originalText);
    } else {
      // Equal paragraphs - no markers needed
      return { moreParagraphsSide: 'equal', markers: [] };
    }

    // Now traverse the diff result to find corresponding positions
    const markers: Array<{ number: number; leftPos: number; rightPos: number }> = [];
    let leftPos = 0;
    let rightPos = 0;
    let markerNumber = 1;
    let nextBreakIndex = 0;

    for (const part of diffResult) {
      const partLength = part.value.length;

      if (part.removed) {
        // Only in left (original)
        if (moreParagraphsSide === 'left') {
          // Check if any break positions fall within this part
          while (nextBreakIndex < sourceBreakPositions.length) {
            const breakPos = sourceBreakPositions[nextBreakIndex];
            if (breakPos > leftPos && breakPos <= leftPos + partLength) {
              markers.push({
                number: markerNumber++,
                leftPos: breakPos,
                rightPos: rightPos
              });
              nextBreakIndex++;
            } else {
              break;
            }
          }
        }
        leftPos += partLength;
      } else if (part.added) {
        // Only in right (modified)
        if (moreParagraphsSide === 'right') {
          // Check if any break positions fall within this part
          while (nextBreakIndex < sourceBreakPositions.length) {
            const breakPos = sourceBreakPositions[nextBreakIndex];
            if (breakPos > rightPos && breakPos <= rightPos + partLength) {
              markers.push({
                number: markerNumber++,
                leftPos: leftPos,
                rightPos: breakPos
              });
              nextBreakIndex++;
            } else {
              break;
            }
          }
        }
        rightPos += partLength;
      } else {
        // Unchanged - exists in both
        if (moreParagraphsSide === 'left') {
          while (nextBreakIndex < sourceBreakPositions.length) {
            const breakPos = sourceBreakPositions[nextBreakIndex];
            if (breakPos > leftPos && breakPos <= leftPos + partLength) {
              const offsetInPart = breakPos - leftPos;
              markers.push({
                number: markerNumber++,
                leftPos: breakPos,
                rightPos: rightPos + offsetInPart
              });
              nextBreakIndex++;
            } else {
              break;
            }
          }
        } else if (moreParagraphsSide === 'right') {
          while (nextBreakIndex < sourceBreakPositions.length) {
            const breakPos = sourceBreakPositions[nextBreakIndex];
            if (breakPos > rightPos && breakPos <= rightPos + partLength) {
              const offsetInPart = breakPos - rightPos;
              markers.push({
                number: markerNumber++,
                leftPos: leftPos + offsetInPart,
                rightPos: breakPos
              });
              nextBreakIndex++;
            } else {
              break;
            }
          }
        }
        leftPos += partLength;
        rightPos += partLength;
      }
    }

    return { moreParagraphsSide, markers };
  }

  private rebuildReadOnlyDiffCaches(): void {
    if (this.isEditModeEnabled) {
      return;
    }

    const leftLayers = this.leftDiffLayers;
    const rightLayers = this.rightDiffLayers;
    if (!leftLayers?.default || !leftLayers.hover || !leftLayers.complete) {
      return;
    }
    if (!rightLayers?.default || !rightLayers.hover || !rightLayers.complete) {
      return;
    }

    const currentOriginal = this.originalEditor ? this.originalEditor.value : this.originalText;
    const currentModified = this.modifiedEditor ? this.modifiedEditor.value : this.modifiedText;

    const diffResult = this.diffInlineText(currentOriginal, currentModified);

    // Calculate paragraph markers
    const { moreParagraphsSide, markers } = this.calculateParagraphMarkers(
      currentOriginal,
      currentModified,
      diffResult
    );

    // Create a map for quick lookup: position -> marker number
    const leftMarkerMap = new Map<number, number>();
    const rightMarkerMap = new Map<number, number>();
    for (const m of markers) {
      leftMarkerMap.set(m.leftPos, m.number);
      rightMarkerMap.set(m.rightPos, m.number);
    }

    // Clear all layers
    leftLayers.default.textContent = "";
    leftLayers.hover.textContent = "";
    leftLayers.complete.textContent = "";
    rightLayers.default.textContent = "";
    rightLayers.hover.textContent = "";
    rightLayers.complete.textContent = "";

    // Track positions as we render
    let leftPos = 0;
    let rightPos = 0;

    // Helper to render text with markers interspersed
    const renderTextWithMarkers = (
      container: HTMLElement,
      text: string,
      startPos: number,
      markerMap: Map<number, number>,
      cssClass?: string
    ) => {
      let currentPos = startPos;
      let textOffset = 0;

      while (textOffset < text.length) {
        // Check if there's a marker at current position
        const markerNum = markerMap.get(currentPos);
        if (markerNum !== undefined) {
          this.createParagraphMarker(container, markerNum);
        }

        // Find next marker position within this text
        let nextMarkerOffset = text.length;
        for (const [pos] of markerMap) {
          if (pos > currentPos && pos < startPos + text.length) {
            const offset = pos - startPos;
            if (offset < nextMarkerOffset && offset > textOffset) {
              nextMarkerOffset = offset;
            }
          }
        }

        // Render text up to next marker (or end)
        const chunk = text.slice(textOffset, nextMarkerOffset);
        if (chunk) {
          const span = container.createSpan();
          span.textContent = chunk;
          if (cssClass) {
            span.addClass(cssClass);
          }
        }

        textOffset = nextMarkerOffset;
        currentPos = startPos + textOffset;
      }
      // Note: Don't check for marker at the very end here, as it will be handled
      // by the next diff part's start position check
    };

    // Helper to render text without markers (for complete layer parts that don't need markers)
    const renderTextSimple = (
      container: HTMLElement,
      text: string,
      cssClass?: string
    ) => {
      const span = container.createSpan();
      span.textContent = text;
      if (cssClass) {
        span.addClass(cssClass);
      }
    };

    // Determine which marker map to use for complete layer
    const completeMarkerMap = moreParagraphsSide === 'right' ? rightMarkerMap : leftMarkerMap;

    for (const part of diffResult) {
      const partLength = part.value.length;

      // Left default: deletions only (show removed and unchanged)
      if (!part.added) {
        renderTextWithMarkers(
          leftLayers.default,
          part.value,
          leftPos,
          leftMarkerMap,
          part.removed ? "diff-deleted-default" : undefined
        );
      }

      // Right default: additions only (show added and unchanged)
      if (!part.removed) {
        renderTextWithMarkers(
          rightLayers.default,
          part.value,
          rightPos,
          rightMarkerMap,
          part.added ? "diff-added-default" : undefined
        );
      }

      // Left hover: deletions underline
      if (!part.added) {
        renderTextWithMarkers(
          leftLayers.hover,
          part.value,
          leftPos,
          leftMarkerMap,
          part.removed ? "diff-deleted-hover" : undefined
        );
      }

      // Right hover: additions underline
      if (!part.removed) {
        renderTextWithMarkers(
          rightLayers.hover,
          part.value,
          rightPos,
          rightMarkerMap,
          part.added ? "diff-added-hover" : undefined
        );
      }

      // Complete layer: show everything with markers based on moreParagraphsSide
      // The complete layer's paragraph structure matches the side with more paragraphs
      const completeCssClass = part.removed ? "diff-deleted-complete" : (part.added ? "diff-added-complete" : undefined);

      if (moreParagraphsSide === 'right') {
        // Markers are based on modified text positions
        // Only render markers for added and unchanged parts (which exist in modified)
        if (!part.removed) {
          renderTextWithMarkers(leftLayers.complete, part.value, rightPos, completeMarkerMap, completeCssClass);
          renderTextWithMarkers(rightLayers.complete, part.value, rightPos, completeMarkerMap, completeCssClass);
        } else {
          // Removed parts don't have markers (they don't exist in modified)
          renderTextSimple(leftLayers.complete, part.value, completeCssClass);
          renderTextSimple(rightLayers.complete, part.value, completeCssClass);
        }
      } else if (moreParagraphsSide === 'left') {
        // Markers are based on original text positions
        // Only render markers for removed and unchanged parts (which exist in original)
        if (!part.added) {
          renderTextWithMarkers(leftLayers.complete, part.value, leftPos, completeMarkerMap, completeCssClass);
          renderTextWithMarkers(rightLayers.complete, part.value, leftPos, completeMarkerMap, completeCssClass);
        } else {
          // Added parts don't have markers (they don't exist in original)
          renderTextSimple(leftLayers.complete, part.value, completeCssClass);
          renderTextSimple(rightLayers.complete, part.value, completeCssClass);
        }
      } else {
        // No markers needed (equal paragraphs)
        renderTextSimple(leftLayers.complete, part.value, completeCssClass);
        renderTextSimple(rightLayers.complete, part.value, completeCssClass);
      }

      // Update positions
      if (!part.added) {
        leftPos += partLength;
      }
      if (!part.removed) {
        rightPos += partLength;
      }
    }
  }
}
