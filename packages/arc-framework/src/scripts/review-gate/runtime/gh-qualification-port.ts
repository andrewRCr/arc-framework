/** Developer-authenticated actions and canonical GitHub re-queries for qualification cells. */

import { buildCodexReviewCommand } from "../providers/codex/adapter.js";
import { deriveReviewGateAction } from "../core/next-action.js";
import { runPerformAction } from "./action-main.js";
import { GhDeveloperActionPort } from "./gh-action-port.js";
import type { QualificationCellId, QualificationCellResult, QualificationScope } from "./qualification-contract.js";
import {
  assertQualificationPending,
  deriveQualificationCellResult,
  type QualificationDispatchProof,
  type QualificationRawRecord,
} from "./qualification-evidence.js";
import type { QualificationProbePort } from "./qualification-runner.js";
import type { ProcessRunner } from "./gh-action-port.js";
import type { DeveloperActionPort, NextActionReader } from "./action-main.js";
import type { ReviewRequest } from "../core/execution.js";
import { computePolicyVersion } from "../core/identity.js";
import { createHostedProviderProbePolicy } from "../policy/self-hosting/qualification.js";
import { SELF_HOSTING_POLICY } from "../policy/self-hosting/schema.js";

export interface QualificationProbeDescriptor {
  cellId: QualificationCellId;
  preconditionApiPaths?: string[];
  evidenceApiPaths: string[];
  dispatch: "none" | "reconcile" | "qualify-token" | "repair";
  action?: { requestKey: string; generation: number };
  repairAttestation?: string;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("qualification-gh-response-malformed");
  }
}

function emptyEvidence(value: unknown): boolean {
  if (value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value).length === 0;
}

function qualificationError(error: unknown, code: string): Error {
  return error instanceof Error ? error : new Error(code, { cause: error });
}

function repoPath(scope: QualificationScope): string {
  return `repos/${scope.repositoryRef}`;
}

function workflowFile(descriptor: QualificationProbeDescriptor): string {
  if (descriptor.dispatch === "qualify-token") return "review-gate-qualify.yml";
  if (descriptor.dispatch === "repair") return "review-gate-repair.yml";
  return "review-gate.yml";
}

function dispatchEvent(descriptor: QualificationProbeDescriptor): QualificationDispatchProof["expectedEvent"] {
  return descriptor.dispatch === "reconcile" ? "workflow_dispatch" : "repository_dispatch";
}

function expectedDispatch(cellId: QualificationCellId): QualificationProbeDescriptor["dispatch"] {
  if (cellId === "token-stateless" || cellId === "token-classic") return "qualify-token";
  if (cellId === "repair-authority") return "repair";
  if (cellId === "pending-first"
    || cellId === "provider-fallback"
    || cellId === "ledger-reconstruction"
    || cellId.startsWith("coderabbit-")
    || cellId.startsWith("codex-")) return "reconcile";
  return "none";
}

/** Exact cell actions plus live evidence re-query; private descriptors cannot substitute for missing host records. */
export class GhQualificationProbePort implements QualificationProbePort {
  private readonly descriptors: Map<QualificationCellId, QualificationProbeDescriptor>;
  private readonly evidenceAttempts: number;
  private readonly pause: () => Promise<void>;
  private readonly dispatchProofs = new Map<QualificationCellId, QualificationDispatchProof>();
  private lastScope: QualificationScope | null = null;

