import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  handleMergeLockHold,
  handleMergeLockRelease,
  handleMergeLockResolve,
  handleReviewReadiness,
  handleReviewResolve,
  handleReviewChunkingResolve,
  handleReviewFrontlineResolve,
  handleReviewFrontlineRun,
  handleReviewHostedAwait,
  handleReviewHostedRequest,
  handleReviewHostedSettle,
  handleReviewLocalAttest,
  handleReviewLocalPrepare,
  handleReviewLocalResume,
  handleReviewPlanningLane,
  handleReviewPlanningGroomingResolve,
  handleReviewPrePublication,
  handleReviewMergeMethodResolve,
  handleReviewChecksAwait,
  handleReviewReduce,
  handleReviewRespond,
  handleReviewStatus,
  handleReviewTerminusAccept,
  stageDeliveryReviewTerminusBoundary,
} from "../../../src/handlers/review.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { SlugSchema } from "../../../src/lib/kernel/schema/slug.js";
import { resolveProcessInteractionContext } from
  "../../../src/lib/command-input/interaction-context.js";
import { IntegrationBoundaryLocusSchema } from
  "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  createLocalReviewAdmission,
} from "../../../src/scripts/review-gate/core/local-operation.js";
import {
  LocalReviewRecordStoreError,
} from "../../../src/scripts/review-gate/hosts/local/record-store-error.js";
import { LocalTargetDerivationError } from "../../../src/scripts/review-gate/hosts/local/repository-target.js";
import { reduceReviewRouting } from "../../../src/scripts/review-gate/policy/routing.js";
import { resolvePlanningGroomingReviewCommand } from
  "../../../src/scripts/review-gate/policy/planning-grooming-command.js";
import {
  createLocalReviewReceipt,
} from "../../../src/scripts/review-gate/runtime/local-attestation.js";
import {
  runFrontlineReviewCommand,
} from "../../../src/scripts/review-gate/runtime/frontline-run-command.js";
import { LocalPrepareRequestSchema } from "../../../src/scripts/review-gate/runtime/local-prepare.js";
import {
  LocalPrepareCommandError,
} from "../../../src/scripts/review-gate/runtime/local-prepare.js";

const target = {
  schemaVersion: 2 as const,
  semanticsVersion: "review-gate/v2" as const,
  kind: "change-set" as const,
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: "a".repeat(40),
  diffBaseTree: "b".repeat(40),
  headSha: "c".repeat(40),
  headTree: "d".repeat(40),
  targetId: `sha256:${"e".repeat(64)}`,
};
const targetCoordinates = {
  kind: target.kind,
  baseRef: target.baseRef,
  diffBaseSha: target.diffBaseSha,
  headSha: target.headSha,
};
const routingFacts = {
  schemaVersion: 1 as const,
  changeSetState: "known" as const,
  contentKind: "code-bearing" as const,
  reviewRisk: "routine" as const,
  changeDeterminacy: "ordinary" as const,
  ownership: "self" as const,
  surfaceAuthority: "ordinary" as const,
  assurance: { workContext: "work-unit" as const, workClass: "Light" as const },
  activity: { selfReview: true, frontlineReview: true },
};
const frontlineRunRequest = {
  schemaVersion: 1,
  target: targetCoordinates,
  resolution: {
    schemaVersion: 1,
    mode: "review-frontline-resolve",
    diagnostics: [],
    state: "ready",
    nextAction: "run-frontline",
    payload: {
      routing: {
        facts: routingFacts,
        decision: reduceReviewRouting(routingFacts),
      },
      frontlineReview: {
        schemaVersion: 1,
        semanticsVersion: "frontline-review/v1",
        action: "attempt",
        reasons: ["routine-code"],
        source: {
          sourceId: "review-cli",
          kind: "command",
          executable: "reviewer",
          argv: ["--plain"],
        },
        maxPasses: 2,
        promptText: "Review the aggregate candidate.",
      },
      pass: 1,
      maxPasses: 2,
    },
  },
};

describe("handleReviewMergeMethodResolve", () => {
  it("emits the live validation result for the configured method", async () => {
    const write = vi.fn();
    const readConfiguredMethod = vi.fn(async () => "squash" as const);
    await handleReviewMergeMethodResolve({ json: true, stackPosition: "top" }, {
      resolveRoot: () => "/repo",
      readConfiguredMethod,
      resolve: async (method, stackPosition) => ({
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "owner/repo",
        stackPosition,
        state: "validated",
        nextAction: "use-method",
        method,
        allowedMethods: ["merge", "squash"],
        policyFingerprint: `sha256:${"a".repeat(64)}`,
      }),
      write,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      state: "validated",
      nextAction: "use-method",
      method: "squash",
      stackPosition: "top",
    });
    expect(readConfiguredMethod).toHaveBeenCalledWith("/repo");
  });

  it("fails closed with a schema-valid result outside an ARC project", async () => {
    const write = vi.fn();
    const readConfiguredMethod = vi.fn();
    await handleReviewMergeMethodResolve({ json: true }, {
      resolveRoot: () => null,
      readConfiguredMethod,
      write,
      setExitCode: vi.fn(),
    });

    expect(readConfiguredMethod).not.toHaveBeenCalled();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      state: "blocked",
      reason: "policy-unreadable",
      stackPosition: "non-delivery",
      configuredMethod: null,
      allowedMethods: [],
    });
  });

  it("fails closed on an invalid stack position", async () => {
    const write = vi.fn();
    await handleReviewMergeMethodResolve({ json: true, stackPosition: "middle" }, {
      resolveRoot: () => "/repo",
      readConfiguredMethod: async () => "merge",
      resolve: async (_method, stackPosition) => ({
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "owner/repo",
        stackPosition,
        state: "validated",
        nextAction: "use-method",
        method: "merge",
        allowedMethods: ["merge"],
        policyFingerprint: `sha256:${"a".repeat(64)}`,
      }),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      state: "blocked",
      reason: "invalid-input",
      stackPosition: "non-delivery",
      detail: "Stack position must be non-delivery, intermediate, or top.",
    });
  });
});

describe("handleReviewChecksAwait", () => {
  it("validates CLI flags before invoking the await", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    const awaitChecks = vi.fn();
    await handleReviewChecksAwait({
      repository: "owner/repo",
      pullRequest: "42",
      headSha: "not-an-oid",
      timeoutMs: "2000",
      pollIntervalMs: "500",
      json: true,
    }, { awaitChecks, write, setExitCode });

    expect(awaitChecks).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(64);
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
    });
  });

  it("preserves typed unavailable detail in the JSON result", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    await handleReviewChecksAwait({
      repository: "owner/repo",
      pullRequest: "42",
      headSha: "a".repeat(40),
      timeoutMs: "2000",
      pollIntervalMs: "500",
      json: true,
    }, {
      awaitChecks: async () => ({
        schemaVersion: 1,
        mode: "review-checks-await",
        repository: "owner/repo",
        pullRequest: 42,
        headSha: "a".repeat(40),
        state: "unavailable",
        nextAction: "retry",
        cause: "deadline",
        detail: "Required-check evidence was unavailable: hosted process timed out",
        checks: [{ name: "merge-ok", state: "pending" }],
        diagnosticFailures: [{ name: "E2E shard 3", state: "failed" }],
        elapsedMs: 500,
      }),
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      schemaVersion: 1,
      mode: "review-checks-await",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: "a".repeat(40),
      state: "unavailable",
      nextAction: "retry",
      cause: "deadline",
      detail: "Required-check evidence was unavailable: hosted process timed out",
      checks: [{ name: "merge-ok", state: "pending" }],
      diagnosticFailures: [{ name: "E2E shard 3", state: "failed" }],
      elapsedMs: 500,
    });
    expect(setExitCode).not.toHaveBeenCalled();
  });
});
const localAttestRequest = {
  schemaVersion: 1,
  operationId: "local-operation",
  result: {
    status: "complete",
    result: "clean",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    headSha: target.headSha,
    headTree: target.headTree,
    rubricVersion: "standard-review/v1",
    rubricDigest: `sha256:${"f".repeat(64)}`,
    sourceDigest: `sha256:${"1".repeat(64)}`,
    guidanceDigest: `sha256:${"2".repeat(64)}`,
    evaluatorIdentity: "reviewer",
    reviewRunId: "run-1",
    applicabilityId: null,
    findings: [],
  },
};
const respondProposalRequest = {
  schemaVersion: 1,
  source: {
    kind: "attested-local",
    receiptRef: "arc-review-source:v1:attested-local:operation:receipt",
  },
  proposal: {
    findings: [{
      findingId: "finding-1",
      sourceVerification: "verified",
      verificationRefs: ["source:src/index.ts:1"],
      disposition: "reject",
      rationale: "The source does not support the finding.",
      recommendation: "Record the rejection.",
      openQuestions: [],
    }],
  },
};
const hostedTarget = {
  repository: "arc-framework/example",
  pullRequest: 42,
  headSha: "a".repeat(40),
};
const hostedHandle = {
  schemaVersion: 1,
  provider: "coderabbit-pr",
  requestedCoverage: "complete",
  effectiveCoverage: "complete",
  target: hostedTarget,
  artifact: {
    kind: "issue-comment",
    id: "comment-1",
    url: "https://github.com/arc-framework/example/pull/42#issuecomment-1",
    createdAt: "2026-07-24T12:00:00Z",
  },
};
const hostedStandardReview = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set" as const],
  rubricVersion: "standard-review/v1",
  rubricDigest: `sha256:${"c".repeat(64)}`,
  retrigger: "full-final" as const,
  count: 1 as const,
};

