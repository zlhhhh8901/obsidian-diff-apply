const en = {
  "command.hybrid.name": "Hybrid edit selection",
  "menu.hybrid.title": "Hybrid Edit (Hybrid Diff)",

  "notice.clipboardReadFailed": "Failed to read clipboard content (permission?).",

  "modal.header.review": "Review",
  "modal.header.final": "Final",
  "modal.brand.title": "Diff & Apply",
  "modal.action.apply": "Apply",
  "modal.action.cancel": "Cancel",
  "modal.diffGranularity.word": "Word",
  "modal.diffGranularity.char": "Char",
  "modal.fontSize.decreaseAriaLabel": "Decrease font size",
  "modal.fontSize.increaseAriaLabel": "Increase font size",
  "modal.tooltip.originalEmpty": "(Original text is empty)",
} as const;

export type I18nKey = keyof typeof en;

export function t(key: I18nKey): string {
  return en[key] ?? key;
}
