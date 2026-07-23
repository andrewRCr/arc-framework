import { describe, expect, it, vi } from "vitest";

import {
  handleReviewFrontlineResolve,
  handleReviewFrontlineRun,
  handleReviewLocalAttest,
  handleReviewLocalPrepare,
  handleReviewLocalResume,
} from "../../../src/handlers/review.js";
import { LocalTargetDerivationError } from "../../../src/scripts/review-gate/hosts/local/repository-target.js";

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
      readText: async () => "{\"schemaVersion\":1}",
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

  it("emits a typed invalid-input envelope for repository preconditions", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleReviewLocalPrepare("request.json", {
      resolveRoot: () => "/repo",
      readText: async () => "{}",
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
      readText: async () => "{\"schemaVersion\":1}",
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
