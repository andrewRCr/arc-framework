import { describe, expect, it } from "vitest";

import { formatActiveInFlightLine } from "../../../src/handlers/active.js";
import type { InFlightWorkUnit } from "../../../src/lib/git/in-flight-derivation.js";

function workUnit(overrides: Partial<InFlightWorkUnit> = {}): InFlightWorkUnit {
  return {
    kind: "work-unit",
    branch: "feat/local-unoccupied",
    name: "local-unoccupied",
    state: "Active",
    remoteOnly: false,
    dependsOn: [],
    ...overrides,
  };
}

describe("formatActiveInFlightLine", () => {
  it("renders an unoccupied local branch as having no worktree", () => {
    expect(formatActiveInFlightLine(workUnit())).toBe(
      "feat/local-unoccupied  (Active)  no worktree",
    );
  });

  it("retains the remote-only and checked-out location labels", () => {
    expect(formatActiveInFlightLine(workUnit({ remoteOnly: true }))).toContain("remote-only");
    expect(
      formatActiveInFlightLine(workUnit({ worktreePath: "/repo.local", remoteOnly: false })),
    ).toContain("/repo.local");
  });
});
