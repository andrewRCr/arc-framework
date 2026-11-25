import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { handleReviewLocalAttest, handleReviewLocalPrepare, handleReviewLocalResume } from "../../src/handlers/review.js";
import { LocalAttestEnvelopeSchema, LocalPrepareEnvelopeSchema, LocalResumeEnvelopeSchema } from
  "../../src/scripts/review-gate/core/review-command-envelope.js";
import { attestLocalReviewCommand } from "../../src/scripts/review-gate/runtime/local-attest-command.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";
import { resumeLocalReviewCommand } from "../../src/scripts/review-gate/runtime/local-resume-command.js";
import { readLaneProgressOwner } from "../../src/scripts/review-gate/lane-progress.js";

// Only ambient session identity is supplied: Git, target derivation, policy, stores,
// materialization, locks, receipt publication and handler serialization run for real.
vi.mock("../../src/scripts/review-gate/hosts/local/live-context.js", () => ({
  readLocalReviewLiveContext: async () => ({
    meta: null,
    context: {
      activeIdentity: "andrew", workUnit: null,
      errand: { identity: "local-target-recovery", claimId: "1".repeat(32) },
    },
  }),
}));

const { createLocalPrepareDependencies } = await import(
  "../../src/scripts/review-gate/runtime/local-prepare-composition.js"
);
const { createLocalAttestDependencies } = await import(
  "../../src/scripts/review-gate/runtime/local-attest-composition.js"
);
const { createLocalResumeDependencies } = await import(
  "../../src/scripts/review-gate/runtime/local-resume-composition.js"
);

const exec = createExecaGitExec();
const roots: string[] = [];
const request = {
  schemaVersion: 1,
  evaluatorIdentity: "independent-reviewer",
  routingFacts: {
    contentKind: "code-bearing", reviewRisk: "sensitive", changeDeterminacy: "atomic",
    ownership: "self", surfaceAuthority: "ordinary",
  },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function git(root: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd: root })).stdout.trim();
}

async function repository() {
  const root = await mkdtemp(join(tmpdir(), "arc-local-target-recovery-"));
  roots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "ARC Test");
  await git(root, "config", "user.email", "arc@example.test");
  await writeFile(join(root, "initial.txt"), "initial\n");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "initial");
  await git(root, "switch", "-c", "feature");
  await writeFile(join(root, "foundation.ts"), "export const foundation = 1;\n");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "foundation");
  const foundation = await git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "feature.ts"), "export const feature = 2;\n");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "feature");
  return { root, foundation };
}

async function prepare(root: string, dependencies = createLocalPrepareDependencies({ exec, cwd: root })) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewLocalPrepare("-", {
    resolveRoot: () => root,
    readText: async () => JSON.stringify(request),
    prepare: (input) => prepareLocalReview(input, dependencies),
    write: (text) => output.push(text),
    setExitCode: (code) => exitCodes.push(code),
  });
  expect(exitCodes, output.join("")).toEqual([]);
  return LocalPrepareEnvelopeSchema.parse(JSON.parse(output.join("")));
}

async function attest(root: string, operationId: string) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewLocalAttest("-", {
    resolveRoot: () => root,
    readText: async () => JSON.stringify({
      schemaVersion: 1, operationId,
      result: {
        status: "complete", result: "clean", evaluatorIdentity: request.evaluatorIdentity,
        reviewRunId: "integration-run", applicabilityId: null, findings: [],
      },
    }),
    attest: (input) => attestLocalReviewCommand(input, createLocalAttestDependencies({ exec, cwd: root })),
    write: (text) => output.push(text),
    setExitCode: (code) => exitCodes.push(code),
  });
  expect(exitCodes, output.join("")).toEqual([]);
  return LocalAttestEnvelopeSchema.parse(JSON.parse(output.join("")));
}

async function resume(root: string, operationId: string) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewLocalResume("-", {
    resolveRoot: () => root,
    readText: async () => JSON.stringify({ schemaVersion: 1, operationId }),
    resume: (input) => resumeLocalReviewCommand(input, createLocalResumeDependencies({ exec, cwd: root })),
    write: (text) => output.push(text),
    setExitCode: (code) => exitCodes.push(code),
  });
  expect(exitCodes, output.join("")).toEqual([]);
  return LocalResumeEnvelopeSchema.parse(JSON.parse(output.join("")));
}

