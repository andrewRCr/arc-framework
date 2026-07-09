/**
 * Integration coverage for the park@Active → resume round-trip against real git
 * worktrees, in both placement modes (spawn and `--here`). Proves the
 * cross-branch invariant the verbs shipped without end-to-end coverage of:
 * park@Active preserves the branch and lands a pointer-record on the tracked
 * branch (the WU branch's `active/` stays authoritative), and resume re-attaches
 * and removes the pointer — cleanly in a fresh worktree (spawn), and via a
 * deferred checkout that survives the pointer-removal commit (`--here`).
 *
 * Git and the filesystem are real (temp repos + temp worktrees); the verb cores
 * are called directly with handler-resolved inputs, and the workflow ship (the
 * pointer commit) is performed inline so the assertions read the on-disk and
 * on-branch result.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile, stat, readFile, readdir, rmdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { runPark, runResume, type ParkResumeFs } from "../../src/lib/work-unit/verbs/park-resume.js";
import { parseMetaRecord, type MetaFieldName } from "../../src/lib/active/meta-reader.js";
import { resolveWorktreeLocation } from "../../src/lib/git/worktree-location.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { getInternalTemplatePath } from "../../src/lib/paths.js";
import {
  composeProjectReadinessView,
  resolveProjectReadinessRenderStamp,
  resolveProjectReadinessViewInput,
} from "../../src/lib/status/project-view.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { buildLifecycleIndex } from "../../src/lib/work-unit/lifecycle-index.js";
import { listParkedSlugs } from "../../src/lib/work-unit/lifecycle-resolver.js";
import type { UserIOContext } from "../../src/commands/user/types.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";

const execFileAsync = promisify(execFile);

const IDENTITY = "test-user";
const SLUG = "foo";
const BRANCH = "feat/foo";
const REASON = "pivoting to the upstream dependency first";

/** A managed Active-WU meta — the authoritative artifact that rides the preserved branch. */
function activeMeta(): string {
  return (
    `# Metadata: ${SLUG}\n\n` +
    `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
    `|-----------|-----------|------------|-----------|--------------|\n` +
    `| \`Active\` | \`${IDENTITY}\` | \`${BRANCH}\` | \`Novel\` | \`P1\` |\n\n` +
    `- **Cohort:** [none]\n- **Depends On:** [none]\n\n` +
    `- **Last Completed:** [none]\n- **Next Task:** Task 1.1\n- **Blockers:** [none]\n\n` +
    `- **Next Action:** continue.\n\n---\n`
  );
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Read a path at a committed branch tip (the authoritative-on-branch check). */
async function showAtBranch(repo: string, branch: string, relPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["show", `${branch}:${relPath}`], { cwd: repo });
    return stdout;
  } catch {
    return null;
  }
}

async function headBranch(repo: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repo });
  return stdout.trim();
}

async function branchExists(repo: string, branch: string): Promise<boolean> {
  const { stdout } = await execFileAsync("git", ["branch", "--list", branch], { cwd: repo });
  return stdout.trim() !== "";
}

interface Harness {
  repo: string;
  io: UserIOContext;
  locationTemplate: string;
  /** The WU worktree path (location_template resolved for the WU branch). */
  wuWorktree: string;
  spawned: string[];
}

const POINTER_REL = `.arc/backlog/planned/${SLUG}/meta-${SLUG}.md`;
const ACTIVE_REL = `.arc/active/meta-${SLUG}.md`;

/** The pointer-record fs seam — `node:fs/promises` over the IO write/mkdir (mirrors the handler). */
function parkResumeFs(io: UserIOContext): ParkResumeFs {
  return {
    writeFile: io.writeFile,
    mkdir: io.mkdir,
    rm: (path) => rm(path),
    readdir: (path) => readdir(path),
    rmdir: (path) => rmdir(path),
  };
}

function executorFor(h: Harness): ReturnType<typeof buildExecutorContext> {
  return buildExecutorContext({
    cwd: h.repo,
    io: h.io,
    identity: IDENTITY,
    teamMode: false,
    internalTemplateDir: getInternalTemplatePath(),
  });
}

