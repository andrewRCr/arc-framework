/** Exact Errand review-status composition from identity and durable lane progress. */

import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  serializeTransientIdentityRecord,
  TransientIdentityRecordV3Schema,
} from "../../src/lib/errand/identity-record.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { resolveRepositoryIdentity } from
  "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import {
  recordHostedAwaitAttempt,
  recordHostedPendingRequest,
  recordLaneAttempt,
} from "../../src/scripts/review-gate/lane-progress.js";
import { readErrandRoutedObligation } from "../../src/scripts/review-gate/status-errand.js";
import { readRoutedObligation } from "../../src/scripts/review-gate/status-composition.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from
  "../../src/scripts/review-gate/policy/standard-review.js";
import { makeGitExec } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => removeGitBackedDir(root)));
});

async function git(cwd: string, args: readonly string[]): Promise<string> {
  return (await execFileAsync("git", [...args], { cwd })).stdout.trim();
}

describe("Errand review status", () => {
  it("binds an awaiting-merge identity to the live PR base and both host coordinates", async () => {
    const root = await createTempRepoCore({ prefix: "arc-review-status-awaiting-", identity: "andrew" });
    roots.push(root);
    await git(root, ["commit", "--allow-empty", "-m", "base"]);
    const slug = "awaiting-errand";
    const branch = `chore/${slug}`;
    await git(root, ["switch", "-c", branch]);
    await git(root, ["commit", "--allow-empty", "-m", "reviewed change"]);
    const headSha = await git(root, ["rev-parse", "HEAD"]);
    await git(root, ["switch", "main"]);
    const record = TransientIdentityRecordV3Schema.parse({
      version: 3,
      kind: "errand",
      slug,
      claimId: "0123456789abcdef0123456789abcdef",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      intent: "Review an awaiting Errand",
      branch,
      state: "awaiting-merge",
      savedHead: null,
      changeRequest: {
        repositoryRef: "owner/repo",
        hostRef: "github.com",
        baseRef: "main",
        headRef: branch,
        headSha,
      },
      createdAt: "2026-09-13T00:00:00.000Z",
      updatedAt: "2026-09-13T00:00:00.000Z",
    });
    await writeFile(join(root, slug), serializeTransientIdentityRecord(record), "utf8");
    await git(root, ["add", slug]);
    await git(root, ["commit", "-m", "identity snapshot"]);
    await git(root, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
    await git(root, ["remote", "add", "origin", "https://github.com/owner/repo.git"]);
    const exec = makeGitExec(root);
    const target = { repository: "owner/repo", headRef: branch, headSha };
    const candidate = { baseRefName: "main", url: "https://github.com/owner/repo/pull/42" };
    const obligation = (changeRequestCandidate?: typeof candidate, remote?: string) => readErrandRoutedObligation({
      cwd: root,
      exec,
      target,
      pullRequest: 42,
      ...(remote === undefined ? {} : { remote }),
      ...(changeRequestCandidate === undefined ? {} : { changeRequestCandidate }),
    });

    await expect(obligation(candidate)).resolves.toEqual({
      state: "review-required",
      detail: "No standard review is recorded for this Errand head.",
    });
    await expect(obligation({ ...candidate, baseRefName: "feature" })).resolves.toMatchObject({
      state: "blocked",
      detail: "The Errand identity's change request does not match the exact target.",
    });
    await expect(obligation({ ...candidate, url: "https://other.example/owner/repo/pull/42" }))
      .resolves.toMatchObject({
        state: "blocked",
        detail: "The Errand identity's change request does not match the exact target.",
      });
    await git(root, ["remote", "set-url", "origin", "https://other.example/owner/repo.git"]);
    await expect(obligation(candidate)).resolves.toMatchObject({
      state: "blocked",
      detail: "The Errand identity's change request does not match the exact target.",
    });
    await git(root, ["remote", "add", "upstream", "https://github.com/owner/repo.git"]);
    await expect(obligation(candidate, "upstream")).resolves.toMatchObject({ state: "review-required" });
    await expect(obligation()).resolves.toMatchObject({ state: "blocked" });
  });

  it("accepts the exact live remote head without a local Errand branch ref", async () => {
    const root = await createTempRepoCore({ prefix: "arc-review-status-remote-", identity: "andrew" });
    const remote = await mkdtemp(join(tmpdir(), "arc-review-status-bare-"));
    roots.push(root, remote);
    const slug = "remote-only-errand";
    const branch = `chore/${slug}`;
    const record = TransientIdentityRecordV3Schema.parse({
      version: 3,
      kind: "errand",
      slug,
      claimId: "0123456789abcdef0123456789abcdef",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      intent: "Review an exact remote Errand head",
      branch,
      state: "open",
      savedHead: null,
      changeRequest: null,
      createdAt: "2026-09-13T00:00:00.000Z",
      updatedAt: "2026-09-13T00:00:00.000Z",
    });
    await writeFile(join(root, slug), serializeTransientIdentityRecord(record), "utf8");
    await git(root, ["add", slug]);
    await git(root, ["commit", "-m", "identity snapshot"]);
    await git(root, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
    await git(root, ["switch", "-c", branch]);
    await writeFile(join(root, "change.txt"), "remote reviewed change\n", "utf8");
    await git(root, ["add", "change.txt"]);
    await git(root, ["commit", "-m", "remote reviewed change"]);
    const headSha = await git(root, ["rev-parse", "HEAD"]);
    await execFileAsync("git", ["init", "--bare", remote]);
    await git(root, ["remote", "add", "origin", remote]);
    await git(root, ["push", "origin", branch]);
    await git(root, ["switch", "--detach", headSha]);
    await git(root, ["update-ref", "-d", `refs/heads/${branch}`]);
    await git(root, ["update-ref", "-d", `refs/remotes/origin/${branch}`]);

    await expect(git(root, ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`])).rejects.toThrow();
    await expect(git(root, ["rev-parse", "--verify", `refs/remotes/origin/${branch}^{commit}`]))
      .rejects.toThrow();
    expect(await git(root, ["ls-remote", "--heads", "origin", `refs/heads/${branch}`]))
      .toBe(`${headSha}\trefs/heads/${branch}`);

    const exec = makeGitExec(root);
    await expect(readRoutedObligation(root, exec, {
      repository: "owner/repo",
      headRef: branch,
      headSha,
    }, 42)).resolves.toEqual({
      state: "review-required",
      detail: "No standard review is recorded for this Errand head.",
    });
    await expect(readRoutedObligation(root, exec, {
      repository: "owner/repo",
      headRef: branch,
      headSha: "0".repeat(40),
    }, 42)).resolves.toEqual({
      state: "blocked",
      detail: "The Errand identity's branch does not match the exact review head.",
    });
  });

  it("reads a pending then clean hosted pass from an exact Errand identity without Candidate artifacts", async () => {
    const root = await createTempRepoCore({ prefix: "arc-review-status-errand-", identity: "andrew" });
    roots.push(root);
    await git(root, ["commit", "--allow-empty", "-m", "earlier base"]);
    const slug = "review-status-errand";
    const branch = `chore/${slug}`;
    const claimId = "0123456789abcdef0123456789abcdef";
    const record = TransientIdentityRecordV3Schema.parse({
      version: 3,
      kind: "errand",
      slug,
      claimId,
      purpose: "errand",
      origin: "description",
      originEntry: null,
      intent: "Review one exact Errand",
      branch,
      state: "open",
      savedHead: null,
      changeRequest: null,
      createdAt: "2026-09-13T00:00:00.000Z",
      updatedAt: "2026-09-13T00:00:00.000Z",
    });
    await writeFile(join(root, slug), serializeTransientIdentityRecord(record), "utf8");
    await git(root, ["add", slug]);
    await git(root, ["commit", "-m", "identity snapshot"]);
    await git(root, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
    const base = await git(root, ["rev-parse", "HEAD"]);
    const earlierBase = await git(root, ["rev-parse", "HEAD^"]);
    const baseTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
    await git(root, ["switch", "-c", branch]);
    await writeFile(join(root, "change.txt"), "reviewed change\n", "utf8");
    await git(root, ["add", "change.txt"]);
    await git(root, ["commit", "-m", "reviewed change"]);
    const headSha = await git(root, ["rev-parse", "HEAD"]);
    const headTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
    await git(root, ["update-ref", `refs/remotes/origin/${branch}`, base]);
    const exec = makeGitExec(root);
    const publisher = new RepositoryGitCommonStatePublisher(exec, root);
    const repositoryId = await resolveRepositoryIdentity(publisher);
    const store = new LocalReviewOperationStateStore(publisher);
    const standardReview = {
      obligation: "required" as const,
      reasons: ["sensitive-change-set" as const],
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
      retrigger: "full-final" as const,
      count: 1 as const,
    };
    const target = { repository: "owner/repo", headRef: branch, headSha };
    const hostedTarget = { repository: target.repository, pullRequest: 42, headSha };
    const handle = {
      schemaVersion: 1 as const,
      provider: "codex-pr" as const,
      requestedCoverage: "complete" as const,
      effectiveCoverage: "complete" as const,
      target: hostedTarget,
      artifact: {
        kind: "issue-comment" as const,
        id: "comment-42",
        url: "https://example.test/comment-42",
        createdAt: "2026-09-13T00:01:00Z",
      },
      vehicle: { kind: "errand" as const, key: slug, claimId, branch, sources: ["codex-pr"], standardReview },
    };
    const reviewTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId,
      baseRef: "main",
      diffBaseSha: base,
      diffBaseTree: baseTree,
      headSha,
      headTree,
    });
    const requirement = createReviewRequirement({
      target: reviewTarget,
      projection: standardReview,
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("the hosted requirement must be present");
    const context = { repositoryId, handle, reviewTarget, requirement, actorIdentity: "github-user-1" };

    await expect(readRoutedObligation(root, exec, {
      ...target,
      headRef: "feat/synthetic-work-unit",
    }, 42)).resolves.toMatchObject({
      state: "blocked",
      detail: "The publication boundary is unavailable.",
    });

    await recordHostedPendingRequest(store, { ...context, now: "2026-09-13T00:01:00Z" });
    const pending = await readRoutedObligation(root, exec, target, 42);
    expect(pending).toEqual({
      state: "review-required",
      detail: "The exact Errand standard-review lane is not settled.",
    });

    await recordHostedAwaitAttempt(store, {
      repositoryId,
      reviewTarget,
      requirement,
      actorIdentity: "github-user-1",
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.test/review-42",
      },
      now: "2026-09-13T00:02:00Z",
    });
    await expect(readRoutedObligation(root, exec, target, 42)).resolves.toMatchObject({
      state: "review-required",
    });
    await expect(readRoutedObligation(root, exec, target, 42, undefined, base)).resolves.toMatchObject({
      state: "settled",
    });
    await expect(readRoutedObligation(root, exec, target, 42, undefined, earlierBase))
      .resolves.toMatchObject({ state: "review-required" });
    await expect(readRoutedObligation(root, exec, target, 42, undefined, headSha))
      .resolves.toMatchObject({ state: "settled" });

    await expect(readRoutedObligation(root, exec, target, 43, undefined, base)).resolves.toMatchObject({
      state: "review-required",
    });

    const replacementHandle = {
      ...handle,
      target: { ...hostedTarget, pullRequest: 43 },
      artifact: {
        ...handle.artifact,
        id: "comment-replacement-43",
        url: "https://example.test/comment-replacement-43",
      },
    };
    await recordHostedPendingRequest(store, {
      ...context,
      handle: replacementHandle,
      now: "2026-09-13T00:02:10Z",
    });
    await recordHostedAwaitAttempt(store, {
      ...context,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: replacementHandle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.test/review-replacement-43",
      },
      now: "2026-09-13T00:02:20Z",
    });
    await expect(readRoutedObligation(root, exec, target, 43, undefined, base)).resolves.toMatchObject({
      state: "settled",
    });

    const staleStandardReview = { ...standardReview, rubricDigest: `sha256:${"0".repeat(64)}` };
    const staleRequirement = createReviewRequirement({
      target: reviewTarget,
      projection: staleStandardReview,
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "automatic",
    });
    if (staleRequirement === null) throw new Error("the stale hosted requirement must be present");
    const staleHandle = {
      ...handle,
      artifact: {
        ...handle.artifact,
        id: "comment-stale-rubric",
        url: "https://example.test/comment-stale-rubric",
      },
      vehicle: { ...handle.vehicle, standardReview: staleStandardReview },
    };
    await recordHostedPendingRequest(store, {
      ...context,
      handle: staleHandle,
      requirement: staleRequirement,
      now: "2026-09-13T00:02:30Z",
    });
    await recordHostedAwaitAttempt(store, {
      ...context,
      requirement: staleRequirement,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: staleHandle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.test/review-stale-rubric",
      },
      now: "2026-09-13T00:02:40Z",
    });
    await expect(readRoutedObligation(root, exec, target, 42)).resolves.toMatchObject({
      state: "review-required",
    });

    await recordLaneAttempt(store, {
      lane: "standard",
      repositoryId,
      changeRequestId: "pull/42",
      headSha,
      attemptId: "hosted-request/later-unavailable",
      sourceId: "codex-pr",
      outcome: "rate-limited",
      consumedPass: false,
      now: "2026-09-13T00:03:00Z",
    });
    await expect(readRoutedObligation(root, exec, target, 42)).resolves.toMatchObject({
      state: "review-required",
    });

    await git(root, ["switch", "main"]);
    const nextRecord = TransientIdentityRecordV3Schema.parse({
      ...record,
      claimId: "fedcba9876543210fedcba9876543210",
    });
    await writeFile(join(root, slug), serializeTransientIdentityRecord(nextRecord), "utf8");
    await git(root, ["add", slug]);
    await git(root, ["commit", "-m", "new identity claim"]);
    await git(root, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
    await git(root, ["switch", branch]);
    await expect(readRoutedObligation(root, exec, target, 42)).resolves.toMatchObject({
      state: "blocked",
      detail: "Recorded review progress does not match the exact Errand identity and change request.",
    });

    const nextHandle = {
      ...handle,
      target: { ...hostedTarget, pullRequest: 43 },
      artifact: {
        ...handle.artifact,
        id: "comment-43",
        url: "https://example.test/comment-43",
        createdAt: "2026-09-13T00:03:30Z",
      },
      vehicle: { ...handle.vehicle, claimId: nextRecord.claimId },
    };
    await recordHostedPendingRequest(store, { ...context, handle: nextHandle, now: "2026-09-13T00:03:30Z" });
    await recordHostedAwaitAttempt(store, {
      ...context,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: nextHandle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.test/review-43",
      },
      now: "2026-09-13T00:03:40Z",
    });
    await expect(readRoutedObligation(root, exec, target, 43, undefined, base)).resolves.toMatchObject({
      state: "settled",
    });

    await writeFile(join(root, "local-change.txt"), "locally reviewed change\n", "utf8");
    await git(root, ["add", "local-change.txt"]);
    await git(root, ["commit", "-m", "locally reviewed change"]);
    const localHeadSha = await git(root, ["rev-parse", "HEAD"]);
    const localHeadTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
    const localTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId,
      baseRef: "main",
      diffBaseSha: base,
      diffBaseTree: baseTree,
      headSha: localHeadSha,
      headTree: localHeadTree,
    });
    await recordLaneAttempt(store, {
      lane: "standard",
      repositoryId,
      changeRequestId: null,
      headSha: localHeadSha,
      attemptId: "local/review-1",
      sourceId: "delegated-agent",
      outcome: "clean",
      consumedPass: true,
      chunkSeriesComplete: true,
      local: {
        vehicle: { kind: "errand", identity: slug, claimId: nextRecord.claimId },
        target: localTarget,
      },
      now: "2026-09-13T00:04:00Z",
    });
    const localStatusTarget = { ...target, headSha: localHeadSha };
    await expect(readRoutedObligation(root, exec, localStatusTarget, 42)).resolves.toMatchObject({
      state: "review-required",
    });
    await recordLaneAttempt(store, {
      lane: "standard",
      repositoryId,
      changeRequestId: null,
      headSha: localHeadSha,
      attemptId: "local/stale-rubric",
      sourceId: "delegated-agent",
      outcome: "clean",
      consumedPass: true,
      chunkSeriesComplete: true,
      local: {
        vehicle: { kind: "errand", identity: slug, claimId: nextRecord.claimId },
        target: localTarget,
        rubricIdentity: { version: staleStandardReview.rubricVersion, digest: staleStandardReview.rubricDigest },
      },
      now: "2026-09-13T00:04:10Z",
    });
    await expect(readRoutedObligation(root, exec, localStatusTarget, 42)).resolves.toMatchObject({
      state: "review-required",
    });
    await recordLaneAttempt(store, {
      lane: "standard",
      repositoryId,
      changeRequestId: null,
      headSha: localHeadSha,
      attemptId: "local/current-rubric",
      sourceId: "delegated-agent",
      outcome: "clean",
      consumedPass: true,
      chunkSeriesComplete: true,
      local: {
        vehicle: { kind: "errand", identity: slug, claimId: nextRecord.claimId },
        target: localTarget,
        rubricIdentity: STANDARD_REVIEW_RUBRIC_IDENTITY,
      },
      now: "2026-09-13T00:04:20Z",
    });
    await expect(readRoutedObligation(root, exec, localStatusTarget, 42, undefined, base)).resolves.toMatchObject({
      state: "settled",
    });
    await expect(readRoutedObligation(root, exec, localStatusTarget, 42, undefined, earlierBase))
      .resolves.toMatchObject({ state: "review-required" });

    await git(root, ["switch", "main"]);
    const finalRecord = TransientIdentityRecordV3Schema.parse({
      ...nextRecord,
      claimId: "00112233445566778899aabbccddeeff",
    });
    await writeFile(join(root, slug), serializeTransientIdentityRecord(finalRecord), "utf8");
    await git(root, ["add", slug]);
    await git(root, ["commit", "-m", "third identity claim"]);
    await git(root, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
    await git(root, ["switch", branch]);
    await expect(readRoutedObligation(root, exec, localStatusTarget, 42)).resolves.toMatchObject({
      state: "blocked",
      detail: "Recorded local review does not match the exact Errand target.",
    });

    await recordLaneAttempt(store, {
      lane: "standard",
      repositoryId,
      changeRequestId: null,
      headSha: localHeadSha,
      attemptId: "local/review-2",
      sourceId: "delegated-agent",
      outcome: "clean",
      consumedPass: true,
      chunkSeriesComplete: true,
      local: {
        vehicle: { kind: "errand", identity: slug, claimId: finalRecord.claimId },
        target: localTarget,
        rubricIdentity: STANDARD_REVIEW_RUBRIC_IDENTITY,
      },
      now: "2026-09-13T00:04:30Z",
    });
    await expect(readRoutedObligation(root, exec, localStatusTarget, 42, undefined, base)).resolves.toMatchObject({
      state: "settled",
    });

    await writeFile(join(root, "legacy-local-change.txt"), "legacy review\n", "utf8");
    await git(root, ["add", "legacy-local-change.txt"]);
    await git(root, ["commit", "-m", "legacy local review"]);
    const legacyHeadSha = await git(root, ["rev-parse", "HEAD"]);
    const legacyHeadTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
    await recordLaneAttempt(store, {
      lane: "standard",
      repositoryId,
      changeRequestId: null,
      headSha: legacyHeadSha,
      attemptId: "local/legacy-review",
      sourceId: "delegated-agent",
      outcome: "clean",
      consumedPass: true,
      chunkSeriesComplete: true,
      local: {
        vehicle: { kind: "errand", identity: slug },
        target: createReviewTarget({
          schemaVersion: 2,
          semanticsVersion: "review-gate/v2",
          kind: "change-set",
          repositoryId,
          baseRef: "main",
          diffBaseSha: base,
          diffBaseTree: baseTree,
          headSha: legacyHeadSha,
          headTree: legacyHeadTree,
        }),
      },
      now: "2026-09-13T00:05:00Z",
    });
    await expect(readRoutedObligation(root, exec, {
      ...target,
      headSha: legacyHeadSha,
    }, 42)).resolves.toMatchObject({
      state: "blocked",
      detail: "Recorded local review does not match the exact Errand target.",
    });
  });
});
