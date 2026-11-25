/** Missing-member reports retain the section reader's ordering and heading boundaries. */
import { describe, expect, it } from "vitest";
import { reportOrphanCohortMemberSections } from "../../../../../../src/lib/store/kinds/cohort/index.js";

describe("orphan cohort member-section report", () => {
  it("does not report a section naming a known member", () => {
    expect(reportOrphanCohortMemberSections("## Members\n\n### `known`\n\nProse", new Set(["known"]))).toEqual([]);
  });

  it("reports a section naming no member", () => {
    expect(reportOrphanCohortMemberSections("## Members\n\n### `ghost`\n", ["known"])).toEqual(["ghost"]);
  });

  it("ignores member-shaped headings outside Members", () => {
    const content = "# Cohort\n\n### `before`\n\n## Coordination\n\n### `after`\n";
    expect(reportOrphanCohortMemberSections(content, [])).toEqual([]);
  });

  it("reports in document order, retaining duplicate unknown sections and both membership sources", () => {
    const content = "## MEMBERS\r\n\r\n### `ghost-b`\r\n### `live`\r\n### `staged`\r\n### `ghost-a`\r\n### `ghost-b`\r\n## Other\r\n### `outside`\r\n";
    expect(reportOrphanCohortMemberSections(content, new Set(["live", "staged"])))
      .toEqual(["ghost-b", "ghost-a", "ghost-b"]);
  });
});
