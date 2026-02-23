import { describe, expect, it } from "vitest";
import {
  canRedoInjection,
  canUndoInjection,
  createInjectionHistoryState,
  pushInjectionTxn,
  redoInjection,
  undoInjection,
  type InjectionTxn,
} from "../src/utils/injectionHistory";

const makeTxn = (before: string, after: string): InjectionTxn => ({
  beforeValue: before,
  afterValue: after,
  beforeSelectionStart: 0,
  beforeSelectionEnd: 0,
  afterSelectionStart: after.length,
  afterSelectionEnd: after.length,
  beforeScrollTop: 0,
  beforeScrollLeft: 0,
  afterScrollTop: 0,
  afterScrollLeft: 0,
});

describe("injection history", () => {
  it("push clears redo stack", () => {
    const base = createInjectionHistoryState();
    const withFirst = pushInjectionTxn(base, makeTxn("a", "ab"));
    const undone = undoInjection(withFirst, "ab");
    expect(undone.txn).not.toBeNull();

    const withSecond = pushInjectionTxn(undone.state, makeTxn("ab", "abc"));
    expect(withSecond.undoStack).toHaveLength(1);
    expect(withSecond.redoStack).toHaveLength(0);
    expect(withSecond.undoStack[0].afterValue).toBe("abc");
  });

  it("undo moves txn to redo stack", () => {
    const base = createInjectionHistoryState();
    const withTxn = pushInjectionTxn(base, makeTxn("a", "ab"));

    expect(canUndoInjection(withTxn, "ab")).toBe(true);

    const undone = undoInjection(withTxn, "ab");
    expect(undone.txn).not.toBeNull();
    expect(undone.state.undoStack).toHaveLength(0);
    expect(undone.state.redoStack).toHaveLength(1);
    expect(undone.state.redoStack[0].beforeValue).toBe("a");
  });

  it("redo moves txn back to undo stack", () => {
    const base = createInjectionHistoryState();
    const withTxn = pushInjectionTxn(base, makeTxn("a", "ab"));
    const undone = undoInjection(withTxn, "ab");

    expect(canRedoInjection(undone.state, "a")).toBe(true);

    const redone = redoInjection(undone.state, "a");
    expect(redone.txn).not.toBeNull();
    expect(redone.state.undoStack).toHaveLength(1);
    expect(redone.state.redoStack).toHaveLength(0);
    expect(redone.state.undoStack[0].afterValue).toBe("ab");
  });

  it("rejects undo/redo when current value mismatches", () => {
    const base = createInjectionHistoryState();
    const withTxn = pushInjectionTxn(base, makeTxn("a", "ab"));

    const failedUndo = undoInjection(withTxn, "different");
    expect(failedUndo.txn).toBeNull();
    expect(failedUndo.state.undoStack).toHaveLength(1);
    expect(failedUndo.state.redoStack).toHaveLength(0);

    const undone = undoInjection(withTxn, "ab");
    const failedRedo = redoInjection(undone.state, "different");
    expect(failedRedo.txn).toBeNull();
    expect(failedRedo.state.undoStack).toHaveLength(0);
    expect(failedRedo.state.redoStack).toHaveLength(1);
  });
});

