/**
 * Deterministic owner-facing finding packet construction.
 *
 * @module
 */

import { canonicalizeRoutingLedger, digestCanonicalJson } from "./canonical.js";
import { CouplingAuditScanError } from "./contracts.js";
import type { CouplingScanResult, RoutingLedger } from "./types.js";

/** Judgment input that binds one coherent concern to one live work-unit owner. */
export interface FindingRoute {
  targetSlug: string;
  concernId: string;
  ownerState: "planned" | "provisional";
  ownerResolvedAt: string;
  classIds: string[];
  extractRefs: string[];
  designImplication: string;
  recommendation: string;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

/**
 * Build a canonical prepared routing ledger from reviewed owner mappings.
 *
 * @param result - Settled canonical result carrying ranked class evidence.
 * @param resultDigest - SHA-256 of the exact canonical result artifact.
 * @param routes - Reviewed owner/concern mappings.
 * @returns Prepared packets ready for review before capture.
 */
export function buildRoutingLedger(
  result: CouplingScanResult,
  resultDigest: string,
  routes: readonly FindingRoute[],
): RoutingLedger {
  if (!/^[a-f0-9]{64}$/u.test(resultDigest)) throw new CouplingAuditScanError("invalid result digest for routing");
  const inventory = new Map(result.reportInputs.rankedInventory.map((entry) => [entry.classId, entry]));
  const packets: RoutingLedger["packets"] = routes.map((route) => {
    const classIds = uniqueSorted(route.classIds);
    if (classIds.length === 0) throw new CouplingAuditScanError(`empty class set for ${route.targetSlug}`);
    const classEvidence = classIds.map((classId) => {
      const row = inventory.get(classId);
      if (row === undefined) throw new CouplingAuditScanError(`unknown class ${classId}`);
      return {
        classId,
        rank: row.rank,
        verdict: row.verdict,
        fanOut: row.fanOut,
        hitCount: row.hitCount,
        surfaceCounts: { ...row.surfaceCounts },
        maxThresholdRatio: row.maxThresholdRatio,
      };
    });
    const evidenceAnchors = classIds.map((classId) => `scan-result.json#class-${classId}`);
    const reportAnchors = classIds.map((classId) => `report-coupling-blast-radius-audit.md#class-${classId}`);
    const content = {
      targetSlug: route.targetSlug,
      concernId: route.concernId,
      owner: { state: route.ownerState, resolvedAt: route.ownerResolvedAt },
      classIds,
      extractRefs: uniqueSorted(route.extractRefs),
      evidenceAnchors,
      reportAnchors,
      classEvidence,
      designImplication: route.designImplication,
      recommendation: route.recommendation,
    };
    return {
      id: `packet-${digestCanonicalJson({ resultDigest, targetSlug: route.targetSlug, classIds }).slice(0, 24)}`,
      ...content,
      contentDigest: digestCanonicalJson(content),
      state: "prepared-for-review",
    };
  });
  const ledger = canonicalizeRoutingLedger({ version: 1, resultDigest, packets });
  const ids = new Set(ledger.packets.map((packet) => packet.id));
  if (ids.size !== ledger.packets.length) throw new CouplingAuditScanError("duplicate deterministic packet identity");
  return ledger;
}
