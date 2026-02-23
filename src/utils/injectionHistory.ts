export type InjectionTxn = {
  beforeValue: string;
  afterValue: string;
  beforeSelectionStart: number;
  beforeSelectionEnd: number;
  afterSelectionStart: number;
  afterSelectionEnd: number;
  beforeScrollTop: number;
  beforeScrollLeft: number;
  afterScrollTop: number;
  afterScrollLeft: number;
};

export type InjectionHistoryState = {
  undoStack: InjectionTxn[];
  redoStack: InjectionTxn[];
};

export type InjectionHistoryApplyResult = {
  state: InjectionHistoryState;
  txn: InjectionTxn | null;
};

const DEFAULT_MAX_HISTORY = 200;

export function createInjectionHistoryState(): InjectionHistoryState {
  return {
    undoStack: [],
    redoStack: [],
  };
}

export function pushInjectionTxn(
  state: InjectionHistoryState,
  txn: InjectionTxn,
  maxHistory = DEFAULT_MAX_HISTORY
): InjectionHistoryState {
  const cappedMax = Math.max(1, maxHistory);
  const nextUndo = [...state.undoStack, txn];
  if (nextUndo.length > cappedMax) {
    nextUndo.splice(0, nextUndo.length - cappedMax);
  }

  return {
    undoStack: nextUndo,
    redoStack: [],
  };
}

export function canUndoInjection(state: InjectionHistoryState, currentValue: string): boolean {
  const top = state.undoStack[state.undoStack.length - 1];
  return !!top && top.afterValue === currentValue;
}

export function canRedoInjection(state: InjectionHistoryState, currentValue: string): boolean {
  const top = state.redoStack[state.redoStack.length - 1];
  return !!top && top.beforeValue === currentValue;
}

export function undoInjection(
  state: InjectionHistoryState,
  currentValue: string
): InjectionHistoryApplyResult {
  if (!canUndoInjection(state, currentValue)) {
    return { state, txn: null };
  }

  const undoStack = state.undoStack.slice(0, -1);
  const txn = state.undoStack[state.undoStack.length - 1];
  return {
    state: {
      undoStack,
      redoStack: [...state.redoStack, txn],
    },
    txn,
  };
}

export function redoInjection(
  state: InjectionHistoryState,
  currentValue: string
): InjectionHistoryApplyResult {
  if (!canRedoInjection(state, currentValue)) {
    return { state, txn: null };
  }

  const redoStack = state.redoStack.slice(0, -1);
  const txn = state.redoStack[state.redoStack.length - 1];
  return {
    state: {
      undoStack: [...state.undoStack, txn],
      redoStack,
    },
    txn,
  };
}

