/** The stop an Errand's next review takes while its predecessor hosted response still owes host settlement. */

import { spineRemedy, type SpineRemedy } from "../integration/spine-refusal.js";
import type { LaneSubjectLineage } from "./core/lane-admission.js";
import type { LaneProgressState } from "./core/operation-state-schema.js";
import { pendingHostedSettlement, type PendingHostedSettlement } from "./hosted-response-completion.js";

const SETTLEMENT_INVARIANT = "An approved hosted response is complete only once each finding it answers on the host is "
  + "settled there, and the next look follows the completed response.";

/** Describe an approved hosted response's unsettled fixes. */
export function pendingHostedSettlementDetail(pending: PendingHostedSettlement): string {
  return `Hosted review ${pending.attemptId} has fixed findings not yet settled on the host: `
    + `${pending.findingIds.join(", ")}.`;
}

/**
 * Name the settle command for each pending finding before the refused command runs again.
 *
 * @param pending - The response and its unsettled findings.
 * @param rerun - The refused command, as the operator re-runs it after settling.
 * @returns The remedy whose command settles one finding per request.
 */
export function hostedSettlementRemedy(pending: PendingHostedSettlement, rerun: string): SpineRemedy {
  return spineRemedy(SETTLEMENT_INVARIANT,
    `Settle findings ${pending.findingIds.join(", ")} of ${pending.attemptId} under disposition set `
      + `${pending.dispositionSetId} before ${rerun}, one request per finding, each through`,
    ["arc", "review", "hosted", "settle", "-"]);
}

/** A review continuation refused while its Errand predecessor's hosted response still owes host settlement. */
export class PendingHostedSettlementError extends Error {
  readonly code = "invalid-input" as const;

  constructor(readonly pending: PendingHostedSettlement) {
    super(pendingHostedSettlementDetail(pending));
    this.name = "PendingHostedSettlementError";
  }
}

/**
 * Refuse an Errand's next look while the review it follows still owes host settlement.
 *
 * @param lineage - The current subject; other lineages pass unchanged.
 * @param predecessor - The claim's latest completed review at an earlier head.
 */
export function requireSettledErrandPredecessor(lineage: LaneSubjectLineage,
  predecessor: LaneProgressState["attempts"][number] | null | undefined): void {
  if (lineage.kind !== "head-bound" || lineage.vehicleKind !== "errand" || predecessor === null
    || predecessor === undefined) return;
  const pending = pendingHostedSettlement(predecessor);
  if (pending !== null) throw new PendingHostedSettlementError(pending);
}
