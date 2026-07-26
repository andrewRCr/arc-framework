/**
 * Dependent-specific projection of authenticated retirement evidence.
 *
 * Consumers ask about one retired work-unit subject and never observe record
 * paths or adapter enumeration mechanics.
 *
 * @module
 */

import type { InventoryRead, RetirementReceipt } from "./retirement-authority.js";
import type {
  RetirementRecordEnumerationResult,
} from "./retirement-record-enumeration.js";

/** Evidence completeness retained by a dependent reconcile plan. */
export type RetirementEvidenceQuality =
  | "unknown"
  | Exclude<InventoryRead, "not-applicable">;

/** Closed incoming-edge action derived from one retirement receipt. */
export type RetirementReconcileDisposition =
  | { kind: "replace"; replacementTargets: readonly string[] }
  | { kind: "drop"; reason: string }
  | { kind: "retarget"; targetSlug: string }
  | { kind: "abandoned" };

/** Storage-independent subject/dependent lookup. */
export interface RetirementDispositionQuery {
  retiredSubject: string;
  dependentSlug: string;
}

/** Closed result returned by retirement-disposition readers. */
export type RetirementDispositionQueryResult =
  | { status: "absent" }
  | {
      status: "unique";
      evidenceQuality: RetirementEvidenceQuality;
      disposition: RetirementReconcileDisposition;
    }
  | { status: "ambiguous" }
  | {
      status: "unmapped-dependent";
      evidenceQuality: RetirementEvidenceQuality;
    }
  | { status: "version-conflict" }
  | { status: "namespace-corrupt" };

/** Port implemented by the current Git adapter and future storage backends. */
export interface RetirementDispositionQueryPort {
  query(input: RetirementDispositionQuery): Promise<RetirementDispositionQueryResult>;
}

/**
 * Project one dependent-specific disposition from an authenticated namespace.
 *
 * @param enumeration - Complete validated records reachable from the dependent
 * @param input - Retired subject and dependent asking for its authored mapping
 * @returns One closed resolution without storage location details
 */
export function queryRetirementDisposition(
  enumeration: RetirementRecordEnumerationResult,
  input: RetirementDispositionQuery,
): RetirementDispositionQueryResult {
  if (enumeration.status !== "valid") return { status: enumeration.status };

  const candidates: RetirementReceipt[] = [];
  for (const entry of enumeration.records) {
    if (entry.record.kind !== "receipt") continue;
    const receipt = entry.record.value;
    if (
      receipt.subject.kind === "work-unit"
      && receipt.subject.name === input.retiredSubject
      && receipt.transition !== "park-planning"
    ) candidates.push(receipt);
  }
  if (candidates.length === 0) return { status: "absent" };
  if (candidates.length > 1) return { status: "ambiguous" };

  const receipt = candidates[0];
  if (receipt === undefined) return { status: "absent" };
  const evidenceQuality = qualityOf(receipt);
  if (evidenceQuality === null) return { status: "namespace-corrupt" };

  switch (receipt.result.kind) {
    case "rename":
      return {
        status: "unique",
        evidenceQuality,
        disposition: { kind: "retarget", targetSlug: receipt.result.targetSlug },
      };
    case "discard":
      return {
        status: "unique",
        evidenceQuality,
        disposition: { kind: "abandoned" },
      };
    case "decompose": {
      const mapping = receipt.result.allocation.incomingEdges
        .find((edge) => edge.dependent === input.dependentSlug);
      if (mapping === undefined) return { status: "unmapped-dependent", evidenceQuality };
      return mapping.disposition.kind === "replace"
        ? {
            status: "unique",
            evidenceQuality,
            disposition: {
              kind: "replace",
              replacementTargets: mapping.disposition.replacementTargets,
            },
          }
        : {
            status: "unique",
            evidenceQuality,
            disposition: {
              kind: "drop",
              reason: mapping.disposition.reason,
            },
          };
    }
    case "relocate":
      return { status: "absent" };
    default: {
      const exhaustive: never = receipt.result;
      return exhaustive;
    }
  }
}

function qualityOf(receipt: RetirementReceipt): RetirementEvidenceQuality | null {
  if (receipt.schemaVersion === 1) return "unknown";
  return receipt.inventoryRead === "not-applicable" ? null : receipt.inventoryRead;
}
