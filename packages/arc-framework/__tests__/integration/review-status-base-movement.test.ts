/**
 * Public review status observed across a base advance, through the production status composition.
 *
 * The status port is what threads the base read into the reducer, so these drive it rather than supplying a
 * containment fact: the repository has a real origin, the advance really moves it, and the observation comes
 * back through the same composition the review verb uses. The host is a stub on `PATH`, which is the only
 * dependency here that is not the repository itself.
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { handleCandidateApplicabilityResolve } from "../../src/handlers/candidate.js";
import { handleAttest, handlePublish } from "../../src/handlers/lifecycle.js";
import {
  handleReviewHostedAwait,
  handleReviewHostedRequest,
  handleReviewPrePublication,
} from "../../src/handlers/review.js";
import { HostedRequestResultSchema } from "../../src/scripts/review-gate/hosted/request.js";
import { resolveProcessInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import { CandidateReviewResponseEvidenceV1Schema, createCandidateReviewResponseEvidence } from
  "../../src/lib/work-unit/candidate-attestation.js";
import { readCandidateRecordVersioned, writeCandidateRecord } from
  "../../src/lib/work-unit/candidate-record-store.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
import { readSubmissionBoundaryVersioned } from
  "../../src/lib/work-unit/submission-boundary-store.js";
import { createReviewStatusPort } from "../../src/scripts/review-gate/status-composition.js";
import { resolveReviewStatus } from "../../src/scripts/review-gate/status.js";
import { stageSingletonPublicationResponse } from
  "../../src/scripts/review-gate/runtime/singleton-publication-response.js";
import { createStandardReviewReservation } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  advanceBase,
  arrangeAmbiguousMergeBase,
  arrangeUnrelatedBase,
  movementPaths,
  withUnavailableBaseRead,
  withUnreadableMergeBases,
  type GitExecLike,
} from "../helpers/base-advance.js";
import { runHandlerAt } from "../helpers/handler.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import {
  cleanupTempDir,
  DEFAULT_PROMPTS,
  execFileAsync,
  initInTempRepo,
  makeGitExec,
  removeGitBackedDir,
} from "../helpers/integration.js";

const WORK_UNIT = "example";
const HEAD_REF = `feat/${WORK_UNIT}`;
const REPOSITORY = "owner/repository";
const HOST_URL = `git@github.com:${REPOSITORY}.git`;
const PULL_REQUEST = 41;

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd });
  return stdout.trim();
}

function metaDocument(): string {
  return makeMetaFixture(WORK_UNIT, {
    owner: "test-user", branch: HEAD_REF, workClass: "Light", priority: "P2",
    taskList: `tasks-${WORK_UNIT}.md`, lastCompleted: "verification",
    nextTask: "Task 1.1 — Verification complete", nextAction: "verification complete",
  });
}

/** A stub host answering only what the status composition asks of it. */
async function installHost(root: string): Promise<string> {
  const bin = join(root, ".arc-fixture", "bin");
  const headSha = await git(root, ["rev-parse", "HEAD"]);
  // Exact merge admission is proved by a test-merge commit whose parents are the requested base and head.
  const TEST_MERGE = "a".repeat(40);
  const listed = JSON.stringify([{
    number: PULL_REQUEST,
    url: `https://example.test/pull/${String(PULL_REQUEST)}`,
    state: "OPEN",
    baseRefName: "main",
    headRefName: HEAD_REF,
    headRefOid: headSha,
  }]);
  const pull = JSON.stringify({
    number: PULL_REQUEST,
    state: "open",
    merged: false,
    draft: false,
    merge_commit_sha: TEST_MERGE,
    mergeable: true,
    head: { ref: HEAD_REF, sha: headSha, repo: { full_name: REPOSITORY } },
    base: { ref: "main", sha: "%s", repo: { full_name: REPOSITORY } },
  });
  // The host's review verdict: one writer's review still requests changes.
  const hostReview = JSON.stringify({ data: { repository: { pullRequest: {
    reviewDecision: "CHANGES_REQUESTED",
    reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    latestOpinionatedReviews: { nodes: [{
      fullDatabaseId: "5396287217",
      state: "CHANGES_REQUESTED",
      submittedAt: "2026-10-02T18:43:15Z",
      author: { login: "reviewer-bot" },
      commit: { oid: headSha },
    }] },
  } } } });
  await mkdir(bin, { recursive: true });
  const script = join(bin, "gh");
  await writeFile(script, [
    "#!/bin/sh",
    // The host reports the base it actually has, so the stub reads the remote rather than pinning a value the
    // advance would invalidate.
    `base=$(git --git-dir='${join(root, ".arc-fixture", "origin.git")}' rev-parse refs/heads/main)`,
    'case "$1:$2" in',
    '  api:user) printf \'%s\\n\' \'{"id":123}\' ;;',
    `  api:repos/${REPOSITORY}/issues/${String(PULL_REQUEST)}/comments)`,
    '    if test "$6" = "body=@coderabbitai full review"; then echo "HTTP 429 rate limited" >&2; exit 1; fi',
    '    test "$6" = "body=@codex review" || exit 1',
    `    printf '%s\\n' '{"node_id":"request-comment","html_url":"https://example.test/request","user":{"id":123},"body":"@codex review","created_at":"2026-10-03T00:00:00Z","updated_at":"2026-10-03T00:00:00Z"}' ;;`,
    `  api:repos/${REPOSITORY}/issues/${String(PULL_REQUEST)}/comments\\?*)`,
    `    if test -f '${join(root, ".arc-fixture", "codex-result.json")}'; then`,
    `      cat '${join(root, ".arc-fixture", "codex-result.json")}'`,
    "    else printf '%s\\n' '[[]]'; fi ;;",
    `  api:repos/${REPOSITORY}/pulls/${String(PULL_REQUEST)}/reviews\\?*) printf '%s\\n' '[[]]' ;;`,
    `  pr:list) printf '%s\\n' '${listed}' ;;`,
    "  pr:checks) echo 'no required checks reported' >&2; exit 1 ;;",
    `  api:repos/${REPOSITORY}/pulls/${String(PULL_REQUEST)}) printf '${pull}\\n' "$base" ;;`,
    `  api:repos/${REPOSITORY}/branches/main) printf '%s\\n' '{}' ;;`,
    `  api:repos/${REPOSITORY}/commits/${TEST_MERGE})`,
    `    printf '{"parents":[{"sha":"%s"},{"sha":"${headSha}"}]}\\n' "$base" ;;`,
    "  api:--paginate) printf '%s\\n' '[[]]' ;;",
    `  api:graphql) printf '%s\\n' '${hostReview}' ;;`,
    '  *) echo "unexpected host invocation: $*" >&2; exit 1 ;;',
    "esac",
    "",
  ].join("\n"), "utf8");
  await chmod(script, 0o755);
  return bin;
}