describe("handleReviewPlanningLane", () => {
  it("parses the exact-change operands before invoking the classifier", async () => {
    const classify = async (base: string, head: string, repository: string) =>
      base === "a".repeat(40) && head === "b".repeat(40) && repository === "/repo"
        ? "planning" as const
        : "reviewed" as const;
    const output: string[] = [];

    await handleReviewPlanningLane(
      "a".repeat(40),
      "b".repeat(40),
      { repository: " /repo " },
      { classify, write: (text) => output.push(text) },
    );

    expect(output).toEqual(["planning\n"]);
  });

  it("fails closed without invoking the classifier when syntax-owned input is invalid", async () => {
    let classified = false;
    const classify = async (): Promise<"planning"> => {
      classified = true;
      return "planning";
    };
    const output: string[] = [];
    const errors: string[] = [];
    const exitCodes: number[] = [];

    await handleReviewPlanningLane(
      "not-a-sha",
      "b".repeat(40),
      {},
      {
        classify,
        write: (text) => output.push(text),
        writeError: (text) => errors.push(text),
        setExitCode: (code) => exitCodes.push(code),
      },
    );

    expect(classified).toBe(false);
    expect(output).toEqual([]);
    expect(errors).toEqual(["planning-lane: invalid exact-change operands\n"]);
    expect(exitCodes).toEqual([64]);
  });

  it("renders the generic reviewed verdict without receipt-specific side effects", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const exitCodes: number[] = [];

    await handleReviewPlanningLane("a".repeat(40), "b".repeat(40), {}, {
      classify: async () => "reviewed",
      write: (text) => output.push(text),
      writeError: (text) => errors.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });

    expect(output).toEqual(["reviewed\n"]);
    expect(errors).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("does not downgrade an unexpected classifier failure", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const exitCodes: number[] = [];

    await handleReviewPlanningLane("a".repeat(40), "b".repeat(40), {}, {
      classify: vi.fn().mockRejectedValue(new Error("boom")),
      write: (text) => output.push(text),
      writeError: (text) => errors.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });

    expect(output).toEqual([]);
    expect(errors).toEqual(["planning-lane classification failed\n"]);
    expect(exitCodes).toEqual([1]);
  });
});

describe("handleReviewPlanningGroomingResolve", () => {
  const request = {
    schemaVersion: 1 as const,
    target: {
      baseRef: "main",
      diffBaseSha: "a".repeat(40),
      headSha: "c".repeat(40),
    },
    routingFacts: {
      contentKind: "documentation" as const,
      reviewRisk: "routine" as const,
      changeDeterminacy: "atomic" as const,
      ownership: "self" as const,
      surfaceAuthority: "planning-grooming" as const,
    },
  };

  it("emits one validated exemption composed through the handler seam", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    const interaction = resolveProcessInteractionContext({
      noInput: true,
      machineReadable: true,
      yes: "absent",
    });
    const resolve = vi.fn(async (parsed: typeof request) =>
      resolvePlanningGroomingReviewCommand({
        request: parsed,
        target,
        changeSet: {
          changeSet: "known",
          changes: [{
            status: "modified",
            path: ".arc/backlog/planned/example/draft-example.md",
            oldMode: "100644",
            newMode: "100644",
          }],
        },
        context: {
          state: "resolved",
          assurance: { workContext: "errand", workClass: "none" },
          activity: { selfReview: true, frontlineReview: true },
          diagnostics: [],
        },
      }));

    await handleReviewPlanningGroomingResolve("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify(request),
      resolve,
      write,
      setExitCode,
    }, interaction);

    expect(resolve).toHaveBeenCalledWith(request, "/repo", interaction);
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-planning-grooming-resolve",
      state: "exempt",
      nextAction: "none",
    });
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("rejects caller-authored derived facts before repository composition", async () => {
    const resolve = vi.fn();
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleReviewPlanningGroomingResolve("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        ...request,
        routingFacts: { ...request.routingFacts, changeSetState: "known" },
      }),
      resolve,
      write,
      setExitCode,
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-planning-grooming-resolve",
      error: { code: "invalid-input" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});

describe("handleReviewReadiness", () => {
  it("emits exactly one validated readiness envelope through the handler seam", async () => {
    const output: string[] = [];
    const request = {
      schemaVersion: 1,
      treeRoot: "/tree",
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: "a".repeat(40),
      },
      pullRequest: {
        repository: "owner/repo",
        number: 42,
        state: "open",
        headBranch: "fix/demo",
        headSha: "a".repeat(40),
      },
      vehicle: {
        kind: "errand",
        slug: "demo",
      },
    };

    await handleReviewReadiness("request.json", {
      resolveRoot: () => "/trusted-cli",
      readText: async () => JSON.stringify(request),
      check: async (parsed) => ({
        schemaVersion: 1,
        mode: "review-readiness",
        diagnostics: [],
        state: "ready",
        nextAction: "none",
        payload: {
          target: parsed.target,
          vehicle: parsed.vehicle,
        },
      }),
      write: (text) => output.push(text),
      setExitCode: vi.fn(),
    });

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      mode: "review-readiness",
      state: "ready",
      payload: {
        vehicle: {
          kind: "errand",
          slug: "demo",
        },
      },
    });
  });
});

