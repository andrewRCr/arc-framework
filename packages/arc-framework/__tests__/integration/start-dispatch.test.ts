/**
 * Integration coverage for `arc start`'s lifecycle-state dispatch against real
 * git worktrees. Exercises the dispatch routing, the executor binder, and the
 * real mutators end to end: create-new spawns a worktree, a backlog stub
 * graduates (the name-collision fix — an existing stub graduates, never
 * mis-scaffolds), the worktree-occupancy guard rejects a second active WU in one
 * worktree, and the already-live / terminal states refuse with direction.
 *
 * Git and the filesystem are real (temp repos + temp worktrees); the cores are
 * called directly so the assertions read the on-disk result.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile, stat, readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { runCreateNew, runGraduate, resolveStartDispatch } from "../../src/commands/start.js";
import { handleStart } from "../../src/handlers/start.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { resolveWorktreeLocation } from "../../src/lib/git/worktree-location.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { getInternalTemplatePath } from "../../src/lib/paths.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { buildLifecycleIndex } from "../../src/lib/work-unit/lifecycle-index.js";
import type { UserIOContext } from "../../src/commands/user/types.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";

const execFileAsync = promisify(execFile);

const IDENTITY = "test-user";

/** A minimal managed meta for a stub at a given State. */
function metaFor(slug: string, state: string, branch: string, cls = "Light"): string {
  return (
    `# Metadata: ${slug}\n\n` +
    `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
    `|-----------|-----------|------------|-----------|--------------|\n` +
    `| \`${state}\` | \`${IDENTITY}\` | \`${branch}\` | \`${cls}\` | \`P1\` |\n\n` +
    `- **Cohort:** [none]\n- **Depends On:** [none]\n\n` +
    `- **Last Completed:** [none]\n- **Next Task:** [none]\n- **Blockers:** [none]\n\n` +
    `- **Next Action:** begin.\n\n---\n`
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

interface Harness {
  repo: string;
  io: UserIOContext;
  /** Absolute `worktree.location_template` — lands spawns beside the repo (in the temp parent). */
  locationTemplate: string;
  spawned: string[];
  cleanupPaths: string[];
}

/** A real git repo on `main` with `.arc/` scaffolding and an initial commit. */
async function setup(): Promise<Harness> {
  const repo = await createTempRepo("arc-start-dispatch-");
  const locationTemplate = join(dirname(repo), "{repo}.{name}");
  await mkdir(join(repo, ".arc", "active"), { recursive: true });
  await mkdir(join(repo, ".arc", "backlog", "planned"), { recursive: true });
  await mkdir(join(repo, ".arc", "system"), { recursive: true });
  await writeFile(
    join(repo, ".arc", "system", "arc-config.yml"),
    `branch.base: main\nbranch.protection: partial\nworktree.location_template: ${locationTemplate}\n`,
  );
  await writeFile(join(repo, ".gitignore"), ".codex/\n.unregistered-harness/\n.arc/user/\n");
  await execFileAsync("git", ["add", "-A"], { cwd: repo });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "scaffold"], { cwd: repo });
  return { repo, io: { ...createUserIOContext(), exec: makeGitExec(repo) }, locationTemplate, spawned: [], cleanupPaths: [] };
}

/** Commit a stub meta into a lifecycle tier so `git mv` can relocate it. */
async function commitMeta(repo: string, relDir: string, slug: string, state: string, branch: string): Promise<void> {
  const dir = join(repo, ".arc", relDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `meta-${slug}.md`), metaFor(slug, state, branch));
  await execFileAsync("git", ["add", "-A"], { cwd: repo });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", `stub ${slug}`], { cwd: repo });
}

async function indexOf(repo: string): ReturnType<typeof buildLifecycleIndex> {
  return buildLifecycleIndex({
    cwd: repo,
    fs: {
      readdir: (p) => readdir(p, { withFileTypes: true }),
      readFile: (p) => readFile(p, "utf8"),
    },
  });
}

