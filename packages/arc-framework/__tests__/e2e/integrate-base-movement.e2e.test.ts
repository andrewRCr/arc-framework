/**
 * Landing observed across a base that moves under a minted checkpoint handle.
 *
 * Checkpoint mints a handle and merge consumes it by exact value, so the window between the two invocations is
 * where a concurrent advance lands. Reaching that window at all needs a work unit published to a real origin and
 * a host that answers, which is what this fixture builds.
 */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { DeliveryStateV1Schema } from "../../src/lib/delivery/schema.js";
import { deliveryStackPlanForWorkUnitFixture } from "../fixtures/delivery-plan.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";
import {
  advanceBase,
  arrangeBranchSide,
  movementPaths,
  writeUnavailableBaseReadShim,
  type BaseMovementKind,
} from "../helpers/base-advance.js";

const execFileAsync = promisify(execFile);

const WORK_UNIT = "example";
const HEAD_REF = `feat/${WORK_UNIT}`;
const REPOSITORY = "owner/repository";
const HOST_URL = `git@github.com:${REPOSITORY}.git`;
const PULL_REQUEST = 41;
const PREDECESSOR_REF = "delivery/member-1";

const cleanups: string[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const path = cleanups.pop();
    if (path !== undefined) await cleanupTempDir(path);
  }
});

const META = [
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
  "- **Next Task:** [none]",
  "- **Blockers:** [none]",
  "",
  "- **Next Action:** verification complete",
  "",
  "- **PR URL:** [none]",
  "- **Completed:** [none]",
  "",
  "---",
  "",
  "## Completion Notes",
  "",
  "Added one surface and its verification.",
  "",
].join("\n");

/**
 * A host answering only what landing asks of it, for one open change request on the work unit's branch.
 *
 * The head is read from a file on every invocation rather than baked in, so the lifecycle commits that follow
 * publication do not leave the host describing a change request whose head no longer exists.
 */
