export type DiffViewPosition = "left" | "center" | "right";

export type DiffApplyLanguage = "auto" | "en" | "zh";

export interface DiffApplySettings {
  fontSize: number;
  defaultDiffPosition: DiffViewPosition;
  smartDblClickInsertNewlines: boolean;
  language: DiffApplyLanguage;
}

export const DEFAULT_SETTINGS: DiffApplySettings = {
  fontSize: 14,
  defaultDiffPosition: "center",
  smartDblClickInsertNewlines: true,
  language: "auto",
};
