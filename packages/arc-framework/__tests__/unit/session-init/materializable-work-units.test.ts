/**
 * Unit tests for materializable-WU detection — filtering the oracle's in-flight
 * entries to the operator's remote-only work units, the discovery surface
 * session-init offers to materialize (git worktree add → arc user pull → orient).
 */

import { describe, it, expect } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import type {
  InFlightErrand,
  InFlightWorkUnit,
} from "../../../src/lib/git/in-flight-derivation.js";
import {
  MaterializableWorkUnitSchema,
  MaterializableWorkUnitDiscoveryResultSchema,
  MaterializableWorkUnitsResultSchema,
  composeMaterializableDiscoveryRefreshRemedy,
  findMaterializableWorkUnits,
} from "../../../src/lib/session-init/materializable-work-units.js";

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

describe("MaterializableWorkUnitsResultSchema", () => {
  it("accepts candidates with or without warning diagnostics", () => {
    const candidate = { name: "in-flight-awareness", branch: "feat/in-flight-awareness" };

    expect(MaterializableWorkUnitsResultSchema.parse({ candidates: [candidate] })).toEqual({ candidates: [candidate] });
    expect(MaterializableWorkUnitsResultSchema.parse({ candidates: [], warnings: ["remote residue"] })).toEqual({
      candidates: [],
      warnings: ["remote residue"],
    });
  });

  it.each([
    { name: "Not A Slug", branch: "feat/not-a-slug" },
    { name: "valid-slug", branch: "" },
    { name: "valid-slug", branch: "feat/valid-slug", leaked: true },
  ])("rejects a malformed candidate", (candidate) => {
    assertSchemaRefuses(MaterializableWorkUnitSchema, candidate);
  });

  it("rejects malformed warning entries", () => {
    assertSchemaRefuses(MaterializableWorkUnitsResultSchema, { candidates: [], warnings: [42] });
  });
});

describe("MaterializableWorkUnitDiscoveryResultSchema", () => {
  const candidate = { name: "in-flight-awareness", branch: "feat/in-flight-awareness" };
  const remedy = {
    text: "Refresh live in-flight discovery.",
    argv: ["arc", "active", "in-flight", "--json"],
  };

  it("enforces exact, pending, unreachable, and disabled evidence combinations", () => {
    assertSchemaAccepts(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [candidate], remoteEvidence: "exact", pendingBranchCount: 0, refreshRemedy: null,
    });
    assertSchemaAccepts(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [candidate], remoteEvidence: "pending-fetch", pendingBranchCount: 2, refreshRemedy: remedy,
    });
    assertSchemaAccepts(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [], remoteEvidence: "unreachable", pendingBranchCount: 0, refreshRemedy: null,
      failureReason: "network",
    });
    assertSchemaAccepts(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [], remoteEvidence: "not-applicable", pendingBranchCount: 0, refreshRemedy: null,
    });

    assertSchemaRefuses(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [], remoteEvidence: "exact", pendingBranchCount: 1, refreshRemedy: null,
    });
    assertSchemaRefuses(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [], remoteEvidence: "pending-fetch", pendingBranchCount: 0, refreshRemedy: remedy,
    });
    assertSchemaRefuses(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [], remoteEvidence: "unreachable", pendingBranchCount: 0, refreshRemedy: null,
    });
    assertSchemaRefuses(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [], remoteEvidence: "not-applicable", pendingBranchCount: 0, refreshRemedy: null,
      failureReason: "network",
    });
  });

  it("distinguishes exact empty discovery from incomplete and unavailable discovery", () => {
    expect(MaterializableWorkUnitDiscoveryResultSchema.parse({
      candidates: [], remoteEvidence: "exact", pendingBranchCount: 0, refreshRemedy: null,
    })).toMatchObject({ remoteEvidence: "exact", candidates: [], pendingBranchCount: 0 });
    expect(MaterializableWorkUnitDiscoveryResultSchema.parse({
      candidates: [], remoteEvidence: "pending-fetch", pendingBranchCount: 1, refreshRemedy: remedy,
    })).toMatchObject({ remoteEvidence: "pending-fetch", candidates: [], pendingBranchCount: 1 });
    expect(MaterializableWorkUnitDiscoveryResultSchema.parse({
      candidates: [], remoteEvidence: "unreachable", pendingBranchCount: 0, refreshRemedy: null,
      failureReason: "timeout",
    })).toMatchObject({ remoteEvidence: "unreachable", candidates: [], failureReason: "timeout" });
  });

  it("provides the exact live refresh remedy only for pending discovery", () => {
    const composed = composeMaterializableDiscoveryRefreshRemedy();
    expect(composed).toEqual(remedy);
    assertSchemaAccepts(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [], remoteEvidence: "pending-fetch", pendingBranchCount: 1, refreshRemedy: composed,
    });
    assertSchemaRefuses(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [], remoteEvidence: "exact", pendingBranchCount: 0, refreshRemedy: composed,
    });
    assertSchemaRefuses(MaterializableWorkUnitDiscoveryResultSchema, {
      candidates: [], remoteEvidence: "pending-fetch", pendingBranchCount: 1, refreshRemedy: null,
    });
  });
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

  it("skips malformed WU names without dropping valid candidates", () => {
    const result = findMaterializableWorkUnits({
      entries: [
        wu({ name: "Not A Slug", branch: "feat/not-a-slug" }),
        wu({ name: "valid-slug", branch: "feat/valid-slug" }),
      ],
      identity: "andrew",
    });

    expect(result.candidates).toEqual([{ name: "valid-slug", branch: "feat/valid-slug" }]);
  });

  it("excludes an errand entry (only work units are materialize-WU candidates)", () => {
    const result = findMaterializableWorkUnits({ entries: [errand()], identity: "andrew" });

    expect(result.candidates).toEqual([]);
  });

  it("returns no candidates for an empty entry set", () => {
    expect(findMaterializableWorkUnits({ entries: [], identity: "andrew" }).candidates).toEqual([]);
  });
});