/**
 * A singleton work unit whose publication reserved no hosted review, published to a host-shaped origin.
 *
 * The branch is an ordinary work-unit branch, so the routed obligation resolves without consulting any
 * delivery plan — which is what keeps the moved-base arm reachable instead of a conjunction deciding first.
 */
async function singletonUnderReview(
  arrange?: (root: string) => Promise<void>,
): Promise<{ root: string; headSha: string; bin: string }> {
  const root = await initInTempRepo(DEFAULT_PROMPTS);
  cleanups.push(async () => cleanupTempDir(root));
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "init"]);

  const remote = join(root, ".arc-fixture", "origin.git");
  await mkdir(join(root, ".arc-fixture"), { recursive: true });
  await writeFile(join(root, ".git", "info", "exclude"), ".arc-fixture/\n", { flag: "a" });
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  cleanups.push(async () => removeGitBackedDir(remote));
  await git(root, ["remote", "add", "origin", remote]);
  await git(root, ["config", `url.${remote}.insteadOf`, HOST_URL]);
  await git(root, ["remote", "set-url", "origin", HOST_URL]);
  await git(root, ["push", "origin", "main"]);

  await git(root, ["switch", "-c", HEAD_REF]);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, ".arc", "active", `meta-${WORK_UNIT}.md`), metaDocument());
  await writeFile(join(root, "src", "example.ts"), "export const example = true;\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "implementation"]);
  await git(root, ["push", "origin", HEAD_REF]);
  // Any history the case needs is arranged here: the attestation below binds whatever HEAD it finds,
  // and a branch rearranged after attestation would carry the old head as its reviewed revision.
  await arrange?.(root);
  await writeFile(
    join(root, ".arc", "active", `tasks-${WORK_UNIT}.md`),
    "# Task List: Example\n\n## **Phase 1:** Verification\n\n### `[x]` **1.1 Verification complete**\n",
  );
  await git(root, ["add", `.arc/active/tasks-${WORK_UNIT}.md`]);

  const attested = await runHandlerAt(root, async () => {
    await handleAttest(WORK_UNIT, { json: true }, machineContext());
  });
  expect(attested.exitCode, attested.stdout + attested.stderr).toBe(0);

  return { root, headSha: await git(root, ["rev-parse", "HEAD"]), bin: await installHost(root) };
}

