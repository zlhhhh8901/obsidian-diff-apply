import { getLanguage, moment } from "obsidian";
import type { DiffApplyLanguage } from "./types";

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

  "settings.title": "Diff Apply Settings",
  "settings.language.name": "Language",
  "settings.language.desc": "Use Obsidian app language, or force a specific language.",
  "settings.language.option.auto": "Auto",
  "settings.language.option.en": "English",
  "settings.language.option.zh": "中文",

  "settings.fontSize.name": "Font size",
  "settings.fontSize.desc": "Set the editor font size (px).",

  "settings.diffStyle.default.name": "Default diff display",
  "settings.diffStyle.default.desc": "How differences look when not hovering a panel.",
  "settings.diffStyle.complete.name": "Complete diff display",
  "settings.diffStyle.complete.desc": "How differences look in the full comparison view on hover.",
  "settings.diffStyle.option.background": "Background highlight",
  "settings.diffStyle.option.text": "Text color only",
  "settings.diffStyle.option.underline": "Underline only",
  "settings.diffColor.added.name": "Added color",
  "settings.diffColor.deleted.name": "Deleted color",
  "settings.diffOpacity.default.name": "Default highlight opacity",
  "settings.diffOpacity.default.desc": "Background opacity in default state (0–40%).",
  "settings.diffOpacity.complete.name": "Complete highlight opacity",
  "settings.diffOpacity.complete.desc": "Background opacity in complete view (0–40%).",

  "settings.smartDblClickInsertNewlines.name": "Double-click copy: smart newlines",
  "settings.smartDblClickInsertNewlines.desc":
    "When double-clicking a line to copy into the editor in Read Only mode: if the source previous line is blank (or whitespace), insert at least 2 newlines before content; otherwise at least 1. Only applies when the editor is non-empty and the cursor is not inside a line.",

  "settings.shortcuts.title": "Shortcuts",
  "settings.shortcuts.enter": "Enter : copy selection to editor",
  "settings.shortcuts.dblClick": "Double-click any non-empty line in read-only panel: copy line to editor",
  "settings.shortcuts.undo": "Cmd/Ctrl + Z : undo",
} as const;

const zh: Record<keyof typeof en, string> = {
  "command.hybrid.name": "混合编辑所选文本",
  "menu.hybrid.title": "混合编辑（Hybrid Diff）",

  "notice.selectOriginalSegment": "请先在笔记中选中要对比的原文片段。",
  "notice.clipboardReadFailed": "无法读取剪贴板内容，可能是权限问题。",

  "modal.header.original": "原文",
  "modal.header.editor": "编辑器",
  "modal.header.modified": "修改版",
  "modal.toggle.readOnly": "只读",
  "modal.toggle.editMode": "编辑",
  "modal.action.clear": "清空",
  "modal.action.apply": "应用",
  "modal.action.cancel": "取消",
  "modal.fontSize.label": "字号：",
  "modal.fontSize.decreaseAriaLabel": "减小字号",
  "modal.fontSize.increaseAriaLabel": "增大字号",
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

  "settings.diffStyle.default.name": "默认差异显示",
  "settings.diffStyle.default.desc": "未悬停时的差异显示方式。",
  "settings.diffStyle.complete.name": "完整差异显示",
  "settings.diffStyle.complete.desc": "悬停对比时完整差异的显示方式。",
  "settings.diffStyle.option.background": "背景高亮",
  "settings.diffStyle.option.text": "仅文字颜色",
  "settings.diffStyle.option.underline": "仅下划线",
  "settings.diffColor.added.name": "新增颜色",
  "settings.diffColor.deleted.name": "删除颜色",
  "settings.diffOpacity.default.name": "默认高亮透明度",
  "settings.diffOpacity.default.desc": "默认状态下背景透明度（0–40%）。",
  "settings.diffOpacity.complete.name": "完整高亮透明度",
  "settings.diffOpacity.complete.desc": "完整视图下背景透明度（0–40%）。",

  "settings.smartDblClickInsertNewlines.name": "双击行复制：智能补换行",
  "settings.smartDblClickInsertNewlines.desc":
    "Read Only 下双击复制行到 Editor 时：如果源文本上一行为空（或仅空白）则在插入内容前补到至少 2 个换行；否则补到至少 1 个。仅在 Editor 非空、且光标不在行内时生效。",

  "settings.shortcuts.title": "快捷键说明",
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
