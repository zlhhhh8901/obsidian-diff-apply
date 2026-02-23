import { describe, expect, it } from "vitest";
import { computeReviewOps } from "../src/utils/reviewDiff";

describe("review diff ops", () => {
  it("merges removed+added into a single replace op", () => {
    const ops = computeReviewOps("ab", "ac", "char");

    expect(ops.map((o) => o.kind)).toEqual(["equal", "change"]);
    const op = ops[1];
    if (op.kind !== "change") {
      throw new Error("Expected a change op");
    }
    expect(op.changeType).toBe("replace");
    expect(op.finalText).toBe("c");
    expect(op.originalText).toBe("b");
    expect(op.finalStart).toBe(1);
    expect(op.finalEnd).toBe(2);
  });

  it("merges consecutive removals into a single delete op", () => {
    const ops = computeReviewOps("ab12cd", "abcd", "char");

    const deletes = ops.filter((o) => o.kind === "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].kind).toBe("delete");
    expect(deletes[0].originalText).toBe("12");
  });

  it("does not advance finalPos for delete ops", () => {
    const ops = computeReviewOps("abXcd", "abcd", "char");

    expect(ops.map((o) => o.kind)).toEqual(["equal", "delete", "equal"]);
    const op = ops[2];
    if (op.kind !== "equal") {
      throw new Error("Expected an equal op");
    }
    expect(op.text).toBe("cd");
    expect(op.finalStart).toBe(2);
    expect(op.finalEnd).toBe(4);
  });

  it("emits insert op with empty originalText", () => {
    const ops = computeReviewOps("ab", "abX", "char");

    const changes = ops.filter((o) => o.kind === "change");
    expect(changes).toHaveLength(1);
    const op = changes[0];
    if (op.kind !== "change") {
      throw new Error("Expected a change op");
    }
    expect(op.changeType).toBe("insert");
    expect(op.originalText).toBe("");
    expect(op.finalText).toBe("X");
    expect(op.finalStart).toBe(2);
    expect(op.finalEnd).toBe(3);
  });
});
