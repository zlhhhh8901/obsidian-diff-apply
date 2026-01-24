export type DiffApplyLanguage = "auto" | "en" | "zh";
export type DiffDisplayStyle = "background" | "text" | "underline";

export interface DiffApplySettings {
  fontSize: number;
  smartDblClickInsertNewlines: boolean;
  language: DiffApplyLanguage;
  defaultDiffStyle: DiffDisplayStyle;
  completeDiffStyle: DiffDisplayStyle;
  diffAddedColor: string;
  diffDeletedColor: string;
  diffDefaultOpacity: number;
  diffCompleteOpacity: number;
}

export const DEFAULT_SETTINGS: DiffApplySettings = {
  fontSize: 14,
  smartDblClickInsertNewlines: true,
  language: "auto",
  defaultDiffStyle: "background",
  completeDiffStyle: "background",
  diffAddedColor: "#2e7d32",
  diffDeletedColor: "#d32f2f",
  diffDefaultOpacity: 18,
  diffCompleteOpacity: 28,
};
