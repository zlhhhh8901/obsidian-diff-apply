import { App, Modal, setIcon, type KeymapEventHandler } from "obsidian";
import type DiffApplyPlugin from "../main";
import type { DiffGranularityMode } from "../main";
import { computeReviewOps } from "../utils/reviewDiff";

type FlashRange = { start: number; end: number; kind: "range" | "caret" };

type ReviewTarget =
  | { kind: "change"; start: number; end: number; originalText: string }
  | { kind: "delete"; pos: number; originalText: string };

type ArmedInjectionTarget = {
  target: ReviewTarget;
  revisionId: number;
};

type EditorSnapshot = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export interface ReviewDiffOptions {
  originalText: string;
  initialFinalText: string;
  onApply: (finalText: string) => void;
  fontSize: number;
  diffGranularity: DiffGranularityMode;
  plugin: DiffApplyPlugin;
}

export class ReviewDiffModal extends Modal {
  private originalText: string;
  private onApply: (finalText: string) => void;
  private plugin: DiffApplyPlugin;
  private initialFinalText: string;

  private fontSize: number;
  private diffGranularity: DiffGranularityMode;

  private headerEl: HTMLDivElement | null = null;
  private reviewViewEl: HTMLDivElement | null = null;
  private finalEditor: HTMLTextAreaElement | null = null;

  private tooltipEl: HTMLDivElement | null = null;
  private tooltipContentEl: HTMLDivElement | null = null;
  private tooltipActiveTarget: HTMLElement | null = null;
  private tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

  private finalOverlayScrollEl: HTMLDivElement | null = null;
  private finalOverlayContentEl: HTMLDivElement | null = null;
  private finalOverlayAnchorEl: HTMLSpanElement | null = null;

  private finalEdgeHintUpEl: HTMLDivElement | null = null;
  private finalEdgeHintDownEl: HTMLDivElement | null = null;

  private hoverState:
    | { kind: "change"; start: number; end: number }
    | { kind: "delete"; pos: number }
    | null = null;

  private armedInjectionTarget: ArmedInjectionTarget | null = null;
  private armedTargetElement: HTMLElement | null = null;
  private revisionId = 0;

  private flashRange: FlashRange | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingScrollFrame: number | null = null;
  private inputDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private fontDisplayEl: HTMLSpanElement | null = null;
  private diffGranularityBtnEls: Partial<Record<DiffGranularityMode, HTMLButtonElement>> = {};
  private scopeHandlers: KeymapEventHandler[] = [];
  private historyStack: EditorSnapshot[] = [];
  private historyIndex = -1;
  private applyingHistory = false;

  private boundHandleFinalScroll: (() => void) | null = null;
  private boundHandleFinalInput: (() => void) | null = null;
  private boundHandleFinalKeyDown: ((event: KeyboardEvent) => void) | null = null;
  private boundHandleReviewPointerOver: ((event: PointerEvent) => void) | null = null;
  private boundHandleReviewPointerOut: ((event: PointerEvent) => void) | null = null;
  private boundHandleReviewClick: ((event: MouseEvent) => void) | null = null;
  private boundHandleTooltipPointerEnter: (() => void) | null = null;
  private boundHandleTooltipPointerLeave: (() => void) | null = null;

  private helpButtonEl: HTMLButtonElement | null = null;
  private helpTooltipEl: HTMLDivElement | null = null;
  private helpTooltipContentEl: HTMLDivElement | null = null;
  private helpTooltipHideTimer: ReturnType<typeof setTimeout> | null = null;
  private boundHandleHelpPointerEnter: (() => void) | null = null;
  private boundHandleHelpPointerLeave: (() => void) | null = null;
  private boundHandleHelpTooltipPointerEnter: (() => void) | null = null;
  private boundHandleHelpTooltipPointerLeave: (() => void) | null = null;
  private boundHandleWindowResize: (() => void) | null = null;

  constructor(app: App, opts: ReviewDiffOptions) {
    super(app);
    this.originalText = opts.originalText;
    this.onApply = opts.onApply;
    this.plugin = opts.plugin;
    this.fontSize = opts.fontSize || 14;
    this.diffGranularity = opts.diffGranularity ?? "word";
    this.initialFinalText = opts.initialFinalText ?? "";
  }

  onOpen(): void {
    this.titleEl.empty();
    const header = this.titleEl.createDiv({ cls: "merge-header" });
    this.headerEl = header;
    const brand = header.createDiv({ cls: "brand" });
    const brandIcon = brand.createSpan({ cls: "brand-icon", attr: { "aria-hidden": "true" } });
    setIcon(brandIcon, "git-merge");
    brand.createEl("span", { text: this.plugin.t("modal.brand.title") });

    const headerActions = header.createDiv({ cls: "merge-header-actions" });
    const helpBtn = headerActions.createEl("button", { cls: "merge-header-help" });
    helpBtn.type = "button";
    setIcon(helpBtn, "help-circle");
    helpBtn.removeAttribute("aria-label");
    helpBtn.removeAttribute("title");
    helpBtn.removeAttribute("data-tooltip-position");
    this.helpButtonEl = helpBtn;

    this.modalEl.addClass("hybrid-diff-modal");
    this.modalEl.addClass("merge-conflict-view");
    this.modalEl.addClass("review-diff-modal");
    this.titleEl.addClass("hybrid-diff-modal__title");
    this.contentEl.addClass("hybrid-diff-modal__content");
    this.modalEl.setCssProps({ "--hybrid-font-size": `${this.fontSize}px` });

    const container = this.contentEl.createDiv({ cls: "hybrid-diff-container" });
    const editorsContainer = container.createDiv({ cls: "hybrid-editors-container" });

    this.createPanels(editorsContainer);
    this.addActions(container);
    this.createTooltip();
    this.createHelpTooltip();
    this.registerEditorUndoRedoKeymaps();
    this.boundHandleWindowResize = () => this.syncHeaderPaddingForCloseButton();
    window.addEventListener("resize", this.boundHandleWindowResize);
    window.requestAnimationFrame(() => this.syncHeaderPaddingForCloseButton());

    this.renderAll({ immediate: true });
  }

