# Manual Test Checklist

## 1. Entry and open behavior

1. Open an Obsidian note and keep no selection.
2. Run `Review & Apply Selection`.
3. Expected: modal does not open.

4. Select a non-empty text range.
5. Right-click editor and click `Review & Apply`.
6. Expected: modal opens with `Review` (left) and `Final` (right).

## 2. Clipboard fallback

1. Copy text to system clipboard, then open modal from a selection.
2. Expected: `Final` initializes with clipboard text.

3. Clear clipboard (or simulate clipboard read failure), then open modal from a selection.
4. Expected: `Final` falls back to selected text; no crash.

## 3. Review click injection

1. Ensure `Review` pane has change/delete markers.
2. Click one change marker.
3. Expected: corresponding original text is injected into `Final` at marker range.

4. For long content where target is out of view, click marker once.
5. Expected: marker is armed and editor scrolls/flashes target area.

6. Click same marker again.
7. Expected: injection applies.

## 4. Apply/Cancel correctness

1. Open modal from a middle-range selection (with text before and after selection).
2. Modify `Final` and click `Apply`.
3. Expected: only selected range is replaced; outside text is unchanged.

4. Reopen modal, modify `Final`, then press `Mod+Enter`.
5. Expected: same result as clicking `Apply` (selected range replaced, modal closes).

6. Reopen modal, modify `Final`, then click `Cancel` (or press `Esc`).
7. Expected: note content remains unchanged.

## 5. Diff granularity

1. Prepare text where one word differs and another case where one character differs.
2. Toggle `Word` / `Char`.
3. Expected: marker granularity updates immediately and reflects mode.

## 6. Font size and persistence

1. In modal, decrease/increase font size.
2. Expected: both panes update visual text size.

3. Close modal and reopen.
4. Expected: font size is preserved.

## 7. Undo/Redo in Final pane

1. Focus `Final` and type three edits.
2. Press `Mod+Z` repeatedly.
3. Expected: changes are undone step-by-step.

4. Press `Mod+Shift+Z` (or `Mod+Y` where available).
5. Expected: changes are redone step-by-step.

## 8. Keyboard navigation

1. Open modal with multiple diff markers visible in `Review`.
2. Enable keyboard mode (click the keyboard button in footer, or press `Mod+Shift+K`).
3. Press `ArrowDown` repeatedly.
4. Expected: active marker cycles (wraps), `Final` scrolls to the marker position, overlay shows highlight/caret.

5. Press `ArrowUp` repeatedly.
6. Expected: cycles backward (wraps).

7. Press `Enter`.
8. Expected: restores original text for active marker, diff updates immediately, active marker advances (or clears when no markers remain).

9. Move focus to a footer control (e.g., click `Word` / `Char`).
10. Repeat the shortcuts above.
11. Expected: same behavior regardless of focus; `Mod+Enter` still applies the final result; `Esc` still cancels.

12. Click inside `Final`.
13. Expected: keyboard mode exits; arrow keys and Enter behave as normal editing keys again.

## 9. Long text scroll and edge hints

1. Use long text (50+ lines) with multiple diff markers.
2. Scroll `Final` and hover/click markers in `Review`.
3. Expected: overlay stays aligned; edge hints appear when target is above/below viewport.

## 10. Theme sanity check

1. Repeat a quick pass in light and dark themes.
2. Expected: text contrast and marker visibility are acceptable; controls remain usable.
