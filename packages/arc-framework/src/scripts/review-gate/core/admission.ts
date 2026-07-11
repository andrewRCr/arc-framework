/** Admission rules for automatic, refresh, alternate, and out-of-band paths. */

import type { ReviewRequirement } from "./contracts.js";
import type { CoverageKind } from "./evidence.js";
import type { ReviewReceipt, SourceCapacity } from "./execution.js";

/** Automatic admission inputs. */
export interface AutomaticAdmissionInput {
  requirement: ReviewRequirement;
  ready: boolean;
  draft: boolean;
  history: ReviewReceipt[];
  capacity: SourceCapacity;
}

/** Admission decision with generation when admitted. */
export interface AdmissionDecision {
  admit: boolean;
  generation: number | null;
  reason: string;
}

/** Admit at most one automatic generation-zero request. */
export function admitAutomaticRequest(input: AutomaticAdmissionInput): AdmissionDecision {
  if (input.draft) return { admit: false, generation: null, reason: "draft" };
  if (!input.ready) return { admit: false, generation: null, reason: "not-ready" };
  if (input.requirement.obligation !== "required") {
    return { admit: false, generation: null, reason: "not-required" };
  }
  if (input.requirement.initialAdmission !== "automatic") {
    return { admit: false, generation: null, reason: "checkpoint-only" };
  }
  if (input.history.some((receipt) => receipt.request.requirementId === input.requirement.id)) {
    return { admit: false, generation: null, reason: "admitted-history-exists" };
  }
  if (input.capacity.status === "exhausted") {
    return { admit: false, generation: null, reason: "capacity-exhausted" };
  }
  if (input.capacity.reason === "lookup-failed") {
    return { admit: false, generation: null, reason: "capacity-lookup-failed" };
  }
  return { admit: true, generation: 0, reason: "automatic-initial" };
}

/** Inputs for an explicit same-change-set refresh. */
export interface RefreshAdmissionInput {
  authorized: boolean;
  priorGenerations: number[];
  coverage: CoverageKind;
  chainHeadSha: string;
  coverageFromSha: string;
}

/** Admit an authorized refresh and advance its generation. */
export function admitRefresh(input: RefreshAdmissionInput): AdmissionDecision {
  if (!input.authorized) return { admit: false, generation: null, reason: "unauthorized" };
  if (input.coverage === "incremental" && input.coverageFromSha !== input.chainHeadSha) {
    return { admit: false, generation: null, reason: "invalid-incremental-bound" };
  }
  const generation = input.priorGenerations.length === 0 ? 0 : Math.max(...input.priorGenerations) + 1;
  return { admit: true, generation, reason: "authorized-refresh" };
}

/** Admit a distinct qualified source only with full coverage. */
export function admitAlternate(input: {
  qualified: boolean;
  coverage: CoverageKind;
  sourceChanged: boolean;
}): AdmissionDecision {
  if (!input.qualified) return { admit: false, generation: null, reason: "unqualified-source" };
  if (!input.sourceChanged) return { admit: false, generation: null, reason: "same-source" };
  if (input.coverage !== "full") return { admit: false, generation: null, reason: "alternate-requires-full" };
  return { admit: true, generation: 0, reason: "qualified-alternate" };
}

/** Accept independently qualified evidence without inventing request history. */
export function admitOutOfBandEvidence(input: {
  qualified: boolean;
  current: boolean;
  durable: boolean;
}): { accepted: boolean; requestSuppressed: boolean; receiptAction: "unadmitted" | null } {
  const accepted = input.qualified && input.current && input.durable;
  return {
    accepted,
    requestSuppressed: accepted,
    receiptAction: accepted ? "unadmitted" : null,
  };
}
