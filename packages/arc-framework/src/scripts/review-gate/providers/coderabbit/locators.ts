/**
 * Receipt-backed CodeRabbit locators binding a `requestIdentity` / `ReviewRequest`
 * to its live pull-request number and run context from canonical controller state.
 *
 * The reconcile composition satisfies CodeRabbit through GitHub's decisive native
 * review, not provider-observed runs, so these locators exist to complete the
 * dormant production `CodeRabbitApi`; they activate only when a `coderabbit-pr`
 * declaration is enabled and qualified.
 *
 * @module
 */

import type { ReviewRequest } from "../../core/execution.js";
import type { ReceiptLedger } from "../../core/ports.js";
import { computeRequestKey } from "../../core/request-key.js";
import type { ChangeRequestResolution } from "../../hosts/github/change-request.js";
import { CodeRabbitRequestError, type CodeRabbitRunContext } from "./adapter.js";
import type { CodeRabbitObservationLocator } from "./github-observation.js";
import type { CodeRabbitRequestLocator } from "./github-trigger.js";

/** Canonical controller state a locator resolves a run against. */
export interface CodeRabbitLocatorDeps {
  pullRequestNumber: number;
  resolveChange: () => Promise<ChangeRequestResolution>;
  readLedger: (changeRequestId: string) => Promise<ReceiptLedger>;
}

async function resolvedChange(deps: CodeRabbitLocatorDeps) {
  const change = await deps.resolveChange();
  if (change.kind !== "resolved") throw new CodeRabbitRequestError("change-request-unavailable");
  return change.changeRequest;
}

/** Resolve a request's live pull number and current/replay/stale disposition. */
export class ReceiptBackedCodeRabbitRequestLocator implements CodeRabbitRequestLocator {
  private readonly deps: CodeRabbitLocatorDeps;

  constructor(deps: CodeRabbitLocatorDeps) {
    this.deps = deps;
  }

  async resolve(request: ReviewRequest): Promise<{ state: "current" | "replay" | "stale"; pullNumber: number }> {
    const change = await resolvedChange(this.deps);
    const pullNumber = this.deps.pullRequestNumber;
    if (request.coverageThroughSha !== change.headSha) return { state: "stale", pullNumber };
    const ledger = await this.deps.readLedger(change.changeRequestId);
    const receipts = ledger.kind === "valid" ? ledger.receipts : [];
    const requestKey = computeRequestKey(request);
    const alreadyTriggered = receipts.some((envelope) =>
      computeRequestKey(envelope.receipt.request) === requestKey
      && (envelope.receipt.action === "acknowledged" || envelope.receipt.action === "terminal-failure"));
    return { state: alreadyTriggered ? "replay" : "current", pullNumber };
  }
}

/** Recover a reserved run's context from the receipt ledger for provider observation. */
export class ReceiptBackedCodeRabbitObservationLocator implements CodeRabbitObservationLocator {
  private readonly deps: CodeRabbitLocatorDeps;

  constructor(deps: CodeRabbitLocatorDeps) {
    this.deps = deps;
  }

  async resolveRun(
    requestIdentity: string,
  ): Promise<{ pullNumber: number; context: CodeRabbitRunContext; candidateTailStart: string | null }> {
    const change = await resolvedChange(this.deps);
    const ledger = await this.deps.readLedger(change.changeRequestId);
    const receipts = ledger.kind === "valid" ? ledger.receipts : [];
    const reserved = receipts.find((envelope) => envelope.receipt.action === "reserved"
      && computeRequestKey(envelope.receipt.request) === requestIdentity);
    if (reserved === undefined) throw new CodeRabbitRequestError("run-not-found");
    const request = reserved.receipt.request;
    return {
      pullNumber: this.deps.pullRequestNumber,
      candidateTailStart: null,
      context: {
        requestIdentity,
        requirementId: request.requirementId,
        policyVersion: request.policyVersion,
        rubricVersion: request.rubricVersion,
        baseRef: change.baseRef,
        diffBaseSha: change.diffBaseSha,
        headSha: change.headSha,
        changeSetId: change.changeSetId,
        coverage: request.coverage,
        coverageFromSha: request.coverageFromSha,
        coverageThroughSha: request.coverageThroughSha,
        reviewRunId: requestIdentity,
        observedAt: reserved.recordedAt,
        trigger: "controller",
      },
    };
  }

  resolveCurrent(): Promise<{
    pullNumber: number;
    context: CodeRabbitRunContext;
    candidateTailStart: string | null;
  } | null> {
    return Promise.resolve(null);
  }
}