describe("handleMergeLockResolve", () => {
  it("emits one validated opening-disposition envelope through an injected effect port", async () => {
    const output: string[] = [];

    await handleMergeLockResolve("request.json", {
      resolveRoot: () => "/trusted-cli",
      readText: async () => JSON.stringify({ schemaVersion: 1, treeRoot: "/candidate" }),
      resolve: async (parsed) => ({
        schemaVersion: 1,
        mode: "merge-lock-resolve",
        diagnostics: [],
        state: parsed.treeRoot === "/candidate" ? "locked" : "none",
        nextAction: parsed.treeRoot === "/candidate" ? "open-locked" : "open-plain",
        payload: {},
      }),
      write: (text) => output.push(text),
      setExitCode: vi.fn(),
    });

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "")).toEqual({
      schemaVersion: 1,
      mode: "merge-lock-resolve",
      diagnostics: [],
      state: "locked",
      nextAction: "open-locked",
      payload: {},
    });
  });

  it("emits a merge-lock error envelope rather than a review one on invalid input", async () => {
    const output: string[] = [];
    const setExitCode = vi.fn();

    await handleMergeLockResolve("request.json", {
      resolveRoot: () => "/trusted-cli",
      readText: async () => JSON.stringify({ schemaVersion: 1 }),
      write: (text) => output.push(text),
      setExitCode,
    });

    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      mode: "merge-lock-resolve",
      error: { code: "invalid-input" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});

describe("merge-lock transition handlers", () => {
  const request = {
    schemaVersion: 1,
    treeRoot: "/candidate",
    target: {
      repository: "owner/repo",
      pullRequest: 42,
      headSha: "a".repeat(40),
    },
    vehicle: {
      kind: "errand",
      slug: "demo",
    },
  };

  it.each([
    ["hold", handleMergeLockHold, "merge-lock-hold", "held"],
    ["release", handleMergeLockRelease, "merge-lock-release", "released"],
  ] as const)("emits one validated %s envelope through an injected effect port", async (
    _verb,
    handler,
    mode,
    state,
  ) => {
    const output: string[] = [];

    await handler("request.json", {
      resolveRoot: () => "/trusted-cli",
      readText: async () => JSON.stringify(request),
      transition: async (parsed) => ({
        schemaVersion: 1,
        mode,
        diagnostics: [],
        state,
        nextAction: "proceed",
        payload: parsed.target,
      }),
      write: (text) => output.push(text),
      setExitCode: vi.fn(),
    });

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      mode,
      state,
      nextAction: "proceed",
      payload: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: "a".repeat(40),
      },
    });
  });

  it("rejects a result carrying the other verb's mode", async () => {
    const output: string[] = [];
    const setExitCode = vi.fn();

    await handleMergeLockHold("request.json", {
      resolveRoot: () => "/trusted-cli",
      readText: async () => JSON.stringify(request),
      transition: async (parsed) => ({
        schemaVersion: 1,
        mode: "merge-lock-release",
        diagnostics: [],
        state: "released",
        nextAction: "proceed",
        payload: parsed.target,
      }),
      write: (text) => output.push(text),
      setExitCode,
    });

    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      mode: "merge-lock-hold",
      error: { code: "unexpected-failure" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});

function localReceiptFixture() {
  const receiptTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40),
    headTree: "d".repeat(40),
  });
  const requirement = createReviewRequirement({
    target: receiptTarget,
    projection: {
      obligation: "recommended",
      reasons: ["routine-code"],
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "standard-review/v1" }),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
    initialAdmission: "checkpoint",
  });
  if (requirement === null) throw new Error("expected local review requirement");
  const admission = createLocalReviewAdmission({
    target: receiptTarget,
    requirement,
    authority: {
      vehicle: { kind: "work-unit", identity: "review-surface-binding" },
      authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation",
    },
    laneSourceId: "delegated-agent",
    policyBindingDigest: canonicalDigest({ policy: "local" }),
    requestMechanism: "local-attestation",
  });
  const sourceDigest = canonicalDigest({ source: receiptTarget.targetId });
  const guidanceDigest = canonicalDigest({ guidance: "standard" });
  return {
    target: receiptTarget,
    requirement,
    carrier: {
      target: receiptTarget,
      request: admission.carrier.request,
      attestation: admission.carrier.attestation,
    },
    runtimeIdentity: admission.authority.runtimeIdentity,
    attestationMechanism: admission.authority.attestationMechanism,
    sourceDigest,
    guidanceDigest,
    result: {
      status: "complete" as const,
      result: "clean" as const,
      repositoryId: receiptTarget.repositoryId,
      targetId: receiptTarget.targetId,
      headSha: receiptTarget.headSha,
      headTree: receiptTarget.headTree,
      rubricVersion: requirement.rubricVersion,
      rubricDigest: requirement.rubricDigest,
      sourceDigest,
      guidanceDigest,
      evaluatorIdentity: admission.authority.evaluatorIdentity,
      reviewRunId: "run-1",
      applicabilityId: null,
      findings: [],
    },
  };
}

