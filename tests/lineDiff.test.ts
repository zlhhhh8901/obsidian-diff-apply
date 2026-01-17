import { describe, it, expect } from "vitest";
import { computeLineDiff, computeModifiedLineDiff } from "../src/utils/lineDiff";

describe("line diff helpers", () => {
  it("marks unchanged and modified lines for originals", () => {
    const original = ["alpha", "bravo", "charlie"];
    const modified = ["alpha", "bravo!", "charlie"];

    const result = computeLineDiff(original, modified);

    expect(result[0]).toBe("unchanged");
    expect(result[1]).toBe("modified");
    expect(result[2]).toBe("unchanged");
  });

  it("marks removed lines when modified is shorter", () => {
    const original = ["alpha", "bravo", "charlie"];
    const modified = ["alpha", "bravo"];

    const result = computeLineDiff(original, modified);

    expect(result[2]).toBe("removed");
  });

  it("marks added lines for modified content", () => {
    const original = ["alpha", ""];
    const modified = ["alpha", "bravo"];

    const result = computeModifiedLineDiff(original, modified);

    expect(result[1]).toBe("added");
  });
});