/** Run one handler with the stub host reachable, as a session invoking it from this repository would. */
async function withHost<T>(bin: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.PATH;
  process.env.PATH = `${bin}:${previous ?? ""}`;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
  }
}

function machineContext() {
  return resolveProcessInteractionContext({ noInput: false, machineReadable: true, yes: "absent" });
}

/**
 * Resolve review status through the production port, with the stub host on `PATH`.
 *
 * `wrap` reaches the port's own execution seam, which is the only place a single read can be failed: the
 * observer collapses every failure into the same shape, so failing the process boundary instead would report an
 * unavailable base for a host that was the thing to break.
 */
async function statusThroughPort(
  fixture: { root: string; headSha: string; bin: string },
  wrap: (exec: GitExecLike) => GitExecLike = (exec) => exec,
) {
  return await withHost(fixture.bin, async () => resolveReviewStatus(
    { target: { repository: REPOSITORY, headRef: HEAD_REF, headSha: fixture.headSha } },
    createReviewStatusPort({ cwd: fixture.root, exec: wrap(makeGitExec(fixture.root)) }),
  ));
}

describe("review status over a base advanced under the work unit", () => {
  it("settles after an advance sharing no path with the branch", async () => {
    const fixture = await singletonUnderReview();
    await advanceBase({ cwd: fixture.root, paths: movementPaths("disjoint", WORK_UNIT).base });

    const status = await statusThroughPort(fixture);

    // The stop this held is gone: containment no longer decides the reading, so an advance the branch shares
    // no path with costs public review nothing.
    expect(status).toMatchObject({ state: "settled", nextAction: "continue-reconcile" });
    // The host's own merge blocker is reported beside it, without changing the action.
    expect(status).toMatchObject({
      hostReview: {
        state: "changes-requested",
        blockingReviews: [{
          reviewId: 5396287217,
          author: "reviewer-bot",
          commitSha: fixture.headSha,
          submittedAt: "2026-10-02T18:43:15Z",
        }],
      },
    });
  });
});