async function installHost(
  repository: string,
  remote: string,
  predecessor: { readonly ref: string; readonly head: string; readonly number: number } | null,
): Promise<{ bin: string; headFile: string }> {
  const bin = join(repository, ".arc-fixture", "bin");
  const headFile = join(repository, ".arc-fixture", "head-sha");
  // The host remembers its own merge: exact confirmation re-reads the pull request and requires it to report
  // merged, so a stub that always answers "open" would fail the confirmation rather than the behaviour under test.
  const mergedFile = join(repository, ".arc-fixture", "merged-sha");
  const listed = `[{"number":${String(PULL_REQUEST)},`
    + `"url":"https://example.test/pull/${String(PULL_REQUEST)}",`
    + `"state":"OPEN","baseRefName":"main","headRefName":"${HEAD_REF}","headRefOid":"%s"}]`;
  // The host proves exact mergeability with a test-merge commit whose parents are the requested base and head.
  // Its object id is the host's to invent; the parents the stub reports for it are the repository's real ones.
  const testMerge = "a".repeat(40);
  const pull = `{"number":${String(PULL_REQUEST)},"state":"open","merged":false,"draft":false,`
    + `"merge_commit_sha":"${testMerge}","mergeable":true,`
    + `"head":{"ref":"${HEAD_REF}","sha":"%s","repo":{"full_name":"${REPOSITORY}"}},`
    + `"base":{"ref":"main","sha":"%s","repo":{"full_name":"${REPOSITORY}"}}}`;
  const mergedPull = `{"number":${String(PULL_REQUEST)},"state":"closed","merged":true,"draft":false,`
    + `"head":{"ref":"${HEAD_REF}","sha":"%s","repo":{"full_name":"${REPOSITORY}"}},`
    + `"base":{"ref":"main","sha":"%s","repo":{"full_name":"${REPOSITORY}"}},`
    + `"merge_commit_sha":"%s","mergeable":null}`;
  const landed = predecessor === null ? null : JSON.stringify([{
    number: predecessor.number,
    url: `https://example.test/pull/${String(predecessor.number)}`,
    state: "MERGED",
    baseRefName: "main",
    headRefName: predecessor.ref,
    headRefOid: predecessor.head,
  }]);
  const settings = '{"allow_merge_commit":true,"allow_squash_merge":false,"allow_rebase_merge":false}';
  const repositoryView = `{"nameWithOwner":"${REPOSITORY}","defaultBranchRef":{"name":"main"}}`;
  await mkdir(bin, { recursive: true });
  const script = join(bin, "gh");
  await writeFile(script, [
    "#!/bin/sh",
    `head=$(cat '${headFile}')`,
    // The host reports the base it actually has, so the stub reads the remote rather than pinning a value that
    // every advance would invalidate.
    `base=$(git --git-dir='${remote}' rev-parse refs/heads/main)`,
    `merged=$(cat '${mergedFile}' 2>/dev/null || true)`,
    'case "$1:$2" in',
    `  repo:view) printf '%s\\n' '${repositoryView}' ;;`,
    "  pr:ready) exit 0 ;;",
    "  pr:list)",
    ...(landed === null ? [] : [
      '    case "$*" in',
      `      *"--head ${predecessor?.ref ?? ""}"*) printf '%s\\n' '${landed}'; exit 0 ;;`,
      "    esac",
    ]),
    `    printf '${listed}\\n' "$head" ;;`,
    "  pr:checks) echo 'no required checks reported' >&2; exit 1 ;;",
    `  api:repos/${REPOSITORY}) printf '%s\\n' '${settings}' ;;`,
    `  api:repos/${REPOSITORY}/pulls/${String(PULL_REQUEST)})`,
    `    if [ -n "$merged" ]; then printf '${mergedPull}\\n' "$head" "$base" "$merged";`,
    `    else printf '${pull}\\n' "$head" "$base"; fi ;;`,
    `  api:repos/${REPOSITORY}/branches/main) printf '%s\\n' '{}' ;;`,
    `  api:repos/${REPOSITORY}/commits/${testMerge})`,
    `    printf '{"parents":[{"sha":"%s"},{"sha":"%s"}]}\\n' "$base" "$head" ;;`,
    ...(predecessor === null ? [] : [
      `  api:repos/${REPOSITORY}/pulls/${String(predecessor.number)})`,
      `    printf '%s\\n' '{"number":${String(predecessor.number)},"state":"closed","merged":true,"draft":false,`
        + `"merge_commit_sha":"${predecessor.head}","mergeable":true,`
        + `"head":{"ref":"${predecessor.ref}","sha":"${predecessor.head}","repo":{"full_name":"${REPOSITORY}"}},`
        + `"base":{"ref":"main","sha":"'"$base"'","repo":{"full_name":"${REPOSITORY}"}}}' ;;`,
    ]),
    "  api:--paginate) printf '%s\\n' '[[]]' ;;",
    // Landing the change request really moves the base, so everything downstream of the merge reads a
    // repository in the state the host claims rather than a response with nothing behind it.
    `  api:repos/${REPOSITORY}/pulls/${String(PULL_REQUEST)}/merge)`,
    `    git --git-dir='${remote}' update-ref refs/heads/main "$head"`,
    `    printf '%s' "$head" > '${mergedFile}'`,
    `    printf '{"sha":"%s","merged":true,"message":"merged"}\\n' "$head"`,
    "    ;;",
    '  *) echo "unexpected host invocation: $*" >&2; exit 1 ;;',
    "esac",
    "",
  ].join("\n"), "utf8");
  await chmod(script, 0o755);
  return { bin, headFile };
}

interface LandingFixture {
  readonly repository: string;
  readonly bin: string;
  readonly env: Record<string, string>;
  /** The branch's first commit, which a bound delivery plan reads as the terminal member's base. */
  readonly implementationHead: string;
  /** The landed predecessor member's head, present only when the fixture built one. */
  readonly predecessorHead: string | null;
}

