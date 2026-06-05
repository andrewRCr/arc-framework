import { describe, it, expect } from "vitest";

import { renderStatusTable, STATUS_USER_COLUMNS } from "../../../src/lib/status/render.js";
import type { StatusViewRow } from "../../../src/lib/status/render.js";

/**
 * The canonical in-flight-mine table shape the renderer must reproduce. The
 * render standard's byte-stability contract covers this table slice (not the
 * surrounding header / `Updated:` footer); the seeded
 * `.arc/user/{identity}/STATUS.USER.md` is rendered to this same shape.
 */
const GOLDEN_IN_FLIGHT_MINE = [
  "| Work unit           | State  | Class | Depends on | Cohort            |",
  "| ------------------- | ------ | ----- | ---------- | ----------------- |",
  "| in-flight-awareness | Active | Heavy | —          | agile-parallelism |",
].join("\n");

describe("renderStatusTable", () => {
  it("renders the in-flight-mine slice to the canonical STATUS.USER table", () => {
    const slice: StatusViewRow[] = [
      { workUnit: "in-flight-awareness", state: "Active", class: "Heavy", dependsOn: [], cohort: "agile-parallelism" },
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
      "| Work unit | State    | Class | Priority | Depends on | Cohort |",
      "| --------- | -------- | ----- | -------- | ---------- | ------ |",
      "| alpha     | Active   | —     | P1       | dep-x      | ranger |",
      "| bravo     | Planning | —     | P1       | —          | ranger |",
      "| zulu      | Active   | —     | P3       | —          | ranger |",
      "| yankee    | Active   | —     | P3       | —          | scout  |",
    ].join("\n");

    expect(renderStatusTable(slice, STATUS_USER_COLUMNS)).toBe(expected);
  });

  it("renders Class as an always-present column — a value (incl. [TBD]) or an em-dash when absent", () => {
    const slice: StatusViewRow[] = [
      { workUnit: "alpha", state: "Active", class: "Heavy", dependsOn: [], cohort: "ranger" },
      { workUnit: "bravo", state: "Active", class: "[TBD]", dependsOn: [], cohort: "ranger" },
      { workUnit: "charlie", state: "Active", dependsOn: [], cohort: "ranger" },
    ];

    const expected = [
      "| Work unit | State  | Class | Depends on | Cohort |",
      "| --------- | ------ | ----- | ---------- | ------ |",
      "| alpha     | Active | Heavy | —          | ranger |",
      "| bravo     | Active | [TBD] | —          | ranger |",
      "| charlie   | Active | —     | —          | ranger |",
    ].join("\n");

    // Priority is dropped (no row carries one), but Class renders regardless.
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
