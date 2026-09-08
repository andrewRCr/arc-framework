import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import {
  createReviewRequirement,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import type {
  ReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import { createLocalReviewAdmission } from "../../src/scripts/review-gate/core/local-operation.js";
import { createLocalReviewSource } from "../../src/scripts/review-gate/core/local-review-source.js";
import type {
  LocalReviewState,
} from "../../src/scripts/review-gate/core/operation-state-schema.js";
import {
  composeDeliveryMemberTarget,
  confirmLocalReviewTarget,
  deriveLocalReviewTarget,
} from "../../src/scripts/review-gate/hosts/local/repository-target.js";
import { createLocalReviewReceipt } from "../../src/scripts/review-gate/runtime/local-attestation.js";
import { projectLocalReviewGuidance } from
  "../../src/scripts/review-gate/policy/local-review-guidance.js";
import { resumeLocalReviewCommand } from "../../src/scripts/review-gate/runtime/local-resume-command.js";
import {
  DurableReviewReductionPort,
  reduceReviewCommand,
} from "../../src/scripts/review-gate/runtime/reduce-command.js";

const roots: string[] = [];
const exec = createExecaGitExec();
const repositoryId = "12345678-1234-1234-1234-123456789abc";
const digest = (value: string): string => canonicalDigest({ value });
const withSourceLock = async <T>(action: () => Promise<T>): Promise<T> => action();

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

/**
 * A work-unit branch carrying a two-member stack, its successor commit, and an
 * uncommitted edit — the locus state that is normal while member work continues.
 */
async function createRepository(seed: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-member-reentry-"));
  roots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "ARC Test");
  await git(root, "config", "user.email", "arc@example.test");
  await writeFile(join(root, "tracked.txt"), `${seed}\n`, "utf8");
  await git(root, "add", "tracked.txt");
  await git(root, "commit", "-m", `initial ${seed}`);
  return root;
}

async function createDirtyStack(): Promise<{
  root: string;
  predecessorSha: string;
  memberSha: string;
}> {
  const root = await createRepository("initial");
  await git(root, "switch", "-c", "feature");
  await writeFile(join(root, "tracked.txt"), "predecessor\n", "utf8");
  await git(root, "commit", "-am", "predecessor");
  const predecessorSha = await git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "tracked.txt"), "member\n", "utf8");
  await git(root, "commit", "-am", "member");
  const memberSha = await git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "tracked.txt"), "successor\n", "utf8");
  await git(root, "commit", "-am", "successor");
  await writeFile(join(root, "tracked.txt"), "uncommitted\n", "utf8");
  return { root, predecessorSha, memberSha };
}

/** One attested local operation over the supplied target, with its source and receipt. */
function operationOver(target: ReviewTarget) {
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "recommended",
      reasons: ["routine-code"],
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("rubric"),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
    initialAdmission: "checkpoint",
  });
  if (requirement === null) throw new Error("expected local requirement");
  const admission = createLocalReviewAdmission({
    target,
    requirement,
    authority: {
      vehicle: target.kind === "delivery-member"
        ? { kind: "delivery-member", identity: `sha256:${"1".repeat(64)}` }
        : { kind: "work-unit", identity: "review-surface-binding" },
      authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation",
    },
    laneSourceId: "delegated-agent",
    lineage: { kind: "candidate" as const, candidateId: "sha256:7777777777777777777777777777777777777777777777777777777777777777" },
    logicalPass: 1,
    retryGeneration: 0,
    policyBindingDigest: digest("binding"),
    requestMechanism: "local-attestation",
  });
  const source = createLocalReviewSource({
    schemaVersion: 1,
    semanticsVersion: "git-object-range/v1",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    objectFormat: "sha1",
    diffBaseSha: target.diffBaseSha,
    diffBaseTree: target.diffBaseTree,
    headSha: target.headSha,
    headTree: target.headTree,
    reachabilityRef: `refs/arc/review/local/${admission.operationId}`,
    materializationRef: `/tmp/${admission.operationId}`,
  });
  const state: LocalReviewState = {
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    kind: "local-review",
    operationId: admission.operationId,
    updatedAt: "2026-08-07T17:00:00Z",
    vehicle: admission.authority.vehicle,
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requestId: admission.carrier.request.requestId,
    policyVersion: requirement.policyVersion,
    policyBindingDigest: admission.policyBindingDigest,
    laneSourceId: admission.laneSourceId,
    lineage: admission.lineage,
    logicalPass: admission.logicalPass,
    retryGeneration: admission.retryGeneration,
    attestationRuntimeKind: admission.authority.attestationRuntimeKind,
    sourceRef: "source.json",
    sourceDigest: source.sourceDigest,
    guidance: projectLocalReviewGuidance().projection,
    guidanceDigest: digest("guidance"),
    reviewerInstructions: projectLocalReviewGuidance().reviewerInstructions,
    target,
    requirement,
    request: admission.carrier.request,
    attestation: admission.carrier.attestation,
    cleanupTtlMs: 60_000,
  };
  const receipt = createLocalReviewReceipt({
    target,
    requirement,
    carrier: admission.carrier,
    result: {
      status: "complete",
      result: "clean",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      headSha: target.headSha,
      headTree: target.headTree,
      rubricVersion: requirement.rubricVersion,
      rubricDigest: requirement.rubricDigest,
      sourceDigest: source.sourceDigest,
      guidanceDigest: state.guidanceDigest,
      evaluatorIdentity: admission.authority.evaluatorIdentity,
      reviewRunId: "run-1",
      applicabilityId: null,
      findings: [],
    },
    runtimeIdentity: admission.authority.runtimeIdentity,
    attestationMechanism: admission.authority.attestationMechanism,
    sourceDigest: source.sourceDigest,
    guidanceDigest: state.guidanceDigest,
  });
  return { state, source, receipt };
}