describe("singleton hosted review after publication", () => {
  it.each([undefined, "codex-pr", "coderabbit-pr"] as const)("admits selected source %s", async (sourceId) => {
    const fixture = await singletonUnderReview();
    const reviewed = await runHandlerAt(fixture.root, async () => {
      await handleReviewPrePublication(WORK_UNIT, { selfReview: "settled" }, {}, machineContext());
    });
    expect(reviewed.exitCode, reviewed.stdout + reviewed.stderr).toBe(0);
    const envelope = JSON.parse(reviewed.stdout) as {
      candidateId: string;
      target: { headSha: string };
    };
    const boundaryPath = join(fixture.root, ".arc", "system", ".internal", "candidates", `${WORK_UNIT}.boundary.json`);
    const boundary = JSON.parse(await readFile(boundaryPath, "utf8")) as Record<string, unknown>;
    const reservation = createStandardReviewReservation({
      candidateId: envelope.candidateId,
      sourceId: "coderabbit-pr",
      sources: ["coderabbit-pr", "codex-pr"],
      repository: REPOSITORY,
      headSha: envelope.target.headSha,
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    await writeFile(boundaryPath, `${JSON.stringify({ ...boundary, reservation })}\n`);
    const published = await runHandlerAt(fixture.root, async () => {
      await handlePublish(WORK_UNIT, {
        json: true,
        lastCompleted: "verification",
        action: "push and open the PR",
      }, machineContext());
    });
    expect(published.exitCode, published.stdout + published.stderr).toBe(0);
    expect(JSON.parse(published.stdout)).toMatchObject({
      boundary: { locus: "publication-pending", nextAction: { kind: "continue-publication" } },
    });
    await git(fixture.root, ["add", "-A"]);
    await git(fixture.root, ["commit", "-m", "publish singleton"]);
    await git(fixture.root, ["push", "origin", HEAD_REF]);
    fixture.headSha = await git(fixture.root, ["rev-parse", "HEAD"]);
    fixture.bin = await installHost(fixture.root);

    const status = await statusThroughPort(fixture);
    expect(status).toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: {
        schemaVersion: 1,
        target: { repository: REPOSITORY, pullRequest: PULL_REQUEST, headSha: fixture.headSha },
        provider: "coderabbit-pr",
        coverage: "complete",
      },
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted review admission");
    expect(status.action).not.toHaveProperty("vehicle");

    if (sourceId !== undefined) {
      if (sourceId === "coderabbit-pr") {
        const initial = await withHost(fixture.bin, async () => resolveReviewStatus({
          target: { repository: REPOSITORY, headRef: HEAD_REF, headSha: fixture.headSha },
          sourceId,
        }, createReviewStatusPort({ cwd: fixture.root, exec: makeGitExec(fixture.root) })));
        if (initial.nextAction !== "review-hosted-request") throw new Error("expected initial hosted request");
        const unavailable = await withHost(fixture.bin, async () => runHandlerAt(fixture.root, async () => {
          await handleReviewHostedRequest("-", { readText: async () => JSON.stringify(initial.action) });
        }));
        expect(unavailable.exitCode, unavailable.stdout + unavailable.stderr).toBe(0);
        expect(JSON.parse(unavailable.stdout)).toMatchObject({
          state: "rate-limited", nextAction: "try-next-source", provider: "coderabbit-pr",
        });
      }
      const selected = await withHost(fixture.bin, async () => resolveReviewStatus({
        target: { repository: REPOSITORY, headRef: HEAD_REF, headSha: fixture.headSha },
        sourceId,
      }, createReviewStatusPort({ cwd: fixture.root, exec: makeGitExec(fixture.root) })));
      expect(selected).toMatchObject({
        state: "review-required",
        nextAction: "review-hosted-request",
        action: {
          ...status.action,
          provider: "codex-pr",
          invocation: { mode: "force", sourceId: "codex-pr" },
        },
      });
      if (selected.nextAction !== "review-hosted-request") throw new Error("expected selected hosted request");
      const requested = await withHost(fixture.bin, async () => runHandlerAt(fixture.root, async () => {
        await handleReviewHostedRequest("-", { readText: async () => JSON.stringify(selected.action) });
      }));
      expect(requested.exitCode, requested.stdout + requested.stderr).toBe(0);
      const request = HostedRequestResultSchema.parse(JSON.parse(requested.stdout));
      expect(request).toMatchObject({
        state: "requested",
        nextAction: "await",
        attemptedProviders: ["codex-pr"],
        handle: {
          provider: "codex-pr",
          invocation: { mode: "force", sourceId: "codex-pr" },
          admission: {
            lineage: { kind: "candidate", candidateId: envelope.candidateId },
            logicalPass: 1,
          },
        },
      });
      if (request.nextAction !== "await") throw new Error("expected selected hosted handle");
      if (sourceId === "codex-pr") {
        const competing = await withHost(fixture.bin, async () => runHandlerAt(fixture.root, async () => {
          await handleReviewHostedRequest("-", { readText: async () => JSON.stringify(status.action) });
        }));
        expect(JSON.parse(competing.stdout)).toMatchObject({ state: "ambiguous-delivery", nextAction: "stop" });
      }
      await writeFile(join(fixture.root, ".arc-fixture", "codex-result.json"), JSON.stringify([[{
        node_id: "codex-clean",
        html_url: "https://example.test/codex-clean",
        user: { id: 199175422 },
        performed_via_github_app: { id: 1144995 },
        body: `Codex Review: didn't find any major issues\nReviewed commit: ${fixture.headSha}`,
        created_at: "2026-10-03T00:01:00Z",
        updated_at: "2026-10-03T00:01:00Z",
      }]]));
      const awaited = await withHost(fixture.bin, async () => runHandlerAt(fixture.root, async () => {
        await handleReviewHostedAwait("-", { readText: async () => JSON.stringify(request.action) });
      }));
      expect(awaited.exitCode, awaited.stdout + awaited.stderr).toBe(0);
      expect(JSON.parse(awaited.stdout)).toMatchObject({
        state: "clean",
        nextAction: "complete",
        hostedResultId: expect.any(String),
        handle: { admission: request.handle.admission },
      });
      expect(await statusThroughPort(fixture)).toMatchObject({ state: "settled", nextAction: "continue-reconcile" });
      if (sourceId === "codex-pr") {
        const exec = makeGitExec(fixture.root);
        const oldTarget = await collectCandidateSubjectTarget({
          cwd: fixture.root, name: WORK_UNIT, baseBranch: "main", exec,
        });
        await writeFile(join(fixture.root, "src", "example.ts"), "export const example = false;\n");
        await git(fixture.root, ["add", "src/example.ts"]);
        await git(fixture.root, ["commit", "-m", "apply approved correction"]);
        const newTarget = await collectCandidateSubjectTarget({
          cwd: fixture.root, name: WORK_UNIT, baseBranch: "main", exec,
        });
        const current = await readCandidateRecordVersioned(fixture.root, WORK_UNIT);
        if (current.record === null) throw new Error("missing Candidate response fixture");
        const correction = createCandidateReviewResponseEvidence({
          candidateId: current.record.attestation.candidateId,
          oldTarget,
          newTarget,
          dispositionId: canonicalDigest({ correction: 1 }),
          approvedBy: "test-user",
          appliedBy: "test-user",
          applicability: "focused",
          approvedVerification: "focused",
          verificationEvidenceRefs: ["verification://approved-correction"],
          implementationChanged: true,
        });
        await writeCandidateRecord(fixture.root, WORK_UNIT, {
          ...current.record,
          transitions: [...current.record.transitions, correction],
        }, current.version);
        await stageSingletonPublicationResponse({
          cwd: fixture.root, exec, workUnit: WORK_UNIT, response: correction, requirePublished: true,
        });
        await git(fixture.root, ["add", "-A"]);
        await git(fixture.root, ["commit", "-m", "record approved correction"]);
        await git(fixture.root, ["push", "origin", HEAD_REF]);
        fixture.headSha = await git(fixture.root, ["rev-parse", "HEAD"]);
        fixture.bin = await installHost(fixture.root);
        const applicability = await withHost(fixture.bin, async () => resolveReviewStatus({
          target: { repository: REPOSITORY, headRef: HEAD_REF, headSha: fixture.headSha },
          sourceId,
        }, createReviewStatusPort({ cwd: fixture.root, exec })));
        expect(applicability).toMatchObject({
          state: "review-required",
          nextAction: "resolve-review-applicability",
          selectionAction: {
            projection: { selector: { sourceId, priorHead: oldTarget.revision, currentHead: fixture.headSha } },
            choices: ["covered", "review-required"],
          },
        });
        if (applicability.nextAction !== "resolve-review-applicability") throw new Error("expected applicability offer");
        const resolved = await runHandlerAt(fixture.root, async () => {
          await handleCandidateApplicabilityResolve(WORK_UNIT, "-", machineContext(), {
            readText: async () => JSON.stringify({
              kind: applicability.selectionAction.kind,
              offer: applicability.selectionAction,
              selection: { selectedBy: "test-user", selectedAt: "2026-10-03T00:02:00Z", choice: "review-required" },
            }),
          });
        });
        expect(resolved.exitCode, resolved.stdout + resolved.stderr).toBe(0);
        expect(JSON.parse(resolved.stdout)).toMatchObject({ state: "resolved", nextAction: "commit-selection" });
        await git(fixture.root, ["add", "-A"]);
        await git(fixture.root, ["commit", "-m", "record review applicability"]);
        await git(fixture.root, ["push", "origin", HEAD_REF]);
        fixture.headSha = await git(fixture.root, ["rev-parse", "HEAD"]);
        fixture.bin = await installHost(fixture.root);
        const continued = await withHost(fixture.bin, async () => resolveReviewStatus({
          target: { repository: REPOSITORY, headRef: HEAD_REF, headSha: fixture.headSha }, sourceId,
        }, createReviewStatusPort({ cwd: fixture.root, exec })));
        expect(continued).toMatchObject({
          state: "review-required", nextAction: "review-hosted-request",
          action: { provider: "codex-pr", invocation: { mode: "force", sourceId: "codex-pr" } },
        });
        if (continued.nextAction !== "review-hosted-request") throw new Error("expected continued hosted request");
        const resumed = await withHost(fixture.bin, async () => runHandlerAt(fixture.root, async () => {
          await handleReviewHostedRequest("-", { readText: async () => JSON.stringify(continued.action) });
        }));
        expect(resumed.exitCode, resumed.stdout + resumed.stderr).toBe(0);
        expect(JSON.parse(resumed.stdout)).toMatchObject({ state: "requested", nextAction: "await" });
        expect((await readSubmissionBoundaryVersioned(fixture.root, WORK_UNIT)).boundary?.reservation).toEqual(reservation);
      }
    }

    const before = (await readSubmissionBoundaryVersioned(fixture.root, WORK_UNIT)).boundary;
    if (before === null || before.candidateSubjectDigest === null) throw new Error("missing public boundary");
    const reviewedSubject = `sha256:${"d".repeat(64)}`;
    const response = CandidateReviewResponseEvidenceV1Schema.parse({
      transitionKind: "review-response",
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      candidateId: envelope.candidateId,
      responseId: `sha256:${"f".repeat(64)}`,
      oldTarget: {
        revision: fixture.headSha,
        subject: { entries: [], subjectDigest: before.candidateSubjectDigest },
      },
      newTarget: {
        revision: "b".repeat(40),
        subject: { entries: [], subjectDigest: reviewedSubject },
      },
      dispositionId: `sha256:${"c".repeat(64)}`,
      approvedBy: "test-user",
      appliedBy: "test-user",
      applicability: "focused",
      verificationEvidenceRefs: ["verification://review-fix"],
      implementationChanged: true,
    });
    await stageSingletonPublicationResponse({
      cwd: fixture.root,
      exec: makeGitExec(fixture.root),
      workUnit: WORK_UNIT,
      response,
      requirePublished: true,
    });
    const rebound = (await readSubmissionBoundaryVersioned(fixture.root, WORK_UNIT)).boundary;
    expect(rebound).toMatchObject({
      candidateSubjectDigest: reviewedSubject,
      reservation,
    });
    expect(await git(fixture.root, ["diff", "--cached", "--name-only"])).toContain(
      `.arc/system/.internal/candidates/${WORK_UNIT}.boundary.json`,
    );
  });
});

describe("review status when the base read goes unavailable under it", () => {
  it("blocks on the unavailable base revision, and settles once the read is restored", async () => {
    const fixture = await singletonUnderReview();

    const blocked = await statusThroughPort(fixture, (exec) => withUnavailableBaseRead(exec));

    expect(blocked).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      detail: "The current base revision is unavailable.",
      currentBaseOid: null,
    });
    // The remedy names a re-run of the same reading, and with the base read restored that is what it reports.
    expect(await statusThroughPort(fixture)).toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
    });
  });
});

