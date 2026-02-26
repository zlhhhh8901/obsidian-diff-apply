import { diffArrays } from "diff";

export type DiffGranularity = "word" | "char";

export type ReviewOpEqual = {
  kind: "equal";
  text: string;
  finalStart: number;
  finalEnd: number;
};

export type ReviewOpChange = {
  kind: "change";
  changeType: "insert" | "replace";
  finalText: string;
  originalText: string;
  finalStart: number;
  finalEnd: number;
};

export type ReviewOpDelete = {
  kind: "delete";
  originalText: string;
  finalPos: number;
};

export type ReviewOp = ReviewOpEqual | ReviewOpChange | ReviewOpDelete;

type DiffPart = {
  value: string;
  added?: boolean;
  removed?: boolean;
};

function tokenizeInlineDiff(text: string, granularity: DiffGranularity): string[] {
  if (text.length === 0) {
    return [];
  }

  const SegmenterCtor = (Intl as unknown as { Segmenter?: unknown }).Segmenter as
    | (new (
        locales?: string | string[],
        options?: { granularity?: "grapheme" | "word" }
      ) => {
        segment: (input: string) => Iterable<{ segment: string; isWordLike?: boolean }>;
      })
    | undefined;

  if (SegmenterCtor) {
    if (granularity === "char") {
      const seg = new SegmenterCtor(undefined, { granularity: "grapheme" });
      return Array.from(seg.segment(text), (s) => s.segment);
    }

    const wordSeg = new SegmenterCtor(undefined, { granularity: "word" });
    return Array.from(wordSeg.segment(text), (s) => s.segment);
  }

  if (granularity === "char") {
    return Array.from(text);
  }

  // Fallback tokenizer: CJK/punctuation as single chars + everything else as "word+trailing-space".
  const tokens: string[] = [];
  const cjkCharPattern =
    "[\\u3400-\\u9FFF\\uF900-\\uFAFF\\u3040-\\u30FF\\uAC00-\\uD7AF\\u1100-\\u11FF\\u3130-\\u318F\\u3000-\\u303F]";
  const cjkSplitRegex = new RegExp(`(${cjkCharPattern})`, "g");
  const cjkTestRegex = new RegExp(`^${cjkCharPattern}$`);

  const parts = text.split(cjkSplitRegex).filter((part) => part.length > 0);
  for (const part of parts) {
    if (cjkTestRegex.test(part)) {
      tokens.push(part);
      continue;
    }

    const matches = part.match(/\\s+|\\S+\\s*/g);
    if (matches) {
      tokens.push(...matches);
    }
  }

  return tokens;
}

function computeDiffParts(originalText: string, finalText: string, granularity: DiffGranularity): DiffPart[] {
  const originalTokens = tokenizeInlineDiff(originalText, granularity);
  const finalTokens = tokenizeInlineDiff(finalText, granularity);
  const raw = diffArrays(originalTokens, finalTokens);

  return raw.map((part) => ({
    value: part.value.join(""),
    added: part.added,
    removed: part.removed,
  }));
}

function mergeAdjacentParts(parts: DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = [];
  for (const part of parts) {
    if (part.value.length === 0) {
      continue;
    }

    const prev = merged[merged.length - 1];
    if (prev && !!prev.added === !!part.added && !!prev.removed === !!part.removed) {
      prev.value += part.value;
      continue;
    }

    merged.push({ ...part });
  }
  return merged;
}

export function computeReviewOps(
  originalText: string,
  finalText: string,
  granularity: DiffGranularity
): ReviewOp[] {
  const parts = mergeAdjacentParts(computeDiffParts(originalText, finalText, granularity));

  const ops: ReviewOp[] = [];
  let finalPos = 0;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const len = part.value.length;

    const isAdded = !!part.added;
    const isRemoved = !!part.removed;

    if (!isAdded && !isRemoved) {
      ops.push({
        kind: "equal",
        text: part.value,
        finalStart: finalPos,
        finalEnd: finalPos + len,
      });
      finalPos += len;
      continue;
    }

    const next = parts[i + 1];
    const nextIsAdded = !!next?.added;
    const nextIsRemoved = !!next?.removed;

    // Replacement: removed+added OR added+removed (defensive).
    if ((isRemoved && next && nextIsAdded && !nextIsRemoved) || (isAdded && next && nextIsRemoved && !nextIsAdded)) {
      const removedText = isRemoved ? part.value : (next?.value ?? "");
      const addedText = isAdded ? part.value : (next?.value ?? "");

      ops.push({
        kind: "change",
        changeType: "replace",
        finalText: addedText,
        originalText: removedText,
        finalStart: finalPos,
        finalEnd: finalPos + addedText.length,
      });

      finalPos += addedText.length;
      i += 1;
      continue;
    }

    if (isAdded && !isRemoved) {
      ops.push({
        kind: "change",
        changeType: "insert",
        finalText: part.value,
        originalText: "",
        finalStart: finalPos,
        finalEnd: finalPos + len,
      });
      finalPos += len;
      continue;
    }

    if (isRemoved && !isAdded) {
      ops.push({
        kind: "delete",
        originalText: part.value,
        finalPos,
      });
      continue;
    }

    // Shouldn't happen with diffArrays, but stay safe.
    if (isAdded) {
      finalPos += len;
    }
  }

  return ops;
}