async function renderExpectedRoadmap(h: Harness): Promise<string> {
  const fs = {
    readdir: (path: string) => readdir(path, { withFileTypes: true }),
    readFile: (path: string) => readFile(path, "utf8"),
  };
  const parkedSlugs = listParkedSlugs(await buildLifecycleIndex({ cwd: h.repo, fs }));
  const input = await resolveProjectReadinessViewInput({
    cwd: h.repo,
    fs,
    localRefs: { exec: h.io.exec, baseBranch: "main", parkedSlugs },
  });
  const view = composeProjectReadinessView({
    ...input,
    renderedRef: await resolveProjectReadinessRenderStamp({
      exec: h.io.exec,
      cwd: h.repo,
      scope: "tree + local refs",
      liveView: "arc status --project",
    }),
  });
  return view.endsWith("\n") ? view : `${view}\n`;
}

/**
 * A real repo on `main` with `.arc/` scaffolding, plus an **Active** WU whose
 * authoritative artifacts live on a preserved `feat/foo` branch in its own
 * worktree — `main` carries none of them (the pre-park state: active work is
 * unmerged on its branch).
 */
async function setup(): Promise<Harness> {
  const repo = await createTempRepo("arc-park-resume-");
  const locationTemplate = join(dirname(repo), "{repo}.{name}");
  await mkdir(join(repo, ".arc", "active"), { recursive: true });
  await mkdir(join(repo, ".arc", "backlog", "planned"), { recursive: true });
  await mkdir(join(repo, ".arc", "system"), { recursive: true });
  await writeFile(
    join(repo, ".arc", "system", "arc-config.yml"),
    `branch.base: main\nbranch.protection: partial\nworktree.location_template: ${locationTemplate}\n`,
  );
  await execFileAsync("git", ["add", "-A"], { cwd: repo });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "scaffold"], { cwd: repo });

  // The WU branch + worktree carry the authoritative active/ meta; main does not.
  const wuWorktree = resolveWorktreeLocation({
    template: locationTemplate,
    repo: basename(repo),
    name: SLUG,
    branch: BRANCH,
  });
  await execFileAsync("git", ["worktree", "add", "-b", BRANCH, wuWorktree], { cwd: repo });
  await mkdir(join(wuWorktree, ".arc", "active"), { recursive: true });
  await writeFile(join(wuWorktree, ACTIVE_REL), activeMeta());
  await execFileAsync("git", ["add", "-A"], { cwd: wuWorktree });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "activate foo"], { cwd: wuWorktree });

  return {
    repo,
    io: { ...createUserIOContext(), exec: makeGitExec(repo) },
    locationTemplate,
    wuWorktree,
    spawned: [wuWorktree],
  };
}

/** Run park@Active from the base checkout, then commit the pointer-record (the workflow ship). */
async function parkAndShip(h: Harness): Promise<void> {
  const sourceRecord = parseMetaRecord(await readFile(join(h.wuWorktree, ACTIVE_REL), "utf8")) as Record<
    MetaFieldName,
    string | null
  >;
  const result = await runPark(
    { executor: executorFor(h), fs: parkResumeFs(h.io) },
    { name: SLUG, reason: REASON, sourceRecord, worktreePath: h.wuWorktree, currentLocus: h.repo },
  );
  expect(result.status).toBe("parked");
  await execFileAsync("git", ["add", "-A"], { cwd: h.repo });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "park foo"], { cwd: h.repo });
}

