import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../../../src/lib/git/exec.js";
import { createRawGitExec } from "../../../../../src/lib/io-context.js";
import {
  createCandidateAttestation,
  type CandidateManagedRecordV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";
import type { CandidateEffectiveTargetProjection } from
  "../../../../../src/lib/work-unit/candidate-effective-target.js";
import { collectGitCandidateSubject } from
  "../../../../../src/lib/work-unit/git-candidate-subject.js";
import { createReviewTarget } from
  "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewResult } from
  "../../../../../src/scripts/review-gate/core/review-result.js";
import type { ReviewOperationState } from
  "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { laneProgressOperationId } from
  "../../../../../src/scripts/review-gate/lane-progress.js";
import { LocalTargetDerivationError } from
  "../../../../../src/scripts/review-gate/hosts/local/repository-target.js";
import {
  confirmNoPullRequestCandidatePriorProducer,
  noPullRequestCandidatePriorApplicability,
  resolvePrePublicationDiffBase,
  singletonFrontlinePhaseClosed,
} from
  "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";

const baseRef = "main";
const headSha = "a".repeat(40);
const firstBase = "b".repeat(40);
const secondBase = "c".repeat(40);

describe("singleton frontline phase across Candidate roots", () => {
  it("stays closed after an ancestor terminal result before standard admission", async () => {
    const ancestorId = `sha256:${"1".repeat(64)}`;
    const currentId = `sha256:${"2".repeat(64)}`;
    const operationId = laneProgressOperationId({
      lane: "frontline", repositoryId: "repo-1", headSha,
      lineage: { kind: "candidate", candidateId: ancestorId },
    });
    let outcome: "clean" | "findings" | "settled-findings" = "clean";
    const store = {
      readOperation: async (id: string) => ({
        version: 1,
        state: id === operationId ? {
          kind: "lane-progress", lane: "frontline", repositoryId: "repo-1",
          lineage: { kind: "candidate", candidateId: ancestorId },
          attempts: [{ attemptId: "frontline-attempt", terminalProducer: true, outcome }],
        } as unknown as ReviewOperationState : null,
      }),
    };
    const input = { repositoryId: "repo-1", candidateIds: [currentId, ancestorId] };
    expect(await singletonFrontlinePhaseClosed(store, input)).toBe(true);
    outcome = "findings";
    expect(await singletonFrontlinePhaseClosed(store, input)).toBe(false);
    outcome = "settled-findings";
    expect(await singletonFrontlinePhaseClosed(store, {
      ...input,
      readSettledFindingsAdvice: async () => ({
        action: "follow-up-after-fix", pass: 2, maxPasses: 2, nextCommand: "frontline-resolve",
      }),
    })).toBe(false);
    expect(await singletonFrontlinePhaseClosed(store, {
      ...input,
      readSettledFindingsAdvice: async () => ({ action: "stop", reason: "pass-cap-exhausted" }),
    })).toBe(true);
    outcome = "clean";
    expect(await singletonFrontlinePhaseClosed(store, {
      repositoryId: "repo-1", candidateIds: [currentId],
    })).toBe(false);
  });
});

describe("pre-publication diff base", () => {
  it("accepts the sole best ancestor for both exact target paths", async () => {
    const exec: GitExec = vi.fn(async () => ({ stdout: `${firstBase}\n` }));
    await expect(resolvePrePublicationDiffBase({ exec, cwd: "/repo", baseRef, headSha }))
      .resolves.toBe(firstBase);
    expect(exec).toHaveBeenCalledWith(
      "git", ["merge-base", "--all", "refs/heads/main", headSha], { cwd: "/repo" },
    );
  });

  it("refuses a criss-cross history with two best ancestors", async () => {
    const exec: GitExec = vi.fn(async () => ({ stdout: `${firstBase}\n${secondBase}\n` }));
    await expect(resolvePrePublicationDiffBase({ exec, cwd: "/repo", baseRef, headSha }))
      .rejects.toMatchObject({
        name: LocalTargetDerivationError.name,
        code: "invalid-input",
        reason: "ambiguous-merge-base",
      });
  });
});

describe("local Candidate prior-head applicability without a pull request", () => {
  const candidateId = `sha256:${"d".repeat(64)}`;
  const priorTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef,
    diffBaseSha: firstBase,
    diffBaseTree: "e".repeat(40),
    headSha,
    headTree: "f".repeat(40),
  });
  const currentTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef,
    diffBaseSha: firstBase,
    diffBaseTree: "e".repeat(40),
    headSha: "1".repeat(40),
    headTree: "2".repeat(40),
  });
  const lineage = { kind: "candidate" as const, candidateId };
  const predecessor = {
    kind: "attested-local",
    repositoryId: "repo-1",
    target: priorTarget,
    admission: { lineage },
  } as ReviewResult;
  const projection = (revision: string, subjectDigest: string) => ({
    state: "current",
    candidateId,
    recognizedTarget: { revision, subject: { subjectDigest } },
  }) as CandidateEffectiveTargetProjection;
  const prior = projection(priorTarget.headSha, `sha256:${"3".repeat(64)}`);
  const current = projection(currentTarget.headSha, `sha256:${"3".repeat(64)}`);
  const input = {
    predecessor,
    currentTarget,
    currentLineage: lineage,
    candidateId,
    prior,
    current,
    observedCurrentTarget: currentTarget,
  };

  it("retains a prior local producer when exact heads have the same recognized subject", () => {
    expect(noPullRequestCandidatePriorApplicability(input)).toBe("applicable");
  });

  it("requires review for a changed subject and refuses stale or foreign evidence", () => {
    expect(noPullRequestCandidatePriorApplicability({
      ...input,
      current: projection(currentTarget.headSha, `sha256:${"4".repeat(64)}`),
    })).toBe("review-required");
    expect(noPullRequestCandidatePriorApplicability({
      ...input,
      observedCurrentTarget: priorTarget,
    })).toBe("unavailable");
    expect(noPullRequestCandidatePriorApplicability({
      ...input,
      candidateId: `sha256:${"5".repeat(64)}`,
    })).toBe("unavailable");
  });

  it("reads pinned Git subjects across an evidence-neutral commit and refuses changed code", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-prior-candidate-"));
    const run = promisify(execFile);
    const exec: GitExec = async (_command, args) => {
      const result = await run("git", args, { cwd });
      return { stdout: result.stdout, stderr: result.stderr };
    };
    const git = async (...args: string[]) => (await exec("git", args)).stdout.trim();
    try {
      await git("init", "--initial-branch=main");
      await git("config", "user.name", "ARC Test");
      await git("config", "user.email", "arc@example.test");
      await mkdir(join(cwd, "src"));
      await writeFile(join(cwd, "src", "example.ts"), "export const value = 1;\n");
      await git("add", ".");
      await git("commit", "-m", "base");
      const baseSha = await git("rev-parse", "HEAD");
      const baseTree = await git("rev-parse", "HEAD^{tree}");
      await git("checkout", "-b", "work");
      await writeFile(join(cwd, "src", "example.ts"), "export const value = 2;\n");
      await git("add", ".");
      await git("commit", "-m", "implementation");
      const priorHead = await git("rev-parse", "HEAD");
      const priorTree = await git("rev-parse", "HEAD^{tree}");
      const collected = await collectGitCandidateSubject({
        cwd, name: "example", baseBranch: "main", baseRevision: baseSha,
        revision: priorHead, exec,
      });
      expect(collected.status).toBe("collected");
      if (collected.status !== "collected") return;
      const attestation = createCandidateAttestation({
        workUnit: "example",
        subject: collected.target.subject,
        baseRevision: priorHead,
        attestedBy: "andrew",
        attestedAt: "2026-09-25T12:00:00.000Z",
        verificationEvidenceRef: "verification://prior",
      });
      const candidate: CandidateManagedRecordV1 = {
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        attestation,
        subject: collected.target.subject,
        transitions: [],
        lineageAttestations: [],
      };
      const prior = createReviewTarget({
        schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
        repositoryId: "repo-1", baseRef, diffBaseSha: baseSha, diffBaseTree: baseTree,
        headSha: priorHead, headTree: priorTree,
      });
      const actualLineage = { kind: "candidate" as const, candidateId: attestation.candidateId };
      const actualPredecessor = {
        kind: "attested-local", repositoryId: "repo-1", target: prior,
        admission: { lineage: actualLineage },
      } as ReviewResult;
      await mkdir(join(cwd, ".arc", "active"), { recursive: true });
      await writeFile(join(cwd, ".arc", "active", "meta-example.md"), "# Workflow projection\n");
      await git("add", ".");
      await git("commit", "-m", "lifecycle projection");
      const makeCurrent = async () => createReviewTarget({
        schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
        repositoryId: "repo-1", baseRef, diffBaseSha: baseSha, diffBaseTree: baseTree,
        headSha: await git("rev-parse", "HEAD"), headTree: await git("rev-parse", "HEAD^{tree}"),
      });
      const evaluate = async () => {
        const exact = await makeCurrent();
        return confirmNoPullRequestCandidatePriorProducer({
          cwd, workUnit: "example", baseBranch: "main", candidate,
          predecessor: actualPredecessor, currentTarget: exact, currentLineage: actualLineage,
          exec, rawExec: createRawGitExec(cwd), observeTarget: makeCurrent,
        });
      };
      await expect(evaluate()).resolves.toBe("applicable");
      await writeFile(join(cwd, "src", "example.ts"), "export const value = 3;\n");
      await git("add", ".");
      await git("commit", "-m", "changed reviewed code");
      await expect(evaluate()).resolves.toBe("unavailable");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
