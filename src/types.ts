export type DiffApplyLanguage = "auto" | "en" | "zh";
export type DiffDisplayStyle = "background" | "text" | "underline";

export interface DiffApplySettings {
  fontSize: number;
  smartDblClickInsertNewlines: boolean;
  language: DiffApplyLanguage;
  defaultDiffStyle: DiffDisplayStyle;
  completeDiffStyle: DiffDisplayStyle;
}

export const DEFAULT_SETTINGS: DiffApplySettings = {
  fontSize: 14,
  smartDblClickInsertNewlines: true,
  language: "auto",
  defaultDiffStyle: "background",
  completeDiffStyle: "background",
};