  constructor(
    private readonly process: ProcessRunner,
    descriptors: QualificationProbeDescriptor[],
    options: { evidenceAttempts?: number; pause?: () => Promise<void> } = {},
  ) {
    this.descriptors = new Map(descriptors.map((descriptor) => [descriptor.cellId, descriptor]));
    this.evidenceAttempts = options.evidenceAttempts ?? 1;
    this.pause = options.pause ?? (() => Promise.resolve());
    if (!Number.isSafeInteger(this.evidenceAttempts) || this.evidenceAttempts <= 0) {
      throw new Error("qualification-probe-attempts-invalid");
    }
    if (this.descriptors.size !== descriptors.length) throw new Error("qualification-probe-descriptor-duplicate");
    if (descriptors.some((descriptor) => descriptor.dispatch !== expectedDispatch(descriptor.cellId))) {
      throw new Error("qualification-probe-dispatch-mismatch");
    }
    if (descriptors.some((descriptor) => {
      const actorAction = descriptor.cellId === "coderabbit-command-trigger"
        || descriptor.cellId.startsWith("codex-");
      return actorAction !== (descriptor.action !== undefined)
        || (actorAction && (descriptor.preconditionApiPaths?.length ?? 0) === 0)
        || (descriptor.action !== undefined && (!/^[a-f0-9]{64}$/u.test(descriptor.action.requestKey)
          || !Number.isSafeInteger(descriptor.action.generation) || descriptor.action.generation < 0));
    })) throw new Error("qualification-probe-action-contract-mismatch");
  }

  private async currentHead(scope: QualificationScope, cellId: QualificationCellId): Promise<string> {
    return (await this.process.run("gh", [
      "api", `${repoPath(scope)}/pulls/${scope.cellScopes[cellId].pullRequestNumber}`, "--jq", ".head.sha",
    ])).stdout.trim();
  }

