export function getDesiredLeadingNewlineCountFromSource(
  sourceText: string,
  lineStartIndex: number
): number {
  if (lineStartIndex <= 0) {
    return 1;
  }

  const previousLineEndIndex = lineStartIndex - 1;
  const previousLineStartIndex = sourceText.lastIndexOf("\n", previousLineEndIndex - 1) + 1;
  const previousLine = sourceText.substring(previousLineStartIndex, previousLineEndIndex);

  return previousLine.trim().length === 0 ? 2 : 1;
}

export function getSmartLeadingNewlinesForTarget(
  targetText: string,
  cursorIndex: number,
  desiredLeadingNewlines: number
): string {
  if (desiredLeadingNewlines <= 0) {
    return "";
  }
  if (targetText.length === 0) {
    return "";
  }
  if (cursorIndex <= 0 || cursorIndex > targetText.length) {
    return "";
  }

  const previousChar = targetText[cursorIndex - 1];
  const nextNewlineIndex = targetText.indexOf("\n", cursorIndex);

  const isMidLineInsertion =
    previousChar !== "\n" &&
    ((nextNewlineIndex !== -1 && cursorIndex < nextNewlineIndex) ||
      (nextNewlineIndex === -1 && cursorIndex < targetText.length));
  if (isMidLineInsertion) {
    return "";
  }

  let existingLeadingNewlines = 0;
  for (let i = cursorIndex - 1; i >= 0; i -= 1) {
    if (targetText[i] !== "\n") {
      break;
    }
    existingLeadingNewlines += 1;
  }

  const toAdd = Math.max(0, desiredLeadingNewlines - existingLeadingNewlines);
  return "\n".repeat(toAdd);
}
