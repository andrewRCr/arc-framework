import { describe, it, expect } from "vitest";

import { buildInFlightMineSlice } from "../../../src/lib/status/in-flight-mine.js";
import type { InFlightEntry } from "../../../src/lib/git/in-flight-derivation.js";
import type { StoreInFlightErrand, StoreInFlightWorkUnit } from "../../../src/lib/git/in-flight-store.js";

/** A minimal in-flight work-unit entry, overridable per field. */
function wu(name: string, over: Partial<InFlightEntry> = {}): InFlightEntry {
  return {
    kind: "work-unit",
    name,
    state: "Active",
    branch: `feat/${name}`,
    remoteOnly: false,
    dependsOn: [],
    ...over,
  } as InFlightEntry;
}

describe("buildInFlightMineSlice", () => {
  it("drops a branchless store Errand", () => {
    const entry: StoreInFlightErrand = {
      kind: "errand", slug: "fix-typo", owner: "andrew", remoteOnly: false,
    };

    expect(buildInFlightMineSlice([entry])).toEqual([]);
  });

  it("renders a branchless store work unit", () => {
    const entry: StoreInFlightWorkUnit = {
      kind: "work-unit", name: "planning", state: "Planning",
      remoteOnly: false, dependsOn: [], class: "Heavy", priority: "P2",
    };

    expect(buildInFlightMineSlice([entry])).toEqual([
      { workUnit: "planning", state: "Planning", dependsOn: [], class: "Heavy", priority: "P2" },
    ]);
  });

  it("renders paused store scheduling over the lifecycle state", () => {
    const entry: StoreInFlightWorkUnit = {
      kind: "work-unit", name: "paused", state: "Active", scheduling: "paused",
      branch: "feat/paused", remoteOnly: false, dependsOn: [],
    };

    expect(buildInFlightMineSlice([entry])).toEqual([
      { workUnit: "paused", state: "Paused", dependsOn: [] },
    ]);
  });

  it("maps work-unit entries to render rows and drops errands", () => {
    const entries: InFlightEntry[] = [
      wu("alpha", { state: "Active", cohort: "ranger" }),
      { kind: "errand", slug: "fix-typo", branch: "chore/fix-typo", remoteOnly: false },
    ];

    const slice = buildInFlightMineSlice(entries);

    expect(slice).toEqual([
      { workUnit: "alpha", state: "Active", dependsOn: [], cohort: "ranger" },
    ]);
  });

  it("keeps only still-in-flight dependencies, dropping shipped / non-in-flight ones", () => {
    const entries: InFlightEntry[] = [
      wu("alpha", { dependsOn: ["bravo", "shipped-dep"] }),
      wu("bravo"),
    ];

    const [alpha] = buildInFlightMineSlice(entries);

    expect(alpha?.dependsOn).toEqual(["bravo"]);
  });

  it("sets priority only when the entry carries an explicit level", () => {
    const entries: InFlightEntry[] = [
      wu("alpha", { priority: "P1" }),
      wu("bravo"),
    ];

    const [alpha, bravo] = buildInFlightMineSlice(entries);

    expect(alpha?.priority).toBe("P1");
    expect(bravo).not.toHaveProperty("priority");
  });

  it("normalizes a Class value to its display form on the row", () => {
    const entries: InFlightEntry[] = [
      wu("alpha", { class: "heavy" }),
      wu("bravo", { class: "Light" }),
      wu("charlie", { class: "novel" }),
    ];

    const [alpha, bravo, charlie] = buildInFlightMineSlice(entries);

    expect(alpha?.class).toBe("Heavy");
    expect(bravo?.class).toBe("Light");
    expect(charlie?.class).toBe("Novel");
  });

  it("keeps an explicit [TBD] Class as a value on the row", () => {
    const [alpha] = buildInFlightMineSlice([wu("alpha", { class: "[TBD]" })]);

    expect(alpha?.class).toBe("[TBD]");
  });

  it("renders parked work units as Parked instead of their meta lifecycle state", () => {
    const [alpha] = buildInFlightMineSlice([wu("alpha", { state: "Active", scheduling: "parked" })]);

    expect(alpha?.state).toBe("Parked");
  });

  it("omits Class when the entry carries no field", () => {
    const [alpha] = buildInFlightMineSlice([wu("alpha")]);

    expect(alpha).not.toHaveProperty("class");
  });
});