describe("handleReviewResolve", () => {
  const request = {
    schemaVersion: 1,
    target: {
      repository: "arc-framework/example",
      pullRequest: 42,
      headSha: "a".repeat(40),
    },
    lane: "standard",
    standardReview: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"b".repeat(64)}`,
      retrigger: "full-final",
      count: 1,
    },
    completedPasses: 0,
    attempts: [],
  };

  it("rejects malformed input before resolving policy", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    const resolve = vi.fn();

    await handleReviewResolve("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({ schemaVersion: 1 }),
      resolve,
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      schemaVersion: 1,
      mode: "review-resolve",
      error: { code: "invalid-input" },
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("returns typed invalid input for inconsistent terminal pass progress", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    const resolve = vi.fn();

    await handleReviewResolve("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        ...request,
        attempts: [{ sourceId: "codex-pr", outcome: "clean" }],
      }),
      resolve,
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      schemaVersion: 1,
      mode: "review-resolve",
      error: {
        code: "invalid-input",
        message: expect.stringMatching(/completedPasses must include the completed terminal pass/u),
      },
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it.each([
    ["sources", ["delegated-agent"]],
    ["maxPasses", 99],
  ])("rejects caller-authored %s policy overrides", async (field, value) => {
    const write = vi.fn();
    const resolve = vi.fn();

    await handleReviewResolve("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({ ...request, [field]: value }),
      resolve,
      write,
      setExitCode: vi.fn(),
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-resolve",
      error: { code: "invalid-input" },
    });
  });

  it("emits one validated transition envelope", async () => {
    const write = vi.fn();

    await handleReviewResolve("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify(request),
      resolve: vi.fn(async () => ({
        schemaVersion: 1,
        mode: "review-resolve",
        diagnostics: [],
        state: "no-op",
        nextAction: "none",
        payload: {
          lane: "standard",
          scope: "whole-target",
          consumedPass: false,
          attemptedSources: [],
        },
      })),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-resolve",
      state: "no-op",
      nextAction: "none",
    });
  });
});

describe("handleReviewStatus", () => {
  it("routes a work-unit cursor through joined delivery status without requiring a target", async () => {
    const output: string[] = [];
    const resolve = vi.fn();
    const resolveWorkUnit = vi.fn(async (_root, request) => ({
      schemaVersion: 1 as const,
      mode: "review-status" as const,
      target: {
        repository: "owner/repo",
        headRef: "delivery/example/member-1",
        headSha: "c".repeat(40),
      },
      requiredChecks: "green" as const,
      routedObligation: {
        state: "review-required" as const,
        detail: `Member one is selected for ${request.workUnitId}.`,
      },
      currentBaseOid: "b".repeat(40),
      movement: "disjoint" as const,
      baseMovement: {
        coordinates: {
          repository: "owner/repo",
          changeRequest: 42,
          base: "b".repeat(40),
          head: "c".repeat(40),
        },
        overlap: { status: "available" as const, substantivePaths: [], regenerablePaths: [] },
      },
      state: "review-required" as const,
      nextAction: "run-review" as const,
    }));

    await handleReviewStatus({ workUnit: "example", json: true }, undefined, {
      resolveRoot: () => "/repo",
      resolve,
      resolveWorkUnit,
      write: (text) => output.push(text),
      setExitCode: () => undefined,
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(resolveWorkUnit).toHaveBeenCalledWith("/repo", { workUnitId: "example" });
    expect(JSON.parse(output.join(""))).toMatchObject({
      target: { headRef: "delivery/example/member-1" },
      state: "review-required",
      nextAction: "run-review",
      movement: "disjoint",
      baseMovement: {
        coordinates: {
          repository: "owner/repo",
          changeRequest: 42,
          base: "b".repeat(40),
          head: "c".repeat(40),
        },
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
      routedObligation: { detail: "Member one is selected for example." },
    });
  });

  it("passes an invocation-scoped source into work-unit status composition", async () => {
    const output: string[] = [];
    const resolveWorkUnit = vi.fn(async (_root, request) => ({
      schemaVersion: 1 as const,
      mode: "review-status" as const,
      target: {
        repository: "owner/repo",
        headRef: "delivery/example/member-1",
        headSha: "c".repeat(40),
      },
      requiredChecks: "green" as const,
      routedObligation: {
        state: "review-required" as const,
        detail: `Selected ${request.sourceId ?? "default"}.`,
      },
      currentBaseOid: "b".repeat(40),
      movement: "disjoint" as const,
      baseMovement: {
        coordinates: {
          repository: "owner/repo",
          changeRequest: 42,
          base: "b".repeat(40),
          head: "c".repeat(40),
        },
        overlap: { status: "available" as const, substantivePaths: [], regenerablePaths: [] },
      },
      state: "review-required" as const,
      nextAction: "run-review" as const,
    }));

    await handleReviewStatus({
      workUnit: "example",
      source: "codex-pr",
      json: true,
    }, undefined, {
      resolveRoot: () => "/repo",
      resolve: vi.fn(),
      resolveWorkUnit,
      write: (text) => output.push(text),
      setExitCode: () => undefined,
    });

    expect(resolveWorkUnit).toHaveBeenCalledWith("/repo", {
      workUnitId: "example",
      sourceId: "codex-pr",
    });
    expect(JSON.parse(output.join(""))).toMatchObject({
      routedObligation: { detail: "Selected codex-pr." },
    });
  });

  it("passes an exact ceiling override into status composition", async () => {
    const statusTarget = {
      repository: "owner/repo",
      headRef: "feat/example",
      headSha: "c".repeat(40),
    };
    const ceilingOverride = {
      target: { repository: "owner/repo", pullRequest: 42, headSha: "c".repeat(40) },
      lane: "standard" as const,
      exhaustedPassCount: 2,
      nextPass: 3,
    };
    const output: string[] = [];

    await handleReviewStatus({
      target: JSON.stringify(statusTarget),
      ceilingOverride: JSON.stringify(ceilingOverride),
      coverage: "incremental",
      json: true,
    }, undefined, {
      resolveRoot: () => "/repo",
      resolve: async (_root, request) => ({
        schemaVersion: 1,
        mode: "review-status",
        target: request.target,
        requiredChecks: "green",
        routedObligation: {
          state: "review-required",
          detail: request.ceilingOverride === undefined
            ? "Ceiling override missing."
            : `Ceiling override admits pass ${String(request.ceilingOverride.nextPass)} with `
              + `${request.coverage ?? "complete"} coverage.`,
        },
        currentBaseOid: "b".repeat(40),
        movement: "disjoint",
        baseMovement: {
          coordinates: {
            repository: statusTarget.repository,
            changeRequest: 42,
            base: "b".repeat(40),
            head: statusTarget.headSha,
          },
          overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
        },
        state: "review-required",
        nextAction: "run-review",
      }),
      write: (text) => output.push(text),
      setExitCode: () => undefined,
    });

    expect(JSON.parse(output.join(""))).toMatchObject({
      routedObligation: { detail: "Ceiling override admits pass 3 with incremental coverage." },
    });
  });
});

describe("handleReviewTerminusAccept", () => {
  it("passes one exact Owner judgment through the typed mutation boundary", async () => {
    const output: string[] = [];
    const request = {
      schemaVersion: 1 as const,
      offer: {
        schemaVersion: 1 as const,
        kind: "delivery-member-owner-terminus" as const,
        workUnitId: "example",
        remote: "origin",
        expectedBoundaryVersion: `sha256:${"b".repeat(64)}`,
        candidateId: `sha256:${"c".repeat(64)}`,
        candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
        target: { repository: "owner/repo", pullRequest: 41, headSha: "a".repeat(40) },
        vehicle: {
          kind: "delivery-member" as const,
          planId: "123e4567-e89b-42d3-a456-426614174000",
          deliverableId: `sha256:${"e".repeat(64)}`,
          workUnitId: "example",
          head: "a".repeat(40),
        },
        completedPasses: 7,
        interactionText: "Accept this exact member terminus.",
      },
      judgment: { mode: "owner-accepted" as const },
    };
    const accept = vi.fn(async () => ({
      schemaVersion: 1 as const,
      mode: "review-terminus-accept" as const,
      state: "refused" as const,
      nextAction: "rerun-status" as const,
      reason: "stale-offer" as const,
      detail: "The offer is stale.",
      recommendedActionText: "Re-run work-unit review status.",
    }));

    await handleReviewTerminusAccept("-", undefined, {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify(request),
      accept,
      write: (text) => output.push(text),
      setExitCode: () => undefined,
    });

    expect(accept).toHaveBeenCalledWith(request, "/repo", undefined);
    expect(JSON.parse(output.join(""))).toMatchObject({
      mode: "review-terminus-accept",
      state: "refused",
      reason: "stale-offer",
    });
  });

  it("stages only the exact terminus transition left by a prior process", async () => {
    const boundaryPath = ".arc/system/.internal/candidates/example.boundary.json";
    const root = await mkdtemp(join(tmpdir(), "arc-terminus-replay-"));
    const boundary = IntegrationBoundaryLocusSchema.parse({
      schemaVersion: 1,
      mode: "integration-boundary",
      workUnit: "example",
      candidateId: `sha256:${"c".repeat(64)}`,
      candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
      terminus: null,
      locus: "delivery-status-required",
      nextAction: {
        kind: "resolve-delivery-status",
        workUnitId: "example",
        command: "arc review status --work-unit example --json",
        interactionText: "Resume review.",
      },
      policy: null,
      reservation: {
        schemaVersion: 1,
        semanticsVersion: "standard-review-reservation/v1",
        reservationId: `sha256:${"a".repeat(64)}`,
        sources: ["coderabbit-pr"],
        target: {
          kind: "delivery",
          repository: "owner/repo",
          workUnitId: "example",
          planId: "123e4567-e89b-42d3-a456-426614174000",
        },
        obligation: {
          obligation: "required",
          reasons: ["sensitive-change-set"],
          rubricVersion: "standard-review/v1",
          rubricDigest: `sha256:${"f".repeat(64)}`,
          retrigger: "full-final",
          count: 1,
        },
      },
    });
    const record = {
      vehicle: {
        kind: "delivery-member" as const,
        planId: "123e4567-e89b-42d3-a456-426614174000",
        deliverableId: `sha256:${"e".repeat(64)}`,
        workUnitId: SlugSchema.parse("example"),
        head: "a".repeat(40),
      },
      terminus: {
        schemaVersion: 1 as const,
        semanticsVersion: "review-terminus/v1" as const,
        kind: "owner-accepted" as const,
        lane: "standard" as const,
        acceptedBy: "andrew",
        completedPasses: 2,
      },
    };
    await mkdir(dirname(join(root, boundaryPath)), { recursive: true });
    await writeFile(join(root, boundaryPath), JSON.stringify({
      ...boundary,
      deliveryReviewTermini: [record],
    }));
    let staged = false;
    const exec = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "show") return { stdout: JSON.stringify(boundary), stderr: "" };
      if (args[0] === "add") {
        staged = true;
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected command: ${args.join(" ")}`);
    });

    try {
      await expect(stageDeliveryReviewTerminusBoundary({
        root,
        workUnitId: "example",
        exec,
        result: {
          schemaVersion: 1,
          mode: "review-terminus-accept",
          state: "exact-replay",
          nextAction: "continue",
          record,
          recommendedActionText: "The terminus is already durable.",
        },
      })).resolves.toMatchObject({
        state: "recorded",
        nextAction: "commit-boundary",
        boundaryPath,
        record,
      });
      expect(staged).toBe(true);

      staged = false;
      await writeFile(join(root, boundaryPath), JSON.stringify({
        ...boundary,
        candidateSubjectDigest: `sha256:${"9".repeat(64)}`,
        deliveryReviewTermini: [record],
      }));
      await expect(stageDeliveryReviewTerminusBoundary({
        root,
        workUnitId: "example",
        exec,
        result: {
          schemaVersion: 1,
          mode: "review-terminus-accept",
          state: "exact-replay",
          nextAction: "continue",
          record,
          recommendedActionText: "The terminus is already durable.",
        },
      })).resolves.toMatchObject({
        state: "refused",
        nextAction: "rerun-status",
        reason: "record-conflict",
      });
      expect(staged).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("hosted review handlers", () => {
  it("rejects an invalid request-source operand before reading from disk", async () => {
    const readText = vi.fn();
    const request = vi.fn();
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleReviewHostedRequest(" ", {
      readText,
      request,
      write,
      setExitCode,
    });

    expect(readText).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      schemaVersion: 1,
      mode: "review-hosted-request",
      error: { code: "invalid-input" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("rejects malformed input before requesting a hosted review", async () => {
    const request = vi.fn();
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleReviewHostedRequest("-", {
      readText: async () => "{}",
      request,
      write,
      setExitCode,
    });

    expect(request).not.toHaveBeenCalled();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      schemaVersion: 1,
      mode: "review-hosted-request",
      error: { code: "invalid-input" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it.each([
    {
      mode: "review-hosted-request",
      invoke: async (
        effect: () => Promise<unknown>,
        write: (text: string) => void,
        setExitCode: (code: number) => void,
      ) => handleReviewHostedRequest("-", {
        readText: async () => JSON.stringify({
          schemaVersion: 1,
          target: hostedTarget,
          provider: "coderabbit-pr",
          coverage: "complete",
        }),
        request: effect,
        write,
        setExitCode,
      }),
    },
    {
      mode: "review-hosted-await",
      invoke: async (
        effect: () => Promise<unknown>,
        write: (text: string) => void,
        setExitCode: (code: number) => void,
      ) => handleReviewHostedAwait("-", {
        readText: async () => JSON.stringify({
          schemaVersion: 1,
          handle: hostedHandle,
          timeoutSeconds: 1,
          initialPollIntervalSeconds: 1,
        }),
        awaitResult: effect,
        write,
        setExitCode,
      }),
    },
    {
      mode: "review-hosted-settle",
      invoke: async (
        effect: () => Promise<unknown>,
        write: (text: string) => void,
        setExitCode: (code: number) => void,
      ) => handleReviewHostedSettle("-", {
        readText: async () => JSON.stringify({
          schemaVersion: 1,
          response: {
            attemptRef: "arc-review-source:v1:hosted:lane-progress%2F1:hosted%2F1",
            dispositionSetId: `sha256:${"d".repeat(64)}`,
            findingId: "finding-1",
          },
          target: hostedTarget,
          fixTarget: null,
          actorIdentity: "developer",
          finding: {
            commentId: "comment-1",
            threadId: "thread-1",
          },
          disposition: "reject",
          reply: "Not applicable because the source contract already covers this case.",
        }),
        settle: effect,
        write,
        setExitCode,
      }),
    },
  ])("rejects malformed $mode success output at the public boundary", async ({ mode, invoke }) => {
    const effect = vi.fn(async () => ({ state: "not-a-real-state" }));
    const write = vi.fn();
    const setExitCode = vi.fn();

    await invoke(effect, write, setExitCode);

    expect(effect).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      schemaVersion: 1,
      mode,
      error: { code: "unexpected-failure" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("emits one validated hosted request result", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleReviewHostedRequest("-", {
      readText: async () => JSON.stringify({
        schemaVersion: 1,
        target: hostedTarget,
        provider: "coderabbit-pr",
        coverage: "incremental",
      }),
      request: async () => ({
        schemaVersion: 1,
        mode: "review-hosted-request",
        state: "source-unavailable",
        nextAction: "stop",
        provider: "coderabbit-pr",
        requestedCoverage: "incremental",
        attemptedProviders: ["coderabbit-pr"],
      }),
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      schemaVersion: 1,
      mode: "review-hosted-request",
      state: "source-unavailable",
      nextAction: "stop",
      provider: "coderabbit-pr",
      requestedCoverage: "incremental",
      attemptedProviders: ["coderabbit-pr"],
    });
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("accepts a hosted await request that leaves timing to project defaults", async () => {
    const awaitResult = vi.fn(async () => ({
      schemaVersion: 1,
      mode: "review-hosted-await",
      handle: hostedHandle,
      action: { schemaVersion: 1, handle: hostedHandle },
      state: "pending",
      nextAction: "await",
      elapsedMs: 120_000,
    }));
    const write = vi.fn();

    await handleReviewHostedAwait("-", {
      readText: async () => JSON.stringify({ schemaVersion: 1, handle: hostedHandle }),
      awaitResult,
      write,
      setExitCode: vi.fn(),
    });

    expect(awaitResult).toHaveBeenCalledWith({ schemaVersion: 1, handle: hostedHandle });
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      state: "pending",
      nextAction: "await",
    });
  });

  it("accepts an explicit Errand vehicle at the hosted request boundary", async () => {
    const request = vi.fn(async () => ({
      schemaVersion: 1,
      mode: "review-hosted-request",
      state: "source-unavailable",
      nextAction: "stop",
      provider: "coderabbit-pr",
      requestedCoverage: "complete",
      attemptedProviders: ["coderabbit-pr"],
    }));

    await handleReviewHostedRequest("-", {
      readText: async () => JSON.stringify({
        schemaVersion: 1,
        target: hostedTarget,
        provider: "coderabbit-pr",
        coverage: "complete",
        vehicle: { kind: "errand", standardReview: hostedStandardReview },
      }),
      request,
      write: vi.fn(),
      setExitCode: vi.fn(),
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      vehicle: { kind: "errand", standardReview: hostedStandardReview },
    }));
  });
});

describe("handleReviewFrontlineResolve", () => {
  it("emits the shared invalid-input error envelope for malformed input", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleReviewFrontlineResolve("-", {
      resolveRoot: () => "/repo",
      readText: async () => "{",
      resolve: vi.fn(),
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      schemaVersion: 1,
      mode: "review-frontline-resolve",
      error: { code: "invalid-input" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});

describe("handleReviewChunkingResolve", () => {
  it("emits exactly one validated success envelope", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    await handleReviewChunkingResolve("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({ schemaVersion: 1, target: targetCoordinates }),
      deriveRequest: async (request) => {
        const { scopeSelection, ...fields } = request;
        return {
          ...fields,
          target,
          ...(scopeSelection === undefined
          ? {}
          : { scopeSelection: { ...scopeSelection, target } }),
        };
      },
      resolve: async () => ({
        schemaVersion: 1,
        mode: "review-chunking-resolve",
        diagnostics: [],
        state: "disabled",
        nextAction: "none",
        payload: { target },
      }),
      write,
      setExitCode,
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-chunking-resolve",
      state: "disabled",
    });
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("emits one typed error envelope for invalid input", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    await handleReviewChunkingResolve("-", {
      resolveRoot: () => "/repo",
      readText: async () => "{}",
      deriveRequest: vi.fn(),
      resolve: vi.fn(),
      write,
      setExitCode,
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-chunking-resolve",
      error: { code: "invalid-input" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});

describe("handleReviewFrontlineRun", () => {
  it("reads one request and emits one validated durable run envelope", async () => {
    const write = vi.fn();
    const run = vi.fn(async () => ({
      schemaVersion: 1,
      mode: "review-frontline-run",
      diagnostics: [],
      state: "clean",
      nextAction: "none",
      payload: {
        operationId: "frontline-operation",
        persistedVersion: 2,
        target: {
          schemaVersion: 2,
          semanticsVersion: "review-gate/v2",
          kind: "change-set",
          repositoryId: "repo-1",
          baseRef: "main",
          diffBaseSha: "a".repeat(40),
          diffBaseTree: "b".repeat(40),
          headSha: "c".repeat(40),
          headTree: "d".repeat(40),
          targetId: `sha256:${"e".repeat(64)}`,
        },
        outcomeRef: "git-common:review-gate/outcomes/run.json#1",
        outcomeDigest: `sha256:${"f".repeat(64)}`,
      },
    }));

    await handleReviewFrontlineRun("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify(frontlineRunRequest),
      deriveRequest: async (request) => ({ ...request, target }),
      run,
      write,
      setExitCode: vi.fn(),
    });

    expect(run).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-frontline-run",
      state: "clean",
      payload: {
        operationId: "frontline-operation",
        persistedVersion: 2,
      },
    });
  });

  it.each([
    {
      label: "non-ready",
      resolution: {
        ...frontlineRunRequest.resolution,
        state: "skipped",
        nextAction: "none",
        payload: {
          routing: frontlineRunRequest.resolution.payload.routing,
          frontlineReview: frontlineRunRequest.resolution.payload.frontlineReview,
        },
      },
    },
    {
      label: "non-executable",
      resolution: {
        ...frontlineRunRequest.resolution,
        payload: {
          ...frontlineRunRequest.resolution.payload,
          frontlineReview: {
            ...frontlineRunRequest.resolution.payload.frontlineReview,
            action: "offer",
            source: null,
          },
        },
      },
    },
  ])("emits invalid-input for a $label resolution before any effect", async ({ resolution }) => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    const confirmSource = vi.fn();
    const prepareExecutionTarget = vi.fn();
    const execute = vi.fn();
    const withOperationLock = vi.fn();
    const readOperation = vi.fn();
    const publishOperation = vi.fn();
    const readOutcome = vi.fn();
    const appendOutcome = vi.fn();

    await handleReviewFrontlineRun("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        ...frontlineRunRequest,
        resolution,
      }),
      deriveRequest: async (request) => ({ ...request, target }),
      run: (request) => runFrontlineReviewCommand(request, {
        confirmSource,
        prepareExecutionTarget,
        execute,
        withOperationLock,
        operationStore: { readOperation, publishOperation },
        outcomeStore: { readOutcome, appendOutcome },
        now: () => "2026-07-24T02:33:18Z",
      }),
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-frontline-run",
      error: { code: "invalid-input" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(confirmSource).not.toHaveBeenCalled();
    expect(prepareExecutionTarget).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(withOperationLock).not.toHaveBeenCalled();
    expect(readOperation).not.toHaveBeenCalled();
    expect(publishOperation).not.toHaveBeenCalled();
    expect(readOutcome).not.toHaveBeenCalled();
    expect(appendOutcome).not.toHaveBeenCalled();
  });
});

describe("handleReviewLocalPrepare", () => {
  it("reads one request and emits one validated success envelope", async () => {
    const write = vi.fn();
    const prepare = vi.fn(async () => ({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: [],
      state: "exempt",
      nextAction: "none",
      payload: {},
    }));

    await handleReviewLocalPrepare("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        schemaVersion: 1,
        evaluatorIdentity: "reviewer",
        routingFacts: {},
      }),
      prepare,
      write,
      setExitCode: vi.fn(),
    });

    expect(prepare).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(
      "{\"schemaVersion\":1,\"diagnostics\":[],\"mode\":\"review-local-prepare\","
      + "\"state\":\"exempt\",\"nextAction\":\"none\",\"payload\":{}}\n",
    );
  });

  it("emits typed invalid-input when a caller supplies derived local routing authority", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleReviewLocalPrepare("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        schemaVersion: 1,
        evaluatorIdentity: "reviewer",
        routingFacts: {
          contentKind: "code-bearing",
          reviewRisk: "routine",
          changeDeterminacy: "ordinary",
          ownership: "self",
          surfaceAuthority: "ordinary",
          changeSetState: "known",
        },
      }),
      prepare: async (request) => LocalPrepareRequestSchema.parse(request),
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      schemaVersion: 1,
      mode: "review-local-prepare",
      error: { code: "invalid-input" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it.each([
    ["dirty-worktree", "clean-worktree"],
    ["non-commit-head", "commit-head"],
    ["unresolved-base", "base-resolved"],
  ] as const)("emits a typed invalid-input envelope for the %s precondition", async (
    reason,
    precondition,
  ) => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleReviewLocalPrepare("request.json", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        schemaVersion: 1,
        evaluatorIdentity: "reviewer",
        routingFacts: {
          contentKind: "code-bearing",
          reviewRisk: "routine",
          changeDeterminacy: "ordinary",
          ownership: "self",
          surfaceAuthority: "ordinary",
        },
      }),
      prepare: async () => {
        throw new LocalTargetDerivationError(reason);
      },
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      schemaVersion: 1,
      diagnostics: [{ code: "repository-precondition", message: reason, precondition }],
      mode: "review-local-prepare",
      error: { code: "invalid-input", message: reason },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("emits corrupt-state for a persisted local source binding mismatch", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleReviewLocalPrepare("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        schemaVersion: 1,
        evaluatorIdentity: "reviewer",
        routingFacts: {},
      }),
      prepare: async () => {
        throw new LocalPrepareCommandError("local review source reference mismatch");
      },
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-local-prepare",
      error: {
        code: "corrupt-state",
        message: "local review source reference mismatch",
      },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});

describe("handleReviewLocalAttest", () => {
  it("reads one request and emits one validated attestation envelope", async () => {
    const write = vi.fn();
    const attest = vi.fn(async () => ({
      schemaVersion: 1,
      mode: "review-local-attest",
      diagnostics: [],
      state: "expired",
      nextAction: "rerun-review",
      payload: {
        operationId: "local-operation",
        persistedVersion: 1,
      },
    }));

    await handleReviewLocalAttest("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify(localAttestRequest),
      attest,
      write,
      setExitCode: vi.fn(),
    });

    expect(attest).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(
      "{\"schemaVersion\":1,\"diagnostics\":[],\"mode\":\"review-local-attest\","
      + "\"state\":\"expired\",\"nextAction\":\"rerun-review\","
      + "\"payload\":{\"operationId\":\"local-operation\",\"persistedVersion\":1}}\n",
    );
  });

  it.each(["target", "rubric", "evaluator"] as const)(
    "emits invalid-input for a semantic %s mismatch in the submitted result",
    async (mismatch) => {
      const fixture = localReceiptFixture();
      const result = {
        ...fixture.result,
        ...(mismatch === "target"
          ? { targetId: canonicalDigest({ target: "different" }) }
          : mismatch === "rubric"
            ? { rubricDigest: canonicalDigest({ rubric: "different" }) }
            : { evaluatorIdentity: "different-evaluator" }),
      };
      const write = vi.fn();
      const setExitCode = vi.fn();

      await handleReviewLocalAttest("-", {
        resolveRoot: () => "/repo",
        readText: async () => JSON.stringify({
          schemaVersion: 1,
          operationId: "local-operation",
          result,
        }),
        attest: async (request) => createLocalReviewReceipt({
          ...fixture,
          result: (request as { result: typeof result }).result,
        }),
        write,
        setExitCode,
      });

      expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
        mode: "review-local-attest",
        error: { code: "invalid-input" },
      });
      expect(setExitCode).toHaveBeenCalledWith(1);
    },
  );
});

describe("handleReviewLocalResume", () => {
  it("rejects malformed requests before entering the command runtime", async () => {
    const write = vi.fn();
    const resume = vi.fn();

    await handleReviewLocalResume("-", {
      resolveRoot: () => "/repo",
      readText: async () => "{\"schemaVersion\":1}",
      resume,
      write,
      setExitCode: vi.fn(),
    });

    expect(resume).not.toHaveBeenCalled();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      error: { code: "invalid-input" },
    });
  });

  it("reports malformed durable operation state as corrupt-state", async () => {
    const write = vi.fn();

    await handleReviewLocalResume("-", {
      resolveRoot: () => "/repo",
      readText: async () => "{\"schemaVersion\":1,\"operationId\":\"local-operation\"}",
      resume: async () => {
        throw Object.assign(new Error("malformed operation state"), {
          code: "malformed-operation-state",
        });
      },
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      error: { code: "corrupt-state", message: "malformed operation state" },
    });
  });

  it("reports an invalid command success envelope as an internal failure", async () => {
    const write = vi.fn();

    await handleReviewLocalResume("-", {
      resolveRoot: () => "/repo",
      readText: async () => "{\"schemaVersion\":1,\"operationId\":\"local-operation\"}",
      resume: async () => ({ state: "not-a-real-state" }),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      error: { code: "unexpected-failure" },
    });
  });

  it("reads one request and emits one validated resume envelope", async () => {
    const write = vi.fn();
    const target = {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: "a".repeat(40),
      diffBaseTree: "b".repeat(40),
      headSha: "c".repeat(40),
      headTree: "d".repeat(40),
      targetId: `sha256:${"e".repeat(64)}`,
    };
    const resume = vi.fn(async () => ({
      schemaVersion: 1,
      mode: "review-local-resume",
      diagnostics: [],
      state: "suspended",
      nextAction: "wait",
      payload: {
        operationId: "local-operation",
        persistedVersion: 1,
        currentTarget: target,
      },
    }));

    await handleReviewLocalResume("-", {
      resolveRoot: () => "/repo",
      readText: async () => "{\"schemaVersion\":1,\"operationId\":\"local-operation\"}",
      resume,
      write,
      setExitCode: vi.fn(),
    });

    expect(resume).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-local-resume",
      state: "suspended",
      nextAction: "wait",
      payload: {
        operationId: "local-operation",
        currentTarget: target,
      },
    });
  });
});

describe("handleReviewRespond", () => {
  it("reads one approved set and emits one validated response envelope", async () => {
    const write = vi.fn();
    const respond = vi.fn(async () => ({
      schemaVersion: 1,
      mode: "review-respond",
      diagnostics: [],
      state: "settled",
      nextAction: "reduce",
      payload: {
        operationId: "local-operation",
        dispositionRecordRef: "git-common:review-gate/evidence/disposition.json",
      },
    }));

    await handleReviewRespond("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify(respondProposalRequest),
      respond,
      write,
      setExitCode: vi.fn(),
    });

    expect(respond).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-respond",
      state: "settled",
      payload: { operationId: "local-operation" },
    });
  });
});