describe("local review recovery through command handlers and repository stores", () => {
  it.each(["base", "head"] as const)("keeps and attests a pending admission after transient %s movement", async (movement) => {
    const { root, foundation } = await repository();
    const first = await prepare(root);
    if (first.state !== "ready") throw new Error("initial operation was not ready");
    const ref = movement === "base" ? "refs/heads/main" : "refs/heads/feature";
    const originalRef = await git(root, "rev-parse", ref);
    let transientRef = foundation;
    if (movement === "head") {
      await writeFile(join(root, "feature.ts"), "export const feature = 3;\n");
      await git(root, "commit", "-am", "advance feature");
      transientRef = await git(root, "rev-parse", "HEAD");
      await git(root, "reset", "--hard", originalRef);
    }
    const dependencies = createLocalPrepareDependencies({ exec, cwd: root });
    const deriveTarget = dependencies.deriveTarget;
    const moveTarget = (head: string) => movement === "head"
      ? git(root, "reset", "--hard", head)
      : git(root, "update-ref", ref, head);
    let moved = false;
    dependencies.deriveTarget = async (repositoryId, member) => {
      if (moved) return deriveTarget(repositoryId, member);
      moved = true;
      await moveTarget(transientRef);
      try {
        return await deriveTarget(repositoryId, member);
      } finally {
        await moveTarget(originalRef);
      }
    };
    const original = await dependencies.operationStore.readOperation(first.payload.operationId);
    expect(await prepare(root, dependencies)).toMatchObject({
      state: "ready", payload: {
        operationId: first.payload.operationId, target: first.payload.target,
        request: { logicalPass: 1, generation: 0 },
      },
    });
    expect(await dependencies.operationStore.readOperation(first.payload.operationId)).toEqual(original);
    expect(await attest(root, first.payload.operationId)).toMatchObject({
      state: "attested-current", nextAction: "reduce", payload: { receiptRecorded: true },
    });
    expect(await prepare(root)).toMatchObject({ state: "review-complete", payload: { operationId: first.payload.operationId } });
  });

  it.each(["base", "head"] as const)("replaces a pending %s target and attests only its current replacement", async (movement) => {
    const { root, foundation } = await repository();
    const first = await prepare(root);
    if (first.state !== "ready") throw new Error("initial operation was not ready");
    const firstId = first.payload.operationId;
    const store = createLocalPrepareDependencies({ exec, cwd: root }).operationStore;
    const original = await store.readOperation(firstId);
    if (original.state?.kind !== "local-review") throw new Error("initial operation was not persisted");
    const sourceStore = createLocalPrepareDependencies({ exec, cwd: root }).sourceStore;
    const originalSource = await sourceStore.readSource(original.state.sourceRef);
    if (movement === "base") {
      await git(root, "update-ref", "refs/heads/main", foundation);
    } else {
      await writeFile(join(root, "feature.ts"), "export const feature = 3;\n");
      await git(root, "commit", "-am", "advance feature");
    }
    const stale = await attest(root, firstId);
    expect(stale).toMatchObject({ state: "stale-target", payload: { receiptRecorded: false } });
    const recovered = await prepare(root);
    expect(recovered).toMatchObject({ state: "ready", payload: { request: { logicalPass: 1, generation: 1 } } });
    if (recovered.state !== "ready") throw new Error("replacement operation was not ready");
    expect(recovered.payload.target.targetId).not.toBe(first.payload.target.targetId);
    expect(await store.readOperation(firstId)).toEqual(original);
    expect(await sourceStore.readSource(original.state.sourceRef)).toEqual(originalSource);
    expect(await resume(root, firstId)).toMatchObject({ state: "terminal-operation", nextAction: "rerun-review" });
    expect(await attest(root, firstId)).toMatchObject({ state: "terminal-operation", nextAction: "rerun-review" });
    expect(await attest(root, recovered.payload.operationId)).toMatchObject({
      state: "attested-current", nextAction: "reduce", payload: { receiptRecorded: true },
    });
    expect(await prepare(root)).toMatchObject({
      state: "review-complete", payload: { operationId: recovered.payload.operationId },
    });
    const progress = await readLaneProgressOwner(store, {
      lane: "standard", repositoryId: original.state.repositoryId,
      headSha: recovered.payload.target.headSha, lineage: original.state.lineage,
    });
    expect(progress).toMatchObject({
      completedPasses: 1, attempts: [
        { attemptId: firstId, outcome: "stale-target", logicalPass: 1, retryGeneration: 0, terminalProducer: false },
        { attemptId: recovered.payload.operationId, outcome: "clean", logicalPass: 1, retryGeneration: 1, terminalProducer: true },
      ],
    });
  });
});
