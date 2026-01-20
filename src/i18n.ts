import { getLanguage, moment } from "obsidian";
import type { DiffApplyLanguage, DiffViewPosition } from "./types";

const en = {
  "command.hybrid.name": "Hybrid edit selection",
  "menu.hybrid.title": "Hybrid Edit (Hybrid Diff)",

  "notice.selectOriginalSegment": "Select the original text in the note first.",
  "notice.clipboardReadFailed": "Failed to read clipboard content (permission?).",

  "modal.hint":
    "Left: original, right: modified. Press Enter to copy selection to the middle editor. Use Cmd+, / Cmd+. to move diff view, Cmd+/ to toggle visibility. Cmd+Z to undo.",
  "modal.header.original": "Original",
  "modal.header.editor": "Editor",
  "modal.header.modified": "Modified",
  "modal.toggle.readOnly": "Read Only",
  "modal.toggle.editMode": "Edit Mode",
  "modal.action.clear": "Clear",
  "modal.action.apply": "Apply",
  "modal.action.cancel": "Cancel",
  "modal.fontSize.label": "Size:",
  "modal.notice.readOnly": "Read Only",
  "modal.notice.editMode": "Edit Mode",
  "modal.notice.selectTextInOriginal": "Select text in Original to copy first.",
  "modal.notice.selectTextInModified": "Select text in Modified to copy first.",
  "modal.notice.copied": "Copied.",
  "modal.notice.modifiedEmpty": "Modified version is empty.",

  "settings.title": "Diff Apply Settings",
  "settings.language.name": "Language",
  "settings.language.desc": "Use Obsidian app language, or force a specific language.",
  "settings.language.option.auto": "Auto",
  "settings.language.option.en": "English",
  "settings.language.option.zh": "中文",

  "settings.fontSize.name": "Font size",
  "settings.fontSize.desc": "Set the editor font size (px).",

  "settings.defaultDiffPosition.name": "Default diff view position",
  "settings.defaultDiffPosition.desc": "Choose the default position when opening the diff view.",
  "settings.defaultDiffPosition.option.left": "Left",
  "settings.defaultDiffPosition.option.center": "Center",
  "settings.defaultDiffPosition.option.right": "Right",

  "settings.smartDblClickInsertNewlines.name": "Double-click copy: smart newlines",
  "settings.smartDblClickInsertNewlines.desc":
    "When double-clicking a line to copy into the editor in Read Only mode: if the source previous line is blank (or whitespace), insert at least 2 newlines before content; otherwise at least 1. Only applies when the editor is non-empty and the cursor is not inside a line.",

  "settings.shortcuts.title": "Shortcuts",
  "settings.shortcuts.moveLeft": "Cmd/Ctrl + , : move diff view left",
  "settings.shortcuts.moveRight": "Cmd/Ctrl + . : move diff view right",
  "settings.shortcuts.toggleDiff": "Cmd/Ctrl + / : toggle diff view show/hide",
  "settings.shortcuts.enter": "Enter : copy selection to editor",
  "settings.shortcuts.dblClick": "Double-click any non-empty line in read-only panel: copy line to editor",
  "settings.shortcuts.undo": "Cmd/Ctrl + Z : undo",
} as const;

const zh: Record<keyof typeof en, string> = {
  "command.hybrid.name": "混合编辑所选文本",
  "menu.hybrid.title": "混合编辑（Hybrid Diff）",

  "notice.selectOriginalSegment": "请先在笔记中选中要对比的原文片段。",
  "notice.clipboardReadFailed": "无法读取剪贴板内容，可能是权限问题。",

  "modal.hint":
    "左：原文，右：修改版。按 Enter 将选中文本复制到中间编辑器。Cmd+, / Cmd+. 移动差异视图，Cmd+/ 显示/隐藏，Cmd+Z 撤销。",
  "modal.header.original": "原文",
  "modal.header.editor": "编辑器",
  "modal.header.modified": "修改版",
  "modal.toggle.readOnly": "只读",
  "modal.toggle.editMode": "编辑",
  "modal.action.clear": "清空",
  "modal.action.apply": "应用",
  "modal.action.cancel": "取消",
  "modal.fontSize.label": "字号：",
  "modal.notice.readOnly": "只读模式",
  "modal.notice.editMode": "编辑模式",
  "modal.notice.selectTextInOriginal": "请先在原文中选择要复制的文本",
  "modal.notice.selectTextInModified": "请先在修改版中选择要复制的文本",
  "modal.notice.copied": "已复制。",
  "modal.notice.modifiedEmpty": "修改版为空。",

  "settings.title": "Diff Apply 插件设置",
  "settings.language.name": "语言",
  "settings.language.desc": "跟随 Obsidian 应用语言，或手动指定语言。",
  "settings.language.option.auto": "自动",
  "settings.language.option.en": "English",
  "settings.language.option.zh": "中文",

  "settings.fontSize.name": "字体大小",
  "settings.fontSize.desc": "设置编辑器中的字体大小（像素）",

  "settings.defaultDiffPosition.name": "默认差异视图位置",
  "settings.defaultDiffPosition.desc": "设置打开差异视图时的默认显示位置",
  "settings.defaultDiffPosition.option.left": "左侧",
  "settings.defaultDiffPosition.option.center": "中间",
  "settings.defaultDiffPosition.option.right": "右侧",

  "settings.smartDblClickInsertNewlines.name": "双击行复制：智能补换行",
  "settings.smartDblClickInsertNewlines.desc":
    "Read Only 下双击复制行到 Editor 时：如果源文本上一行为空（或仅空白）则在插入内容前补到至少 2 个换行；否则补到至少 1 个。仅在 Editor 非空、且光标不在行内时生效。",

  "settings.shortcuts.title": "快捷键说明",
  "settings.shortcuts.moveLeft": "Cmd/Ctrl + , : 差异视图位置左移",
  "settings.shortcuts.moveRight": "Cmd/Ctrl + . : 差异视图位置右移",
  "settings.shortcuts.toggleDiff": "Cmd/Ctrl + / : 切换差异视图显示/隐藏",
  "settings.shortcuts.enter": "Enter : 复制选中文本到编辑器",
  "settings.shortcuts.dblClick": "双击只读栏任意非空行：复制该行到编辑器",
  "settings.shortcuts.undo": "Cmd/Ctrl + Z : 撤销编辑",
};

export type I18nKey = keyof typeof en;

function getAppLanguageCode(): string {
  const maybeGetLanguage: unknown = getLanguage;
  if (typeof maybeGetLanguage === "function") {
    try {
      return (maybeGetLanguage as () => string)();
    } catch {
      // Fall back to moment locale below.
    }
  }
  return moment.locale();
}

function resolveLocale(language: DiffApplyLanguage | undefined): "en" | "zh" {
  if (language === "en" || language === "zh") {
    return language;
  }
  const appLanguage = getAppLanguageCode().toLowerCase();
  return appLanguage.startsWith("zh") ? "zh" : "en";
}

export function t(key: I18nKey, language: DiffApplyLanguage | undefined): string {
  const locale = resolveLocale(language);
  const dict = locale === "zh" ? zh : en;
  return dict[key] ?? en[key] ?? key;
}

export function tDiffPosition(pos: DiffViewPosition, language: DiffApplyLanguage | undefined): string {
  switch (pos) {
    case "left":
      return t("settings.defaultDiffPosition.option.left", language);
    case "center":
      return t("settings.defaultDiffPosition.option.center", language);
    case "right":
      return t("settings.defaultDiffPosition.option.right", language);
  }
}
