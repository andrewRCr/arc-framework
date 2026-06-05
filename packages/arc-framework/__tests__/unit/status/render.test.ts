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

describe("renderStatusTable — nested cohort", () => {
  it("renders the leaf segment of a nested cohort in the Cohort cell", () => {
    const slice: StatusViewRow[] = [
      {
        workUnit: "wu",
        state: "Active",
        dependsOn: [],
        cohort: "principle-anchored-core/agile-wu-lifecycle",
      },
    ];

    const table = renderStatusTable(slice, STATUS_USER_COLUMNS);
    expect(table).toContain("agile-wu-lifecycle");
    expect(table).not.toContain("principle-anchored-core");
  });

  it("renders a single-segment cohort unchanged", () => {
    const slice: StatusViewRow[] = [
      { workUnit: "wu", state: "Active", dependsOn: [], cohort: "ranger" },
    ];

    expect(renderStatusTable(slice, STATUS_USER_COLUMNS)).toContain("ranger");
  });

  it("orders by the full cohort path for membership while displaying the leaf", () => {
    const slice: StatusViewRow[] = [
      { workUnit: "wu-a", state: "Active", dependsOn: [], cohort: "z-parent/a-leaf" },
      { workUnit: "wu-b", state: "Active", dependsOn: [], cohort: "a-parent/z-leaf" },
    ];

    const lines = renderStatusTable(slice, STATUS_USER_COLUMNS).split("\n");
    const aIdx = lines.findIndex((line) => line.includes("wu-a"));
    const bIdx = lines.findIndex((line) => line.includes("wu-b"));
    // The full path sorts "a-parent/..." before "z-parent/...", so wu-b precedes
    // wu-a — even though the displayed leaves ("z-leaf", "a-leaf") would order the
    // other way. Membership uses the path; the cell shows the leaf.
    expect(bIdx).toBeLessThan(aIdx);
    expect(lines.join("\n")).toContain("a-leaf");
    expect(lines.join("\n")).toContain("z-leaf");
  });
});
