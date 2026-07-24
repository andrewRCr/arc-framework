import { describe, expect, it, vi } from "vitest";

import {
  handleReviewChunkingResolve,
  handleReviewFrontlineResolve,
  handleReviewFrontlineRun,
  handleReviewLocalAttest,
  handleReviewLocalPrepare,
  handleReviewLocalResume,
  handleReviewReduce,
  handleReviewRespond,
} from "../../../src/handlers/review.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
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
      readText: async () => JSON.stringify({ schemaVersion: 1, target }),
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
