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
async function installHost(repository: string, remote: string): Promise<{ bin: string; headFile: string }> {
  const bin = join(repository, ".arc-fixture", "bin");
  const headFile = join(repository, ".arc-fixture", "head-sha");
  const listed = `[{"number":${String(PULL_REQUEST)},`
    + `"url":"https://example.test/pull/${String(PULL_REQUEST)}",`
    + `"state":"OPEN","baseRefName":"main","headRefName":"${HEAD_REF}","headRefOid":"%s"}]`;
  const pull = `{"number":${String(PULL_REQUEST)},"state":"open","merged":false,"draft":false,`
    + `"merge_commit_sha":null,"mergeable":true,`
    + `"head":{"ref":"${HEAD_REF}","sha":"%s","repo":{"full_name":"${REPOSITORY}"}},`
    + `"base":{"ref":"main","repo":{"full_name":"${REPOSITORY}"}}}`;
  const settings = '{"allow_merge_commit":true,"allow_squash_merge":false,"allow_rebase_merge":false}';
  const repositoryView = `{"nameWithOwner":"${REPOSITORY}","defaultBranchRef":{"name":"main"}}`;
  await mkdir(bin, { recursive: true });
  const script = join(bin, "gh");
  await writeFile(script, [
    "#!/bin/sh",
    `head=$(cat '${headFile}')`,
    'case "$1:$2" in',
    `  repo:view) printf '%s\\n' '${repositoryView}' ;;`,
    "  pr:ready) exit 0 ;;",
    `  pr:list) printf '${listed}\\n' "$head" ;;`,
    "  pr:checks) echo 'no required checks reported' >&2; exit 1 ;;",
    `  api:repos/${REPOSITORY}) printf '%s\\n' '${settings}' ;;`,
    `  api:repos/${REPOSITORY}/pulls/${String(PULL_REQUEST)}) printf '${pull}\\n' "$head" ;;`,
    `  api:repos/${REPOSITORY}/branches/main) printf '%s\\n' '{}' ;;`,
    "  api:--paginate) printf '%s\\n' '[[]]' ;;",
    // Landing the change request really moves the base, so everything downstream of the merge reads a
    // repository in the state the host claims rather than a response with nothing behind it.
    `  api:repos/${REPOSITORY}/pulls/${String(PULL_REQUEST)}/merge)`,
    `    git --git-dir='${remote}' update-ref refs/heads/main "$head"`,
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
}

/**
 * A published work unit on a live origin, standing at its landing boundary.
 *
 * `branchPaths` are committed with the implementation, before attestation, so a movement kind that needs the
 * branch to have touched a path can have that arranged without disturbing the Candidate afterwards.
 */
async function publishedAtLanding(
  options: { readonly branchPaths?: readonly string[] } = {},
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

  await git(repository, ["checkout", "-b", HEAD_REF]);
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await mkdir(join(repository, "src"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", `meta-${WORK_UNIT}.md`), META);
  await writeFile(join(repository, "src", "example.ts"), "export const example = true;\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "implementation"]);
  if (options.branchPaths !== undefined) {
    await arrangeBranchSide({ cwd: repository, paths: options.branchPaths });
  }
  await writeFile(
    join(repository, ".arc", "active", `tasks-${WORK_UNIT}.md`),
    "# Task List: Example\n\n- [x] Verification complete\n",
  );
  await git(repository, ["add", `.arc/active/tasks-${WORK_UNIT}.md`]);

  const host = await installHost(repository, remote);
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
    ["review", "pre-publication", WORK_UNIT, "--self-review", "settled", "--json"],
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

  return { repository, bin: host.bin, env };
}

async function runCheckpoint(
  fixture: LandingFixture,
  env: Record<string, string> = fixture.env,
): Promise<Record<string, unknown>> {
  const run = await runArc(["integrate", "checkpoint", WORK_UNIT, "--json"], fixture.repository, { env });
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
    ["integrate", "merge", WORK_UNIT, "--checkpoint", handle, "--json"],
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
  it("merges the approved head when the base holds still", async () => {
    const fixture = await publishedAtLanding();
    const handle = await mintHandle(fixture);

    const result = await runMerge(fixture, handle);

    expect(result, JSON.stringify(result)).toMatchObject({ state: "merged" });
  });

  it("invalidates the handle when the base advances under it", async () => {
    const fixture = await publishedAtLanding();
    const handle = await mintHandle(fixture);
    await advanceFor(fixture, "disjoint");

    const result = await runMerge(fixture, handle);

    expect(result, JSON.stringify(result)).toMatchObject({
      state: "invalidated",
      reason: "drift-reconcile",
      payload: { verdict: "reconcile" },
    });
    // The step it names does not return a handle: the base it now reads has moved, so the same invocation
    // that minted one before asks for a reconcile instead.
    expect(await takeContinuation(fixture, result)).toMatchObject({
      state: "reconcile",
      nextAction: "reconcile-base",
    });
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
      reason: "unsafe-reconcile",
      payload: { safety: { substantivePaths: [...paths.base], safe: false } },
    });
    // The remedy asks in prose for an append-only base merge, but the argv it carries only re-runs the
    // checkpoint, so following it exactly returns the same refusal.
    expect(await takeContinuation(fixture, result)).toMatchObject({
      state: "blocked",
      reason: "unsafe-reconcile",
    });
  });

  it("offers a reconcile for an advance over the regenerable projection alone", async () => {
    const paths = movementPaths("overlapping-regenerable-only", WORK_UNIT);
    const fixture = await publishedAtLanding({ branchPaths: paths.branch });
    await advanceFor(fixture, "overlapping-regenerable-only");

    const result = await runCheckpoint(fixture);

    expect(result, JSON.stringify(result)).toMatchObject({
      state: "reconcile",
      nextAction: "reconcile-base",
      payload: { safety: { substantivePaths: [], regenerablePaths: [...paths.base], safe: true } },
    });
    // The one result here that is safe to act on is also the only one carrying no remedy: it names a next
    // action and leaves the reader to work out the invocation.
    expect(result["remedy"], JSON.stringify(result)).toBeUndefined();
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
    // The step it names is a base reading rather than another checkpoint, and with the base read restored it
    // reports a clean base. The refusal clears, but the reader is left to return to the checkpoint themselves.
    expect(await takeContinuation(fixture, result)).toMatchObject({
      mode: "authoritative",
      verdict: "clean",
    });
  });
});
