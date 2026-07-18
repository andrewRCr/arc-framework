import { describe, expect, it } from "vitest";

import { buildRoutingLedger } from "../../../../src/lib/coupling-audit/findings.js";
import { renderCouplingReport } from "../../../../src/lib/coupling-audit/report.js";
import { scanCorpus } from "../../../../src/lib/coupling-audit/scan.js";
import type { CouplingManifest } from "../../../../src/lib/coupling-audit/types.js";

const resultDigest = "a".repeat(64);

function fixture() {
  const manifest: CouplingManifest = {
    version: 1,
    corpus: {
      packageRoot: "pkg",
      installedDelta: [],
      repoRootDelta: [],
      excluded: [],
    },
    classes: [
      {
        id: "active-placement",
        key: { kind: "name", value: "active" },
        patterns: [{ id: "active", form: "literal", value: "active/" }],
        citations: [
          {
            path: "draft-state.md",
            anchor: "Target",
            workUnit: "state-model",
          },
        ],
        idioms: ["directory-state"],
        volatility: {
          rating: "high",
          evidence: {
            workUnit: "state-model",
            source: "planned @ 2026-07-18",
          },
        },
      },
      {
        id: "workflow-root",
        key: { kind: "name", value: "workflows" },
        patterns: [{ id: "workflow", form: "literal", value: "workflows/" }],
        citations: [
          {
            path: "draft-procedure.md",
            anchor: "Target",
            workUnit: "procedure-model",
          },
        ],
        idioms: ["path-literal"],
        volatility: {
          rating: "stable",
          evidence: {
            workUnit: "procedure-model",
            source: "accepted @ 2026-07-18",
          },
        },
      },
    ],
    catchAllVectors: [],
    dispositions: { exact: [], bulk: [] },
    thresholds: {
      test: 2,
      workflow: 2,
      template: 2,
      code: 1,
      prose: 2,
      config: 2,
    },
    sampleCaps: { codePerClass: 1, residueTotal: 1 },
  };
  const result = scanCorpus(manifest, [
    {
      path: "pkg/src/state.ts",
      content: 'const placement = "active/";',
      surfaceKind: "code",
      locus: "package",
    },
    {
      path: "pkg/src/workflow.ts",
      content: 'const root = "workflows/";',
      surfaceKind: "code",
      locus: "package",
    },
  ]);
  const ledger = buildRoutingLedger(result, resultDigest, [
    {
      targetSlug: "state-model",
      concernId: "placement-readers",
      ownerState: "planned",
      ownerResolvedAt: "2026-07-18",
      classIds: ["active-placement"],
      extractRefs: ["reportInputs.placementReaders"],
      designImplication: "Placement becomes a record projection.",
      recommendation: "Use the reader list at grooming.",
    },
    {
      targetSlug: "procedure-model",
      concernId: "workflow-root",
      ownerState: "planned",
      ownerResolvedAt: "2026-07-18",
      classIds: ["workflow-root"],
      extractRefs: [],
      designImplication: "The workflow root remains explicit.",
      recommendation: "Retain the local contract.",
    },
  ]);
  ledger.packets.forEach((packet) => {
    packet.state = "captured-awaiting-housekeep";
  });
  return { result, ledger };
}

describe("coupling-audit Markdown report", () => {
  it("renders stable bytes with one ranked row per class and one routing row per packet", () => {
    const { result, ledger } = fixture();
    const first = renderCouplingReport(result, ledger);
    const second = renderCouplingReport(result, ledger);

    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
    expect(first.match(/^\| <a id="class-/gmu)).toHaveLength(
      result.reportInputs.rankedInventory.length,
    );
    expect(first.match(/^\| `packet-/gmu)).toHaveLength(ledger.packets.length);
    expect(first).toContain("## Substrate abstraction input");
    expect(first).toContain("## Placement readers");
    expect(first).toContain("captured-awaiting-housekeep");
  });
});
