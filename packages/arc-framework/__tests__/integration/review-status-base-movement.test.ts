/**
 * Public review status observed across a base advance, through the production status composition.
 *
 * The status port is what threads the base read into the reducer, so these drive it rather than supplying a
 * containment fact: the repository has a real origin, the advance really moves it, and the observation comes
 * back through the same composition the review verb uses. The host is a stub on `PATH`, which is the only
 * dependency here that is not the repository itself.
 */

import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { handleAttest } from "../../src/handlers/lifecycle.js";
import { resolveProcessInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import { createReviewStatusPort } from "../../src/scripts/review-gate/status-composition.js";
import { resolveReviewStatus } from "../../src/scripts/review-gate/status.js";
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
  return [
    `# Metadata: ${WORK_UNIT}`,
    "",
    "| **State** | **Owner**   | **Branch**     | **Class** | **Priority** |",
    "| --------- | ----------- | -------------- | --------- | ------------ |",
    `| \`Active\`  | \`test-user\` | \`${HEAD_REF}\` | \`Light\`   | \`P2\`         |`,
    "",
    "- **Cohort:** [none]",
    "- **Depends On:** [none]",
    "",
    "- **Origin:** [internal]",
    "- **Design:** [none]",
    `- **Task List:** \`tasks-${WORK_UNIT}.md\``,
    "- **Review Rubric:** [none]",
    "- **Promotion Receipt:** [none]",
    "",
    "- **Current Workflow:** [none]",
    "- **Last Completed:** verification",
    "- **Next Task:** Task 1.1 — Verification complete",
    "- **Blockers:** [none]",
    "",
    "- **Next Action:** verification complete",
    "",
    "- **PR URL:** [none]",
    "- **Completed:** [none]",
    "",
    "---",
    "",
  ].join("\n");
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
  await mkdir(bin, { recursive: true });
  const script = join(bin, "gh");
  await writeFile(script, [
    "#!/bin/sh",
    // The host reports the base it actually has, so the stub reads the remote rather than pinning a value the
    // advance would invalidate.
    `base=$(git --git-dir='${join(root, ".arc-fixture", "origin.git")}' rev-parse refs/heads/main)`,
    'case "$1:$2" in',
    `  pr:list) printf '%s\\n' '${listed}' ;;`,
    "  pr:checks) echo 'no required checks reported' >&2; exit 1 ;;",
    `  api:repos/${REPOSITORY}/pulls/${String(PULL_REQUEST)}) printf '${pull}\\n' "$base" ;;`,
    `  api:repos/${REPOSITORY}/branches/main) printf '%s\\n' '{}' ;;`,
    `  api:repos/${REPOSITORY}/commits/${TEST_MERGE})`,
    `    printf '{"parents":[{"sha":"%s"},{"sha":"${headSha}"}]}\\n' "$base" ;;`,
    "  api:--paginate) printf '%s\\n' '[[]]' ;;",
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
    });
  });

  it("sends an ambiguous base back through the checkpoint, naming the cause beside the movement", async () => {
    const fixture = await attestedUnderAnAmbiguousBase();

    // Recoverable at this pair: merging the base in collapses the two comparison points to one, and the
    // checkpoint is where that route is offered. So the reading keeps its rerun.
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
    // A rerun of this same reading is the one remedy that cannot clear the condition, so it is not the one
    // offered: the branch and the base have to be given a common ancestor first.
    expect(status).not.toMatchObject({ remedy: { argv: ["arc", "review", "status"] } });
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
