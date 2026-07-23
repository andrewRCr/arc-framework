import { describe, expect, it, vi } from "vitest";

import {
  handleReviewFrontlineResolve,
  handleReviewFrontlineRun,
  handleReviewLocalAttest,
  handleReviewLocalPrepare,
  handleReviewLocalResume,
  handleReviewReduce,
  handleReviewRespond,
} from "../../../src/handlers/review.js";
import { LocalTargetDerivationError } from "../../../src/scripts/review-gate/hosts/local/repository-target.js";
import { reduceReviewRouting } from "../../../src/scripts/review-gate/policy/routing.js";
import { LocalPrepareRequestSchema } from "../../../src/scripts/review-gate/runtime/local-prepare.js";

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
  target,
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
const localAttestRequest = {
  schemaVersion: 1,
  operationId: "local-operation",
  result: {
    status: "complete",
    result: "clean",
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

  it("emits a typed invalid-input envelope for repository preconditions", async () => {
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
        throw new LocalTargetDerivationError("dirty-worktree");
      },
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      schemaVersion: 1,
      diagnostics: [{
        code: "repository-precondition",
        message: "dirty-worktree",
        precondition: "clean-worktree",
      }],
      mode: "review-local-prepare",
      error: {
        code: "invalid-input",
        message: "dirty-worktree",
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