describe("review status over a history leaving two merge bases", () => {
  /**
   * A Candidate attested over its own criss-cross merge, whose base becomes the second best ancestor after.
   *
   * The two halves cannot both precede the attestation: collecting a subject over a pair with two best
   * ancestors is refused, so a Candidate could never have been attested there. Publishing the base afterwards
   * is also the order a real one reaches this state in — the branch is attested, and then the base moves.
   */
  async function attestedUnderAnAmbiguousBase(): Promise<Awaited<ReturnType<typeof singletonUnderReview>>> {
    let publishBase: (() => Promise<void>) | undefined;
    const fixture = await singletonUnderReview(async (root) => {
      ({ publish: publishBase } = await arrangeAmbiguousMergeBase({
        cwd: root, publishBase: "on-request",
      }));
    });
    await publishBase?.();
    return fixture;
  }

  it("reports the settled state the ambiguous reading is measured against", async () => {
    const fixture = await singletonUnderReview();

    expect(await statusThroughPort(fixture)).toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
    });
  });

  it("directs a checkpoint rerun on a base that moved only in shape", async () => {
    const fixture = await attestedUnderAnAmbiguousBase();

    // A second equally good merge base leaves nothing to prove the branch's own contribution from, rather
    // than leaving that contribution unchanged, so the reading does not settle. It names the rerun because
    // merging the base in is what collapses the two bases to one.
    expect(await statusThroughPort(fixture)).toMatchObject({
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      baseMovementDetail: "The revisions have multiple best merge bases; overlap cannot be proved from one.",
      // The obligation blocks on the same history for its own reason, and says which condition held rather
      // than reporting that the target has no base at all — the reading a zero-base history would get.
      routedObligation: {
        state: "blocked",
        detail: "The Candidate target has more than one base coordinate.",
      },
    });
  });

  it("sends an ambiguous base back through the checkpoint, naming the cause beside the movement", async () => {
    const fixture = await attestedUnderAnAmbiguousBase();

    // Recoverable at this pair: merging the base in collapses the two comparison points to one, so the
    // reading keeps its rerun rather than stopping. The rerun is the route and not the correction — the
    // checkpoint it arrives at is where the merge that clears this pair is named.
    expect(await statusThroughPort(fixture)).toMatchObject({
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      movement: "unknown",
      baseMovementCause: "ambiguous",
    });
  });

  it("reports the ambiguity itself, apart from a comparison it could not read", async () => {
    const fixture = await attestedUnderAnAmbiguousBase();

    const ambiguous = await statusThroughPort(fixture);
    const unreadable = await statusThroughPort(fixture, withUnreadableMergeBases);

    // Two readings that answered the same way until the analyzer kept them apart: one history the branch has
    // two comparison points against, one the boundary could not read at all.
    expect(ambiguous).toMatchObject({ baseMovement: { overlap: { status: "ambiguous" } } });
    expect(unreadable).toMatchObject({
      baseMovement: { overlap: { status: "unavailable", reason: "merge-base-failed" } },
    });
  });
});

