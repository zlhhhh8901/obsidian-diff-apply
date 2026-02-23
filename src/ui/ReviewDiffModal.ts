import { App, Modal, Notice, setIcon } from "obsidian";
import type DiffApplyPlugin from "../main";
import type { DiffGranularityMode } from "../main";
import { computeReviewOps } from "../utils/reviewDiff";

type FlashRange = { start: number; end: number; kind: "range" | "caret" };

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

  private fontSize: number;
  private diffGranularity: DiffGranularityMode;

  private reviewViewEl: HTMLDivElement | null = null;
  private finalEditor: HTMLTextAreaElement | null = null;

  private tooltipEl: HTMLDivElement | null = null;
  private tooltipContentEl: HTMLDivElement | null = null;
  private tooltipActiveTarget: HTMLElement | null = null;
  private tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

  private finalOverlayEl: HTMLDivElement | null = null;
  private finalOverlayScrollEl: HTMLDivElement | null = null;
  private finalOverlayContentEl: HTMLDivElement | null = null;
  private finalOverlayAnchorEl: HTMLSpanElement | null = null;

  private finalEdgeHintUpEl: HTMLDivElement | null = null;
  private finalEdgeHintDownEl: HTMLDivElement | null = null;

  private hoverState:
    | { kind: "change"; start: number; end: number }
    | { kind: "delete"; pos: number }
    | null = null;

  private flashRange: FlashRange | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  private pendingScrollFrame: number | null = null;

  private inputDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private snackbarEl: HTMLDivElement | null = null;
  private snackbarTextEl: HTMLSpanElement | null = null;
  private snackbarUndoBtn: HTMLButtonElement | null = null;
  private snackbarTimer: ReturnType<typeof setTimeout> | null = null;

  private lastUndo:
    | {
        beforeValue: string;
        beforeSelectionStart: number;
        beforeSelectionEnd: number;
        beforeScrollTop: number;
        beforeScrollLeft: number;
        afterValue: string;
      }
    | null = null;

  private fontDisplayEl: HTMLSpanElement | null = null;
  private diffGranularityBtnEls: Partial<Record<DiffGranularityMode, HTMLButtonElement>> = {};

  private boundHandleFinalScroll: (() => void) | null = null;
  private boundHandleFinalInput: (() => void) | null = null;
  private boundHandleReviewPointerOver: ((event: PointerEvent) => void) | null = null;
  private boundHandleReviewPointerOut: ((event: PointerEvent) => void) | null = null;
  private boundHandleReviewClick: ((event: MouseEvent) => void) | null = null;
  private boundHandleTooltipPointerEnter: (() => void) | null = null;
  private boundHandleTooltipPointerLeave: (() => void) | null = null;

  constructor(app: App, opts: ReviewDiffOptions) {
    super(app);
    this.originalText = opts.originalText;
    this.onApply = opts.onApply;
    this.plugin = opts.plugin;
    this.fontSize = opts.fontSize || 14;
    this.diffGranularity = opts.diffGranularity ?? "word";

    const initial = opts.initialFinalText ?? "";
    this.initialFinalText = initial;
  }

  private initialFinalText: string;

  onOpen(): void {
    this.titleEl.empty();
    const header = this.titleEl.createDiv({ cls: "merge-header" });
    const brand = header.createDiv({ cls: "brand" });
    const brandIcon = brand.createSpan({ cls: "brand-icon", attr: { "aria-hidden": "true" } });
    setIcon(brandIcon, "git-merge");
    brand.createEl("span", { text: "Merge conflict resolver" });

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
    this.createSnackbar();

    this.renderAll({ immediate: true });
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

    this.boundHandleFinalInput = () => this.queueRecompute();
    finalEditor.addEventListener("input", this.boundHandleFinalInput);

    this.boundHandleReviewPointerOver = (event) => this.handleReviewPointerOver(event);
    this.boundHandleReviewPointerOut = (event) => this.handleReviewPointerOut(event);
    this.boundHandleReviewClick = (event) => this.handleReviewClick(event);

    reviewViewEl.addEventListener("pointerover", this.boundHandleReviewPointerOver);
    reviewViewEl.addEventListener("pointerout", this.boundHandleReviewPointerOut);
    reviewViewEl.addEventListener("click", this.boundHandleReviewClick);
  }

  private createFinalOverlay(container: HTMLElement): void {
    const overlayEl = container.createDiv({ cls: "final-overlay" });
    const scrollEl = overlayEl.createDiv({ cls: "final-overlay-scroll" });
    const contentEl = scrollEl.createDiv({ cls: "final-overlay-content" });

    this.finalOverlayEl = overlayEl;
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
        span.dataset.finalStart = String(op.finalStart);
        span.dataset.finalEnd = String(op.finalEnd);
        span.dataset.originalText = op.originalText;
        span.dataset.changeType = op.changeType;
        span.textContent = op.finalText;
        frag.appendChild(span);
        continue;
      }

      const span = document.createElement("span");
      span.className = "review-delete";
      span.dataset.kind = "delete";
      span.dataset.finalPos = String(op.finalPos);
      span.dataset.originalText = op.originalText;
      span.textContent = "\u00a0";
      frag.appendChild(span);
    }

    this.reviewViewEl.appendChild(frag);
    this.clearHoverAndTooltip();
  }

  private getClosestReviewTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }
    const el = target.closest<HTMLElement>(".review-change, .review-delete");
    return el ?? null;
  }

  private handleReviewPointerOver(event: PointerEvent): void {
    const el = this.getClosestReviewTarget(event.target);
    if (!el) {
      return;
    }

    this.tooltipActiveTarget = el;
    this.showTooltipForReviewTarget(el);
    this.setHoverFromReviewTarget(el);
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

    event.preventDefault();

    const beforeValue = this.finalEditor.value ?? "";
    const beforeSelectionStart = this.finalEditor.selectionStart ?? 0;
    const beforeSelectionEnd = this.finalEditor.selectionEnd ?? 0;
    const beforeScrollTop = this.finalEditor.scrollTop;
    const beforeScrollLeft = this.finalEditor.scrollLeft;

    const kind = el.dataset.kind;
    if (kind === "change") {
      const start = Number.parseInt(el.dataset.finalStart ?? "", 10);
      const end = Number.parseInt(el.dataset.finalEnd ?? "", 10);
      const originalText = el.dataset.originalText ?? "";
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
        return;
      }
      this.applyInjection({ start, end, replacement: originalText });
    } else if (kind === "delete") {
      const pos = Number.parseInt(el.dataset.finalPos ?? "", 10);
      const originalText = el.dataset.originalText ?? "";
      if (!Number.isFinite(pos) || pos < 0) {
        return;
      }
      this.applyInjection({ start: pos, end: pos, replacement: originalText });
    } else {
      return;
    }

    const afterValue = this.finalEditor.value ?? "";
    this.lastUndo = {
      beforeValue,
      beforeSelectionStart,
      beforeSelectionEnd,
      beforeScrollTop,
      beforeScrollLeft,
      afterValue,
    };

    this.showUndoSnackbar();
    this.renderAll({ immediate: true });
  }

  private applyInjection(opts: { start: number; end: number; replacement: string }): void {
    if (!this.finalEditor) {
      return;
    }

    const value = this.finalEditor.value ?? "";
    const safeStart = Math.max(0, Math.min(opts.start, value.length));
    const safeEnd = Math.max(safeStart, Math.min(opts.end, value.length));

    const before = value.slice(0, safeStart);
    const after = value.slice(safeEnd);
    const nextValue = before + opts.replacement + after;
    this.finalEditor.value = nextValue;

    const insertStart = before.length;
    const insertEnd = insertStart + opts.replacement.length;

    this.flashInjectedRange(insertStart, insertEnd);
    this.scrollFinalToIndex(insertStart);

    this.finalEditor.focus();
    this.finalEditor.setSelectionRange(insertEnd, insertEnd);
  }

  private flashInjectedRange(start: number, end: number): void {
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }

    this.flashRange =
      start === end ? { start, end, kind: "caret" } : { start, end, kind: "range" };

    this.flashTimer = setTimeout(() => {
      this.flashRange = null;
      this.flashTimer = null;
      this.renderFinalOverlayContent({ anchorIndex: this.getHoverAnchorIndex() });
    }, 650);
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

    // Ensure anchor/caret at end-of-text positions.
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

  private clearHover(): void {
    this.hoverState = null;
    this.renderFinalOverlayContent({ anchorIndex: null });
    this.setFinalEdgeHintsVisible(false, false);
  }

  private clearHoverAndTooltip(): void {
    this.clearHover();
    this.hideTooltip();
  }

  private setHoverFromReviewTarget(el: HTMLElement): void {
    const kind = el.dataset.kind;
    if (kind === "change") {
      const start = Number.parseInt(el.dataset.finalStart ?? "", 10);
      const end = Number.parseInt(el.dataset.finalEnd ?? "", 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return;
      }
      this.hoverState = { kind: "change", start, end };
      this.renderFinalOverlayContent({ anchorIndex: start });
      this.syncFinalOverlayScrollAndEdgeHints();
      return;
    }

    if (kind === "delete") {
      const pos = Number.parseInt(el.dataset.finalPos ?? "", 10);
      if (!Number.isFinite(pos)) {
        return;
      }
      this.hoverState = { kind: "delete", pos };
      this.renderFinalOverlayContent({ anchorIndex: pos });
      this.syncFinalOverlayScrollAndEdgeHints();
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

  private showTooltipForReviewTarget(target: HTMLElement): void {
    if (!this.tooltipEl || !this.tooltipContentEl) {
      return;
    }

    this.cancelHideTooltip();

    const originalText = target.dataset.originalText ?? "";
    this.tooltipContentEl.textContent =
      originalText.length > 0 ? originalText : this.plugin.t("modal.tooltip.originalEmpty");

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

    // If there isn't enough room below, place it above.
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

  private createSnackbar(): void {
    const snackbar = document.createElement("div");
    snackbar.className = "final-snackbar";
    snackbar.toggleClass("is-visible", false);

    const text = document.createElement("span");
    text.className = "final-snackbar-text";
    text.textContent = "";
    snackbar.appendChild(text);

    const undoBtn = document.createElement("button");
    undoBtn.className = "btn btn-secondary final-snackbar-undo";
    undoBtn.type = "button";
    undoBtn.textContent = this.plugin.t("modal.action.undo");
    undoBtn.addEventListener("click", () => this.handleUndoClick());
    snackbar.appendChild(undoBtn);

    this.modalEl.appendChild(snackbar);
    this.snackbarEl = snackbar;
    this.snackbarTextEl = text;
    this.snackbarUndoBtn = undoBtn;
  }

  private showUndoSnackbar(): void {
    if (!this.snackbarEl || !this.snackbarTextEl) {
      return;
    }

    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
      this.snackbarTimer = null;
    }

    this.snackbarTextEl.textContent = this.plugin.t("modal.snackbar.injectionApplied");
    this.snackbarEl.toggleClass("is-visible", true);
    this.snackbarTimer = setTimeout(() => this.hideUndoSnackbar(), 5000);
  }

  private hideUndoSnackbar(): void {
    if (!this.snackbarEl) {
      return;
    }
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
      this.snackbarTimer = null;
    }
    this.snackbarEl.toggleClass("is-visible", false);
  }

  private handleUndoClick(): void {
    if (!this.finalEditor || !this.lastUndo) {
      return;
    }

    const current = this.finalEditor.value ?? "";
    if (current !== this.lastUndo.afterValue) {
      new Notice(this.plugin.t("modal.notice.undoNotAvailable"));
      this.hideUndoSnackbar();
      return;
    }

    this.finalEditor.value = this.lastUndo.beforeValue;
    this.finalEditor.scrollTop = this.lastUndo.beforeScrollTop;
    this.finalEditor.scrollLeft = this.lastUndo.beforeScrollLeft;
    this.finalEditor.focus();
    this.finalEditor.setSelectionRange(this.lastUndo.beforeSelectionStart, this.lastUndo.beforeSelectionEnd);

    this.lastUndo = null;
    this.hideUndoSnackbar();
    this.renderAll({ immediate: true });
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

    const clearBtn = rightSection.createEl("button", { cls: "btn btn-ghost hybrid-clear-btn" });
    clearBtn.setAttribute("type", "button");
    clearBtn.setAttribute("aria-label", this.plugin.t("modal.action.clear"));
    clearBtn.setAttribute("title", this.plugin.t("modal.action.clear"));
    const clearIcon = clearBtn.createSpan({ cls: "btn-icon", attr: { "aria-hidden": "true" } });
    setIcon(clearIcon, "trash");
    clearBtn.createSpan({ cls: "btn-label", text: this.plugin.t("modal.action.clear") });

    rightSection.createDiv({ cls: "divider" });

    const cancelBtn = rightSection.createEl("button", { cls: "btn btn-secondary hybrid-cancel-btn" });
    cancelBtn.setAttribute("type", "button");
    cancelBtn.setAttribute("aria-label", this.plugin.t("modal.action.cancel"));
    cancelBtn.setAttribute("title", this.plugin.t("modal.action.cancel"));
    const cancelIcon = cancelBtn.createSpan({ cls: "btn-icon", attr: { "aria-hidden": "true" } });
    setIcon(cancelIcon, "x");
    cancelBtn.createSpan({ cls: "btn-label", text: this.plugin.t("modal.action.cancel") });

    const applyBtn = rightSection.createEl("button", {
      cls: "btn btn-primary hybrid-apply-btn",
    });
    applyBtn.setAttribute("type", "button");
    applyBtn.setAttribute("aria-label", this.plugin.t("modal.action.apply"));
    applyBtn.setAttribute("title", this.plugin.t("modal.action.apply"));
    const applyIcon = applyBtn.createSpan({ cls: "btn-icon", attr: { "aria-hidden": "true" } });
    setIcon(applyIcon, "check");
    applyBtn.createSpan({ cls: "btn-label", text: this.plugin.t("modal.action.apply") });

    clearBtn.addEventListener("click", () => {
      if (!this.finalEditor) {
        return;
      }
      this.finalEditor.value = "";
      this.finalEditor.dispatchEvent(new Event("input", { bubbles: true }));
      this.renderAll({ immediate: true });
    });

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
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
      this.snackbarTimer = null;
    }

    if (this.finalEditor && this.boundHandleFinalScroll) {
      this.finalEditor.removeEventListener("scroll", this.boundHandleFinalScroll);
    }
    if (this.finalEditor && this.boundHandleFinalInput) {
      this.finalEditor.removeEventListener("input", this.boundHandleFinalInput);
    }
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

    if (this.snackbarEl) {
      this.snackbarEl.remove();
      this.snackbarEl = null;
      this.snackbarTextEl = null;
      this.snackbarUndoBtn = null;
    }

    this.contentEl.empty();
  }
}