/**
 * A published work unit on a live origin, standing at its landing boundary.
 *
 * `branchPaths` are committed with the implementation, before attestation, so a movement kind that needs the
 * branch to have touched a path can have that arranged without disturbing the Candidate afterwards.
 */
async function publishedAtLanding(
  options: { readonly branchPaths?: readonly string[]; readonly predecessor?: boolean } = {},
): Promise<LandingFixture> {
  const repository = await createTempRepo("arc-integrate-movement-");
  cleanups.push(repository);
  await mkdir(join(repository, ".arc", "system"), { recursive: true });
  // Manual archive cadence keeps the archive move out of the mint's preconditions. The cadence decides when
  // the archive runs, never how the base is read, and the base gate is evaluated ahead of it either way.
  await writeFile(
    join(repository, ".arc", "system", "arc-config.yml"),
    "branch.base: main\narchive.cadence: manual\n",
  );
  await writeFile(join(repository, ".gitignore"), ".arc/user/\n");
  await writeFile(join(repository, "README.md"), "# Fixture\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "base"]);

  const remote = join(repository, ".arc-fixture", "origin.git");
  await mkdir(join(repository, ".arc-fixture"), { recursive: true });
  await writeFile(join(repository, ".git", "info", "exclude"), ".arc-fixture/\n", { flag: "a" });
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", HOST_URL]);
  await git(repository, ["config", `url.${remote}.insteadOf`, HOST_URL]);
  await git(repository, ["push", "origin", "main"]);

  // A landed predecessor, built before the branch exists so the work unit's own Candidate never sees the base
  // move. Its span is what the delivery arm excludes from the terminal member's residual.
  let predecessorHead: string | null = null;
  if (options.predecessor === true) {
    await git(repository, ["checkout", "-b", PREDECESSOR_REF]);
    await mkdir(join(repository, "src"), { recursive: true });
    await writeFile(join(repository, "src", "member-one.ts"), "export const memberOne = true;\n");
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "predecessor member"]);
    predecessorHead = await git(repository, ["rev-parse", "HEAD"]);
    await git(repository, ["push", "origin", PREDECESSOR_REF]);
    await git(repository, ["checkout", "main"]);
    await git(repository, [
      "merge", "--no-ff", PREDECESSOR_REF,
      "-m", `Merge pull request #${String(PULL_REQUEST - 1)} from ${PREDECESSOR_REF}`,
    ]);
    await git(repository, ["push", "origin", "main"]);
  }

  await git(repository, ["checkout", "-b", HEAD_REF]);
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await mkdir(join(repository, "src"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", `meta-${WORK_UNIT}.md`), META);
  await writeFile(join(repository, "src", "example.ts"), "export const example = true;\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "implementation"]);
  const implementationHead = await git(repository, ["rev-parse", "HEAD"]);
  if (options.branchPaths !== undefined) {
    await arrangeBranchSide({ cwd: repository, paths: options.branchPaths });
  }
  await writeFile(
    join(repository, ".arc", "active", `tasks-${WORK_UNIT}.md`),
    "# Task List: Example\n\n- [x] Verification complete\n",
  );
  await git(repository, ["add", `.arc/active/tasks-${WORK_UNIT}.md`]);

  const host = await installHost(
    repository,
    remote,
    predecessorHead === null
      ? null
      : { ref: PREDECESSOR_REF, head: predecessorHead, number: PULL_REQUEST - 1 },
  );
  const publishHead = async (): Promise<void> => {
    await writeFile(host.headFile, await git(repository, ["rev-parse", "HEAD"]));
  };
  await publishHead();
  const env = {
    PATH: `${host.bin}${delimiter}${process.env["PATH"] ?? ""}`,
    GIT_TERMINAL_PROMPT: "0",
  };

  expect((await runArc(["attest", WORK_UNIT, "--json"], repository, { env })).exitCode).toBe(0);
  const reviewed = await runArc(
    ["review", "pre-publication", WORK_UNIT, "--self-review", "settled"],
    repository,
    { env },
  );
  expect(reviewed.exitCode, reviewed.stdout + reviewed.stderr).toBe(0);
  const published = await runArc(
    ["publish", WORK_UNIT, "--last-completed", "verification", "--action", "open the PR", "--json"],
    repository,
    { env },
  );
  expect(published.exitCode, published.stdout + published.stderr).toBe(0);

  // Publication leaves its lifecycle edit staged and the push to the caller; readiness reads the committed
  // tree, so the boundary is only reachable once both have happened.
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "publish"]);
  await publishHead();
  await git(repository, ["push", "-u", "origin", HEAD_REF]);

  return { repository, bin: host.bin, env, implementationHead, predecessorHead };
}

