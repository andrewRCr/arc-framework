/** Receipt-backed hosted Codex request, guidance, and observation locators. */

import type { ReviewRequest } from "../../core/execution.js";
import type { ReceiptLedger } from "../../core/ports.js";
import type { HostChangedPath } from "../../core/ports.js";
import { computeRequestKey } from "../../core/request-key.js";
import type { ChangeRequestResolution } from "../../hosts/github/change-request.js";
import { buildCodexReviewCommand, CodexRequestError, type CodexRunContext } from "./adapter.js";
import { resolveCodexGuidance, type CodexGuidanceObjectReader } from "./guidance.js";
import type { CodexObservationLocator } from "./github-observation.js";
import type { CodexRequestLocator } from "./github-trigger.js";

export interface CodexLocatorDeps {
  pullRequestNumber: number;
  resolveChange: () => Promise<ChangeRequestResolution>;
  readLedger: (changeRequestId: string) => Promise<ReceiptLedger>;
  guidanceReader: CodexGuidanceObjectReader;
}

async function resolvedChange(deps: CodexLocatorDeps) {
  const change = await deps.resolveChange();
  if (change.kind !== "resolved") throw new CodexRequestError("change-request-unavailable");
  return change;
}

function guidanceChanges(changes: Array<{ status: string; path: string; previousPath?: string }>): HostChangedPath[] {
  return changes.map((change) => {
    if (change.status === "renamed") {
      if (change.previousPath === undefined) throw new CodexRequestError("renamed-path-origin-missing");
      return { status: "renamed", path: change.path, previousPath: change.previousPath };
    }
    if (change.status === "added" || change.status === "modified" || change.status === "deleted") {
      return { status: change.status, path: change.path };
    }
    throw new CodexRequestError("changed-path-status-unsupported");
  });
}

/** Canonical request/run locator whose guidance reads come from exact-head git objects. */
export class ReceiptBackedCodexLocator implements CodexRequestLocator, CodexObservationLocator {
  private readonly deps: CodexLocatorDeps;

  constructor(deps: CodexLocatorDeps) {
    this.deps = deps;
  }

  async resolveRequestGuidance(request: ReviewRequest): Promise<
    | { qualified: true; guidanceDigest: string }
    | { qualified: false; reasons: string[] }
  > {
    const change = await resolvedChange(this.deps);
    if (
      request.sourceIdentity !== "codex-pr"
      || request.coverageThroughSha !== change.changeRequest.headSha
      || request.changeSetId !== change.changeRequest.changeSetId
    ) return { qualified: false, reasons: ["stale-request"] };
    const guidance = await resolveCodexGuidance({
      headSha: request.coverageThroughSha,
      changes: guidanceChanges(change.context.changedPaths),
      reader: this.deps.guidanceReader,
    });
    return guidance.qualified
      ? { qualified: true, guidanceDigest: guidance.digest }
      : { qualified: false, reasons: guidance.reasons };
  }

  async resolve(request: ReviewRequest): Promise<{
    state: "current" | "replay" | "stale";
    pullNumber: number;
    reservedAt: string;
  }> {
    const change = await resolvedChange(this.deps);
    const ledger = await this.deps.readLedger(change.changeRequest.changeRequestId);
    if (ledger.kind !== "valid") throw new CodexRequestError("receipt-ledger-degraded");
    const requestIdentity = computeRequestKey(request);
    const reservation = ledger.receipts.find((entry) => entry.receipt.action === "reserved"
      && computeRequestKey(entry.receipt.request) === requestIdentity);
    if (reservation === undefined) throw new CodexRequestError("reservation-not-found");
    const stale = request.coverageThroughSha !== change.changeRequest.headSha;
    const acknowledged = ledger.receipts.some((entry) => entry.receipt.action === "acknowledged"
      && computeRequestKey(entry.receipt.request) === requestIdentity);
    return {
      state: stale ? "stale" : acknowledged ? "replay" : "current",
      pullNumber: this.deps.pullRequestNumber,
      reservedAt: reservation.recordedAt,
    };
  }

  async resolveRun(requestIdentity: string): Promise<{ pullNumber: number; context: CodexRunContext }> {
    const change = await resolvedChange(this.deps);
    const ledger = await this.deps.readLedger(change.changeRequest.changeRequestId);
    if (ledger.kind !== "valid") throw new CodexRequestError("receipt-ledger-degraded");
    const reservation = ledger.receipts.find((entry) => entry.receipt.action === "reserved"
      && computeRequestKey(entry.receipt.request) === requestIdentity);
    const acknowledgement = ledger.receipts.find((entry) => entry.receipt.action === "acknowledged"
      && computeRequestKey(entry.receipt.request) === requestIdentity);
    if (reservation === undefined || acknowledgement === undefined) throw new CodexRequestError("run-not-found");
    if (acknowledgement.receipt.payload.kind !== "acknowledgement") {
      throw new CodexRequestError("acknowledgement-payload-missing");
    }
    const request = reservation.receipt.request;
    const guidance = await this.resolveRequestGuidance(request);
    if (!guidance.qualified) throw new CodexRequestError(guidance.reasons[0] ?? "guidance-unresolved");
    if (request.requestCommand !== buildCodexReviewCommand(guidance.guidanceDigest)) {
      throw new CodexRequestError("guidance-command-mismatch");
    }
    const trigger = acknowledgement.receipt.payload.trigger;
    if (trigger.eventKind !== "comment" || trigger.occurredAt === null) {
      throw new CodexRequestError("trigger-provenance-missing");
    }
    return {
      pullNumber: this.deps.pullRequestNumber,
      context: {
        requestIdentity,
        requirementId: request.requirementId,
        policyVersion: request.policyVersion,
        rubricVersion: request.rubricVersion,
        baseRef: change.changeRequest.baseRef,
        diffBaseSha: change.changeRequest.diffBaseSha,
        headSha: change.changeRequest.headSha,
        changeSetId: change.changeRequest.changeSetId,
        coverage: request.coverage,
        coverageFromSha: request.coverageFromSha,
        coverageThroughSha: request.coverageThroughSha,
        reviewRunId: requestIdentity,
        observedAt: acknowledgement.recordedAt,
        triggerEventId: trigger.eventId,
        triggerOccurredAt: trigger.occurredAt,
        guidanceDigest: guidance.guidanceDigest,
      },
    };
  }

  async resolveCurrent(): Promise<{ pullNumber: number; context: CodexRunContext } | null> {
    const change = await resolvedChange(this.deps);
    const ledger = await this.deps.readLedger(change.changeRequest.changeRequestId);
    if (ledger.kind !== "valid") throw new CodexRequestError("receipt-ledger-degraded");
    const acknowledgement = [...ledger.receipts].reverse().find((entry) =>
      entry.receipt.action === "acknowledged"
      && entry.receipt.request.sourceIdentity === "codex-pr"
      && entry.receipt.request.coverageThroughSha === change.changeRequest.headSha);
    if (acknowledgement === undefined) return null;
    return this.resolveRun(computeRequestKey(acknowledgement.receipt.request));
  }
}