describe("review status over a base sharing no history with the branch", () => {
  it("stops rather than inviting a rerun that cannot clear it", async () => {
    const fixture = await singletonUnderReview();
    await arrangeUnrelatedBase({ cwd: fixture.root });

    const status = await statusThroughPort(fixture);

    expect(status).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "base-unrelated",
      movement: "unknown",
      baseMovementCause: "unrelated",
    });
    // Named positively, because the negation this replaced could not fail: `toMatchObject` compares arrays by
    // exact length, so a three-element argv never matched the four-element one offered here, and the assertion
    // passed for a correct remedy, a wrong one, and no remedy at all. What the condition needs is a common
    // ancestor, so that is what the remedy has to name.
    expect(status).toMatchObject({
      remedy: { argv: ["git", "merge", "--allow-unrelated-histories", status.currentBaseOid] },
    });
  });

  it("reports the absent common ancestor as its own reading", async () => {
    // The replacement lands after attestation, unlike the branch-side arrangements above: it moves the base
    // alone, so the reviewed revision the attestation binds is the same one either way.
    const fixture = await singletonUnderReview();
    await arrangeUnrelatedBase({ cwd: fixture.root });

    expect(await statusThroughPort(fixture)).toMatchObject({
      baseMovement: { overlap: { status: "unrelated" } },
    });
  });
});
