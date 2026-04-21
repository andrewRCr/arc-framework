/**
 * Regression coverage for `commit-msg` CHECK 7's Next Task grep pattern.
 *
 * CHECK 7 warns when a maintainer commits a completed parent task without
 * advancing the staged status file's Next Task pointer. It locates the
 * current Next Task by grepping the status file for a bold-prefixed
 * `**Next Task:**` label and extracting `Task X.Y`.
 *
 * Because status-file formatting varies across adopters (list marker,
 * backticks, path prefix, indentation), the grep anchor is deliberately
 * lenient — match the bold label anywhere on a line. This test documents
 * which shapes the pattern accepts and guards against accidental
 * re-tightening that would reintroduce false negatives.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..", "..", "..");

const commitMsgSource = readFileSync(
  join(repoRoot, "packages/arc-framework/arc/system/githooks/commit-msg"),
  "utf-8",
);

/** Mirror the shell pattern `grep -E '\*\*Next Task:\*\*'` as a JS regex. */
const NEXT_TASK_LABEL = /\*\*Next Task:\*\*/;

/** Mirror `grep -oE 'Task [0-9]+\.[0-9]+'` used on the matched line. */
const TASK_NUM = /Task [0-9]+\.[0-9]+/;

/** Simulate the CHECK 7 extraction pipeline against a full status-file body. */
function extractNextTaskNum(body: string): string | null {
  const labelLine = body
    .split("\n")
    .find((line) => NEXT_TASK_LABEL.test(line));
  if (labelLine === undefined) return null;
  const match = labelLine.match(TASK_NUM);
  if (match === null) return null;
  return match[0].replace(/^Task /, "");
}

describe("commit-msg CHECK 7 — Next Task grep pattern", () => {
  it("is present in the hook source with the lenient (non-anchored) form", () => {
    // Regression guard: if someone re-tightens to `^- ` or `^\*\*`, this fails.
    expect(commitMsgSource).toMatch(/grep -E '\\\*\\\*Next Task:\\\*\\\*'/);
  });

  describe("tolerates canonical and adopter-variant formats", () => {
    it("matches the list-item shape (current project convention)", () => {
      const body = [
        "## Active Work",
        "",
        "- **State:** In Progress",
        "- **Next Task:** Task 3.8 — Retire aggregates (line ~790)",
        "",
      ].join("\n");
      expect(extractNextTaskNum(body)).toBe("3.8");
    });

    it("matches the naked bold-prefixed shape (archived convention)", () => {
      const body = [
        "## Active Work",
        "",
        "**State:** In Progress",
        "**Next Task:** Task 5.2 — Wire up review",
        "",
      ].join("\n");
      expect(extractNextTaskNum(body)).toBe("5.2");
    });

    it("matches when the line is indented (nested under another list)", () => {
      const body = [
        "## Active Work",
        "",
        "- **Phase 3:**",
        "    - **Next Task:** Task 7.1.a — Hook rewrite",
        "",
      ].join("\n");
      expect(extractNextTaskNum(body)).toBe("7.1");
    });

    it("matches when the value contains backticks or a full path", () => {
      const body = [
        "- **Task List:** `tasks-foo.md`",
        "- **Next Task:** Task 1.1 — first task (line ~10)",
      ].join("\n");
      expect(extractNextTaskNum(body)).toBe("1.1");
    });
  });

  describe("silently no-ops on absent or non-standard labels", () => {
    it("returns null when the status file has no Next Task line", () => {
      const body = ["## Active Work", "", "- **State:** Complete", ""].join(
        "\n",
      );
      expect(extractNextTaskNum(body)).toBeNull();
    });

    it("returns null when the adopter uses a non-ARC label", () => {
      // "Current Task:" falls outside CHECK 7's recognition set — that's
      // fine. Better to miss the warning than false-fire on variant labels.
      const body = [
        "## Active Work",
        "",
        "- **Current Task:** Task 2.4",
        "",
      ].join("\n");
      expect(extractNextTaskNum(body)).toBeNull();
    });
  });
});
