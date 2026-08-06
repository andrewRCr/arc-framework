/** Dependent-specific projection of lean terminal transition history. */

import type { TransitionRecordEnumerationResult } from "./transition-record-enumeration.js";

/** Closed incoming-edge action derived from one transition record. */
export type TransitionReconcileDisposition =
  | { kind: "replace"; replacementTargets: readonly string[] }
  | { kind: "drop"; reason: string }
  | { kind: "retarget"; targetSlug: string }
  | { kind: "abandoned" };

/** Storage-independent origin/dependent lookup. */
export interface TransitionDispositionQuery {
  origin: string;
  dependentSlug: string;
}

/** Closed result returned by lean transition readers. */
export type TransitionDispositionQueryResult =
  | { status: "absent" }
  | { status: "unique"; disposition: TransitionReconcileDisposition }
  | { status: "ambiguous" }
  | { status: "unmapped-dependent" }
  | { status: "namespace-corrupt" };

/** Port implemented by Git-backed lean transition readers. */
export interface TransitionDispositionQueryPort {
  query(input: TransitionDispositionQuery): Promise<TransitionDispositionQueryResult>;
}

/** Project one dependent-specific action from an authenticated lean namespace. */
export function queryTransitionDisposition(
  enumeration: TransitionRecordEnumerationResult,
  input: TransitionDispositionQuery,
): TransitionDispositionQueryResult {
  if (enumeration.status !== "valid") return { status: "namespace-corrupt" };
  const group = enumeration.groups.find(({ origin }) => origin === input.origin);
  if (group === undefined || group.records.length === 0) return { status: "absent" };
  if (group.records.length > 1) return { status: "ambiguous" };
  const record = group.records[0];
  if (record === undefined) return { status: "namespace-corrupt" };
  if (record.kind === "rename") {
    const targetSlug = record.successors[0];
    return targetSlug === undefined
      ? { status: "namespace-corrupt" }
      : { status: "unique", disposition: { kind: "retarget", targetSlug } };
  }
  if (record.kind === "abandon") {
    return { status: "unique", disposition: { kind: "abandoned" } };
  }
  const edge = record.edges.find(({ dependent }) => dependent === input.dependentSlug);
  return edge === undefined
    ? { status: "unmapped-dependent" }
    : { status: "unique", disposition: edge.disposition };
}
