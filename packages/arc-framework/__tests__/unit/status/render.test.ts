import { describe, it, expect } from "vitest";

import { renderStatusTable, STATUS_USER_COLUMNS } from "../../../src/lib/status/render.js";
import type { StatusViewRow } from "../../../src/lib/status/render.js";

/**
 * The canonical in-flight-mine table — byte-identical to the table block in the
 * seeded `.arc/user/{identity}/STATUS.USER.md`. The render standard's
 * byte-stability contract covers this table slice (not the surrounding header /
 * `Updated:` footer), so the renderer must reproduce it exactly.
 */
const GOLDEN_IN_FLIGHT_MINE = [
  "| Work unit           | State  | Depends on | Cohort            |",
  "| ------------------- | ------ | ---------- | ----------------- |",
  "| in-flight-awareness | Active | —          | agile-parallelism |",
].join("\n");

describe("renderStatusTable", () => {
  it("renders the in-flight-mine slice to the canonical STATUS.USER table", () => {
    const slice: StatusViewRow[] = [
      { workUnit: "in-flight-awareness", state: "Active", dependsOn: [], cohort: "agile-parallelism" },
    ];

    expect(renderStatusTable(slice, STATUS_USER_COLUMNS)).toBe(GOLDEN_IN_FLIGHT_MINE);
  });

  it("produces byte-identical output regardless of input row order", () => {
    const rows: StatusViewRow[] = [
      { workUnit: "alpha", state: "Active", dependsOn: [], cohort: "ranger" },
      { workUnit: "bravo", state: "Planning", dependsOn: [], cohort: "ranger" },
      { workUnit: "charlie", state: "Active", dependsOn: [], cohort: "scout" },
    ];

    const forward = renderStatusTable(rows, STATUS_USER_COLUMNS);
    const reversed = renderStatusTable([...rows].reverse(), STATUS_USER_COLUMNS);

    expect(reversed).toBe(forward);
  });

  it("renders the Priority column when present and orders by (priority, cohort, wu-name)", () => {
    const slice: StatusViewRow[] = [
      { workUnit: "yankee", priority: "P3", state: "Active", dependsOn: [], cohort: "scout" },
      { workUnit: "alpha", priority: "P1", state: "Active", dependsOn: ["dep-x"], cohort: "ranger" },
      { workUnit: "bravo", priority: "P1", state: "Planning", dependsOn: [], cohort: "ranger" },
      { workUnit: "zulu", state: "Active", dependsOn: [], cohort: "ranger" },
    ];

    const expected = [
      "| Work unit | State    | Priority | Depends on | Cohort |",
      "| --------- | -------- | -------- | ---------- | ------ |",
      "| alpha     | Active   | P1       | dep-x      | ranger |",
      "| bravo     | Planning | P1       | —          | ranger |",
      "| zulu      | Active   | P3       | —          | ranger |",
      "| yankee    | Active   | P3       | —          | scout  |",
    ].join("\n");

    expect(renderStatusTable(slice, STATUS_USER_COLUMNS)).toBe(expected);
  });

  it("omits the conditional Priority column when no row carries a value", () => {
    const slice: StatusViewRow[] = [
      { workUnit: "solo", state: "Active", dependsOn: [], cohort: "ranger" },
    ];

    expect(renderStatusTable(slice, STATUS_USER_COLUMNS)).not.toContain("Priority");
  });
});