  private syncHeaderPaddingForCloseButton(): void {
    if (!this.headerEl) {
      return;
    }

    // Reset inline overrides before measuring.
    this.headerEl.style.paddingRight = "";
    this.titleEl.style.paddingTop = "";

    const closeButton = this.modalEl.querySelector<HTMLElement>(
      "button.modal-close-button, .modal-close-button, button[aria-label='Close'], .modal-close",
    );
    if (!closeButton) {
      return;
    }

    const closeRect = closeButton.getBoundingClientRect();
    let headerRect = this.headerEl.getBoundingClientRect();

    const headerCenterY = (headerRect.top + headerRect.bottom) / 2;
    const closeCenterY = (closeRect.top + closeRect.bottom) / 2;
    const delta = closeCenterY - headerCenterY;
    const offsetY = Math.min(6, Math.max(-6, Math.round(delta)));

    if (Math.abs(offsetY) >= 1) {
      const computed = window.getComputedStyle(this.titleEl);
      const basePaddingTopRaw = Number.parseFloat(computed.paddingTop);
      const basePaddingTop = Number.isFinite(basePaddingTopRaw) ? basePaddingTopRaw : 0;
      const nextPaddingTop = Math.max(0, basePaddingTop + offsetY);
      this.titleEl.style.paddingTop = `${nextPaddingTop}px`;
      headerRect = this.headerEl.getBoundingClientRect();
    }

    const overlapsVertically = headerRect.top < closeRect.bottom && headerRect.bottom > closeRect.top;

    if (!overlapsVertically) {
      this.headerEl.style.paddingRight = "0px";
      return;
    }

    const gap = 4;
    const requiredPadding = Math.max(0, headerRect.right - closeRect.left + gap);
    this.headerEl.style.paddingRight = `${Math.ceil(requiredPadding)}px`;
  }

  private createPanels(editorsContainer: HTMLElement): void {
    const leftPanel = editorsContainer.createDiv({ cls: "hybrid-panel review" });
    const leftHeader = leftPanel.createDiv({ cls: "panel-header" });
    leftHeader.setText(this.plugin.t("modal.header.review"));

    const leftContent = leftPanel.createDiv({ cls: "panel-content" });
    const reviewViewEl = leftContent.createDiv({ cls: "review-view" });
    this.reviewViewEl = reviewViewEl;

    const rightPanel = editorsContainer.createDiv({ cls: "hybrid-panel editable final" });
    const rightHeader = rightPanel.createDiv({ cls: "panel-header" });
    rightHeader.setText(this.plugin.t("modal.header.final"));

    const rightContent = rightPanel.createDiv({ cls: "panel-content" });
    const finalEditor = rightContent.createEl("textarea", {
      cls: "hybrid-editor hybrid-editor--final final-editor",
    });
    finalEditor.value = this.initialFinalText;
    this.finalEditor = finalEditor;

    this.createFinalOverlay(rightContent);
    this.createFinalEdgeHints(rightContent);

    this.boundHandleFinalScroll = () => this.syncFinalOverlayScrollAndEdgeHints();
    finalEditor.addEventListener("scroll", this.boundHandleFinalScroll);

    this.boundHandleFinalInput = () => this.handleFinalInput();
    finalEditor.addEventListener("input", this.boundHandleFinalInput);

    this.boundHandleFinalKeyDown = (event) => this.handleFinalKeyDown(event);
    finalEditor.addEventListener("keydown", this.boundHandleFinalKeyDown, { capture: true });

    this.boundHandleReviewPointerOver = (event) => this.handleReviewPointerOver(event);
    this.boundHandleReviewPointerOut = (event) => this.handleReviewPointerOut(event);
    this.boundHandleReviewClick = (event) => this.handleReviewClick(event);

    reviewViewEl.addEventListener("pointerover", this.boundHandleReviewPointerOver);
    reviewViewEl.addEventListener("pointerout", this.boundHandleReviewPointerOut);
    reviewViewEl.addEventListener("click", this.boundHandleReviewClick);

    this.resetEditorHistory();
  }

  private createFinalOverlay(container: HTMLElement): void {
    const overlayEl = container.createDiv({ cls: "final-overlay" });
    const scrollEl = overlayEl.createDiv({ cls: "final-overlay-scroll" });
    const contentEl = scrollEl.createDiv({ cls: "final-overlay-content" });

    this.finalOverlayScrollEl = scrollEl;
    this.finalOverlayContentEl = contentEl;

    this.syncFinalOverlayStyles();
  }

  private syncFinalOverlayStyles(): void {
    if (!this.finalEditor || !this.finalOverlayScrollEl) {
      return;
    }

    const computed = window.getComputedStyle(this.finalEditor);
    this.finalOverlayScrollEl.setCssProps({
      "box-sizing": computed.boxSizing,
      padding: computed.padding,
      "font-family": computed.fontFamily,
      "font-size": computed.fontSize,
      "line-height": computed.lineHeight,
      "letter-spacing": computed.letterSpacing,
    });
  }

