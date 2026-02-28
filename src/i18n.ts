const en = {
  "command.hybrid.name": "Review & Apply Selection",
  "menu.hybrid.title": "Review & Apply",

  "notice.clipboardReadFailed": "Failed to read clipboard content (permission?).",
  "notice.selectionRequired": "Select some text before running Review & Apply.",

  "modal.header.review": "Review",
  "modal.header.reviewHint":
    "Hover a change to preview the original text.\nClick a marker to restore the original into Final.\nIf a marker is offscreen: click once to jump, click again to restore.",
  "modal.header.final": "Final",
  "modal.header.finalHint":
    "Edit the result (undo/redo: Mod+Z / Mod+Shift+Z / Mod+Y).\nApply replaces the selected text in the editor (shortcut: Mod+Enter).",
  "modal.brand.title": "Diff & Apply",
  "modal.help.ariaLabel": "How it works",
  "modal.help.controlsTitle": "Controls",
  "modal.help.controlsHint": "Footer: switch Word/Char and adjust font size (10–24px).",
  "modal.action.apply": "Apply",
  "modal.action.cancel": "Cancel",
  "modal.diffGranularity.word": "Word",
  "modal.diffGranularity.char": "Char",
  "modal.fontSize.decreaseAriaLabel": "Decrease font size",
  "modal.fontSize.increaseAriaLabel": "Increase font size",
  "modal.tooltip.originalEmpty": "(Original text is empty)",
  "modal.tooltip.originalPrefix": "Original:",
} as const;

export type I18nKey = keyof typeof en;

export function t(key: I18nKey): string {
  return en[key] ?? key;
}
