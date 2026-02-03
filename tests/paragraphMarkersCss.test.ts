import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readCss = (path: string): string => readFileSync(resolve(path), "utf8");

const getRuleBlock = (css: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, "m"));
  expect(match, `Missing CSS rule for selector: ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
};

describe("paragraph marker CSS", () => {
  it("renders markers without affecting text layout", () => {
    for (const cssPath of ["src/styles.css", "styles.css"]) {
      const css = readCss(cssPath);

      expect(getRuleBlock(css, ".diff-inline-content")).toContain("position: relative");

      expect(getRuleBlock(css, ".diff-paragraph-anchor")).toContain("width: 0");
      expect(getRuleBlock(css, ".diff-paragraph-anchor")).toContain("height: 0");
      expect(getRuleBlock(css, ".diff-paragraph-anchor")).toContain("pointer-events: none");

      expect(getRuleBlock(css, ".diff-paragraph-marker-layer")).toContain("position: absolute");
      expect(getRuleBlock(css, ".diff-paragraph-marker-layer")).toContain("inset: 0");
      expect(getRuleBlock(css, ".diff-paragraph-marker-layer")).toContain("pointer-events: none");

      expect(getRuleBlock(css, ".diff-paragraph-marker")).toContain("position: absolute");
    }
  });
});
