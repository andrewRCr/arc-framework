/** Cohort prose remains tolerant while Parent identity has one closed grammar. */
import { describe, expect, it } from "vitest";
import { parseCohortDocument } from "../../../../../../src/lib/store/kinds/cohort/index.js";

describe("cohort content parser", () => {
  it.each([
    ["omitted Parent", "# Cohort\n\n**Purpose:** Full thesis. Next sentence.", "Full thesis. Next sentence.", null],
    ["explicit none", "**Parent:** [none]\n\n- **Purpose:** Two\n  lines", "Two lines", null],
    ["one slug", "**Parent:** `outer-group`\r\n\r\n**Purpose:** —", "—", "outer-group"],
    ["empty Purpose", "**Purpose:**", "", null],
    ["absent Purpose", "# Cohort\n", null, null],
  ])("reads %s", (_name, content, purpose, parent) => {
    expect(parseCohortDocument(content)).toEqual({ success: true, data: { purpose, parent } });
  });

  it.each([
    ["bare slug", "**Parent:** outer-group"],
    ["invalid slug", "**Parent:** `Bad_Name`"],
    ["multiple values", "**Parent:** `one` `two`"],
    ["empty Parent", "**Parent:**"],
    ["duplicate Parent", "**Parent:** [none]\n**Parent:** `outer-group`"],
  ])("refuses %s and accepts the repaired document", (_name, content) => {
    expect(parseCohortDocument(content)).toMatchObject({ success: false, error: expect.stringContaining("Parent") });
    expect(parseCohortDocument("**Parent:** `outer-group`\n\n**Purpose:** Real"))
      .toEqual({ success: true, data: { purpose: "Real", parent: "outer-group" } });
  });
});
