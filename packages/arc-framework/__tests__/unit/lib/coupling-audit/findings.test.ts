import { describe, expect, it } from "vitest";

import { buildRoutingLedger } from "../../../../src/lib/coupling-audit/findings.js";
import { scanCorpus } from "../../../../src/lib/coupling-audit/scan.js";
import type { CouplingManifest } from "../../../../src/lib/coupling-audit/types.js";

const resultDigest = "a".repeat(64);

function result() {
  const manifest: CouplingManifest = {
    version: 1,
    corpus: { packageRoot: "pkg", installedDelta: [], repoRootDelta: [], excluded: [] },
    classes: [
      {
        id: "active-placement",
        key: { kind: "name", value: "active" },
        patterns: [{ id: "active", form: "literal", value: "active/" }],
        citations: [{ path: "draft-state.md", anchor: "Target", workUnit: "state-model" }],
        idioms: ["path-literal"],
        volatility: { rating: "high", evidence: { workUnit: "state-model", source: "planned @ 2026-07-18" } },
      },
    ],
    catchAllVectors: [],
    dispositions: { exact: [], bulk: [] },
    thresholds: { test: 1, workflow: 1, template: 1, code: 1, prose: 1, config: 1 },
    sampleCaps: { codePerClass: 1, residueTotal: 1 },
  };
  return scanCorpus(manifest, [
    { path: "pkg/src/state.ts", content: 'const placement = "active/";', surfaceKind: "code", locus: "package" },
  ]);
}

describe("coupling-audit finding packets", () => {
  it("builds deterministic prepared packets from result evidence and owner concerns", () => {
    const ledger = buildRoutingLedger(result(), resultDigest, [
      {
        targetSlug: "state-model",
        concernId: "placement-readers",
        ownerState: "planned",
        ownerResolvedAt: "2026-07-18",
        classIds: ["active-placement"],
        extractRefs: ["placementReaders"],
        designImplication: "Placement must become a lifecycle record projection.",
        recommendation: "Groom the reader list into the state-model boundary.",
      },
    ]);
    expect(ledger).toMatchObject({ version: 1, resultDigest });
    expect(ledger.packets[0]).toMatchObject({
      targetSlug: "state-model",
      concernId: "placement-readers",
      owner: { state: "planned", resolvedAt: "2026-07-18" },
      classIds: ["active-placement"],
      state: "prepared-for-review",
      classEvidence: [{ classId: "active-placement", rank: 1, verdict: "abstract", fanOut: 1 }],
    });
    expect(ledger.packets[0]!.id).toMatch(/^packet-[a-f0-9]{24}$/u);
    expect(ledger.packets[0]!.contentDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      buildRoutingLedger(
        result(),
        resultDigest,
        ledger.packets.map(
          ({ targetSlug, concernId, owner, classIds, extractRefs, designImplication, recommendation }) => ({
            targetSlug,
            concernId,
            ownerState: owner.state,
            ownerResolvedAt: owner.resolvedAt,
            classIds,
            extractRefs,
            designImplication,
            recommendation,
          }),
        ),
      ),
    ).toEqual(ledger);
  });

  it("rejects unknown classes before packet construction", () => {
    expect(() =>
      buildRoutingLedger(result(), resultDigest, [
        {
          targetSlug: "state-model",
          concernId: "unknown",
          ownerState: "planned",
          ownerResolvedAt: "2026-07-18",
          classIds: ["missing-class"],
          extractRefs: [],
          designImplication: "Unknown.",
          recommendation: "Review.",
        },
      ]),
    ).toThrow("unknown class missing-class");
  });
});
