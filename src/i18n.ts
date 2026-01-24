const en = {
  "command.hybrid.name": "Hybrid edit selection",
  "menu.hybrid.title": "Hybrid Edit (Hybrid Diff)",

  "notice.selectOriginalSegment": "Select the original text in the note first.",
  "notice.clipboardReadFailed": "Failed to read clipboard content (permission?).",

  "modal.header.original": "Original",
  "modal.header.editor": "Editor",
  "modal.header.modified": "Modified",
  "modal.toggle.readOnly": "Read Only",
  "modal.toggle.editMode": "Edit Mode",
  "modal.action.clear": "Clear",
  "modal.action.apply": "Apply",
  "modal.action.cancel": "Cancel",
  "modal.fontSize.label": "Size:",
  "modal.fontSize.decreaseAriaLabel": "Decrease font size",
  "modal.fontSize.increaseAriaLabel": "Increase font size",
  "modal.notice.readOnly": "Read Only",
  "modal.notice.editMode": "Edit Mode",
  "modal.notice.selectTextInOriginal": "Select text in Original to copy first.",
  "modal.notice.selectTextInModified": "Select text in Modified to copy first.",
  "modal.notice.copied": "Copied.",
  "modal.notice.modifiedEmpty": "Modified version is empty.",
} as const;

export type I18nKey = keyof typeof en;

export function t(key: I18nKey): string {
  return en[key] ?? key;
}
