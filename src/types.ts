export type DiffApplyLanguage = "auto" | "en" | "zh";

export interface DiffApplySettings {
  fontSize: number;
  smartDblClickInsertNewlines: boolean;
  language: DiffApplyLanguage;
}

export const DEFAULT_SETTINGS: DiffApplySettings = {
  fontSize: 14,
  smartDblClickInsertNewlines: true,
  language: "auto",
};
