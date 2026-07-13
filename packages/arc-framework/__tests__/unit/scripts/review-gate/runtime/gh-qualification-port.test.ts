import { describe, expect, it, vi } from "vitest";

import type { ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import { serializeReceiptComment } from "../../../../../src/scripts/review-gate/hosts/github/receipt-comment.js";
import { computeRequestKey, createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import { computePolicyVersion } from "../../../../../src/scripts/review-gate/core/identity.js";
import { buildCodexReviewCommand } from "../../../../../src/scripts/review-gate/providers/codex/adapter.js";
import { createHostedProviderProbePolicy } from "../../../../../src/scripts/review-gate/policy/self-hosting/qualification.js";
import { SELF_HOSTING_POLICY } from "../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";
import {
  GhQualificationProbePort,
  type QualificationProbeDescriptor,
} from "../../../../../src/scripts/review-gate/runtime/gh-qualification-port.js";
import type { ProcessRunner } from "../../../../../src/scripts/review-gate/runtime/gh-action-port.js";
import { qualificationScope } from "./qualification-fixtures.js";

function descriptor(): QualificationProbeDescriptor {
  return {
    cellId: "pending-first",
    evidenceApiPaths: ["repos/o/r/qualification-bundle"],
    dispatch: "reconcile",
  };
}

function bundle() {
  const scope = qualificationScope();
  const cell = scope.cellScopes["pending-first"];
  const request: ReviewRequest = {
    schemaVersion: 1,
    repositoryId: scope.repositoryId,
    changeRequestId: cell.changeRequestId,
    changeSetId: "f".repeat(64),
    policyVersion: scope.policyVersion,
    semanticsVersion: "review-gate/v1",
    rubricVersion: scope.rubricVersion,
    requirementId: "analysis",
    sourceIdentity: "coderabbit-pr",
    coverage: "full",
    coverageFromSha: "0".repeat(40),
    coverageThroughSha: cell.headSha,
    generation: 0,
    actorIdentity: scope.controllerBotUserId,
    requestMechanism: "automatic",
    requiredActorIdentity: scope.controllerBotUserId,
    requestCommand: null,
  };
  const receipt = createReceipt({
    eventId: "reservation-1",
    previousLedgerVersion: 0,
    action: "reserved",
    request,
    result: null,
    evidenceUrlOrId: null,
    findingIds: [],
    payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
  });
  const summary = `<!-- arc-review-gate-state:v1:${Buffer.from(JSON.stringify({
    schemaVersion: 1,
    conclusion: "pending",
    blockerCodes: [],
    ledgerVersion: 1,
    receiptRefs: ["receipt-node"],
  }), "utf8").toString("base64url")} -->`;
  return {
    workflow_runs: [{
      id: 44,
      head_sha: scope.defaultBranchSha,
      head_branch: scope.defaultBranch,
      conclusion: "success",
      event: "workflow_dispatch",
      actor: { id: Number(scope.expectedActorIdentity) },
      html_url: "https://github.com/o/r/actions/runs/44",
      path: ".github/workflows/review-gate.yml",
    }],
    comments: [{
      node_id: "receipt-node",
      body: serializeReceiptComment({ ledgerVersion: 1, receipt }),
      created_at: "2026-07-12T20:00:00Z",
      updated_at: "2026-07-12T20:00:00Z",
      performed_via_github_app: { id: Number(scope.controllerAppId) },
      user: { id: Number(scope.controllerBotUserId) },
    }],
    check_runs: [{
      id: 55,
      head_sha: cell.headSha,
      html_url: "https://github.com/o/r/checks/55",
      app: { id: Number(scope.controllerAppId) },
      output: { summary },
    }],
  };
}

function runner(evidence: unknown = bundle()): { process: ProcessRunner; run: ReturnType<typeof vi.fn> } {
  const scope = qualificationScope();
  const run = vi.fn(async (_command: string, args: string[]) => {
    if (args.includes("user")) return { stdout: `${scope.expectedActorIdentity}\n` };
    if (args.some((value) => value.includes("/pulls/7"))) {
      return { stdout: `${scope.cellScopes["pending-first"].headSha}\n` };
    }
    if (args.some((value) => value.includes("/actions/workflows/review-gate.yml/runs?"))) {
      return { stdout: JSON.stringify({ workflow_runs: [] }) };
    }
    if (args[1] === "repos/o/r/qualification-bundle") return { stdout: JSON.stringify(evidence) };
    return { stdout: "{}" };
  });
  return { process: { run }, run };
}

function codexActionRunner(): {
  descriptor: QualificationProbeDescriptor;
  process: ProcessRunner;
  run: ReturnType<typeof vi.fn>;
} {
  const scope = qualificationScope();
  const cellId = "codex-comment-trigger";
  const cell = scope.cellScopes[cellId];
  const command = buildCodexReviewCommand(scope.guidanceDigests.codex ?? "");
  const request: ReviewRequest = {
    schemaVersion: 1,
    repositoryId: scope.repositoryId,
    changeRequestId: cell.changeRequestId,
    changeSetId: "f".repeat(64),
    policyVersion: computePolicyVersion({
      policy: createHostedProviderProbePolicy(
        SELF_HOSTING_POLICY,
        "codex",
        scope.guidanceDigests.codex ?? null,
      ),
    }),
    semanticsVersion: "review-gate/v1",
    rubricVersion: scope.rubricVersion,
    requirementId: "analysis",
    sourceIdentity: "codex-pr",
    coverage: "full",
    coverageFromSha: "0".repeat(40),
    coverageThroughSha: cell.headSha,
    generation: 1,
    actorIdentity: scope.controllerBotUserId,
    requestMechanism: "user-trigger",
    requiredActorIdentity: scope.expectedActorIdentity,
    requestCommand: command,
  };
  const reservation = createReceipt({
    eventId: "reservation-codex",
    previousLedgerVersion: 0,
    action: "reserved",
    request,
    result: null,
    evidenceUrlOrId: null,
    findingIds: [],
    payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
  });
  const acknowledgement = createReceipt({
    eventId: "acknowledgement-codex",
    previousLedgerVersion: 1,
    action: "acknowledged",
    request,
    result: null,
    evidenceUrlOrId: `https://github.com/o/r/pull/${cell.pullRequestNumber}#issuecomment-101`,
    findingIds: [],
    payload: {
      kind: "acknowledgement",
      acknowledgedAt: "2026-07-12T20:05:00Z",
      acknowledgementRef: `https://github.com/o/r/pull/${cell.pullRequestNumber}#issuecomment-101`,
      trigger: {
        mechanism: "user-trigger",
        eventKind: "comment",
        eventId: "101",
        actorIdentity: scope.expectedActorIdentity,
        occurredAt: "2026-07-12T20:05:00Z",
        headSha: cell.headSha,
        contentDigest: "a".repeat(64),
      },
    },
  });
  const receiptComment = (receipt: typeof reservation, ledgerVersion: number) => ({
    node_id: `receipt-${ledgerVersion}`,
    body: serializeReceiptComment({ ledgerVersion, receipt }),
    created_at: `2026-07-12T20:0${ledgerVersion}:00Z`,
    updated_at: `2026-07-12T20:0${ledgerVersion}:00Z`,
    performed_via_github_app: { id: Number(scope.controllerAppId) },
    user: { id: Number(scope.controllerBotUserId) },
  });
  const checkRun = (ledgerVersion: number) => ({
    id: 55,
    head_sha: cell.headSha,
    html_url: "https://github.com/o/r/checks/55",
    app: { id: Number(scope.controllerAppId) },
    output: { summary: `<!-- arc-review-gate-state:v1:${Buffer.from(JSON.stringify({
      schemaVersion: 1,
      conclusion: "pending",
      blockerCodes: ["review-pending"],
      ledgerVersion,
      receiptRefs: Array.from({ length: ledgerVersion }, (_value, index) => `receipt-${index + 1}`),
    }), "utf8").toString("base64url")} -->` },
  });
  const precondition = { comments: [receiptComment(reservation, 1)], check_runs: [checkRun(1)] };
  const evidence = {
    workflow_runs: [{
      id: 45,
      head_sha: scope.defaultBranchSha,
      head_branch: scope.defaultBranch,
      conclusion: "success",
      event: "workflow_dispatch",
      actor: { id: Number(scope.expectedActorIdentity) },
      created_at: "2026-07-12T20:06:00Z",
      updated_at: "2026-07-12T20:07:00Z",
      html_url: "https://github.com/o/r/actions/runs/45",
      path: ".github/workflows/review-gate.yml",
    }],
    comments: [
      receiptComment(reservation, 1),
      receiptComment(acknowledgement, 2),
      {
        id: 101,
        body: command,
        user: { id: Number(scope.expectedActorIdentity) },
        html_url: `https://github.com/o/r/pull/${cell.pullRequestNumber}#issuecomment-101`,
      },
    ],
    check_runs: [checkRun(2)],
  };
  let runListReads = 0;
  const run = vi.fn(async (_command: string, args: string[]) => {
    const path = args[1] ?? "";
    if (args.includes("user") && args.includes("--jq")) return { stdout: `${scope.expectedActorIdentity}\n` };
    if (path === "user") return { stdout: JSON.stringify({ id: Number(scope.expectedActorIdentity) }) };
    if (path.includes(`/pulls/${cell.pullRequestNumber}`)) return { stdout: `${cell.headSha}\n` };
    if (path.includes("/actions/workflows/review-gate.yml/runs?")) {
      runListReads += 1;
      return { stdout: JSON.stringify({ workflow_runs: runListReads === 1 ? [{ id: 40 }] : [{ id: 40 }, { id: 44 }] }) };
    }
    if (path === "repos/o/r/codex-precondition") return { stdout: JSON.stringify(precondition) };
    if (path === "repos/o/r/codex-evidence") return { stdout: JSON.stringify(evidence) };
    if (path.endsWith(`/issues/${cell.pullRequestNumber}/comments`) && args.includes("POST")) {
      return { stdout: JSON.stringify({
        id: 101,
        user: { id: Number(scope.expectedActorIdentity) },
        body: command,
        created_at: "2026-07-12T20:05:00Z",
      }) };
    }
    return { stdout: "{}" };
  });
  return {
    descriptor: {
      cellId,
      preconditionApiPaths: ["repos/o/r/codex-precondition"],
      evidenceApiPaths: ["repos/o/r/codex-evidence"],
      dispatch: "reconcile",
      action: { requestKey: computeRequestKey(request), generation: 1 },
    },
    process: { run },
    run,
  };
}

describe("developer-authenticated qualification probe port", () => {
  it("derives the pending cell from App-authored live records instead of descriptor claims", async () => {
    const scope = qualificationScope();
    const fake = runner();
    const port = new GhQualificationProbePort(fake.process, [descriptor()]);
    await expect(port.execute("pending-first", scope)).resolves.toMatchObject({
      result: {
        cellId: "pending-first",
        outcome: "pending",
        capabilityProven: true,
        repositoryId: "100",
        headSha: scope.cellScopes["pending-first"].headSha,
        workflowSha: scope.defaultBranchSha,
      },
    });
    expect(fake.run.mock.calls.some(([, args]) => args.some((value: string) => value.includes("review-gate.yml/dispatches"))))
      .toBe(true);
    expect(fake.run.mock.calls.some(([, args]) => args.includes("labels[]=arc-review-gate"))).toBe(false);
  });

  it("revalidates pending state and preserves the qualified policy on the action redispatch", async () => {
    const scope = qualificationScope();
    const fake = codexActionRunner();
    const port = new GhQualificationProbePort(fake.process, [fake.descriptor]);
    await expect(port.execute("codex-comment-trigger", scope)).resolves.toMatchObject({
      result: { cellId: "codex-comment-trigger", outcome: "triggered", capabilityProven: true },
    });
    const calls = fake.run.mock.calls.map(([, args]) => args as string[]);
    const dispatches = calls.filter((args) => args.some((value) => value.includes("review-gate.yml/dispatches")));
    expect(dispatches).toHaveLength(2);
    expect(dispatches.every((args) => args.includes("inputs[qualification_provider]=codex"))).toBe(true);
    expect(dispatches.every((args) => args.includes(
      `inputs[qualification_guidance_digest]=${scope.guidanceDigests.codex ?? ""}`,
    ))).toBe(true);
    const postIndex = calls.findIndex((args) => args.some((value) => value.startsWith("body=@codex review")));
    const dispatchIndexes = calls.flatMap((args, index) =>
      args.some((value) => value.includes("review-gate.yml/dispatches")) ? [index] : []);
    expect(dispatchIndexes[0]).toBeLessThan(postIndex);
    expect(dispatchIndexes[1]).toBeGreaterThan(postIndex);
    expect(calls.filter((args) => args.some((value) => value.includes(
      `/pulls/${scope.cellScopes["codex-comment-trigger"].pullRequestNumber}`,
    )))).toHaveLength(2);
    expect(calls.some((args) => args[1] === "repos/o/r")).toBe(false);
  });

  it("rejects unrelated nonempty records, wrong dispatch classes, actors, and outside paths", async () => {
    await expect(new GhQualificationProbePort(runner({ id: 1 }).process, [descriptor()])
      .execute("pending-first", qualificationScope())).rejects.toThrow(/workflow-run/u);
    expect(() => new GhQualificationProbePort(runner().process, [{ ...descriptor(), dispatch: "none" }]))
      .toThrow(/dispatch-mismatch/u);
    expect(() => new GhQualificationProbePort(runner().process, [{
      cellId: "codex-clean",
      evidenceApiPaths: ["repos/o/r/qualification-bundle"],
      dispatch: "reconcile",
    }])).toThrow(/action-contract/u);
    expect(() => new GhQualificationProbePort(runner().process, [{
      cellId: "coderabbit-clean",
      evidenceApiPaths: ["repos/o/r/qualification-bundle"],
      dispatch: "none",
    }])).toThrow(/dispatch-mismatch/u);
    const wrongActorScope = { ...qualificationScope(), expectedActorIdentity: "999" };
    await expect(new GhQualificationProbePort(runner().process, [descriptor()])
      .execute("pending-first", wrongActorScope)).rejects.toThrow(/actor-mismatch/u);
    const outside = { ...descriptor(), evidenceApiPaths: ["repos/other/repo/issues/7/comments"] };
    await expect(new GhQualificationProbePort(runner().process, [outside])
      .execute("pending-first", qualificationScope())).rejects.toThrow(/outside-repository/u);
  });
});
