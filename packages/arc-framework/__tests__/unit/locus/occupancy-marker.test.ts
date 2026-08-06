import { describe, expect, it } from "vitest";

import {
  parseOccupancyMarker,
  promoteOccupancyMarker,
  readyOccupancyMarker,
  removeTerminalOccupancy,
  serializeOccupancyMarker,
  validateOccupancyMarkerTopology,
  type OccupancyMarker,
} from "../../../src/lib/locus/occupancy-marker.js";

const validClaimId = "a".repeat(32);
const spawnedErrand: OccupancyMarker = {
  spawnedByArc: true,
  createdFor: { kind: "errand", slug: "repair-index", claimId: validClaimId },
  provisioning: "pending",
  parentCheckoutPath: "/repo/parent",
};

describe("dormant occupancy marker projection", () => {
  it("round-trips a spawned transient without widening the live marker", () => {
    expect(parseOccupancyMarker(serializeOccupancyMarker(spawnedErrand))).toEqual({
      kind: "valid",
      marker: spawnedErrand,
    });
  });

  it("round-trips transient occupancy on the physical primary", () => {
    const primary: OccupancyMarker = {
      spawnedByArc: false,
      createdFor: { kind: "errand", slug: "repair-index", claimId: validClaimId },
      provisioning: "ready",
    };
    expect(parseOccupancyMarker(serializeOccupancyMarker(primary))).toEqual({
      kind: "valid",
      marker: primary,
    });
  });

  it("round-trips the exact partial-Errand subject with complete origin binding", () => {
    const partial: OccupancyMarker = {
      spawnedByArc: false,
      createdFor: { kind: "partial-errand", slug: "quick-repair", claimId: null },
      provisioning: "ready",
      parentCheckoutPath: "/repo/parent",
      originEntry: "Repair the index",
      originEntrySourceDigest: `sha256:${"a".repeat(64)}`,
    };
    expect(parseOccupancyMarker(serializeOccupancyMarker(partial))).toEqual({
      kind: "valid",
      marker: partial,
    });
  });

  it("round-trips spawned work-unit ownership without transient fields", () => {
    const workUnit: OccupancyMarker = {
      spawnedByArc: true,
      createdFor: { kind: "work-unit", name: "widget" },
    };
    expect(parseOccupancyMarker(serializeOccupancyMarker(workUnit))).toEqual({
      kind: "valid",
      marker: workUnit,
    });
  });

  it.each([
    { spawnedByArc: true, createdFor: { kind: "errand", slug: "legacy" }, provisioning: "ready" },
    { spawnedByArc: true, createdFor: { kind: "errand", slug: "wrong", claimId: null }, provisioning: "ready" },
    {
      spawnedByArc: true,
      createdFor: { kind: "partial-errand", slug: "wrong", claimId: "claim-1" },
      provisioning: "ready",
    },
    { spawnedByArc: false, createdFor: { kind: "work-unit", name: "widget" } },
    {
      spawnedByArc: false,
      createdFor: { kind: "partial-errand", slug: "partial", claimId: null },
      provisioning: "ready",
      originEntry: "Capture",
    },
    {
      spawnedByArc: false,
      createdFor: { kind: "partial-errand", slug: "partial", claimId: null },
      provisioning: "ready",
      originEntrySourceDigest: `sha256:${"a".repeat(64)}`,
    },
    {
      ...spawnedErrand,
      originEntry: "Capture",
      originEntrySourceDigest: `sha256:${"a".repeat(64)}`,
    },
    { spawnedByArc: true, createdFor: { kind: "work-unit", name: "widget" }, provisioning: "ready" },
    { spawnedByArc: true, createdFor: { kind: "work-unit", name: "widget" }, parentCheckoutPath: "/repo" },
    { ...spawnedErrand, terminalState: "removed" },
  ])("rejects invalid ownership, incomplete binding, and extra lifecycle state %#", (invalid) => {
    expect(parseOccupancyMarker(JSON.stringify(invalid))).toMatchObject({ kind: "malformed" });
  });

  it.each([
    { spawnedByArc: true, createdFor: { kind: "work-unit", name: "" } },
    {
      spawnedByArc: true,
      createdFor: { kind: "errand", slug: "../escape", claimId: validClaimId },
      provisioning: "ready",
    },
    {
      spawnedByArc: true,
      createdFor: { kind: "errand", slug: "repair", claimId: "x" },
      provisioning: "ready",
    },
    {
      spawnedByArc: true,
      createdFor: { kind: "errand", slug: "repair", claimId: validClaimId },
      provisioning: "ready",
      parentCheckoutPath: "relative/path",
    },
    {
      spawnedByArc: false,
      createdFor: { kind: "partial-errand", slug: "", claimId: null },
      provisioning: "ready",
      originEntry: "Repair",
      originEntrySourceDigest: `sha256:${"a".repeat(64)}`,
    },
    {
      spawnedByArc: false,
      createdFor: { kind: "partial-errand", slug: "repair", claimId: null },
      provisioning: "ready",
      originEntry: "",
      originEntrySourceDigest: `sha256:${"a".repeat(64)}`,
    },
  ])("rejects invalid persisted identity, path, and origin scalars %#", (invalid) => {
    expect(parseOccupancyMarker(JSON.stringify(invalid))).toMatchObject({ kind: "malformed" });
  });

  it("validates primary-only and spawned-only provenance at topology composition", () => {
    const primary = { ...spawnedErrand, spawnedByArc: false };
    expect(validateOccupancyMarkerTopology(primary, { primary: true }))
      .toEqual({ kind: "valid", marker: primary });
    expect(validateOccupancyMarkerTopology(primary, { primary: false }))
      .toEqual({ kind: "unresolved", reason: "spawn-topology-mismatch" });
    expect(validateOccupancyMarkerTopology(spawnedErrand, { primary: false }))
      .toEqual({ kind: "valid", marker: spawnedErrand });
    expect(validateOccupancyMarkerTopology(spawnedErrand, { primary: true }))
      .toEqual({ kind: "unresolved", reason: "spawn-topology-mismatch" });
  });

  it("projects pending-to-ready while preserving every ownership field", () => {
    expect(readyOccupancyMarker(spawnedErrand)).toEqual({
      kind: "replace-marker",
      marker: { ...spawnedErrand, provisioning: "ready" },
    });
    expect(spawnedErrand.provisioning).toBe("pending");
  });

  it("projects terminal removal without adding marker state", () => {
    expect(removeTerminalOccupancy(spawnedErrand)).toEqual({ kind: "remove-marker" });
  });

  it("preserves spawn provenance and drops transient fields on promotion", () => {
    expect(promoteOccupancyMarker(spawnedErrand, "widget")).toEqual({
      kind: "replace-marker",
      marker: { spawnedByArc: true, createdFor: { kind: "work-unit", name: "widget" } },
    });
    const primary: OccupancyMarker = {
      spawnedByArc: false,
      createdFor: { kind: "errand", slug: "repair-index", claimId: validClaimId },
      provisioning: "ready",
    };
    expect(promoteOccupancyMarker(primary, "widget")).toEqual({ kind: "remove-marker" });
  });
});