describe("arc start dispatch — against real worktrees", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await setup();
  });

  afterEach(async () => {
    for (const wt of h.spawned) {
      await execFileAsync("git", ["worktree", "remove", "--force", wt], { cwd: h.repo }).catch(() => {});
      await rm(wt, { recursive: true, force: true });
    }
    for (const path of h.cleanupPaths) {
      await rm(path, { recursive: true, force: true });
    }
    await cleanupTempDir(h.repo);
  });

  it("create-new: spawns a real worktree on a new plan/ branch with a scaffolded meta + marker", async () => {
    const wt = resolveWorktreeLocation({
      template: h.locationTemplate,
      repo: basename(h.repo),
      name: "alpha",
      branch: "plan/alpha",
    });
    h.spawned.push(wt);

    const outcome = await runCreateNew(
      { io: h.io, internalTemplateDir: getInternalTemplatePath() },
      { worktreePath: h.repo, identity: IDENTITY, name: "alpha" },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.branch).toBe("plan/alpha");
    expect(await pathExists(wt)).toBe(true);
    const record = parseMetaRecord(await readFile(join(wt, ".arc", "active", "meta-alpha.md"), "utf8"));
    expect(record.State).toBe("Planning");
    expect(record.Branch).toBe("plan/alpha");
    expect((await readWorktreeMarker(wt)).kind).toBe("present");
  });

  it("create-new handler: shell invocation commits and pushes the spawned plan branch", async () => {
    const remote = `${h.repo}-origin.git`;
    h.cleanupPaths.push(remote);
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: h.repo });
    await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: h.repo });
    await execFileAsync("git", ["config", "arc.identity", IDENTITY], { cwd: h.repo });

    const wt = resolveWorktreeLocation({
      template: h.locationTemplate,
      repo: basename(h.repo),
      name: "shell-alpha",
      branch: "plan/shell-alpha",
    });
    h.spawned.push(wt);

    const originalCwd = process.cwd();
    const savedExitCode = process.exitCode;
    process.exitCode = undefined;
    let observedExitCode: typeof process.exitCode;
    try {
      process.chdir(h.repo);
      await handleStart("shell-alpha", { yes: true });
      observedExitCode = process.exitCode;
    } finally {
      process.chdir(originalCwd);
      process.exitCode = savedExitCode;
    }

    expect(observedExitCode).toBeUndefined();

    const { stdout: subject } = await execFileAsync("git", ["log", "-1", "--format=%s"], { cwd: wt });
    const { stdout: body } = await execFileAsync("git", ["log", "-1", "--format=%b"], { cwd: wt });
    expect(subject.trim()).toBe("chore(arc): start shell-alpha in planning");
    expect(body).toContain("Context: meta-shell-alpha.md (activation)");
    const roadmap = await readFile(join(wt, ".arc", "backlog", "ROADMAP.md"), "utf8");
    expect(roadmap).toContain("shell-alpha");
    expect(roadmap).toContain("Generated from meta files");
    const notes = await readFile(join(wt, ".arc", "user", IDENTITY, "shell-alpha", "SESSION-NOTES.md"), "utf8");
    const { stdout: shortHead } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: wt });
    expect(notes).toContain("**Working On:** meta-shell-alpha.md");
    expect(notes).toContain(`**Commit at Handoff:** \`${shortHead.trim()}\``);

    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: wt });
    const { stdout: remoteHead } = await execFileAsync("git", ["ls-remote", "origin", "refs/heads/plan/shell-alpha"], { cwd: h.repo });
    expect(remoteHead).toContain(head.trim());
  });

  it("graduate handler: shell invocation commits and pushes the spawned plan branch", async () => {
    await commitMeta(h.repo, "backlog/planned/shell-widget", "shell-widget", "Planning", "[none]");
    const remote = `${h.repo}-origin.git`;
    h.cleanupPaths.push(remote);
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: h.repo });
    await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: h.repo });
    await execFileAsync("git", ["config", "arc.identity", IDENTITY], { cwd: h.repo });

    const wt = resolveWorktreeLocation({
      template: h.locationTemplate,
      repo: basename(h.repo),
      name: "shell-widget",
      branch: "plan/shell-widget",
    });
    h.spawned.push(wt);

    const originalCwd = process.cwd();
    const savedExitCode = process.exitCode;
    process.exitCode = undefined;
    let observedExitCode: typeof process.exitCode;
    try {
      process.chdir(h.repo);
      await handleStart("shell-widget", { yes: true });
      observedExitCode = process.exitCode;
    } finally {
      process.chdir(originalCwd);
      process.exitCode = savedExitCode;
    }

    expect(observedExitCode).toBeUndefined();
    expect(await pathExists(join(wt, ".arc", "active", "meta-shell-widget.md"))).toBe(true);
    expect(await pathExists(join(wt, ".arc", "backlog", "planned", "shell-widget", "meta-shell-widget.md"))).toBe(false);
    expect(await pathExists(join(h.repo, ".arc", "backlog", "planned", "shell-widget", "meta-shell-widget.md"))).toBe(true);

    const { stdout: subject } = await execFileAsync("git", ["log", "-1", "--format=%s"], { cwd: wt });
    const { stdout: body } = await execFileAsync("git", ["log", "-1", "--format=%b"], { cwd: wt });
    expect(subject.trim()).toBe("chore(arc): graduate shell-widget into active");
    expect(body).toContain("Context: meta-shell-widget.md (activation)");
    const notes = await readFile(join(wt, ".arc", "user", IDENTITY, "shell-widget", "SESSION-NOTES.md"), "utf8");
    const { stdout: shortHead } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: wt });
    expect(notes).toContain("**Working On:** meta-shell-widget.md");
    expect(notes).toContain(`**Commit at Handoff:** \`${shortHead.trim()}\``);

    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: wt });
    const { stdout: remoteHead } = await execFileAsync("git", ["ls-remote", "origin", "refs/heads/plan/shell-widget"], { cwd: h.repo });
    expect(remoteHead).toContain(head.trim());
  });

  it("create-new: registers the ownership marker ignore rule before leaving the spawned worktree", async () => {
    const wt = resolveWorktreeLocation({
      template: h.locationTemplate,
      repo: basename(h.repo),
      name: "clean-marker",
      branch: "plan/clean-marker",
    });
    h.spawned.push(wt);

    const outcome = await runCreateNew(
      { io: h.io, internalTemplateDir: getInternalTemplatePath() },
      { worktreePath: h.repo, identity: IDENTITY, name: "clean-marker" },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect((await readWorktreeMarker(wt)).kind).toBe("present");

    const { stdout } = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: wt });
    expect(stdout).not.toContain(".arc/system/.internal/worktree-marker.json");
  });

  it("create-new: copies registered gitignored harness dirs from the primary worktree only", async () => {
    await mkdir(join(h.repo, ".codex", "skills"), { recursive: true });
    await writeFile(join(h.repo, ".codex", "skills", "arc.txt"), "copied from primary\n");
    await mkdir(join(h.repo, ".unregistered-harness"), { recursive: true });
    await writeFile(join(h.repo, ".unregistered-harness", "secret.txt"), "should stay primary-local\n");
    await writeFile(
      join(h.repo, ".arc", "system", "arc-config.yml"),
      `branch.base: main\nbranch.protection: partial\nworktree.location_template: ${h.locationTemplate}\nworktree.harness_dirs: .codex\n`,
    );

    const wt = resolveWorktreeLocation({
      template: h.locationTemplate,
      repo: basename(h.repo),
      name: "harnessed",
      branch: "plan/harnessed",
    });
    h.spawned.push(wt);

    const outcome = await runCreateNew(
      { io: h.io, internalTemplateDir: getInternalTemplatePath() },
      { worktreePath: h.repo, identity: IDENTITY, name: "harnessed" },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    await expect(readFile(join(wt, ".codex", "skills", "arc.txt"), "utf8")).resolves.toBe("copied from primary\n");
    expect(await pathExists(join(wt, ".unregistered-harness", "secret.txt"))).toBe(false);
  });

  it("graduate: an existing backlog stub graduates onto its branch (never mis-scaffolds)", async () => {
    await commitMeta(h.repo, "backlog/planned/widget", "widget", "Planning", "[none]");
    const wt = resolveWorktreeLocation({
      template: h.locationTemplate,
      repo: basename(h.repo),
      name: "widget",
      branch: "plan/widget",
    });
    h.spawned.push(wt);

    // The name collision routes to graduate, not create-new.
    const dispatch = resolveStartDispatch(await indexOf(h.repo), "widget");
    expect(dispatch.arm).toBe("graduate");

    const result = await runGraduate(
      buildExecutorContext({ cwd: h.repo, io: h.io, identity: IDENTITY, teamMode: false, internalTemplateDir: getInternalTemplatePath() }),
      {
        name: "widget",
        cls: "Light",
        baseBranch: "main",
        locationTemplate: h.locationTemplate,
        repo: basename(h.repo),
        spawningIdentity: IDENTITY,
      },
    );

    expect(result.status).toBe("graduated");
    // The stub relocated `backlog → active` in the spawned worktree — not the invoking checkout.
    expect(await pathExists(wt)).toBe(true);
    expect(await pathExists(join(wt, ".arc", "active", "meta-widget.md"))).toBe(true);
    expect(await pathExists(join(wt, ".arc", "backlog", "planned", "widget", "meta-widget.md"))).toBe(false);
    expect(await pathExists(join(h.repo, ".arc", "active", "meta-widget.md"))).toBe(false);
    expect(await pathExists(join(h.repo, ".arc", "backlog", "planned", "widget", "meta-widget.md"))).toBe(true);
    // The `reconcile-status-user` side-effect rendered for real (local-only) and wrote STATUS.USER
    // at the identity-global root.
    const statusUserPath = join(h.repo, ".arc", "user", IDENTITY, "STATUS.USER.md");
    expect(await pathExists(statusUserPath)).toBe(true);
    expect(await readFile(statusUserPath, "utf8")).toContain("## In Flight");
    expect(await pathExists(join(wt, ".arc", "user", IDENTITY, "STATUS.USER.md"))).toBe(false);
    const notes = await readFile(join(wt, ".arc", "user", IDENTITY, "widget", "SESSION-NOTES.md"), "utf8");
    expect(notes).toContain("Graduated the backlog stub");
    expect(notes).toContain("**Commit at Handoff:** `[start ceremony pending]`");
  });

  it("graduate --here: cuts the branch in the current checkout, no worktree spawned", async () => {
    await commitMeta(h.repo, "backlog/planned/widget", "widget", "Planning", "[none]");
    const spawnWt = resolveWorktreeLocation({
      template: h.locationTemplate,
      repo: basename(h.repo),
      name: "widget",
      branch: "plan/widget",
    });

    const result = await runGraduate(
      buildExecutorContext({ cwd: h.repo, io: h.io, identity: IDENTITY, teamMode: false, internalTemplateDir: getInternalTemplatePath() }),
      { name: "widget", cls: "Light", inPlace: true },
    );

    expect(result.status).toBe("graduated");
    // The stub relocated `backlog → active` (real `git mv`) in the current checkout.
    expect(await pathExists(join(h.repo, ".arc", "active", "meta-widget.md"))).toBe(true);
    expect(await pathExists(join(h.repo, ".arc", "backlog", "planned", "widget", "meta-widget.md"))).toBe(false);
    // The branch was cut in the CURRENT worktree (HEAD moved onto it) — no spawn.
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: h.repo });
    expect(head.trim()).toBe("plan/widget");
    expect(await pathExists(spawnWt)).toBe(false);
  });

  it("worktree-occupancy (in-place): graduating --here into a checkout already holding an active WU is rejected", async () => {
    // An active WU already occupies the *current* checkout on a different branch.
    // An in-place graduate would check the new branch out alongside it — the real
    // foot-gun (two metas in one checkout's `active/`), so it MUST reject.
    await commitMeta(h.repo, "active", "incumbent", "Active", "feat/incumbent");
    await commitMeta(h.repo, "backlog/planned/widget", "widget", "Planning", "[none]");

    const result = await runGraduate(
      buildExecutorContext({ cwd: h.repo, io: h.io, identity: IDENTITY, teamMode: false, internalTemplateDir: getInternalTemplatePath() }),
      { name: "widget", cls: "Light", inPlace: true },
    );

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/active work unit|occupanc|one active/i);
    // No relocation happened — the stub is untouched.
    expect(await pathExists(join(h.repo, ".arc", "backlog", "planned", "widget", "meta-widget.md"))).toBe(true);
  });

  it("worktree-occupancy (spawn): graduating into a fresh worktree ignores an invoking-checkout occupant", async () => {
    await commitMeta(h.repo, "backlog/planned/widget", "widget", "Planning", "[none]");
    await execFileAsync("git", ["switch", "-c", "feat/incumbent"], { cwd: h.repo });
    await commitMeta(h.repo, "active", "incumbent", "Active", "feat/incumbent");
    const wt = resolveWorktreeLocation({
      template: h.locationTemplate,
      repo: basename(h.repo),
      name: "widget",
      branch: "plan/widget",
    });
    h.spawned.push(wt);

    const result = await runGraduate(
      buildExecutorContext({ cwd: h.repo, io: h.io, identity: IDENTITY, teamMode: false, internalTemplateDir: getInternalTemplatePath() }),
      {
        name: "widget",
        cls: "Light",
        baseBranch: "main",
        locationTemplate: h.locationTemplate,
        repo: basename(h.repo),
        spawningIdentity: IDENTITY,
      },
    );

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(await pathExists(join(wt, ".arc", "active", "meta-widget.md"))).toBe(true);
    // The invoking checkout's active WU stays where it was; graduate did not add a second active meta there.
    expect(await pathExists(join(h.repo, ".arc", "active", "meta-incumbent.md"))).toBe(true);
    expect(await pathExists(join(h.repo, ".arc", "active", "meta-widget.md"))).toBe(false);
    expect(await pathExists(join(h.repo, ".arc", "backlog", "planned", "widget", "meta-widget.md"))).toBe(true);
  });

  it("refuse: an already-Active WU is refused as occupied (no mutation)", async () => {
    await commitMeta(h.repo, "active", "solo", "Active", "feat/solo");

    const dispatch = resolveStartDispatch(await indexOf(h.repo), "solo");
    expect(dispatch.arm).toBe("refuse");
    if (dispatch.arm !== "refuse") return;
    expect(dispatch.reason).toMatch(/occupied|already active/i);
  });
});
