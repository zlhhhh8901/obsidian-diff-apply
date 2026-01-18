import { describe, expect, it } from "vitest";
import {
  getDesiredLeadingNewlineCountFromSource,
  getSmartLeadingNewlinesForTarget,
} from "../src/utils/smartInsert";

describe("smart insert helpers", () => {
  it("derives 1 newline when previous source line is non-empty", () => {
    const source = "alpha\nbravo\ncharlie\n";
    const lineStart = source.indexOf("bravo");
    expect(getDesiredLeadingNewlineCountFromSource(source, lineStart)).toBe(1);
  });

  it("derives 2 newlines when previous source line is blank/whitespace", () => {
    const source = "alpha\n   \nbravo\n";
    const lineStart = source.indexOf("bravo");
    expect(getDesiredLeadingNewlineCountFromSource(source, lineStart)).toBe(2);
  });

  it("does not add prefix for empty target", () => {
    expect(getSmartLeadingNewlinesForTarget("", 0, 2)).toBe("");
    expect(getSmartLeadingNewlinesForTarget("", 0, 1)).toBe("");
  });

  it("does not add prefix at start of target", () => {
    expect(getSmartLeadingNewlinesForTarget("alpha", 0, 2)).toBe("");
  });

  it("adds desired newlines at end of line / end of file", () => {
    expect(getSmartLeadingNewlinesForTarget("alpha", 5, 1)).toBe("\n");
    expect(getSmartLeadingNewlinesForTarget("alpha", 5, 2)).toBe("\n\n");
    expect(getSmartLeadingNewlinesForTarget("alpha\nbravo\n", 5, 1)).toBe("\n");
  });

  it("tops up newlines at start of line when needed", () => {
    const target = "alpha\nbravo";
    const cursorAtStartOfBravo = target.indexOf("bravo");
    expect(getSmartLeadingNewlinesForTarget(target, cursorAtStartOfBravo, 1)).toBe("");
    expect(getSmartLeadingNewlinesForTarget(target, cursorAtStartOfBravo, 2)).toBe("\n");
  });

  it("does not add prefix for mid-line insertion", () => {
    const target = "alpha\nbravo\n";
    const cursorMidBravo = target.indexOf("bravo") + 2;
    expect(getSmartLeadingNewlinesForTarget(target, cursorMidBravo, 2)).toBe("");
  });
});
