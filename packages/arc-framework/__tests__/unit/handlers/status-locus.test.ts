import { describe, expect, it } from "vitest";

import { sessionPathTreatmentWorkUnit } from "../../../src/handlers/status.js";

type SessionPathTreatmentFrame = Parameters<typeof sessionPathTreatmentWorkUnit>[0];
type SessionPathTreatmentRow = SessionPathTreatmentFrame["roster"][number];

function workUnitRow(name: string, path: string): SessionPathTreatmentRow {
  return {
    checkout: {
      path,
      head: "a".repeat(40),
      branch: `feat/${name}`,
      detached: false,
      primary: false,
    },
    markerGeneration: `sha256:${"b".repeat(64)}`,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: "active",
    diagnostics: [],
    kind: "work-unit",
    subject: { kind: "work-unit", key: name },
  };
}

describe("session path-treatment work-unit", () => {
  it("uses the canonical entering checkout retained by the derived frame", () => {
    const row = workUnitRow("example", "/canonical/example");

    expect(sessionPathTreatmentWorkUnit({
      roster: [row],
      entering: { kind: "selected", row },
    })).toEqual({ name: "example" });
  });
});