/**
 * Bind a two-member delivery plan over the published work unit, with its branch as the terminal member.
 *
 * The predecessor's span is the branch's first commit; everything after it is the terminal member's residual,
 * which is the partition the delivery arm classifies an advance against rather than the whole Candidate union.
 */
async function bindDeliveryPlan(fixture: LandingFixture): Promise<void> {
  const plan = deliveryStackPlanForWorkUnitFixture(WORK_UNIT);
  const predecessor = plan.members[0];
  const terminal = plan.members.at(-1);
  if (predecessor === undefined || terminal === undefined) throw new Error("the plan carries no members");
  const treeOf = async (commit: string): Promise<string> =>
    git(fixture.repository, ["rev-parse", `${commit}^{tree}`]);
  const targetHead = await git(fixture.repository, ["rev-parse", "origin/main"]);
  const head = await git(fixture.repository, ["rev-parse", "HEAD"]);
  const predecessorHead = fixture.predecessorHead;
  if (predecessorHead === null) throw new Error("the fixture built no predecessor member");
  const predecessorBase = await git(fixture.repository, ["rev-parse", `${predecessorHead}^`]);

  const state = DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    boundPlan: { planRevision: plan.planRevision, planDigest: plan.planDigest },
    target: { ref: "refs/heads/main", coordinates: { head: targetHead, tree: await treeOf(targetHead) } },
    members: [
      {
        deliverableId: predecessor.deliverableId,
        ref: `refs/heads/${PREDECESSOR_REF}`,
        changeRequest: { providerId: "github", changeRequestId: String(PULL_REQUEST - 1) },
        coordinates: {
          base: predecessorBase,
          head: predecessorHead,
          tree: await treeOf(predecessorHead),
        },
      },
      {
        deliverableId: terminal.deliverableId,
        ref: `refs/heads/${HEAD_REF}`,
        changeRequest: { providerId: "github", changeRequestId: String(PULL_REQUEST) },
        coordinates: { base: predecessorHead, head, tree: await treeOf(head) },
      },
    ],
    activeOperation: null,
    pendingReviewFixVerification: null,
  });

  const root = join(fixture.repository, ".git", "arc", "delivery");
  await mkdir(join(root, "plans"), { recursive: true });
  await mkdir(join(root, "state"), { recursive: true });
  await writeFile(join(root, "plans", `${plan.planId}.json`), `${JSON.stringify(plan)}\n`);
  await writeFile(join(root, "state", `${plan.planId}.json`), `${JSON.stringify({
    schemaVersion: 1,
    semanticsVersion: "delivery-state-store/v1",
    planId: plan.planId,
    revision: 1,
    value: state,
  })}\n`);
}

async function runCheckpoint(
  fixture: LandingFixture,
  env: Record<string, string> = fixture.env,
): Promise<Record<string, unknown>> {
  const run = await runArc(["integrate", "checkpoint", WORK_UNIT], fixture.repository, { env });
  return JSON.parse(run.stdout) as Record<string, unknown>;
}

