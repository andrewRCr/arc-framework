import { describe, expect, it, vi } from "vitest";

import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import {
  createV3DecomposeStarterMap,
  v3PreflightId,
  v3SourceArtifactDigest,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";
import type { V3DecomposePreflight } from "../../../src/lib/work-unit/decompose-v3-preflight.js";
import {
  revalidateV3DecomposeExecutionPreflight,
} from "../../../src/lib/work-unit/decompose-v3-execution-preflight.js";

function refreshPreflightId(machine: ReturnType<typeof currentPreflight>["starterMap"]["machine"]): void {
  const { preflightId, ...facts } = machine;
  void preflightId;
  machine.preflightId = v3PreflightId(facts);
}

function currentPreflight(): V3DecomposePreflight {
  const map = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
  const starterMap = createV3DecomposeStarterMap(map.machine);
  const sourceArtifactDigest = v3SourceArtifactDigest([]);
  if (starterMap === null || sourceArtifactDigest === null) throw new Error("valid fixture");
  return {
    sourceOriginPath: ".arc/active/meta-origin.md",
    sourceArtifactInventory: [],
    sourceArtifactDigest,
    starterMap,
  };
}

describe("v3 decomposition execution preflight", () => {
  it("reads canonical completed bytes once, then resolves and returns the exact current binding", async () => {
    const map = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
    const order: string[] = [];
    const readCutMap = vi.fn(async () => {
      order.push("read-map");
      return new TextEncoder().encode(`${canonicalize(map)}\n`);
    });
    const resolvePreflight = vi.fn(async () => {
      order.push("resolve-source");
      return { status: "ready" as const, preflight: currentPreflight() };
    });

    const result = await revalidateV3DecomposeExecutionPreflight({
      readCutMap,
      resolvePreflight,
    }, "origin", "map.json");

    expect(result).toEqual({
      status: "current",
      completedMap: map,
      preflight: currentPreflight(),
    });
    expect(order).toEqual(["read-map", "resolve-source"]);
    expect(readCutMap).toHaveBeenCalledOnce();
    expect(resolvePreflight).toHaveBeenCalledOnce();
  });

  it("refuses malformed or noncanonical map bytes before resolving source authority", async () => {
    const resolvePreflight = vi.fn();
    const malformed = await revalidateV3DecomposeExecutionPreflight({
      readCutMap: async () => new TextEncoder().encode("{bad json"),
      resolvePreflight,
    }, "origin", "map.json");
    expect(malformed).toEqual({
      status: "stale",
      reason: "completed-map",
      locus: "map.json",
    });

    const map = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
    const noncanonical = await revalidateV3DecomposeExecutionPreflight({
      readCutMap: async () => new TextEncoder().encode(`${JSON.stringify(map, null, 2)}\n`),
      resolvePreflight,
    }, "origin", "map.json");
    expect(noncanonical).toEqual({
      status: "stale",
      reason: "completed-map",
      locus: "map.json",
    });
    expect(resolvePreflight).not.toHaveBeenCalled();
  });

  it("reports decoded authoring identity drift at the exact allocation locus", async () => {
    const map = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
    map.authoring.sourceAllocations = [];
    const resolvePreflight = vi.fn();

    const result = await revalidateV3DecomposeExecutionPreflight({
      readCutMap: async () => new TextEncoder().encode(`${canonicalize(map)}\n`),
      resolvePreflight,
    }, "origin", "map.json");

    expect(result).toEqual({
      status: "stale",
      reason: "completed-map",
      locus: "authoring.sourceAllocations",
    });
    expect(resolvePreflight).not.toHaveBeenCalled();
  });

  it("returns the deterministic first exact machine mismatch without a partial binding", async () => {
    const map = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
    const changed = currentPreflight();
    changed.starterMap.machine.source.head = "f".repeat(40);
    refreshPreflightId(changed.starterMap.machine);

    const result = await revalidateV3DecomposeExecutionPreflight({
      readCutMap: async () => new TextEncoder().encode(`${canonicalize(map)}\n`),
      resolvePreflight: async () => ({ status: "ready", preflight: changed }),
    }, "origin", "map.json");

    expect(result).toEqual({
      status: "stale",
      reason: "source-head",
      locus: "machine.source.head",
      evidence: {
        expected: map.machine.source.head,
        actual: changed.starterMap.machine.source.head,
      },
    });
    expect(result).not.toHaveProperty("completedMap");
    expect(result).not.toHaveProperty("preflight");
  });

  it("orders planning-profile drift ahead of the preflight identity", async () => {
    const map = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
    const changed = currentPreflight();
    changed.starterMap.machine.planningProfile = {
      kind: "single-spec",
      sourceDesign: ["spec-origin.md"],
    };
    refreshPreflightId(changed.starterMap.machine);

    const result = await revalidateV3DecomposeExecutionPreflight({
      readCutMap: async () => new TextEncoder().encode(`${canonicalize(map)}\n`),
      resolvePreflight: async () => ({ status: "ready", preflight: changed }),
    }, "origin", "map.json");

    expect(result).toEqual({
      status: "stale",
      reason: "planning-profile",
      locus: "machine.planningProfile",
      evidence: {
        expected: map.machine.planningProfile,
        actual: changed.starterMap.machine.planningProfile,
      },
    });
  });

  it("reports exact source-inventory drift before preflight identity comparison", async () => {
    const map = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
    const changed = currentPreflight();
    const machine = structuredClone(changed.starterMap.machine);
    machine.sourceUnits = [];
    refreshPreflightId(machine);
    const starterMap = createV3DecomposeStarterMap(machine);
    if (starterMap === null) throw new Error("valid changed fixture");
    changed.starterMap = starterMap;

    const result = await revalidateV3DecomposeExecutionPreflight({
      readCutMap: async () => new TextEncoder().encode(`${canonicalize(map)}\n`),
      resolvePreflight: async () => ({ status: "ready", preflight: changed }),
    }, "origin", "map.json");

    expect(result).toEqual({
      status: "stale",
      reason: "source-units",
      locus: "machine.sourceUnits.0",
      evidence: {
        expected: map.machine.sourceUnits[0],
        actual: { kind: "absent" },
      },
    });
  });

  it("reports the authenticated and completed-map origins", async () => {
    const map = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
    map.machine.source.origin = "other";
    refreshPreflightId(map.machine);

    const result = await revalidateV3DecomposeExecutionPreflight({
      readCutMap: async () => new TextEncoder().encode(`${canonicalize(map)}\n`),
      resolvePreflight: vi.fn(),
    }, "origin", "map.json");

    expect(result).toEqual({
      status: "stale",
      reason: "completed-map",
      locus: "machine.source.origin",
      evidence: {
        expected: "origin",
        actual: "other",
      },
    });
  });

  it("refuses source-resolution drift without exposing map authority", async () => {
    const map = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
    const result = await revalidateV3DecomposeExecutionPreflight({
      readCutMap: async () => new TextEncoder().encode(`${canonicalize(map)}\n`),
      resolvePreflight: async () => ({
        status: "rejected",
        reason: "planning-profile",
        locus: ".arc/active/meta-origin.md#Design",
        evidence: {
          expected: { kind: "draft", sourceDesign: ["draft-origin.md"] },
          actual: { kind: "single-spec", sourceDesign: ["spec-origin.md"] },
        },
      }),
    }, "origin", "map.json");

    expect(result).toEqual({
      status: "stale",
      reason: "planning-profile",
      locus: ".arc/active/meta-origin.md#Design",
      evidence: {
        expected: { kind: "draft", sourceDesign: ["draft-origin.md"] },
        actual: { kind: "single-spec", sourceDesign: ["spec-origin.md"] },
      },
    });
    expect(result).not.toHaveProperty("completedMap");
  });
});
