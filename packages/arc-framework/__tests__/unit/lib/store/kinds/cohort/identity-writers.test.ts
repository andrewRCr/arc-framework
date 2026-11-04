/** Cohort identity edits preserve all unrelated document bytes. */
import { describe, expect, it } from "vitest";
import { rewriteCohortHeading, writeCohortParent } from "../../../../../../src/lib/store/kinds/cohort/index.js";

describe.each(["\n", "\r\n"])("cohort identity writers with %j line endings", newline => {
  const document = ["# Cohort: `old`", "", "**Parent:** `old`", "", "**Purpose:** Keep `old` in prose.",
    "", "## Members", "", "### `old`", "", "_Exposes:_ old details.", ""].join(newline);
  it("rewrites only the cohort identity heading", () => {
    expect(rewriteCohortHeading(document, "renamed"))
      .toBe(document.replace("# Cohort: `old`", "# Cohort: `renamed`"));
  });
  it("rewrites only the Parent line", () => {
    expect(writeCohortParent(document, "renamed"))
      .toBe(document.replace("**Parent:** `old`", "**Parent:** `renamed`"));
  });
  it("returns null for a top-level cohort without Parent", () => {
    expect(writeCohortParent(document.replace(`**Parent:** \`old\`${newline}`, ""), "renamed")).toBeNull();
  });
});