  private async priorWorkflowRunIds(
    descriptor: QualificationProbeDescriptor,
    scope: QualificationScope,
  ): Promise<string[]> {
    const response = await this.process.run("gh", [
      "api",
      `${repoPath(scope)}/actions/workflows/${workflowFile(descriptor)}/runs?event=${dispatchEvent(descriptor)}`
        + `&branch=${encodeURIComponent(scope.defaultBranch)}&per_page=100`,
    ]);
    const value = parseJson(response.stdout);
    const runs = value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).workflow_runs : null;
    if (!Array.isArray(runs)) throw new Error("qualification-probe-workflow-runs-malformed");
    return runs.map((run) => {
      if (run === null || typeof run !== "object" || Array.isArray(run)) {
        throw new Error("qualification-probe-workflow-run-malformed");
      }
      const id = (run as Record<string, unknown>).id;
      if (typeof id !== "number" && typeof id !== "string") {
        throw new Error("qualification-probe-workflow-run-malformed");
      }
      return String(id);
    });
  }

  private async performAssignedAction(
    descriptor: QualificationProbeDescriptor,
    scope: QualificationScope,
  ): Promise<QualificationRawRecord[]> {
    if (descriptor.cellId !== "coderabbit-command-trigger" && !descriptor.cellId.startsWith("codex-")) return [];
    if (descriptor.action === undefined) throw new Error("qualification-probe-action-missing");
    let preconditionRecords: QualificationRawRecord[] = [];
    let lastError: Error | null = new Error("qualification-probe-pending-unavailable");
    for (let attempt = 1; attempt <= this.evidenceAttempts; attempt += 1) {
      try {
        preconditionRecords = await this.readRecords(scope, descriptor.preconditionApiPaths ?? []);
        assertQualificationPending(
          scope,
          descriptor.cellId,
          preconditionRecords,
          descriptor.action.requestKey,
        );
        lastError = null;
        break;
      } catch (error) {
        lastError = qualificationError(error, "qualification-probe-pending-unavailable");
        if (attempt < this.evidenceAttempts) await this.pause();
      }
    }
    if (lastError !== null) throw lastError;
    const cellScope = scope.cellScopes[descriptor.cellId];
    const command = descriptor.cellId === "coderabbit-command-trigger"
      ? "@coderabbitai full review"
      : buildCodexReviewCommand(scope.guidanceDigests.codex ?? "");
    const actionFromRequest = (request: ReviewRequest) => {
      const provider = descriptor.cellId === "coderabbit-command-trigger" ? "coderabbit" : "codex";
      const expectedSource = scope.sourceIdentities[provider] ?? "";
      const expectedPolicyVersion = computePolicyVersion({
        policy: createHostedProviderProbePolicy(
          SELF_HOSTING_POLICY,
          provider,
          provider === "codex" ? scope.guidanceDigests.codex ?? null : null,
        ),
      });
      if (request.repositoryId !== scope.repositoryId
        || request.changeRequestId !== cellScope.changeRequestId
        || request.coverageThroughSha !== cellScope.headSha
        || request.sourceIdentity !== expectedSource
        || request.policyVersion !== expectedPolicyVersion
        || request.requiredActorIdentity !== scope.expectedActorIdentity
        || request.requestCommand !== command) {
        throw new Error("qualification-probe-assigned-request-mismatch");
      }
      return deriveReviewGateAction({
        repositoryId: scope.repositoryId,
        changeRequestId: cellScope.changeRequestId,
        headSha: cellScope.headSha,
        request,
        projection: {
          schemaVersion: 1,
          conclusion: "pending",
          summary: "qualification request pending",
          blockers: [],
          requirementExecutions: [],
          receiptRefs: [],
          policyDecision: {
            lane: "reviewed",
            reviewRisk: "sensitive",
            disposition: "required",
            reasons: [],
            policyVersion: request.policyVersion,
          },
          ciState: "success",
          ledgerVersion: null,
          evidence: [],
        },
      });
    };
    const reader: NextActionReader = {
      read: async (input) => {
        if (input.repositoryId !== scope.repositoryId
          || input.changeRequestId !== cellScope.changeRequestId
          || input.headSha !== cellScope.headSha
          || await this.currentHead(scope, descriptor.cellId) !== cellScope.headSha) {
          throw new Error("qualification-probe-action-scope-moved");
        }
        const currentRecords = await this.readRecords(scope, descriptor.preconditionApiPaths ?? []);
        const request = assertQualificationPending(
          scope,
          descriptor.cellId,
          currentRecords,
          descriptor.action?.requestKey,
        );
        return actionFromRequest(request);
      },
    };
    const developer = new GhDeveloperActionPort(this.process);
    const port: DeveloperActionPort = {
      currentActorIdentity: () => developer.currentActorIdentity(),
      postComment: (input) => developer.postComment(input),
      findComments: (input) => developer.findComments(input),
      dispatchReconcile: async (input) => {
        if (input.repositoryRef !== scope.repositoryRef
          || input.pullRequestNumber !== cellScope.pullRequestNumber
          || input.headSha !== cellScope.headSha) {
          throw new Error("qualification-probe-redispatch-scope-moved");
        }
        await this.dispatchProtectedWorkflow(descriptor, scope);
      },
    };
    await runPerformAction({
      repositoryRef: scope.repositoryRef,
      pullRequestNumber: cellScope.pullRequestNumber,
      repositoryId: scope.repositoryId,
      changeRequestId: cellScope.changeRequestId,
      headSha: cellScope.headSha,
      requestKey: descriptor.action.requestKey,
      generation: descriptor.action.generation,
    }, {
      reader,
      port,
      now: () => new Date(),
    });
    return preconditionRecords;
  }

  private async dispatchProtectedWorkflow(
    descriptor: QualificationProbeDescriptor,
    scope: QualificationScope,
  ): Promise<void> {
    const root = repoPath(scope);
    if (descriptor.dispatch === "none") return;
    const priorRunIds = await this.priorWorkflowRunIds(descriptor, scope);
    const recordProof = (): void => {
      this.dispatchProofs.set(descriptor.cellId, {
        expectedEvent: dispatchEvent(descriptor),
        priorRunIds,
        actorIdentity: scope.expectedActorIdentity,
      });
    };
    if (descriptor.dispatch === "reconcile") {
      const cellScope = scope.cellScopes[descriptor.cellId];
      const provider = descriptor.cellId.startsWith("coderabbit-") ? "coderabbit"
        : descriptor.cellId.startsWith("codex-") ? "codex" : null;
      await this.process.run("gh", [
        "api", `${root}/actions/workflows/review-gate.yml/dispatches`, "--method", "POST",
        "--field", `ref=${scope.defaultBranch}`,
        "--field", `inputs[pull_request]=${cellScope.pullRequestNumber}`,
        "--field", `inputs[head_sha]=${cellScope.headSha}`,
        ...(provider === null ? [] : ["--field", `inputs[qualification_provider]=${provider}`]),
        ...(provider !== "codex" ? [] : [
          "--field", `inputs[qualification_guidance_digest]=${scope.guidanceDigests.codex ?? ""}`,
        ]),
      ]);
      recordProof();
      return;
    }
    if (descriptor.dispatch === "qualify-token") {
      await this.process.run("gh", [
        "api", `${root}/dispatches`, "--method", "POST", "--raw-field", "event_type=review-gate-qualify",
      ]);
      recordProof();
      return;
    }
    if (descriptor.repairAttestation === undefined) throw new Error("qualification-repair-attestation-missing");
    await this.process.run("gh", [
      "api", `${root}/dispatches`, "--method", "POST", "--raw-field", "event_type=review-gate-repair",
      "--field", `client_payload[pull_request]=${scope.cellScopes[descriptor.cellId].pullRequestNumber}`,
      "--raw-field", `client_payload[payload]=${descriptor.repairAttestation}`,
    ]);
    recordProof();
  }

  async execute(cellId: QualificationCellId, scope: QualificationScope): Promise<{
    result: Omit<QualificationCellResult, "rawCheckpointHash">;
    rawNonSecret: unknown;
  }> {
    this.lastScope = scope;
    const descriptor = this.descriptors.get(cellId);
    if (descriptor === undefined || descriptor.evidenceApiPaths.length === 0) {
      throw new Error("qualification-probe-descriptor-missing");
    }
    const cellScope = scope.cellScopes[cellId];
    const actor = (await this.process.run("gh", ["api", "user", "--jq", ".id"])).stdout.trim();
    if (actor !== scope.expectedActorIdentity) throw new Error("qualification-probe-actor-mismatch");
    const head = await this.currentHead(scope, cellId);
    if (head !== cellScope.headSha) throw new Error("qualification-probe-head-mismatch");
    await this.dispatchProtectedWorkflow(descriptor, scope);
    const preconditionRecords = await this.performAssignedAction(descriptor, scope);
    let lastError = new Error("qualification-probe-evidence-unavailable");
    for (let attempt = 1; attempt <= this.evidenceAttempts; attempt += 1) {
      try {
        const rawRecords = await this.readRecords(scope, descriptor.evidenceApiPaths);
        const combined = [...preconditionRecords, ...rawRecords];
        return {
          result: deriveQualificationCellResult(scope, cellId, combined, this.dispatchProofs.get(cellId)),
          rawNonSecret: { cellId, records: combined },
        };
      } catch (error) {
        lastError = qualificationError(error, "qualification-probe-evidence-unavailable");
        if (attempt < this.evidenceAttempts) await this.pause();
      }
    }
    throw lastError;
  }

  private async readRecords(scope: QualificationScope, paths: string[]): Promise<QualificationRawRecord[]> {
    const records: QualificationRawRecord[] = [];
    for (const path of paths) {
      if (!path.startsWith(`${repoPath(scope)}/`)) throw new Error("qualification-probe-path-outside-repository");
      const response = await this.process.run("gh", ["api", path]);
      const value = parseJson(response.stdout);
      if (emptyEvidence(value)) throw new Error("qualification-probe-evidence-empty");
      records.push({ path, value });
    }
    return records;
  }

  async restoreSafeCheckpoint(cellId: QualificationCellId): Promise<void> {
    if (this.lastScope === null) return;
    void cellId;
    await this.process.run("gh", [
      "api", `${repoPath(this.lastScope)}/issues/${this.lastScope.cellScopes[cellId].pullRequestNumber}/labels/arc-review-gate`,
      "--method", "DELETE",
    ]).catch(() => undefined);
  }
}