/** Re-entry dependencies whose only live boundary is the repository's own confirmation. */
function reentry(root: string, records: ReturnType<typeof operationOver>) {
  const confirmTarget = (target: ReviewTarget) => confirmLocalReviewTarget({
    exec,
    cwd: root,
    attemptedTarget: target,
  });
  const operationStore = {
    readOperation: async () => ({ version: 1, state: records.state }),
    publishOperation: vi.fn(),
  };
  const sourceStore = {
    readSource: async () => records.source,
    appendSource: vi.fn(),
  };
  const dispositionStore = {
    readDispositionRecord: async () => null,
    appendDispositionRecord: vi.fn(),
  };
  return {
    resume: {
      sweep: vi.fn(),
      withSourceLock,
      operationStore,
      sourceStore,
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 1, receipts: [records.receipt] }),
        appendReceipt: async () => ({
          ledgerVersion: 1,
          durableEvidenceRef: "git-common:review-gate/evidence/receipts-v2.json#1",
        }),
      },
      dispositionStore,
      confirmTarget,
      materialize: async () => ({ reviewRoot: records.source.materializationRef }),
      now: () => "2026-08-07T17:00:30Z",
    },
    reduce: {
      reductionPort: new DurableReviewReductionPort({
        operationStore,
        sourceStore,
        dispositionStore,
        outcomeStore: { readOutcome: vi.fn(), appendOutcome: vi.fn() },
        readReceiptEntries: async () => [{
          receipt: records.receipt,
          durableEvidenceRef: "git-common:review-gate/evidence/receipts-v2.json#1",
        }],
        confirmTarget,
      }),
    },
  };
}

describe("member operation re-entry", () => {
  async function memberOperation() {
    const stack = await createDirtyStack();
    const target = await composeDeliveryMemberTarget({
      exec,
      cwd: stack.root,
      baseRef: "main",
      repositoryId,
      member: { base: stack.predecessorSha, head: stack.memberSha },
    });
    return { ...stack, target, records: operationOver(target) };
  }

  it("resumes and reduces a member operation from a moved, dirty control checkout", async () => {
    const { root, records, target } = await memberOperation();
    const dependencies = reentry(root, records);
    const request = { schemaVersion: 1 as const, operationId: records.state.operationId };

    // Neither verb re-resolves authority, and confirmation verifies the pinned
    // commits rather than re-deriving, so the successor commit and the
    // uncommitted edit on the work-unit branch are both invisible here.
    await expect(resumeLocalReviewCommand(request, dependencies.resume))
      .resolves.toMatchObject({ state: "review-complete", payload: { currentTarget: target } });
    await expect(reduceReviewCommand(request, dependencies.reduce))
      .resolves.toMatchObject({ state: "advisory-complete", payload: { currentTarget: target } });
  });

  it("refuses at both verbs when the member's pinned objects are gone", async () => {
    const { records } = await memberOperation();
    // A repository that does not hold the recorded commits stands in for a member
    // reaped after admission: confirmation verifies the pins, so it refuses rather
    // than re-deriving something else and calling the operation stale.
    const withoutObjects = await createRepository("unrelated");
    const dependencies = reentry(withoutObjects, records);
    const request = { schemaVersion: 1 as const, operationId: records.state.operationId };

    await expect(resumeLocalReviewCommand(request, dependencies.resume))
      .rejects.toMatchObject({ code: "invalid-input", reason: "non-commit-head" });
    await expect(reduceReviewCommand(request, dependencies.reduce))
      .rejects.toMatchObject({ code: "corrupt-state", message: "non-commit-head" });
  });

  it("leaves ordinary operations re-deriving against the work-unit branch", async () => {
    const root = await createRepository("ordinary");
    await git(root, "switch", "-c", "feature");
    await writeFile(join(root, "tracked.txt"), "change\n", "utf8");
    await git(root, "commit", "-am", "change");
    const target = await deriveLocalReviewTarget({ exec, cwd: root, baseRef: "main", repositoryId });
    const records = operationOver(target);
    const request = { schemaVersion: 1 as const, operationId: records.state.operationId };

    await expect(resumeLocalReviewCommand(request, reentry(root, records).resume))
      .resolves.toMatchObject({ state: "review-complete" });
    await expect(reduceReviewCommand(request, reentry(root, records).reduce))
      .resolves.toMatchObject({ state: "advisory-complete" });

    // The work-unit branch moving is what an ordinary operation still detects — the
    // incidental drift signal the member path deliberately does not manufacture.
    await writeFile(join(root, "tracked.txt"), "moved\n", "utf8");
    await git(root, "commit", "-am", "moved");

    await expect(resumeLocalReviewCommand(request, reentry(root, records).resume))
      .resolves.toMatchObject({ state: "stale-target" });
    await expect(reduceReviewCommand(request, reentry(root, records).reduce))
      .resolves.toMatchObject({ state: "stale-target" });
  });
});
