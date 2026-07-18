import { describe, expect, it } from "vitest";

import { buildReportInputs } from "../../../../src/lib/coupling-audit/projection.js";
import type {
  CouplingManifest,
  CouplingScanCore,
  SurfaceKind,
} from "../../../../src/lib/coupling-audit/types.js";

const zeroCounts = (): Record<SurfaceKind, number> => ({
  test: 0,
  workflow: 0,
  template: 0,
  code: 0,
  prose: 0,
  config: 0,
});

function manifest(): CouplingManifest {
  return {
    version: 1,
    corpus: { packageRoot: "packages/example", installedDelta: [], repoRootDelta: [], excluded: [] },
    classes: [
      {
        id: "active-placement",
        key: { kind: "name", value: "active" },
        patterns: [{ id: "active", form: "literal", value: "active/" }],
        citations: [{ path: "draft-state.md", anchor: "Target", workUnit: "state-model" }],
        idioms: ["path-literal", "directory-state"],
        volatility: { rating: "high", evidence: { workUnit: "state-model", source: "planned @ 2026-07-18" } },
      },
      {
        id: "config-name",
        key: { kind: "name", value: "config" },
        patterns: [{ id: "config", form: "literal", value: "config.key" }],
        citations: [{ path: "draft-config.md", anchor: "Target", workUnit: "config-model" }],
        idioms: ["config-key"],
        volatility: { rating: "high", evidence: { workUnit: "config-model", source: "planned @ 2026-07-18" } },
      },
    ],
    catchAllVectors: [],
    dispositions: {
      exact: [{ id: "exact", candidateDigest: "a".repeat(64), reason: "Reviewed." }],
      bulk: [
        {
          id: "bulk",
          predicate: { field: "vectorId", operator: "equals", values: ["path"] },
          memberSetDigest: "b".repeat(64),
          reason: "Reviewed group.",
        },
      ],
    },
    thresholds: { test: 25, workflow: 8, template: 2, code: 12, prose: 20, config: 3 },
    sampleCaps: { codePerClass: 5, residueTotal: 64 },
  };
}

function core(): CouplingScanCore {
  const placementCounts = zeroCounts();
  placementCounts.code = 12;
  const configCounts = zeroCounts();
  configCounts.code = 1;
  const placementHit = {
    id: `hit-${"c".repeat(64)}`,
    path: "packages/example/src/reader.ts",
    line: 3,
    column: 4,
    endLine: 3,
    endColumn: 11,
    token: "active/",
    excerpt: 'existsSync("active/")',
    surfaceKind: "code" as const,
    locus: "package" as const,
    idiom: "directory-state" as const,
    vectorId: "directory-state-call",
    evidenceDigest: "c".repeat(64),
    classId: "active-placement",
    patternId: "active",
  };
  return {
    version: 1,
    manifestDigest: "d".repeat(64),
    corpus: { fileCount: 2, filesDigest: "e".repeat(64) },
    classes: [
      {
        classId: "config-name",
        volatility: "high",
        fanOut: 1,
        hitCount: 1,
        files: ["packages/example/src/config.ts"],
        surfaceCounts: configCounts,
        highFanOut: false,
        maxThresholdRatio: 1 / 13,
        verdict: "change-with-mover",
        rankKey: "1:config-name",
        hits: [{ ...placementHit, id: `hit-${"f".repeat(64)}`, classId: "config-name", idiom: "config-key", evidenceDigest: "f".repeat(64) }],
      },
      {
        classId: "active-placement",
        volatility: "high",
        fanOut: 1,
        hitCount: 1,
        files: [placementHit.path],
        surfaceCounts: placementCounts,
        highFanOut: true,
        maxThresholdRatio: 1,
        verdict: "abstract",
        rankKey: "0:active-placement",
        hits: [placementHit],
      },
    ],
    candidates: { classified: [], dismissed: [{ ...placementHit, dispositionId: "exact" }], unresolved: [] },
    diagnostics: [],
  };
}

describe("coupling-audit report-input projection", () => {
  it("materializes one ranked provenance-bearing inventory record per class", () => {
    const projected = buildReportInputs(manifest(), core());
    expect(projected.rankedInventory.map((row) => row.classId)).toEqual(["active-placement", "config-name"]);
    expect(projected.rankedInventory[0]).toMatchObject({
      rank: 1,
      classFilesRef: "active-placement",
      reportAnchor: "class-active-placement",
      provenance: { manifestDigest: "d".repeat(64), corpusFilesDigest: "e".repeat(64), resultVersion: 1 },
      thresholdMethod: { highWhen: "any-surface-count-gte-threshold", mixedSurfaceRank: "maximum-count-over-threshold" },
      residueSummary: { classified: 0, dismissed: 1, unresolved: 0, exactDispositions: 1, bulkDispositions: 1 },
      volatilityEvidence: { workUnit: "state-model", source: "planned @ 2026-07-18" },
      verdict: "abstract",
    });
  });

  it("projects concrete abstract classes and complete placement readers from canonical evidence", () => {
    const projected = buildReportInputs(manifest(), core());
    expect(projected.substrateAbstractions).toEqual([
      {
        classId: "active-placement",
        inventoryAnchor: "class-active-placement",
        idioms: ["directory-state"],
        evidenceDigests: ["c".repeat(64)],
      },
    ]);
    expect(projected.placementReaders).toEqual({
      classIds: ["active-placement"],
      idioms: ["directory-state", "filename-prefix"],
      readers: [
        {
          path: "packages/example/src/reader.ts",
          classIds: ["active-placement"],
          evidenceDigests: ["c".repeat(64)],
        },
      ],
    });
  });

  it("rejects unresolved classes before report projection", () => {
    const input = core();
    input.classes[0]!.volatility = "unresolved";
    input.classes[0]!.verdict = null;
    input.classes[0]!.rankKey = null;
    expect(() => buildReportInputs(manifest(), input)).toThrow("unresolved class config-name");
  });
});