describe("handleReviewReduce", () => {
  it("reports malformed local review records as corrupt state", async () => {
    const write = vi.fn();

    await handleReviewReduce("-", {
      resolveRoot: () => "/repo",
      readText: async () => "{\"schemaVersion\":1,\"operationId\":\"local-operation\"}",
      reduce: async () => {
        throw new LocalReviewRecordStoreError("malformed-local-source");
      },
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      error: { code: "corrupt-state", message: "malformed-local-source" },
    });
  });

  it("reads an operation request and emits one validated reduction envelope", async () => {
    const write = vi.fn();
    const target = {
      schemaVersion: 2 as const,
      semanticsVersion: "review-gate/v2" as const,
      kind: "change-set" as const,
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: "a".repeat(40),
      diffBaseTree: "b".repeat(40),
      headSha: "c".repeat(40),
      headTree: "d".repeat(40),
      targetId: `sha256:${"e".repeat(64)}`,
    };
    const projection = {
      schemaVersion: 1 as const,
      semanticsVersion: "review-advisory/v1" as const,
      operationId: "local-operation",
      persistedVersion: 1,
      currentTarget: target,
      state: "advisory-complete" as const,
      nextAction: "none" as const,
    };
    const reduce = vi.fn(async () => ({
      schemaVersion: 1,
      mode: "review-reduce",
      diagnostics: [],
      state: "advisory-complete",
      nextAction: "none",
      payload: {
        operationId: "local-operation",
        persistedVersion: 1,
        currentTarget: target,
        projection,
      },
    }));

    await handleReviewReduce("-", {
      resolveRoot: () => "/repo",
      readText: async () => "{\"schemaVersion\":1,\"operationId\":\"local-operation\"}",
      reduce,
      write,
      setExitCode: vi.fn(),
    });

    expect(reduce).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-reduce",
      state: "advisory-complete",
      payload: { operationId: "local-operation", projection: { state: "advisory-complete" } },
    });
  });
});

