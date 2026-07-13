/** Developer-authenticated actions and canonical GitHub re-queries for qualification cells. */

import type { QualificationCellId, QualificationCellResult, QualificationScope } from "./qualification-contract.js";
import type { QualificationProbePort } from "./qualification-runner.js";
import type { ProcessRunner } from "./gh-action-port.js";

export interface QualificationProbeDescriptor {
  cellId: QualificationCellId;
  result: Omit<QualificationCellResult, "rawCheckpointHash" | "repositoryId" | "pullRequestNumber" | "headSha" | "workflowSha" | "actorIdentity">;
  evidenceApiPaths: string[];
  dispatch: "none" | "reconcile" | "qualify-token" | "repair";
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

function repoPath(scope: QualificationScope): string {
  return `repos/${scope.repositoryRef}`;
}

function expectedDispatch(cellId: QualificationCellId): QualificationProbeDescriptor["dispatch"] {
  if (cellId === "token-stateless" || cellId === "token-classic") return "qualify-token";
  if (cellId === "repair-authority") return "repair";
  if (cellId === "pending-first"
    || cellId === "provider-fallback"
    || cellId === "event-repair"
    || cellId === "ledger-reconstruction"
    || cellId.startsWith("coderabbit-")
    || cellId.startsWith("codex-")) return "reconcile";
  return "none";
}

/** Exact cell actions plus live evidence re-query; private descriptors cannot substitute for missing host records. */
export class GhQualificationProbePort implements QualificationProbePort {
  private readonly descriptors: Map<QualificationCellId, QualificationProbeDescriptor>;
  private lastScope: QualificationScope | null = null;

  constructor(private readonly process: ProcessRunner, descriptors: QualificationProbeDescriptor[]) {
    this.descriptors = new Map(descriptors.map((descriptor) => [descriptor.cellId, descriptor]));
    if (this.descriptors.size !== descriptors.length) throw new Error("qualification-probe-descriptor-duplicate");
    if (descriptors.some((descriptor) => descriptor.dispatch !== expectedDispatch(descriptor.cellId))) {
      throw new Error("qualification-probe-dispatch-mismatch");
    }
  }

  private async performAssignedAction(cellId: QualificationCellId, scope: QualificationScope): Promise<void> {
    const root = repoPath(scope);
    if (cellId === "coderabbit-label-trigger") {
      await this.process.run("gh", [
        "api", `${root}/issues/${scope.disposablePullRequest}/labels`, "--method", "POST",
        "--field", "labels[]=arc-review-gate",
      ]);
    }
    const body = cellId === "coderabbit-command-trigger" ? "@coderabbitai full review"
      : cellId === "codex-comment-trigger"
        ? "@codex review\n\nApply every independent-analysis/v1 rubric dimension to the complete current change set."
        : null;
    if (body !== null) {
      await this.process.run("gh", [
        "api", `${root}/issues/${scope.disposablePullRequest}/comments`, "--method", "POST", "--field", `body=${body}`,
      ]);
    }
  }

  private async dispatchProtectedWorkflow(
    descriptor: QualificationProbeDescriptor,
    scope: QualificationScope,
  ): Promise<void> {
    const root = repoPath(scope);
    if (descriptor.dispatch === "none") return;
    if (descriptor.dispatch === "reconcile") {
      await this.process.run("gh", [
        "api", `${root}/actions/workflows/review-gate.yml/dispatches`, "--method", "POST",
        "--field", `ref=${scope.defaultBranch}`,
        "--field", `inputs[pull_request]=${scope.disposablePullRequest}`,
        "--field", `inputs[head_sha]=${scope.disposableHeadSha}`,
      ]);
      return;
    }
    if (descriptor.dispatch === "qualify-token") {
      await this.process.run("gh", [
        "api", `${root}/dispatches`, "--method", "POST", "--raw-field", "event_type=review-gate-qualify",
      ]);
      return;
    }
    if (descriptor.repairAttestation === undefined) throw new Error("qualification-repair-attestation-missing");
    await this.process.run("gh", [
      "api", `${root}/dispatches`, "--method", "POST", "--raw-field", "event_type=review-gate-repair",
      "--field", `client_payload[pull_request]=${scope.disposablePullRequest}`,
      "--raw-field", `client_payload[payload]=${descriptor.repairAttestation}`,
    ]);
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
    if (!descriptor.result.evidenceRef.startsWith(`https://github.com/${scope.repositoryRef}/`)) {
      throw new Error("qualification-probe-evidence-ref-mismatch");
    }
    const actor = (await this.process.run("gh", ["api", "user", "--jq", ".id"])).stdout.trim();
    if (actor !== scope.expectedActorIdentity) throw new Error("qualification-probe-actor-mismatch");
    const head = (await this.process.run("gh", [
      "api", `${repoPath(scope)}/pulls/${scope.disposablePullRequest}`, "--jq", ".head.sha",
    ])).stdout.trim();
    if (head !== scope.disposableHeadSha) throw new Error("qualification-probe-head-mismatch");
    await this.performAssignedAction(cellId, scope);
    await this.dispatchProtectedWorkflow(descriptor, scope);
    const rawRecords = [];
    for (const path of descriptor.evidenceApiPaths) {
      if (!path.startsWith(`${repoPath(scope)}/`)) throw new Error("qualification-probe-path-outside-repository");
      const response = await this.process.run("gh", ["api", path]);
      const value = parseJson(response.stdout);
      if (emptyEvidence(value)) throw new Error("qualification-probe-evidence-empty");
      rawRecords.push({ path, value });
    }
    return {
      result: {
        ...descriptor.result,
        repositoryId: scope.repositoryId,
        pullRequestNumber: scope.disposablePullRequest,
        headSha: scope.disposableHeadSha,
        workflowSha: scope.defaultBranchSha,
        actorIdentity: scope.expectedActorIdentity,
      },
      rawNonSecret: { cellId, records: rawRecords },
    };
  }

  async restoreSafeCheckpoint(cellId: QualificationCellId): Promise<void> {
    if (this.lastScope === null) return;
    void cellId;
    await this.process.run("gh", [
      "api", `${repoPath(this.lastScope)}/issues/${this.lastScope.disposablePullRequest}/labels/arc-review-gate`,
      "--method", "DELETE",
    ]).catch(() => undefined);
  }
}
