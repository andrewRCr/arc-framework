/** Exact member-heading rewrites preserve other coordination prose. */
import { describe, expect, it } from "vitest";
import { rewriteCohortMemberHeading } from "../../../../../../src/lib/store/kinds/cohort/index.js";

describe("rewriteCohortMemberHeading", () => {
  it("rewrites only the exact member heading inside Members", () => {
    const content = [
      "# Cohort: group",
      "",
      "## Members",
      "",
      "### `sample`",
      "",
      "### `sibling`",
      "",
      "## Coordination",
      "",
      "### `sample`",
      "",
    ].join("\n");

    const rewritten = rewriteCohortMemberHeading(content, "sample", "renamed-sample");

    expect(rewritten).toContain("## Members\n\n### `renamed-sample`");
    expect(rewritten).toContain("### `sibling`");
    expect(rewritten).toContain("## Coordination\n\n### `sample`");
  });

  it("is byte-identical when the member section is absent", () => {
    const content = "## Members\n\n### `sibling`\n";
    expect(rewriteCohortMemberHeading(content, "sample", "renamed-sample")).toBe(content);
  });
});