describe("handleReviewPrePublication", () => {
  const target = { repository: "arc-framework/example", pullRequest: null, headSha: "a".repeat(40) };
  const standardReview = {
    obligation: "required" as const,
    reasons: ["unknown-change-set" as const],
    rubricVersion: "standard-review/v1",
    rubricDigest: `sha256:${"b".repeat(64)}`,
    retrigger: "full-final" as const,
    count: 1 as const,
  };
  const lane = (name: "frontline" | "standard", sources: readonly string[]) => ({
    schemaVersion: 1 as const,
    target,
    lane: name,
    frontlineActive: false,
    standardReview,
    completedPasses: 0,
    attempts: [],
    sources,
    maxPasses: 2 as const,
  });
  const request = {
    schemaVersion: 1 as const,
    workUnit: "example",
    candidateId: `sha256:${"c".repeat(64)}`,
    reservationTarget: {
      kind: "pinned-head" as const,
      repository: target.repository,
      headSha: target.headSha,
    },
    selfReview: "inactive" as const,
    frontline: lane("frontline", []),
    standard: lane("standard", ["codex-pr"]),
    candidate: {
      subjectDigest: `sha256:${"e".repeat(64)}`,
      implementationChanged: false,
      convergenceVerification: "satisfied" as const,
      convergenceScope: null,
    },
  };

  function boundary(overrides: Record<string, unknown> = {}) {
    return {
      resolveRoot: () => "/repo",
      persistBoundary: vi.fn(),
      write: vi.fn(),
      warn: vi.fn(),
      setExitCode: vi.fn(),
      ...overrides,
    };
  }

  it("emits the projected locus and reserves the hosted source before pull-request binding", async () => {
    const dependencies = boundary({
      compose: vi.fn(async () => ({ status: "composed", request, advisories: [] })),
    });

    await handleReviewPrePublication("example", { json: true }, dependencies);

    const envelope = JSON.parse(String(dependencies.write.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      mode: "pre-publication-review",
      workUnit: "example",
      locus: "candidate-publish-ready",
      nextAction: { kind: "publish-candidate", command: "arc publish example --json" },
    });
    expect(envelope.reservation).toMatchObject({
      semanticsVersion: "standard-review-reservation/v1",
      sources: ["codex-pr"],
      target: { repository: "arc-framework/example", headSha: "a".repeat(40) },
    });
    expect(dependencies.setExitCode).not.toHaveBeenCalled();
  });

  it("writes the durable publication boundary where the locus settles", async () => {
    const dependencies = boundary({
      compose: vi.fn(async () => ({ status: "composed", request, advisories: [] })),
    });

    await handleReviewPrePublication("example", { json: true }, dependencies);

    // The digest travels with the boundary because submission authorizes against it: a boundary
    // recording only its Candidate identity could not tell a settled review from a superseded one.
    expect(dependencies.persistBoundary).toHaveBeenCalledWith("/repo", expect.objectContaining({
      workUnit: "example",
      locus: "candidate-publish-ready",
      candidateId: request.candidateId,
      candidateSubjectDigest: request.candidate.subjectDigest,
    }));
  });

  it("writes no boundary while a pre-publication obligation is still open", async () => {
    const dependencies = boundary({
      compose: vi.fn(async () => ({
        status: "composed",
        request: { ...request, selfReview: "pending" as const },
        advisories: [],
      })),
    });

    await handleReviewPrePublication("example", { json: true }, dependencies);

    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      locus: "candidate-review-pending",
    });
    expect(dependencies.persistBoundary).not.toHaveBeenCalled();
  });

  it("persists the convergence-verification resume locus", async () => {
    const dependencies = boundary({
      compose: vi.fn(async () => ({
        status: "composed",
        request: {
          ...request,
          candidate: {
            subjectDigest: `sha256:${"e".repeat(64)}`,
            implementationChanged: true,
            convergenceVerification: "pending" as const,
            convergenceScope: "full",
          },
        },
        advisories: [],
      })),
    });

    await handleReviewPrePublication("example", { json: true }, dependencies);

    expect(dependencies.persistBoundary).toHaveBeenCalledWith("/repo", expect.objectContaining({
      locus: "candidate-convergence-verification-pending",
    }));
  });

  it("reports a failed boundary write instead of claiming a settled locus", async () => {
    const dependencies = boundary({
      compose: vi.fn(async () => ({ status: "composed", request, advisories: [] })),
      persistBoundary: vi.fn(async () => {
        throw new Error("boundary write failed");
      }),
    });

    await handleReviewPrePublication("example", { json: true }, dependencies);

    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-pre-publication",
      error: { message: expect.stringContaining("boundary write failed") },
    });
    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);
  });

  it("passes the reported self-review state through to the procedure", async () => {
    const compose = vi.fn(async () => ({ status: "composed", request, advisories: [] }));

    await handleReviewPrePublication(
      "example",
      { json: true, selfReview: "settled" },
      boundary({ compose }),
    );

    expect(compose).toHaveBeenCalledWith("/repo", expect.objectContaining({
      name: "example",
      selfReview: "settled",
    }), { selfReview: "settled", changeSet: undefined, lanes: undefined });
  });

  it("writes composition advisories to stderr so the JSON envelope stays machine-clean", async () => {
    const dependencies = boundary({
      compose: vi.fn(async () => ({
        status: "composed",
        request,
        advisories: ["the standard lane has no durable progress at this head"],
      })),
    });

    await handleReviewPrePublication("example", { json: true }, dependencies);

    expect(dependencies.warn).toHaveBeenCalledWith(
      "the standard lane has no durable progress at this head\n",
    );
    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "pre-publication-review",
    });
  });

  it("rejects an unreported self-review state before composing", async () => {
    const compose = vi.fn();
    const dependencies = boundary({ compose });

    await handleReviewPrePublication("example", { json: true, selfReview: "done" }, dependencies);

    expect(compose).not.toHaveBeenCalled();
    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-pre-publication",
      error: { code: "invalid-input" },
    });
    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);
  });

  it("reads each judgment source separately and hands both to composition", async () => {
    const compose = vi.fn(async () => ({ status: "composed", request, advisories: [] }));
    const readText = vi.fn(async (source: string) => source === "-"
      ? JSON.stringify({ changeSetState: "known" })
      : JSON.stringify({ standard: { scopeMode: "chunked" } }));
    const dependencies = boundary({ compose, readText });

    await handleReviewPrePublication(
      "example",
      { json: true, changeSet: "-", lanes: "lanes.json" },
      dependencies,
    );

    expect(readText).toHaveBeenCalledWith("-");
    expect(readText).toHaveBeenCalledWith("lanes.json");
    expect(compose).toHaveBeenCalledWith("/repo", expect.anything(), {
      selfReview: undefined,
      changeSet: { changeSetState: "known" },
      lanes: { standard: { scopeMode: "chunked" } },
    });
  });

  it("composes with no judgment rather than a placeholder when both options are absent", async () => {
    const compose = vi.fn(async () => ({ status: "composed", request, advisories: [] }));
    const readText = vi.fn();
    const dependencies = boundary({ compose, readText });

    await handleReviewPrePublication("example", { json: true }, dependencies);

    expect(readText).not.toHaveBeenCalled();
    expect(compose).toHaveBeenCalledWith("/repo", expect.anything(), {
      selfReview: undefined,
      changeSet: undefined,
      lanes: undefined,
    });
  });

  it("replays every judgment and records self-review completion on the next hop", async () => {
    const openRequest = {
      ...request,
      selfReview: "pending" as const,
    };
    const changeSet = { changeSetState: "known", surfaceAuthority: "repository" };
    const lanes = { frontline: { invocation: { mode: "skip" } }, standard: { scopeMode: "chunked" } };
    const first = boundary({
      readText: async (source: string) => JSON.stringify(source === "change.json" ? changeSet : lanes),
      compose: vi.fn(async () => ({ status: "composed", request: openRequest, advisories: [] })),
    });

    await handleReviewPrePublication(
      "example",
      { json: true, changeSet: "change.json", lanes: "lanes.json" },
      first,
    );

    const firstEnvelope = JSON.parse(String(first.write.mock.calls[0]?.[0])) as {
      nextAction: { command: string };
    };
    const token = firstEnvelope.nextAction.command.match(/--resume ([A-Za-z0-9_-]+)/u)?.[1];
    expect(token).toBeDefined();
    const compose = vi.fn(async () => ({ status: "composed", request, advisories: [] }));
    const readText = vi.fn();
    const second = boundary({ compose, readText });

    await handleReviewPrePublication("example", { json: true, resume: token }, second);

    expect(readText).not.toHaveBeenCalled();
    expect(compose).toHaveBeenCalledWith("/repo", expect.objectContaining({
      name: "example",
      resume: token,
    }), { selfReview: "settled", changeSet, lanes });
    expect(JSON.parse(String(second.write.mock.calls[0]?.[0]))).toMatchObject({
      locus: "candidate-publish-ready",
      nextAction: { kind: "publish-candidate" },
    });
  });

  it("consumes an Owner terminus before findings can advance to another Candidate subject", async () => {
    const findingsRequest = {
      ...request,
      standard: {
        ...request.standard,
        completedPasses: 1,
        sources: ["delegated-agent"],
        attempts: [{ sourceId: "delegated-agent", outcome: "findings" as const }],
      },
    };
    const lanes = {
      frontline: { invocation: { mode: "skip" } },
      standard: { scopeMode: "chunked", terminus: { mode: "owner-accepted" } },
    };
    const dependencies = boundary({
      readText: async () => JSON.stringify(lanes),
      compose: vi.fn(async () => ({ status: "composed", request: findingsRequest, advisories: [] })),
    });

    await handleReviewPrePublication("example", { json: true, lanes: "lanes.json" }, dependencies);

    const envelope = JSON.parse(String(dependencies.write.mock.calls[0]?.[0])) as {
      locus: string;
      nextAction: { command: string };
    };
    expect(envelope.locus, JSON.stringify(envelope)).toBe("candidate-fix-pending");
    const token = envelope.nextAction.command.match(/--resume ([A-Za-z0-9_-]+)/u)?.[1];
    expect(token).toBeDefined();
    expect(JSON.parse(Buffer.from(String(token), "base64url").toString("utf8"))).toEqual({
      lanes: {
        frontline: { invocation: { mode: "skip" } },
        standard: { scopeMode: "chunked" },
      },
    });
  });

  it("binds a Frontline ceiling override to the exact member across same-pass fallback", async () => {
    const lanes = {
      frontline: {
        scopeMode: "whole-target",
        ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 },
      },
    };
    const readyRequest = {
      ...request,
      frontline: {
        ...request.frontline,
        frontlineActive: true,
        sources: ["coderabbit-cli"],
        completedPasses: 2,
        maxPasses: 2,
        scopeSelection: { mode: "whole-target" as const, target },
        ceilingOverride: {
          target,
          lane: "frontline" as const,
          exhaustedPassCount: 2,
          nextPass: 3,
        },
      },
    };
    const dependencies = boundary({
      readText: async () => JSON.stringify(lanes),
      compose: vi.fn(async () => ({ status: "composed", request: readyRequest, advisories: [] })),
    });

    await handleReviewPrePublication("example", { json: true, lanes: "lanes.json" }, dependencies);

    const envelope = JSON.parse(String(dependencies.write.mock.calls[0]?.[0])) as {
      policy: { state: string; nextAction: string };
      nextAction: { command: string };
    };
    expect(envelope.policy).toMatchObject({ state: "ready", nextAction: "run-frontline" });
    const token = envelope.nextAction.command.match(/--resume ([A-Za-z0-9_-]+)/u)?.[1];
    expect(token).toBeDefined();
    expect(JSON.parse(Buffer.from(String(token), "base64url").toString("utf8"))).toEqual({
      lanes,
      frontlineCeilingHeadSha: target.headSha,
    });
  });

  it("consumes a bound Frontline ceiling override when composition advances to another member", async () => {
    const priorHead = "f".repeat(40);
    const lanes = {
      frontline: {
        scopeMode: "whole-target",
        ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 },
      },
    };
    const nextTarget = { ...target, headSha: "9".repeat(40) };
    const nextRequest = {
      ...request,
      frontline: {
        ...request.frontline,
        target: nextTarget,
        frontlineActive: true,
        sources: ["coderabbit-cli"],
        scopeSelection: { mode: "whole-target" as const, target: nextTarget },
      },
      standard: { ...request.standard, target: nextTarget },
    };
    const resume = Buffer.from(JSON.stringify({
      lanes,
      frontlineCeilingHeadSha: priorHead,
    }), "utf8").toString("base64url");
    const dependencies = boundary({
      compose: vi.fn(async () => ({ status: "composed", request: nextRequest, advisories: [] })),
    });

    await handleReviewPrePublication("example", { json: true, resume }, dependencies);

    const envelope = JSON.parse(String(dependencies.write.mock.calls[0]?.[0])) as {
      policy: { state: string; nextAction: string };
      nextAction: { command: string };
    };
    expect(envelope.policy).toMatchObject({ state: "ready", nextAction: "run-frontline" });
    const token = envelope.nextAction.command.match(/--resume ([A-Za-z0-9_-]+)/u)?.[1];
    expect(token).toBeDefined();
    expect(JSON.parse(Buffer.from(String(token), "base64url").toString("utf8"))).toEqual({
      lanes: { frontline: { scopeMode: "whole-target" } },
    });
  });

  it("refuses to read both judgment inputs from the same stdin stream", async () => {
    const compose = vi.fn();
    const readText = vi.fn();
    const dependencies = boundary({ compose, readText });

    await handleReviewPrePublication("example", { json: true, changeSet: "-", lanes: "-" }, dependencies);

    expect(readText).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-pre-publication",
      error: { code: "invalid-input" },
    });
    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);
  });

  it.each(["changeSet", "lanes"] as const)("rejects an unparseable %s source before composing", async (option) => {
    const compose = vi.fn();
    const dependencies = boundary({ compose, readText: async () => "{ not json" });

    await handleReviewPrePublication("example", { json: true, [option]: "facts.json" }, dependencies);

    expect(compose).not.toHaveBeenCalled();
    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-pre-publication",
    });
    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);
  });

  it("emits the composition's refusal rather than an empty procedure result", async () => {
    const dependencies = boundary({
      compose: vi.fn(async () => ({
        status: "refused",
        reason: "No managed Candidate record exists for `example`.",
      })),
    });

    await handleReviewPrePublication("example", { json: true }, dependencies);

    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-pre-publication",
      error: { message: expect.stringContaining("No managed Candidate record") },
    });
    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);
  });

  it("preserves a stale Candidate's typed refusal and deliberate re-root remedy", async () => {
    const dependencies = boundary({
      compose: vi.fn(async () => ({
        status: "refused",
        code: "candidate-unexplained-delta",
        reason: "Run full work-unit verification to establish a new Candidate lineage root.",
      })),
    });

    await handleReviewPrePublication("example", { json: true }, dependencies);

    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-pre-publication",
      error: { code: "candidate-unexplained-delta" },
      remedy: { argv: ["arc", "attest", "example", "--new-root"] },
    });
    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);
  });

  it("reports a repository it cannot resolve as an ARC project", async () => {
    const compose = vi.fn();
    const dependencies = boundary({ resolveRoot: () => null, compose });

    await handleReviewPrePublication("example", { json: true }, dependencies);

    expect(compose).not.toHaveBeenCalled();
    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "review-pre-publication",
      error: { message: expect.stringContaining("Not inside an ARC project") },
    });
  });

  it.each([
    ["an unreadable request", { json: true, selfReview: "done" }, {}],
    ["an unresolvable repository", { json: true }, { resolveRoot: () => null }],
    ["a refused composition", { json: true }, {
      compose: vi.fn(async () => ({ status: "refused", reason: "No managed Candidate record exists." })),
    }],
  ] as const)("names the resume command on %s", async (_case, options, overrides) => {
    const dependencies = boundary(overrides);

    await handleReviewPrePublication("example", options, dependencies);

    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      remedy: { argv: ["arc", "review", "pre-publication", "example", "--json"] },
    });
  });

  it("points a refusal of the operand itself at work-unit discovery", async () => {
    const compose = vi.fn();
    const dependencies = boundary({ compose });

    await handleReviewPrePublication("Not A Slug", { json: true }, dependencies);

    expect(compose).not.toHaveBeenCalled();
    expect(JSON.parse(String(dependencies.write.mock.calls[0]?.[0]))).toMatchObject({
      error: { code: "invalid-input" },
      remedy: { argv: ["arc", "status", "--project", "--json"] },
    });
  });
});
