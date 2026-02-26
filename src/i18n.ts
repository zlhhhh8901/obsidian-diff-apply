const en = {
  "command.hybrid.name": "Review & Apply Selection",
  "menu.hybrid.title": "Review & Apply",

  "notice.clipboardReadFailed": "Failed to read clipboard content (permission?).",

  "modal.header.review": "Review",
  "modal.header.reviewHint": "Hover: original • Click: restore • Offscreen: click twice",
  "modal.header.final": "Final",
  "modal.header.finalHint": "Edit result • Apply replaces selection",
  "modal.brand.title": "Diff & Apply",
  "modal.help.ariaLabel": "How it works",
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
