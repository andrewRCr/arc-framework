/**
 * Unit tests for materializable-WU detection — filtering the oracle's in-flight
 * entries to the operator's remote-only work units, the discovery surface
 * session-init offers to materialize (git worktree add → arc user pull → orient).
 */

import { describe, it, expect } from "vitest";

import type {
  InFlightErrand,
  InFlightWorkUnit,
} from "../../../src/lib/git/in-flight-derivation.js";
import { findMaterializableWorkUnits } from "../../../src/lib/session-init/materializable-work-units.js";

const wu = (over: Partial<InFlightWorkUnit> = {}): InFlightWorkUnit => ({
  kind: "work-unit",
  name: "in-flight-awareness",
  branch: "feat/in-flight-awareness",
  state: "Active",
  remoteOnly: true,
  owner: "andrew",
  dependsOn: [],
  ...over,
});

const errand = (over: Partial<InFlightErrand> = {}): InFlightErrand => ({
  kind: "errand",
  slug: "fix-typo",
  branch: "chore/fix-typo",
  remoteOnly: true,
  ...over,
});

describe("findMaterializableWorkUnits", () => {
  it("selects a remote-only owned in-flight WU as a candidate", () => {
    const result = findMaterializableWorkUnits({ entries: [wu()], identity: "andrew" });

    expect(result.candidates).toEqual([
      { name: "in-flight-awareness", branch: "feat/in-flight-awareness" },
    ]);
  });

  it("excludes a WU already checked out locally (a local worktree exists)", () => {
    const result = findMaterializableWorkUnits({
      entries: [wu({ remoteOnly: false, worktreePath: "/repos/in-flight-awareness" })],
      identity: "andrew",
    });

    expect(result.candidates).toEqual([]);
  });

  it("excludes a WU with an unoccupied local branch", () => {
    const result = findMaterializableWorkUnits({
      entries: [wu({ remoteOnly: false })],
      identity: "andrew",
    });

    expect(result.candidates).toEqual([]);
  });

  it("excludes another identity's remote-only WU", () => {
    const result = findMaterializableWorkUnits({
      entries: [wu({ owner: "blair" })],
      identity: "andrew",
    });

    expect(result.candidates).toEqual([]);
  });

  it("excludes parked WUs because resume is their sanctioned verb", () => {
    const result = findMaterializableWorkUnits({
      entries: [wu({ scheduling: "parked" })],
      identity: "andrew",
    });

    expect(result.candidates).toEqual([]);
  });

  it("excludes shipped or marked WUs from the materialize surface", () => {
    const result = findMaterializableWorkUnits({
      entries: [
        wu({ name: "shipped", state: "Shipped" }),
        wu({ name: "degraded", marks: ["degraded"] }),
      ],
      identity: "andrew",
    });

    expect(result.candidates).toEqual([]);
  });

  it("excludes an errand entry (only work units are materialize-WU candidates)", () => {
    const result = findMaterializableWorkUnits({ entries: [errand()], identity: "andrew" });

    expect(result.candidates).toEqual([]);
  });

  it("returns no candidates for an empty entry set", () => {
    expect(findMaterializableWorkUnits({ entries: [], identity: "andrew" }).candidates).toEqual([]);
  });
});
