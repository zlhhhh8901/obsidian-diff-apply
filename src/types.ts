export type DiffViewPosition = "left" | "center" | "right";

export interface DiffApplySettings {
  fontSize: number;
  defaultDiffPosition: DiffViewPosition;
}

export const DEFAULT_SETTINGS: DiffApplySettings = {
  fontSize: 14,
  defaultDiffPosition: "center",
};
