export type DiffViewPosition = "left" | "center" | "right";

export interface DiffApplySettings {
  fontSize: number;
  defaultDiffPosition: DiffViewPosition;
  smartDblClickInsertNewlines: boolean;
}

export const DEFAULT_SETTINGS: DiffApplySettings = {
  fontSize: 14,
  defaultDiffPosition: "center",
  smartDblClickInsertNewlines: true,
};