  private createFinalEdgeHints(container: HTMLElement): void {
    const up = container.createDiv({
      cls: "final-edge-hint",
      attr: { "data-direction": "up", "aria-hidden": "true" },
    });
    up.setText("↑");

    const down = container.createDiv({
      cls: "final-edge-hint",
      attr: { "data-direction": "down", "aria-hidden": "true" },
    });
    down.setText("↓");

    this.finalEdgeHintUpEl = up;
    this.finalEdgeHintDownEl = down;
    this.setFinalEdgeHintsVisible(false, false);
  }

  private setFinalEdgeHintsVisible(showUp: boolean, showDown: boolean): void {
    if (this.finalEdgeHintUpEl) {
      this.finalEdgeHintUpEl.toggleClass("is-visible", showUp);
    }
    if (this.finalEdgeHintDownEl) {
      this.finalEdgeHintDownEl.toggleClass("is-visible", showDown);
    }
  }

  private createTooltip(): void {
    const tooltip = document.createElement("div");
    tooltip.className = "review-tooltip";
    tooltip.toggleClass("is-visible", false);
    const content = document.createElement("div");
    content.className = "review-tooltip-content";
    tooltip.appendChild(content);
    document.body.appendChild(tooltip);

    this.tooltipEl = tooltip;
    this.tooltipContentEl = content;

    this.boundHandleTooltipPointerEnter = () => this.cancelHideTooltip();
    this.boundHandleTooltipPointerLeave = () => this.scheduleHideTooltip();
    tooltip.addEventListener("pointerenter", this.boundHandleTooltipPointerEnter);
    tooltip.addEventListener("pointerleave", this.boundHandleTooltipPointerLeave);
  }

  private createHelpTooltip(): void {
    if (!this.helpButtonEl) {
      return;
    }

    const tooltip = document.createElement("div");
    tooltip.className = "help-tooltip";
    tooltip.toggleClass("is-visible", false);
    const content = document.createElement("div");
    content.className = "help-tooltip-content";
    tooltip.appendChild(content);
    document.body.appendChild(tooltip);

    this.helpTooltipEl = tooltip;
    this.helpTooltipContentEl = content;
    this.renderHelpTooltipContent();

    this.boundHandleHelpPointerEnter = () => this.showHelpTooltip();
    this.boundHandleHelpPointerLeave = () => this.scheduleHideHelpTooltip();
    this.helpButtonEl.addEventListener("pointerenter", this.boundHandleHelpPointerEnter);
    this.helpButtonEl.addEventListener("pointerleave", this.boundHandleHelpPointerLeave);

    this.boundHandleHelpTooltipPointerEnter = () => this.cancelHideHelpTooltip();
    this.boundHandleHelpTooltipPointerLeave = () => this.scheduleHideHelpTooltip();
    tooltip.addEventListener("pointerenter", this.boundHandleHelpTooltipPointerEnter);
    tooltip.addEventListener("pointerleave", this.boundHandleHelpTooltipPointerLeave);
  }

  private renderHelpTooltipContent(): void {
    if (!this.helpTooltipContentEl) {
      return;
    }

    const container = this.helpTooltipContentEl;
    container.empty();

    const createSection = (title: string, hint: string): void => {
      const section = container.createDiv({ cls: "help-tooltip-section" });
      section.createDiv({ cls: "help-tooltip-section-title", text: title });

      const list = section.createEl("ul", { cls: "help-tooltip-section-list" });
      const items = hint
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      for (const item of items) {
        list.createEl("li", { text: item });
      }
    };

    createSection(this.plugin.t("modal.header.review"), this.plugin.t("modal.header.reviewHint"));
    createSection(this.plugin.t("modal.header.final"), this.plugin.t("modal.header.finalHint"));
    createSection(this.plugin.t("modal.help.controlsTitle"), this.plugin.t("modal.help.controlsHint"));
  }

  private showHelpTooltip(): void {
    if (!this.helpTooltipEl || !this.helpButtonEl) {
      return;
    }

    this.hideTooltip();
    this.cancelHideHelpTooltip();
    this.helpTooltipEl.toggleClass("is-visible", true);

    const rect = this.helpButtonEl.getBoundingClientRect();
    const tooltipRect = this.helpTooltipEl.getBoundingClientRect();
    const gap = 8;

    let left = rect.right - tooltipRect.width;
    let top = rect.bottom + gap;

    const maxLeft = window.innerWidth - tooltipRect.width - 8;
    const maxTop = window.innerHeight - tooltipRect.height - 8;

    left = Math.max(8, Math.min(maxLeft, left));
    top = Math.max(8, Math.min(maxTop, top));

    if (rect.bottom + gap + tooltipRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - gap - tooltipRect.height);
    }

