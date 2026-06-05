import { describe, it, expect } from "vitest";

import { buildReadyMineSlice, type PlannedWorkUnit } from "../../../src/lib/status/ready-mine.js";
import { classComposition } from "../../../src/lib/status/class-composition.js";

/** A minimal planned work unit, overridable per field. */
function planned(name: string, over: Partial<PlannedWorkUnit> = {}): PlannedWorkUnit {
  return { name, owner: "andrew", dependsOn: [], ...over };
}

describe("buildReadyMineSlice", () => {
  it("includes owned, unblocked planned WUs, sized by Class", () => {
    const wus = [
      planned("alpha", { class: "heavy", cohort: "ranger" }),
      planned("bravo", { class: "Light" }),
    ];

    const slice = buildReadyMineSlice(wus, new Set(["alpha", "bravo"]), "andrew");

    expect(slice).toEqual([
      { workUnit: "alpha", state: "Planning", class: "Heavy", cohort: "ranger", dependsOn: [] },
      { workUnit: "bravo", state: "Planning", class: "Light", dependsOn: [] },
    ]);
  });

  it("excludes blocked WUs — a dependency still present in the pipeline is unsatisfied", () => {
    const wus = [
      planned("alpha", { dependsOn: ["pending-dep"] }),
      planned("bravo", { dependsOn: ["shipped-dep"] }),
    ];

    // `pending-dep` is still in the pipeline (blocks alpha); `shipped-dep` is
    // absent (shipped → satisfied), so only bravo is ready.
    const slice = buildReadyMineSlice(wus, new Set(["alpha", "bravo", "pending-dep"]), "andrew");

    expect(slice.map((r) => r.workUnit)).toEqual(["bravo"]);
  });

  it("excludes not-mine WUs while keeping unattributed ones", () => {
    const wus = [
      planned("mine", { owner: "andrew" }),
      planned("theirs", { owner: "blair" }),
      planned("orphan", { owner: undefined }),
    ];

    const slice = buildReadyMineSlice(wus, new Set(["mine", "theirs", "orphan"]), "andrew");

    expect(slice.map((r) => r.workUnit)).toEqual(["mine", "orphan"]);
  });

  it("keeps every planned WU when identity is null", () => {
    const wus = [planned("a", { owner: "andrew" }), planned("b", { owner: "blair" })];

    const slice = buildReadyMineSlice(wus, new Set(["a", "b"]), null);

    expect(slice.map((r) => r.workUnit)).toEqual(["a", "b"]);
  });
});

describe("classComposition", () => {
  it("excludes [TBD] (and field-absent) rows from the heavy/light tally", () => {
    const wus = [
      planned("h1", { class: "heavy" }),
      planned("h2", { class: "Heavy" }),
      planned("l1", { class: "light" }),
      planned("t1", { class: "[TBD]" }),
      planned("u1"), // no Class field
    ];

    const slice = buildReadyMineSlice(wus, new Set(wus.map((w) => w.name)), "andrew");

    expect(classComposition(slice)).toEqual({ heavy: 2, light: 1 });
  });
});
