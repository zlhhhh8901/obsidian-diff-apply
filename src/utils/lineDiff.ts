import { diffChars } from "diff";

export type LineStatus = "unchanged" | "modified" | "removed" | "added";
export type LineDiffMap = Record<number, LineStatus>;

export function computeLineDiff(originalLines: string[], modifiedLines: string[]): LineDiffMap {
  const lineStatus: LineDiffMap = {};

  // Use character-level diff to detect changed lines.
  originalLines.forEach((line, index) => {
    if (index < modifiedLines.length) {
      const modifiedLine = modifiedLines[index];
      if (line === modifiedLine) {
        lineStatus[index] = "unchanged";
        return;
      }

      const charDiff = diffChars(line, modifiedLine);
      const hasChanges = charDiff.some((part) => part.added || part.removed);

      if (hasChanges) {
        if (modifiedLine.trim() !== "") {
          lineStatus[index] = "modified";
        } else {
          lineStatus[index] = "removed";
        }
      } else {
        lineStatus[index] = "unchanged";
      }
      return;
    }

    lineStatus[index] = "removed";
  });

  return lineStatus;
}

export function computeModifiedLineDiff(
  originalLines: string[],
  modifiedLines: string[]
): LineDiffMap {
  const lineStatus: LineDiffMap = {};

  // For modified lines, only mark additions.
  modifiedLines.forEach((line, index) => {
    if (index < originalLines.length) {
      const originalLine = originalLines[index];
      if (line === originalLine) {
        lineStatus[index] = "unchanged";
        return;
      }

      if (originalLine.trim() === "" && line.trim() !== "") {
        lineStatus[index] = "added";
        return;
      }

      const charDiff = diffChars(originalLine, line);
      const hasChanges = charDiff.some((part) => part.added || part.removed);

      if (hasChanges) {
        if (originalLine.trim() === "") {
          lineStatus[index] = "added";
        } else {
          lineStatus[index] = "unchanged";
        }
      } else {
        lineStatus[index] = "unchanged";
      }
      return;
    }

    lineStatus[index] = "added";
  });

  return lineStatus;
}
