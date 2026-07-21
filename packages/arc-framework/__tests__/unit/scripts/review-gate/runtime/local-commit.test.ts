import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import type { GitExec } from "../../../../../src/lib/git/exec.js";
import { createFixAuthorization } from "../../../../../src/scripts/review-gate/core/fix-authorization.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import {
  resolveLocalCommit,
  runAuthorizedLocalFixIncrement,
} from "../../../../../src/scripts/review-gate/runtime/local-commit.js";

const HEAD_SHA = "a".repeat(40);

function resolvingExec(expectedRevision: string, stdout = `${HEAD_SHA}\n`): GitExec {
  return async (command, args) => {
    if (command !== "git" || args.join(" ") !== `rev-parse --verify --end-of-options ${expectedRevision}^{commit}`) {
      throw new Error("unexpected git invocation");
    }
    return { stdout, stderr: "" };
  };
}

describe("local commit resolution", () => {
  it.each(["HEAD", "a1b2c3d", "topic/review-fix"])("canonicalizes the local commit-ish %s", async (revision) => {
    await expect(resolveLocalCommit(resolvingExec(revision), revision)).resolves.toBe(HEAD_SHA);
  });

  it("rejects a commit-ish that git cannot resolve", async () => {
    const exec: GitExec = async () => { throw new Error("unknown revision"); };
    await expect(resolveLocalCommit(exec, "missing-ref"))
      .rejects.toThrow("reviewContext.proposedHead: expected a resolvable local commit-ish");
  });

  it("rejects a resolved object that is not a canonical 40-hex commit SHA", async () => {
    await expect(resolveLocalCommit(resolvingExec("HEAD", "not-a-sha\n"), "HEAD"))
      .rejects.toThrow("reviewContext.proposedHead: expected 40 lowercase hexadecimal characters");
  });
});

describe("authorized local review-fix commit", () => {
  const oldTarget = createReviewTarget({
    schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set", repositoryId: "repo-1",
    baseRef: "main", diffBaseSha: "0".repeat(40), diffBaseTree: "1".repeat(40),
    headSha: "a".repeat(40), headTree: "2".repeat(40),
  });
  const newTarget = createReviewTarget({
    schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set", repositoryId: "repo-1",
    baseRef: "main", diffBaseSha: "0".repeat(40), diffBaseTree: "1".repeat(40),
    headSha: "b".repeat(40), headTree: "3".repeat(40),
  });
  const dispositionState = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2, semanticsVersion: "review-gate/v2", targetId: oldTarget.targetId,
      policyVersion: canonicalDigest({ policy: "review" }), rubricVersion: "independent-analysis/v1",
      rubricDigest: canonicalDigest({ rubric: "implementation-audit" }), proposedBy: "author-1",
      findings: [{
        findingId: "finding-1", sourceIdentity: "local-review", locus: "src/index.ts:7",
        sourceVerification: "verified", verificationRefs: ["source:src/index.ts:7"], severity: "major",
        disposition: "fix", gating: "blocking", rationale: "The source confirms the reported defect.",
        recommendation: "Apply the bounded fix.", openQuestions: [],
      }],
    })),
    approvedBy: "maintainer-1",
    approvedAt: "2026-07-20T20:00:00Z",
  });

  it("guards before mutation, runs affected gates, and consumes the interlocked commit result", async () => {
    const authorization = createFixAuthorization({ dispositionState, oldTarget });
    const order: string[] = [];
    let readCount = 0;
    const result = await runAuthorizedLocalFixIncrement({
      authorization, dispositionState, oldTarget, priorConsumptions: [], appliedBy: "author-1",
      consumedAt: "2026-07-20T20:05:00Z",
    }, {
      readCurrentTarget: async () => {
        order.push("read");
        readCount += 1;
        return readCount === 1 ? oldTarget : newTarget;
      },
      applyFix: async () => { order.push("apply"); },
      runAffectedGates: async () => { order.push("gates"); return { passed: true, verificationRefs: ["test:fix"] }; },
      commit: async () => { order.push("commit"); return newTarget; },
    });
    expect(order).toEqual(["read", "apply", "gates", "commit", "read"]);
    expect(result).toMatchObject({
      newTarget: { targetId: newTarget.targetId },
      consumption: { fixAuthorizationId: authorization.fixAuthorizationId, appliedBy: "author-1" },
    });
  });

  it("does not release the commit operation when affected gates fail", async () => {
    const commit = vi.fn(async () => newTarget);
    await expect(runAuthorizedLocalFixIncrement({
      authorization: createFixAuthorization({ dispositionState, oldTarget }),
      dispositionState, oldTarget, priorConsumptions: [], appliedBy: "author-1",
      consumedAt: "2026-07-20T20:05:00Z",
    }, {
      readCurrentTarget: async () => oldTarget,
      applyFix: async () => undefined,
      runAffectedGates: async () => ({ passed: false, verificationRefs: [] }),
      commit,
    })).rejects.toThrow("local-fix-verification-failed");
    expect(commit).not.toHaveBeenCalled();
  });
});