/** Mint a handle over a base the work unit still contains, which is what opens the merge window. */
async function mintHandle(fixture: LandingFixture): Promise<string> {
  const result = await runCheckpoint(fixture);
  expect(result, JSON.stringify(result)).toMatchObject({ state: "ready", nextAction: "request-approval" });
  const handle = (result["payload"] as { checkpointHandle: string }).checkpointHandle;
  expect(handle).toMatch(/^checkpoint-v1:/u);
  return handle;
}

async function runMerge(fixture: LandingFixture, handle: string): Promise<Record<string, unknown>> {
  const run = await runArc(
    ["integrate", "merge", WORK_UNIT, "--checkpoint", handle],
    fixture.repository,
    { env: fixture.env },
  );
  return JSON.parse(run.stdout) as Record<string, unknown>;
}

/**
 * Take the continuation a refusal recommends, exactly as it names it.
 *
 * The argv a result carries is the recommended next step, so running it is the observation of whether the stop
 * clears in one step. Anything the remedy asks for in prose but leaves out of the argv is part of what is being
 * observed, not something to supply on its behalf.
 */
async function takeContinuation(
  fixture: LandingFixture,
  result: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const remedy = result["remedy"] as { argv?: readonly string[] } | undefined;
  const argv = remedy?.argv;
  expect(argv, JSON.stringify(result)).toBeDefined();
  expect(argv?.[0]).toBe("arc");
  const run = await runArc([...(argv ?? []).slice(1)], fixture.repository, { env: fixture.env });
  return JSON.parse(run.stdout) as Record<string, unknown>;
}

/** Advance the base for one movement kind, landed as a change request unless told otherwise. */
async function advanceFor(
  fixture: LandingFixture,
  kind: BaseMovementKind,
  landing: "direct" | "merge" = "merge",
): Promise<void> {
  await advanceBase({ cwd: fixture.repository, paths: movementPaths(kind, WORK_UNIT).base, landing });
}

describe("the window between a minted handle and the merge that consumes it", () => {
  it("merges the approved head after an advance sharing no path with it", async () => {
    const fixture = await publishedAtLanding();
    const handle = await mintHandle(fixture);
    await advanceFor(fixture, "disjoint");

    const remote = join(fixture.repository, ".arc-fixture", "origin.git");
    const baseBefore = await git(fixture.repository, ["--git-dir", remote, "rev-parse", "refs/heads/main"]);

    const result = await runMerge(fixture, handle);

    // The handle survives movement that shares no path with the branch: the window costs the advance nothing.
    expect(result, JSON.stringify(result)).toMatchObject({ state: "merged" });
    // The stub's merge endpoint is what moves this ref, so this establishes that the merge endpoint ran —
    // ruling out a host that reports `merged` without being asked to merge, not proving what the base carries.
    expect(await git(fixture.repository, ["--git-dir", remote, "rev-parse", "refs/heads/main"]))
      .not.toBe(baseBefore);
  });
});

