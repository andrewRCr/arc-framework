import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../src/lib/git/exec.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  RepositoryGitCommonStatePublisher,
} from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import {
  LocalReviewOperationStateStore,
  reconstructReviewSuspensionState,
} from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import {
  armReviewWakeupFallback,
} from "../../src/scripts/review-gate/runtime/review-reentry-fallback.js";
import { resolveReviewReentry } from "../../src/scripts/review-gate/runtime/review-reentry.js";

const roots: string[] = [];
const objectId = (character: string): string => character.repeat(40);
const digest = (value: string): string => canonicalDigest({ value });

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

function target(head: string) {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId(head),
    headTree: objectId(head),
  });
}

async function storeFixture(machine: string) {
  const root = await mkdtemp(join(tmpdir(), `arc-review-reentry-${machine}-`));
  roots.push(root);
  const commonDir = join(root, "common.git");
  await mkdir(commonDir, { recursive: true });
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  return {
    root,
    store: new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(exec, root)),
    siblingStore: () => new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(
      exec,
      join(root, "next-session-worktree"),
    )),
  };
}

function suspension(vehicle: { kind: "work-unit" | "errand"; identity: string }) {
  const reviewTarget = target(vehicle.kind === "work-unit" ? "c" : "d");
  return {
    reviewTarget,
    state: reconstructReviewSuspensionState({
      operationId: `suspension-${vehicle.identity}-1`,
      observedAt: "2026-07-20T20:00:00Z",
      vehicle,
      repositoryId: "repo-1",
      changeRequestId: vehicle.kind === "work-unit" ? "pull/42" : null,
      targetId: reviewTarget.targetId,
      requestId: digest(`request-${vehicle.identity}`),
      sourceIdentity: "codex-pr",
      generation: 1,
      policyVersion: digest("policy"),
      rubricVersion: "independent-analysis/v1",
      rubricDigest: digest("rubric"),
      deadlineAt: "2026-07-20T21:00:00Z",
      wakeupToken: digest(`wakeup-${vehicle.identity}`),
    }),
  };
}

describe("review re-entry resilience", () => {
  it("survives WU handoff and duplicate canonical rereads without advancing durable state", async () => {
    const fixture = await storeFixture("wu");
    const record = suspension({ kind: "work-unit", identity: "review-architecture" });
    await fixture.store.publishOperation(record.state, 0);
    const resumed = fixture.siblingStore();
    const observe = vi.fn(async () => ({
      currentTarget: record.reviewTarget,
      reviewState: "clean" as const,
      responseInput: null,
    }));

    const first = await resolveReviewReentry(resumed, {
      suspension: record.state,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe });
    const duplicate = await resolveReviewReentry(resumed, {
      suspension: record.state,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe });

    expect(first).toEqual(duplicate);
    expect(first).toMatchObject({ state: "review-complete", persistedVersion: 1 });
    await expect(resumed.readOperation(record.state.operationId)).resolves.toEqual({
      version: 1,
      state: record.state,
    });
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it("reconstructs an Errand on a new machine and leaves it explicitly suspended", async () => {
    const fixture = await storeFixture("errand");
    const record = suspension({ kind: "errand", identity: "repair-review" });

    await expect(resolveReviewReentry(fixture.store, {
      suspension: record.state,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe: async () => ({
      currentTarget: record.reviewTarget,
      reviewState: "pending",
      responseInput: null,
    }) })).resolves.toMatchObject({ state: "suspended", persistedVersion: 1 });
    await expect(armReviewWakeupFallback(null, record.state, "2026-07-20T20:45:00Z"))
      .resolves.toMatchObject({
        kind: "human",
        resumeHow: "Re-enter ARC integration for errand 'repair-review' in repository 'repo-1'.",
      });
  });

  it("keeps the shipped workflow resume path canonical and session-independent", async () => {
    const packageRoot = resolve(import.meta.dirname, "../..");
    const workflow = await readFile(
      resolve(packageRoot, "arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      "utf8",
    );

    expect(workflow).toContain("versioned `review-suspension` operation record");
    expect(workflow).toContain("session — or machine — re-enters here");
    expect(workflow).toContain("meta's narrative `Next Action`");
    expect(workflow).toContain("exact human resume condition");
  });
});