describe("park@Active → resume round-trip — against real worktrees", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await setup();
  });

  afterEach(async () => {
    for (const wt of h.spawned) {
      await execFileAsync("git", ["worktree", "remove", "--force", wt], { cwd: h.repo }).catch(() => {});
      await rm(wt, { recursive: true, force: true }).catch(() => {});
    }
    await cleanupTempDir(h.repo);
  });

  it("park@Active preserves the branch, tears down the worktree, and lands the pointer-record", async () => {
    const sourceRecord = parseMetaRecord(await readFile(join(h.wuWorktree, ACTIVE_REL), "utf8")) as Record<
      MetaFieldName,
      string | null
    >;

    const result = await runPark(
      { executor: executorFor(h), fs: parkResumeFs(h.io) },
      { name: SLUG, reason: REASON, sourceRecord, worktreePath: h.wuWorktree, currentLocus: h.repo },
    );

    expect(result.status).toBe("parked");
    // The pointer-record lands on the tracked branch, blessed `State: Active`, with the callout + reason.
    const pointer = await readFile(join(h.repo, POINTER_REL), "utf8");
    expect(pointer).toContain("Parked");
    expect(pointer).toContain(BRANCH);
    expect(pointer).toContain(REASON);
    expect(parseMetaRecord(pointer).State).toBe("Active");
    // The branch is preserved (the durable shelf) and still carries the authoritative active/ meta.
    expect(await branchExists(h.repo, BRANCH)).toBe(true);
    expect(await showAtBranch(h.repo, BRANCH, ACTIVE_REL)).not.toBeNull();
    // Only the worktree was torn down.
    expect(await pathExists(h.wuWorktree)).toBe(false);
    await expect(readFile(join(h.repo, ".arc", "backlog", "ROADMAP.md"), "utf8"))
      .resolves.toBe(await renderExpectedRoadmap(h));
  });

  it("round-trip (spawn): resume re-attaches in a fresh worktree and removes the pointer", async () => {
    await parkAndShip(h);

    const resumeWt = resolveWorktreeLocation({
      template: h.locationTemplate,
      repo: basename(h.repo),
      name: SLUG,
      branch: BRANCH,
    });
    h.spawned.push(resumeWt);

    const result = await runResume(
      { executor: executorFor(h), fs: parkResumeFs(h.io) },
      { name: SLUG, locationTemplate: h.locationTemplate, repo: basename(h.repo), spawningIdentity: IDENTITY },
    );

    expect(result.status).toBe("resumed");
    if (result.status !== "resumed") return;
    expect(result.branch).toBe(BRANCH);
    expect(result.inPlaceCheckoutPending).toBe(false);
    // A fresh worktree re-attaches the preserved branch, authoritative artifacts intact.
    expect(await pathExists(join(resumeWt, ACTIVE_REL))).toBe(true);
    // The pointer is removed from the tracked tree and its emptied dir pruned.
    expect(await pathExists(join(h.repo, POINTER_REL))).toBe(false);
    expect(await pathExists(join(h.repo, ".arc", "backlog", "planned", SLUG))).toBe(false);
    // The base checkout never left main.
    expect(await headBranch(h.repo)).toBe("main");
  });

  it("round-trip (--here): resume defers the checkout; commit then checkout re-attaches with no orphan", async () => {
    await parkAndShip(h);

    const result = await runResume({ executor: executorFor(h), fs: parkResumeFs(h.io) }, { name: SLUG, inPlace: true });

    expect(result.status).toBe("resumed");
    if (result.status !== "resumed") return;
    expect(result.branch).toBe(BRANCH);
    // The checkout is deferred — still on the tracked branch, with the pointer removed but uncommitted.
    expect(result.inPlaceCheckoutPending).toBe(true);
    expect(await headBranch(h.repo)).toBe("main");
    expect(await pathExists(join(h.repo, POINTER_REL))).toBe(false);

    // The ceremony commits the removal on the tracked branch, then re-attaches in place.
    await execFileAsync("git", ["add", "-A"], { cwd: h.repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "resume foo"], { cwd: h.repo });
    await execFileAsync("git", ["checkout", BRANCH], { cwd: h.repo });

    // Re-attached: authoritative artifacts present in the checkout, and no orphaned pointer survives on
    // the tracked branch (the removal was committed before the checkout).
    expect(await headBranch(h.repo)).toBe(BRANCH);
    expect(await pathExists(join(h.repo, ACTIVE_REL))).toBe(true);
    expect(await showAtBranch(h.repo, "main", POINTER_REL)).toBeNull();
  });
});