    this.helpTooltipEl.style.left = `${left}px`;
    this.helpTooltipEl.style.top = `${top}px`;
  }

  private scheduleHideHelpTooltip(): void {
    if (!this.helpTooltipEl) {
      return;
    }
    if (this.helpTooltipHideTimer) {
      clearTimeout(this.helpTooltipHideTimer);
    }
    this.helpTooltipHideTimer = setTimeout(() => {
      this.helpTooltipHideTimer = null;
      this.hideHelpTooltip();
    }, 120);
  }

  private cancelHideHelpTooltip(): void {
    if (this.helpTooltipHideTimer) {
      clearTimeout(this.helpTooltipHideTimer);
      this.helpTooltipHideTimer = null;
    }
  }

  private hideHelpTooltip(): void {
    if (!this.helpTooltipEl) {
      return;
    }
    this.helpTooltipEl.toggleClass("is-visible", false);
  }

  private handleFinalInput(): void {
    if (!this.applyingHistory) {
      this.pushEditorHistory();
    }
    this.markFinalContentChanged({ immediateRender: false });
  }

  private registerEditorUndoRedoKeymaps(): void {
    const register = (
      modifiers: ["Mod"] | ["Mod", "Shift"],
      key: "z" | "y",
      action: "undo" | "redo"
    ) =>
      this.scope.register(modifiers, key, () => this.handleUndoRedoOnFinalEditor(action));

    this.scopeHandlers.push(register(["Mod"], "z", "undo"));
    this.scopeHandlers.push(register(["Mod", "Shift"], "z", "redo"));
    this.scopeHandlers.push(register(["Mod"], "y", "redo"));
  }

  private handleUndoRedoOnFinalEditor(action: "undo" | "redo"): false | void {
    if (!this.finalEditor || document.activeElement !== this.finalEditor) {
      return;
    }

    const changed = action === "undo" ? this.undoHistory() : this.redoHistory();
    if (!changed) {
      return false;
    }
    return false;
  }

  private handleFinalKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    if (!this.finalEditor || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) {
      return;
    }

    const key = event.key.toLowerCase();
    const isUndo = key === "z" && !event.shiftKey;
    const isRedo = key === "y" || (key === "z" && event.shiftKey);
    if (!isUndo && !isRedo) {
      return;
    }

    const changed = isUndo ? this.undoHistory() : this.redoHistory();
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    if (!changed) {
      return;
    }
  }

  private resetEditorHistory(): void {
    this.historyStack = [];
    this.historyIndex = -1;
    this.pushEditorHistory();
  }

  private getCurrentEditorSnapshot(): EditorSnapshot | null {
    if (!this.finalEditor) {
      return null;
    }

    return {
      value: this.finalEditor.value ?? "",
      selectionStart: this.finalEditor.selectionStart ?? 0,
      selectionEnd: this.finalEditor.selectionEnd ?? 0,
    };
  }

  private pushEditorHistory(): void {
    const snapshot = this.getCurrentEditorSnapshot();
    if (!snapshot) {
      return;
    }

    const current = this.historyStack[this.historyIndex];
    if (
      current &&
      current.value === snapshot.value &&
      current.selectionStart === snapshot.selectionStart &&
      current.selectionEnd === snapshot.selectionEnd
    ) {
      return;
    }

    if (this.historyIndex < this.historyStack.length - 1) {
      this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
    }

    this.historyStack.push(snapshot);
    this.historyIndex = this.historyStack.length - 1;

    const maxHistory = 300;
    if (this.historyStack.length > maxHistory) {
      const trim = this.historyStack.length - maxHistory;
      this.historyStack.splice(0, trim);
      this.historyIndex = Math.max(0, this.historyIndex - trim);
    }
  }

  private applyEditorSnapshot(snapshot: EditorSnapshot): void {
    if (!this.finalEditor) {
      return;
    }

    this.applyingHistory = true;
    this.finalEditor.value = snapshot.value;
    this.finalEditor.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    this.finalEditor.focus();
    this.applyingHistory = false;

    this.markFinalContentChanged({ immediateRender: true });
  }

  private undoHistory(): boolean {
    if (this.historyIndex <= 0) {
      return false;
    }

    this.historyIndex -= 1;
    const snapshot = this.historyStack[this.historyIndex];
    if (!snapshot) {
      return false;
    }

    this.applyEditorSnapshot(snapshot);
    return true;
  }

  private redoHistory(): boolean {
    if (this.historyIndex < 0 || this.historyIndex >= this.historyStack.length - 1) {
      return false;
    }

    this.historyIndex += 1;
    const snapshot = this.historyStack[this.historyIndex];
    if (!snapshot) {
      return false;
    }

    this.applyEditorSnapshot(snapshot);
    return true;
  }

  private markFinalContentChanged(opts: { immediateRender: boolean }): void {
    this.revisionId += 1;
    this.clearArmedTarget();

    if (opts.immediateRender) {
      this.renderAll({ immediate: true });
      return;
    }

    this.queueRecompute();
  }

  private queueRecompute(): void {
    if (this.inputDebounceTimer) {
      clearTimeout(this.inputDebounceTimer);
    }
    this.inputDebounceTimer = setTimeout(() => {
      this.inputDebounceTimer = null;
      this.renderAll({ immediate: true });
    }, 200);
  }

  private renderAll({ immediate }: { immediate: boolean }): void {
    if (!this.finalEditor) {
      return;
    }

    if (immediate && this.inputDebounceTimer) {
      clearTimeout(this.inputDebounceTimer);
      this.inputDebounceTimer = null;
    }

    this.renderReview();
    this.renderFinalOverlayContent({ anchorIndex: this.getHoverAnchorIndex() });
    this.syncFinalOverlayScrollAndEdgeHints();
  }

  private renderReview(): void {
    if (!this.reviewViewEl || !this.finalEditor) {
      return;
    }

    const finalText = this.finalEditor.value ?? "";
    const ops = computeReviewOps(this.originalText, finalText, this.diffGranularity);

    this.reviewViewEl.textContent = "";
    const frag = document.createDocumentFragment();

    for (const op of ops) {
      if (op.kind === "equal") {
        frag.appendChild(document.createTextNode(op.text));
        continue;
      }

      if (op.kind === "change") {
        const span = document.createElement("span");
        span.className = "review-change";
        span.dataset.kind = "change";
        span.dataset.changeType = op.changeType;
        span.dataset.finalStart = String(op.finalStart);
        span.dataset.finalEnd = String(op.finalEnd);
        span.dataset.originalText = op.originalText;
        span.textContent = op.finalText;
        frag.appendChild(span);
        continue;
      }

      const span = document.createElement("span");
      span.className = "review-delete";
      span.dataset.kind = "delete";
      span.dataset.finalPos = String(op.finalPos);
      span.dataset.originalText = op.originalText;
      span.textContent = op.originalText.length > 0 ? op.originalText : " ";
      frag.appendChild(span);
    }

    this.reviewViewEl.appendChild(frag);
    this.clearHoverAndTooltip();
  }

  private getClosestReviewTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }
    return target.closest<HTMLElement>(".review-change, .review-delete");
  }

  private parseReviewTarget(el: HTMLElement): ReviewTarget | null {
    const kind = el.dataset.kind;
    const originalText = el.dataset.originalText ?? "";

    if (kind === "change") {
      const start = Number.parseInt(el.dataset.finalStart ?? "", 10);
      const end = Number.parseInt(el.dataset.finalEnd ?? "", 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
        return null;
      }
      return { kind: "change", start, end, originalText };
    }

    if (kind === "delete") {
      const pos = Number.parseInt(el.dataset.finalPos ?? "", 10);
      if (!Number.isFinite(pos) || pos < 0) {
        return null;
      }
      return { kind: "delete", pos, originalText };
    }

    return null;
  }

  private isSameTarget(a: ReviewTarget, b: ReviewTarget): boolean {
    if (a.kind !== b.kind) {
      return false;
    }
    if (a.kind === "change" && b.kind === "change") {
      return a.start === b.start && a.end === b.end;
    }
    if (a.kind === "delete" && b.kind === "delete") {
      return a.pos === b.pos;
    }
    return false;
  }

  private getTargetAnchorIndex(target: ReviewTarget): number {
    return target.kind === "delete" ? target.pos : target.start;
  }

  private handleReviewPointerOver(event: PointerEvent): void {
    const el = this.getClosestReviewTarget(event.target);
    if (!el) {
      return;
    }

    this.tooltipActiveTarget = el;
    this.showTooltipForReviewTarget(el);

    const target = this.parseReviewTarget(el);
    if (target) {
      this.setHoverFromTarget(target);
    }
  }

  private handleReviewPointerOut(event: PointerEvent): void {
    if (!this.tooltipActiveTarget) {
      return;
    }

    const related = event.relatedTarget;
    if (related instanceof Node && this.tooltipActiveTarget.contains(related)) {
      return;
    }

    const toEl = this.getClosestReviewTarget(related);
    if (toEl && toEl === this.tooltipActiveTarget) {
      return;
    }

    this.scheduleHideTooltip();
    this.clearHover();
  }

  private handleReviewClick(event: MouseEvent): void {
    const el = this.getClosestReviewTarget(event.target);
    if (!el || !this.finalEditor) {
      return;
    }

    const target = this.parseReviewTarget(el);
    if (!target) {
      return;
    }

    event.preventDefault();
    this.setHoverFromTarget(target);

    const inViewport = this.isTargetInViewport(target);
    if (inViewport) {
      this.clearArmedTarget();
      this.injectTarget(target);
      return;
    }

    const isArmedForSameTarget =
      this.armedInjectionTarget &&
      this.armedInjectionTarget.revisionId === this.revisionId &&
      this.isSameTarget(this.armedInjectionTarget.target, target);

    if (isArmedForSameTarget) {
      this.clearArmedTarget();
      this.injectTarget(target);
      return;
    }

    this.setArmedTarget(target, el);
    this.scrollAndFlashTarget(target);
  }

  private setArmedTarget(target: ReviewTarget, el: HTMLElement): void {
    this.clearArmedTarget();
    this.armedInjectionTarget = {
      target,
      revisionId: this.revisionId,
    };
    this.armedTargetElement = el;
    this.armedTargetElement.classList.add("is-armed");
  }

  private clearArmedTarget(): void {
    this.armedInjectionTarget = null;
    if (this.armedTargetElement) {
      this.armedTargetElement.classList.remove("is-armed");
      this.armedTargetElement = null;
    }
  }

  private setHoverFromTarget(target: ReviewTarget): void {
    if (target.kind === "change") {
      this.hoverState = { kind: "change", start: target.start, end: target.end };
      this.renderFinalOverlayContent({ anchorIndex: target.start });
      this.syncFinalOverlayScrollAndEdgeHints();
      return;
    }

    this.hoverState = { kind: "delete", pos: target.pos };
    this.renderFinalOverlayContent({ anchorIndex: target.pos });
    this.syncFinalOverlayScrollAndEdgeHints();
  }

  private isTargetInViewport(target: ReviewTarget): boolean {
    if (!this.finalEditor) {
      return true;
    }

    const anchorIndex = this.getTargetAnchorIndex(target);
    this.renderFinalOverlayContent({ anchorIndex });
    this.syncFinalOverlayScrollAndEdgeHints();

    if (!this.finalOverlayAnchorEl) {
      return true;
    }

    const anchorTop = this.finalOverlayAnchorEl.offsetTop;
    const viewportTop = this.finalEditor.scrollTop;
    const viewportBottom = viewportTop + this.finalEditor.clientHeight;
    return anchorTop >= viewportTop + 1 && anchorTop <= viewportBottom - 1;
  }

  private scrollAndFlashTarget(target: ReviewTarget): void {
    if (target.kind === "change") {
      this.flashInjectedRange(target.start, target.end);
      this.scrollFinalToIndex(target.start);
      return;
    }

    this.flashInjectedRange(target.pos, target.pos);
    this.scrollFinalToIndex(target.pos);
  }

  private injectTarget(target: ReviewTarget): void {
    if (!this.finalEditor) {
      return;
    }

    const currentValue = this.finalEditor.value ?? "";
    const startRaw = target.kind === "delete" ? target.pos : target.start;
    const endRaw = target.kind === "delete" ? target.pos : target.end;
    const replacement = target.originalText;

    const start = Math.max(0, Math.min(startRaw, currentValue.length));
    const end = Math.max(start, Math.min(endRaw, currentValue.length));
    const nextValue = currentValue.slice(0, start) + replacement + currentValue.slice(end);

    this.finalEditor.value = nextValue;
    const caret = start + replacement.length;
    this.finalEditor.setSelectionRange(caret, caret);
    this.finalEditor.focus();
    this.pushEditorHistory();

    this.flashInjectedRange(start, caret);
    this.scrollFinalToIndex(start);
    this.markFinalContentChanged({ immediateRender: true });
  }

  private getHoverAnchorIndex(): number | null {
    if (!this.hoverState) {
      return null;
    }
    return this.hoverState.kind === "delete" ? this.hoverState.pos : this.hoverState.start;
  }

  private renderFinalOverlayContent(opts: { anchorIndex: number | null }): void {
    if (!this.finalEditor || !this.finalOverlayContentEl) {
      return;
    }

    const value = this.finalEditor.value ?? "";
    const hoverRange =
      this.hoverState?.kind === "change"
        ? { start: this.hoverState.start, end: this.hoverState.end }
        : null;
    const hoverCaret = this.hoverState?.kind === "delete" ? this.hoverState.pos : null;
    const flash = this.flashRange;

    const anchorIndexRaw =
      opts.anchorIndex ?? (flash ? flash.start : hoverCaret ?? hoverRange?.start ?? null);
    const anchorIndex =
      anchorIndexRaw === null ? null : Math.max(0, Math.min(anchorIndexRaw, value.length));

    const cutPoints = new Set<number>([0, value.length]);
    if (hoverRange) {
      cutPoints.add(Math.max(0, Math.min(hoverRange.start, value.length)));
      cutPoints.add(Math.max(0, Math.min(hoverRange.end, value.length)));
    }
    if (flash) {
      cutPoints.add(Math.max(0, Math.min(flash.start, value.length)));
      cutPoints.add(Math.max(0, Math.min(flash.end, value.length)));
    }
    if (anchorIndex !== null) {
      cutPoints.add(anchorIndex);
    }
    if (hoverCaret !== null) {
      cutPoints.add(Math.max(0, Math.min(hoverCaret, value.length)));
    }

    const points = Array.from(cutPoints).sort((a, b) => a - b);

    this.finalOverlayContentEl.textContent = "";
    this.finalOverlayAnchorEl = null;

    const frag = document.createDocumentFragment();

    const appendAnchorIfNeeded = (pos: number) => {
      if (anchorIndex === null || pos !== anchorIndex || this.finalOverlayAnchorEl) {
        return;
      }
      const anchor = document.createElement("span");
      anchor.className = "final-anchor";
      anchor.dataset.anchor = "true";
      frag.appendChild(anchor);
      this.finalOverlayAnchorEl = anchor;
    };

    const appendCaretIfNeeded = (pos: number) => {
      if (hoverCaret === null || pos !== hoverCaret) {
        return;
      }
      const caret = document.createElement("span");
      caret.className = "final-caret";
      frag.appendChild(caret);
    };

    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i];
      const end = points[i + 1];

      appendAnchorIfNeeded(start);
      appendCaretIfNeeded(start);

      if (end <= start) {
        continue;
      }

      const text = value.slice(start, end);
      if (text.length === 0) {
        continue;
      }

      const inFlash = flash ? start >= flash.start && end <= flash.end : false;
      const inHover = hoverRange ? start >= hoverRange.start && end <= hoverRange.end : false;

      if (inFlash) {
        const span = document.createElement("span");
        span.className = "final-flash";
        span.textContent = text;
        frag.appendChild(span);
      } else if (inHover) {
        const span = document.createElement("span");
        span.className = "final-hover";
        span.textContent = text;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(text));
      }
    }

    const lastPoint = points[points.length - 1];
    appendAnchorIfNeeded(lastPoint);
    appendCaretIfNeeded(lastPoint);

    this.finalOverlayContentEl.appendChild(frag);
  }

  private syncFinalOverlayScrollAndEdgeHints(): void {
    if (!this.finalEditor || !this.finalOverlayScrollEl) {
      return;
    }

    this.finalOverlayScrollEl.scrollTop = this.finalEditor.scrollTop;
    this.finalOverlayScrollEl.scrollLeft = this.finalEditor.scrollLeft;
    this.updateEdgeHintsFromAnchor();
  }

  private updateEdgeHintsFromAnchor(): void {
    if (!this.finalEditor || !this.finalOverlayAnchorEl || !this.hoverState) {
      this.setFinalEdgeHintsVisible(false, false);
      return;
    }

    const anchorTop = this.finalOverlayAnchorEl.offsetTop;
    const viewportTop = this.finalEditor.scrollTop;
    const viewportBottom = viewportTop + this.finalEditor.clientHeight;

    const showUp = anchorTop < viewportTop + 1;
    const showDown = anchorTop > viewportBottom - 1;
    this.setFinalEdgeHintsVisible(showUp, showDown);
  }

  private scrollFinalToIndex(index: number): void {
    if (!this.finalEditor) {
      return;
    }

    if (this.pendingScrollFrame !== null) {
      window.cancelAnimationFrame(this.pendingScrollFrame);
      this.pendingScrollFrame = null;
    }

    this.renderFinalOverlayContent({ anchorIndex: index });
    this.syncFinalOverlayScrollAndEdgeHints();

    this.pendingScrollFrame = window.requestAnimationFrame(() => {
      this.pendingScrollFrame = null;
      if (!this.finalEditor || !this.finalOverlayAnchorEl) {
        return;
      }

      const anchorTop = this.finalOverlayAnchorEl.offsetTop;
      const targetScrollTop = Math.max(0, anchorTop - this.finalEditor.clientHeight * 0.35);
      const maxScrollTop = Math.max(0, this.finalEditor.scrollHeight - this.finalEditor.clientHeight);

      this.finalEditor.scrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));
      this.syncFinalOverlayScrollAndEdgeHints();
    });
  }

  private flashInjectedRange(start: number, end: number): void {
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }

    this.flashRange =
      start === end ? { start, end, kind: "caret" } : { start, end, kind: "range" };
    this.renderFinalOverlayContent({ anchorIndex: start });
    this.syncFinalOverlayScrollAndEdgeHints();

    this.flashTimer = setTimeout(() => {
      this.flashRange = null;
      this.flashTimer = null;
      this.renderFinalOverlayContent({ anchorIndex: this.getHoverAnchorIndex() });
      this.syncFinalOverlayScrollAndEdgeHints();
    }, 650);
  }

  private clearHover(): void {
    this.hoverState = null;
    this.renderFinalOverlayContent({ anchorIndex: null });
    this.setFinalEdgeHintsVisible(false, false);
  }

  private clearHoverAndTooltip(): void {
    this.clearHover();
    this.hideTooltip();
  }

  private showTooltipForReviewTarget(target: HTMLElement): void {
    if (!this.tooltipEl || !this.tooltipContentEl) {
      return;
    }

    this.hideHelpTooltip();
    this.cancelHideTooltip();

    const kind = target.dataset.kind ?? "";
    const changeType = target.dataset.changeType ?? "";
    if (kind === "delete" || (kind === "change" && changeType === "insert")) {
      this.tooltipEl.toggleClass("is-visible", false);
      return;
    }

    const originalText = target.dataset.originalText ?? "";
    const originalBody =
      originalText.length > 0 ? originalText : this.plugin.t("modal.tooltip.originalEmpty");
    const prefix = this.plugin.t("modal.tooltip.originalPrefix");
    this.tooltipContentEl.textContent = `${prefix}\n${originalBody}`;

    this.tooltipEl.toggleClass("is-visible", true);

    const rect = target.getBoundingClientRect();
    const tooltipRect = this.tooltipEl.getBoundingClientRect();
    const gap = 8;

    let left = rect.left;
    let top = rect.bottom + gap;

    const maxLeft = window.innerWidth - tooltipRect.width - 8;
    const maxTop = window.innerHeight - tooltipRect.height - 8;

    left = Math.max(8, Math.min(maxLeft, left));
    top = Math.max(8, Math.min(maxTop, top));

    if (rect.bottom + gap + tooltipRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - gap - tooltipRect.height);
    }

    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${top}px`;
  }

  private scheduleHideTooltip(): void {
    if (!this.tooltipEl) {
      return;
    }
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
    }
    this.tooltipHideTimer = setTimeout(() => {
      this.tooltipHideTimer = null;
      this.hideTooltip();
    }, 120);
  }

  private cancelHideTooltip(): void {
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
  }

  private hideTooltip(): void {
    if (!this.tooltipEl) {
      return;
    }
    this.tooltipEl.toggleClass("is-visible", false);
    this.tooltipActiveTarget = null;
  }

  private addActions(container: HTMLElement): void {
    const footer = container.createEl("footer");
    const leftSection = footer.createDiv({ cls: "footer-section" });
    const rightSection = footer.createDiv({ cls: "footer-section" });

    const segment = leftSection.createDiv({ cls: "segmented-control" });
    const createGranularityBtn = (
      mode: DiffGranularityMode,
      labelKey: Parameters<DiffApplyPlugin["t"]>[0]
    ) => {
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

    const cancelBtn = rightSection.createEl("button", { cls: "btn btn-secondary hybrid-cancel-btn" });
    cancelBtn.type = "button";
    cancelBtn.setAttribute("aria-label", this.plugin.t("modal.action.cancel"));
    cancelBtn.setAttribute("title", this.plugin.t("modal.action.cancel"));
    const cancelIcon = cancelBtn.createSpan({ cls: "btn-icon", attr: { "aria-hidden": "true" } });
    setIcon(cancelIcon, "x");
    cancelBtn.createSpan({ cls: "btn-label", text: this.plugin.t("modal.action.cancel") });

    const applyBtn = rightSection.createEl("button", {
      cls: "btn btn-primary hybrid-apply-btn",
    });
    applyBtn.type = "button";
    applyBtn.setAttribute("aria-label", this.plugin.t("modal.action.apply"));
    applyBtn.setAttribute("title", this.plugin.t("modal.action.apply"));
    const applyIcon = applyBtn.createSpan({ cls: "btn-icon", attr: { "aria-hidden": "true" } });
    setIcon(applyIcon, "check");
    applyBtn.createSpan({ cls: "btn-label", text: this.plugin.t("modal.action.apply") });

    cancelBtn.addEventListener("click", () => this.close());
    applyBtn.addEventListener("click", () => {
      if (!this.finalEditor) {
        return;
      }
      this.onApply(this.finalEditor.value);
      this.close();
    });

    decreaseBtn.addEventListener("click", () => this.updateFontSize(Math.max(10, this.fontSize - 1)));
    increaseBtn.addEventListener("click", () => this.updateFontSize(Math.min(24, this.fontSize + 1)));
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
    this.clearArmedTarget();
    this.renderAll({ immediate: true });

    this.plugin.ui.diffGranularity = mode;
    void this.plugin.saveUiState();
  }

  private updateFontSize(newSize: number): void {
    if (newSize === this.fontSize) {
      return;
    }

    this.fontSize = newSize;
    this.modalEl.setCssProps({ "--hybrid-font-size": `${this.fontSize}px` });
    if (this.fontDisplayEl) {
      this.fontDisplayEl.style.fontSize = `${this.fontSize}px`;
      this.fontDisplayEl.setAttribute("title", `${this.fontSize}px`);
    }

    this.plugin.ui.fontSize = this.fontSize;
    void this.plugin.saveUiState();

    this.syncFinalOverlayStyles();
    this.renderAll({ immediate: true });
  }

  onClose(): void {
    this.clearArmedTarget();
    this.cancelHideHelpTooltip();

    if (this.boundHandleWindowResize) {
      window.removeEventListener("resize", this.boundHandleWindowResize);
      this.boundHandleWindowResize = null;
    }

    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    if (this.pendingScrollFrame !== null) {
      window.cancelAnimationFrame(this.pendingScrollFrame);
      this.pendingScrollFrame = null;
    }
    if (this.inputDebounceTimer) {
      clearTimeout(this.inputDebounceTimer);
      this.inputDebounceTimer = null;
    }
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    if (this.helpTooltipHideTimer) {
      clearTimeout(this.helpTooltipHideTimer);
      this.helpTooltipHideTimer = null;
    }

    if (this.finalEditor && this.boundHandleFinalScroll) {
      this.finalEditor.removeEventListener("scroll", this.boundHandleFinalScroll);
    }
    if (this.finalEditor && this.boundHandleFinalInput) {
      this.finalEditor.removeEventListener("input", this.boundHandleFinalInput);
    }
    if (this.finalEditor && this.boundHandleFinalKeyDown) {
      this.finalEditor.removeEventListener("keydown", this.boundHandleFinalKeyDown, { capture: true });
    }
    for (const handler of this.scopeHandlers) {
      this.scope.unregister(handler);
    }
    this.scopeHandlers = [];
    if (this.reviewViewEl && this.boundHandleReviewPointerOver) {
      this.reviewViewEl.removeEventListener("pointerover", this.boundHandleReviewPointerOver);
    }
    if (this.reviewViewEl && this.boundHandleReviewPointerOut) {
      this.reviewViewEl.removeEventListener("pointerout", this.boundHandleReviewPointerOut);
    }
    if (this.reviewViewEl && this.boundHandleReviewClick) {
      this.reviewViewEl.removeEventListener("click", this.boundHandleReviewClick);
    }

    if (this.tooltipEl) {
      if (this.boundHandleTooltipPointerEnter) {
        this.tooltipEl.removeEventListener("pointerenter", this.boundHandleTooltipPointerEnter);
      }
      if (this.boundHandleTooltipPointerLeave) {
        this.tooltipEl.removeEventListener("pointerleave", this.boundHandleTooltipPointerLeave);
      }
      this.tooltipEl.remove();
      this.tooltipEl = null;
      this.tooltipContentEl = null;
    }

    if (this.helpButtonEl) {
      if (this.boundHandleHelpPointerEnter) {
        this.helpButtonEl.removeEventListener("pointerenter", this.boundHandleHelpPointerEnter);
      }
      if (this.boundHandleHelpPointerLeave) {
        this.helpButtonEl.removeEventListener("pointerleave", this.boundHandleHelpPointerLeave);
      }
      this.helpButtonEl = null;
    }
    if (this.helpTooltipEl) {
      if (this.boundHandleHelpTooltipPointerEnter) {
        this.helpTooltipEl.removeEventListener("pointerenter", this.boundHandleHelpTooltipPointerEnter);
      }
      if (this.boundHandleHelpTooltipPointerLeave) {
        this.helpTooltipEl.removeEventListener("pointerleave", this.boundHandleHelpTooltipPointerLeave);
      }
      this.helpTooltipEl.remove();
      this.helpTooltipEl = null;
      this.helpTooltipContentEl = null;
    }

    this.headerEl = null;
    this.contentEl.empty();
  }
}
