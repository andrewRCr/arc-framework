/** Safety-gated ordinary-v3 Errand abandonment after local occupancy is gone. */

import type { ChangeRequestLifecycleEvidence } from "./change-request-lifecycle.js";
import { projectLocusIdentity, type TransientIdentityRecord } from "./identity-record.js";
import type { OrdinaryErrandRecord } from "./identity-transitions.js";
import type { ErrandErrorCode, ErrandRefusalReason } from "./result-common.js";
import {
  createTerminalOperationOutcome,
  type TerminalOperationOutcome,
} from "./terminal-result.js";

type IdentityRead =
  | { kind: "ready"; record: TransientIdentityRecord | null }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export type AbandonStepResult =
  | { kind: "applied" | "idempotent" }
  | { kind: "refused"; reason: ErrandRefusalReason; message: string }
  | { kind: "error"; message: string };

type RetirementResult =
  | { kind: "applied" | "idempotent" }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export interface AbandonOrdinaryErrandDependencies {
  readIdentity(): Promise<IdentityRead>;
  cleanupResidue(record: OrdinaryErrandRecord): Promise<AbandonStepResult>;
  readLifecycle(record: OrdinaryErrandRecord): Promise<ChangeRequestLifecycleEvidence>;
  clearExecuteBound(record: OrdinaryErrandRecord): Promise<AbandonStepResult>;
  retire(record: OrdinaryErrandRecord, lifecycle: ChangeRequestLifecycleEvidence | null): Promise<RetirementResult>;
}

export interface AbandonOrdinaryErrandOptions {
  slug: string;
  protection: "full";
  dependencies: AbandonOrdinaryErrandDependencies;
}

/** Abandon one exact identity generation without interpreting absence as permission. */
export async function abandonOrdinaryErrand(
  options: AbandonOrdinaryErrandOptions,
): Promise<TerminalOperationOutcome> {
  const slug = options.slug.trim();
  if (slug === "") return refusal("identity-conflict", "Errand slug must be non-empty.");

  let read: IdentityRead;
  try {
    read = await options.dependencies.readIdentity();
  } catch (error) {
    return failure("locus.errand-abandon.identity-read", message(error));
  }
  if (read.kind === "refused") return refusal("identity-conflict", read.reason);
  if (read.kind === "error") return failure("locus.errand-abandon.identity-read", read.message);
  if (read.record === null) return alreadyAbandoned(slug);
  if (!isOrdinary(read.record) || read.record.slug !== slug) {
    return refusal("identity-conflict", `Identity '${slug}' is not an ordinary v3 Errand.`);
  }
  const record = read.record;

  let lifecycle: ChangeRequestLifecycleEvidence | null = null;
  if (record.state === "awaiting-merge") {
    try {
      lifecycle = await options.dependencies.readLifecycle(record);
    } catch (error) {
      return failure("locus.errand-abandon.host", message(error));
    }
    if (lifecycle.kind !== "closed-unmerged" || !sameChangeRequest(lifecycle, record)) {
      return refusal(
        lifecycle.kind === "open" || lifecycle.kind === "requested-work"
          ? "change-request-open"
          : lifecycle.kind === "merged" ? "identity-conflict" : "change-request-unverifiable",
        lifecycle.kind === "merged"
          ? "The exact change request merged; finalize it instead of abandoning it."
          : `Exact host truth is '${lifecycle.kind}', not closed-unmerged.`,
      );
    }
  }

  const cleanup = await runStep("locus.errand-abandon.cleanup", () => options.dependencies.cleanupResidue(record));
  if ("result" in cleanup) return cleanup.result;
  const inbox = await runStep("locus.errand-abandon.inbox", () => options.dependencies.clearExecuteBound(record));
  if ("result" in inbox) return inbox.result;

  let retired: RetirementResult;
  try {
    retired = await options.dependencies.retire(record, lifecycle);
  } catch (error) {
    return failure("locus.errand-abandon.identity", message(error));
  }
  if (retired.kind === "refused") return refusal("identity-conflict", retired.reason);
  if (retired.kind === "error") return failure("locus.errand-abandon.identity", retired.message);

  const outcome = cleanup.step.kind === "applied" || inbox.step.kind === "applied" || retired.kind === "applied"
    ? "applied"
    : "idempotent";
  return createTerminalOperationOutcome({
    outcome,
    operation: "errand-abandon",
    identity: projectLocusIdentity(record),
    nextOffer: null,
    recommendedPromptText: `Abandoned Errand '${slug}', retained its capture, and retired its identity.`,
  });
}

async function runStep(
  code: ErrandErrorCode,
  operation: () => Promise<AbandonStepResult>,
): Promise<
  { step: Extract<AbandonStepResult, { kind: "applied" | "idempotent" }> }
  | { result: TerminalOperationOutcome }
> {
  let step: AbandonStepResult;
  try {
    step = await operation();
  } catch (error) {
    return { result: failure(code, message(error)) };
  }
  if (step.kind === "refused") return { result: refusal(step.reason, step.message) };
  if (step.kind === "error") return { result: failure(code, step.message) };
  return { step };
}

function isOrdinary(record: TransientIdentityRecord): record is OrdinaryErrandRecord {
  return record.kind === "errand" && record.purpose === "errand";
}

function sameChangeRequest(evidence: ChangeRequestLifecycleEvidence, record: OrdinaryErrandRecord): boolean {
  if (record.state !== "awaiting-merge") return false;
  const expected = record.changeRequest;
  const observed = evidence.changeRequest;
  return observed.repositoryRef === expected.repositoryRef
    && observed.hostRef === expected.hostRef
    && observed.baseRef === expected.baseRef
    && observed.headRef === expected.headRef
    && observed.headSha === expected.headSha;
}

function alreadyAbandoned(slug: string): TerminalOperationOutcome {
  return createTerminalOperationOutcome({
    outcome: "idempotent",
    operation: "errand-abandon",
    identity: null,
    nextOffer: null,
    recommendedPromptText: `Errand '${slug}' is already abandoned.`,
  });
}

function refusal(reason: ErrandRefusalReason, text: string): TerminalOperationOutcome {
  return createTerminalOperationOutcome({ outcome: "refused", operation: "errand-abandon", reason, recommendedPromptText: text });
}

function failure(code: ErrandErrorCode, text: string): TerminalOperationOutcome {
  return createTerminalOperationOutcome({
    outcome: "error",
    operation: "errand-abandon",
    error: { code, message: text || "Errand abandonment failed" },
    recommendedPromptText: "Inspect the retained identity, residue, refs, and inbox binding before retrying.",
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