describe("the checkpoint's own base read", () => {
  it("refuses an advance over a reviewable path the branch also changed", async () => {
    const paths = movementPaths("overlapping-substantive", WORK_UNIT);
    const fixture = await publishedAtLanding({ branchPaths: paths.branch });
    await advanceFor(fixture, "overlapping-substantive");

    const result = await runCheckpoint(fixture);

    expect(result, JSON.stringify(result)).toMatchObject({
      state: "blocked",
      reason: "conflict",
      payload: {
        observation: {
          movement: "overlapping",
          feasibility: { state: "substantive-conflict", paths: [...paths.base] },
        },
      },
    });
    // The refusal now names the conflicting paths and sends the reader at the drift read rather than at a
    // re-run of the checkpoint that produced it.
    expect(result["remedy"], JSON.stringify(result)).toMatchObject({
      argv: ["arc", "base", "drift", "--json"],
    });
  });

  it("offers a reconcile for an advance over the regenerable projection alone", async () => {
    const paths = movementPaths("overlapping-regenerable-only", WORK_UNIT);
    const fixture = await publishedAtLanding({ branchPaths: paths.branch });
    await advanceFor(fixture, "overlapping-regenerable-only");

    const result = await runCheckpoint(fixture);

    expect(result, JSON.stringify(result)).toMatchObject({
      state: "reconcile",
      nextAction: "reconcile-regenerable",
      reason: "regenerable-reconcile-required",
      payload: {
        observation: {
          movement: "disjoint",
          feasibility: { state: "regenerable-conflict", paths: [...paths.base] },
        },
      },
    });
  });

  it("refuses when the base read goes unavailable under it", async () => {
    const fixture = await publishedAtLanding();
    const shimDir = await mkdtemp(join(tmpdir(), "arc-integrate-shim-"));
    cleanups.push(shimDir);
    const shim = await writeUnavailableBaseReadShim({ dir: shimDir });

    const result = await runCheckpoint(fixture, {
      ...fixture.env,
      PATH: `${shimDir}${delimiter}${fixture.bin}${delimiter}${process.env["PATH"] ?? ""}`,
      [shim.armVariable]: "1",
    });

    expect(result, JSON.stringify(result)).toMatchObject({
      state: "blocked",
      reason: "drift-unavailable",
    });
    // The continuation re-enters the checkpoint, whose own authoritative drift read observes the restored base.
    expect(await takeContinuation(fixture, result)).toMatchObject({
      state: "ready",
      nextAction: "request-approval",
    });
  });
});

describe("the checkpoint's base read under a bound delivery plan", () => {
  it("mints a handle after an advance sharing no path with the branch", async () => {
    const fixture = await publishedAtLanding({ predecessor: true });
    await bindDeliveryPlan(fixture);
    await advanceFor(fixture, "disjoint");

    const result = await runCheckpoint(fixture);

    // The member path costs the advance nothing either: the same baseline result, with the plan still deciding.
    expect(result, JSON.stringify(result)).toMatchObject({
      state: "ready",
      nextAction: "request-approval",
      payload: { mergeMethod: { stackPosition: "top" } },
    });
  });

  it("refuses a conflicting advance even under a bound delivery plan", async () => {
    const paths = movementPaths("overlapping-substantive", WORK_UNIT);
    const fixture = await publishedAtLanding({ predecessor: true, branchPaths: paths.branch });
    await bindDeliveryPlan(fixture);
    await advanceFor(fixture, "overlapping-substantive");

    const result = await runCheckpoint(fixture);

    // Git feasibility is read before the plan's scoping, so a path both sides changed refuses here exactly as
    // it does on the singleton path — the delivery arm never reaches the question.
    expect(result, JSON.stringify(result)).toMatchObject({
      state: "blocked",
      reason: "conflict",
      payload: {
        observation: {
          movement: "overlapping",
          feasibility: { state: "substantive-conflict", paths: [...paths.base] },
        },
      },
    });
  });

  it("offers a reconcile for an advance over the regenerable projection alone", async () => {
    const paths = movementPaths("overlapping-regenerable-only", WORK_UNIT);
    const fixture = await publishedAtLanding({ predecessor: true, branchPaths: paths.branch });
    await bindDeliveryPlan(fixture);
    await advanceFor(fixture, "overlapping-regenerable-only");

    const result = await runCheckpoint(fixture);

    expect(result, JSON.stringify(result)).toMatchObject({
      state: "reconcile",
      nextAction: "reconcile-regenerable",
      reason: "regenerable-reconcile-required",
      payload: {
        observation: {
          movement: "disjoint",
          feasibility: { state: "regenerable-conflict", paths: [...paths.base] },
        },
      },
    });
  });
});
